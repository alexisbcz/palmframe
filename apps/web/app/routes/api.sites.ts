import { z } from "zod"

import { COSTS } from "@/lib/credits"
import { OpenRouterError, payingConnection } from "@/lib/openrouter.server"
import {
  chooseTemplate,
  draftAvailable,
  draftFake,
  rewriteText,
  writeSite,
} from "@/lib/sites/draft.server"
import { addApp, APPS, emptySite } from "@/lib/sites/edit"
import { applyLook } from "@/lib/sites/looks"
import { slugAllowed, toSite } from "@/lib/sites/model"
import { templateById } from "@/lib/sites/templates"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.sites"

export const config = { maxDuration: 150 }

const id = z.uuid()
const look = z.object({
  palette: z.string().max(40).optional(),
  type: z.string().max(40).optional(),
  corners: z.string().max(40).optional(),
})
const start = {
  template: z.string().max(60).nullable().default(null),
  look: look.default({}),
  apps: z.array(z.enum(APPS)).max(4).default([]),
}
const body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("create"), ...start }),
  z.object({
    intent: z.literal("draft"),
    prompt: z.string().trim().min(3).max(4000),
    language: z.string().max(20).default("en"),
    ...start,
  }),
  z.object({
    intent: z.literal("text"),
    text: z.string().min(1).max(8000),
    instruction: z.string().trim().min(1).max(1000),
  }),
  z.object({ intent: z.literal("publish"), id, slug: z.string().max(60) }),
  z.object({ intent: z.literal("unpublish"), id }),
  z.object({ intent: z.literal("restore"), id, version: z.number().int() }),
  z.object({ intent: z.literal("duplicate"), id }),
])

const fail = (message: string, status: number, code?: string) =>
  Response.json({ error: message, ...(code && { code }) }, { status })

type Supabase = Awaited<ReturnType<typeof getViewer>>["supabase"]

async function charge(
  supabase: Supabase,
  kind: "site_draft" | "site_text",
  job: string
) {
  const spent = await supabase.rpc("spend_credits", {
    p_cost: COSTS[kind],
    p_kind: kind,
    p_job: job,
  })
  if (!spent.error) return null
  return spent.error.code === "P0402"
    ? fail(spent.error.message, 402, "insufficient_credits")
    : fail(spent.error.message, 500)
}

function base(template: string | null, name = "My site") {
  const made = template ? templateById(template)?.make() : null
  return made ?? emptySite(name)
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("Method not allowed", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return fail("Sign in first.", 401)
  if (!viewer.labs.sites) return fail("Not found", 404)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("That request doesn't look right.", 400)
  const r = parsed.data

  const insert = async (name: string, template: string, data: unknown) => {
    const { data: row, error } = await supabase
      .from("comic_sites")
      .insert({
        name: name.slice(0, 120),
        template,
        data: toSite(data),
      })
      .select("id")
      .single()
    if (error) return fail(error.message, 500)
    return Response.json({ id: row.id })
  }

  if (r.intent === "create") {
    let site = applyLook(base(r.template), r.look)
    for (const app of r.apps) site = addApp(site, app)
    return insert(site.name, r.template ?? "", site)
  }

  if (r.intent === "draft" || r.intent === "text") {
    const openrouter = await payingConnection(viewer.id)
    if (!openrouter && !draftAvailable())
      return fail(
        "The writer is not set up: set ANTHROPIC_API_KEY on the server, or connect OpenRouter in Settings.",
        501
      )
    const kind = r.intent === "draft" ? "site_draft" : "site_text"
    const job = crypto.randomUUID()
    const free = !!openrouter || draftFake()
    if (!free) {
      const refused = await charge(supabase, kind, job)
      if (refused) return refused
    }
    try {
      if (r.intent === "text")
        return Response.json({
          text: await rewriteText(
            r.text,
            r.instruction,
            openrouter,
            request.signal
          ),
        })
      const choice = await chooseTemplate(
        r.prompt,
        r.template,
        openrouter,
        request.signal
      )
      let site = applyLook(base(choice.template, choice.name), {
        palette: r.look.palette ?? choice.palette,
        type: r.look.type ?? choice.typeface,
        corners: r.look.corners,
      })
      for (const app of r.apps) site = addApp(site, app)
      site = await writeSite(
        site,
        r.prompt,
        choice.name,
        r.language,
        openrouter,
        request.signal
      )
      return await insert(site.name, choice.template, site)
    } catch (e) {
      if (!free) await supabase.rpc("refund_credits", { p_job: job })
      const message = e instanceof Error ? e.message : String(e)
      return fail(message, e instanceof OpenRouterError ? e.status : 502)
    }
  }

  const { data: row } = await supabase
    .from("comic_sites")
    .select("id, name, template, data, revision")
    .eq("id", r.id)
    .maybeSingle()
  if (!row) return fail("Not found", 404)

  if (r.intent === "duplicate")
    return insert(`${row.name} copy`, row.template, row.data)

  if (r.intent === "unpublish") {
    const { error } = await supabase
      .from("comic_site_releases")
      .delete()
      .eq("site_id", r.id)
    return error ? fail(error.message, 500) : Response.json({ ok: true })
  }

  if (r.intent === "restore") {
    const { data: version } = await supabase
      .from("comic_site_versions")
      .select("data")
      .eq("site_id", r.id)
      .eq("version", r.version)
      .maybeSingle()
    if (!version) return fail("Not found", 404)
    const { error } = await supabase
      .from("comic_sites")
      .update({ data: version.data, revision: row.revision + 1 })
      .eq("id", r.id)
    return error ? fail(error.message, 500) : Response.json({ ok: true })
  }

  if (!slugAllowed(r.slug)) return fail("Pick another address.", 400, "slug")
  const site = toSite(row.data)
  const { data: current } = await supabase
    .from("comic_site_releases")
    .select("version")
    .eq("site_id", r.id)
    .maybeSingle()
  const { data: latest } = await supabase
    .from("comic_site_versions")
    .select("version")
    .eq("site_id", r.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const version = (latest?.version ?? current?.version ?? 0) + 1
  const { error } = await supabase.from("comic_site_releases").upsert(
    {
      site_id: r.id,
      user_id: viewer.id,
      slug: r.slug,
      title: site.name,
      data: site,
      indexable: site.settings.indexable,
      version,
      published_at: new Date().toISOString(),
    },
    { onConflict: "site_id" }
  )
  if (error)
    return error.code === "23505"
      ? fail("That address is taken.", 409, "slug_taken")
      : fail(error.message, 500)
  await supabase
    .from("comic_site_versions")
    .insert({ site_id: r.id, version, data: site })
  return Response.json({ ok: true, slug: r.slug, version })
}
