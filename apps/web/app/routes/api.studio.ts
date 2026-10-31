import { z } from "zod"

import { type Operation, COSTS } from "@/lib/credits"
import { payingConnection } from "@/lib/openrouter.server"
import { comicFromBoard } from "@/lib/studio/comic"
import { NoBoard, writeBoard } from "@/lib/studio/board.server"
import { fetchBrand, fetchProduct } from "@/lib/studio/contextdev.server"
import { isLocale } from "@/i18n/core"
import {
  PLATFORMS,
  platformOf,
  rankAds,
  rankVideos,
  sourceTitle,
  studioSource,
  toDomain,
} from "@/lib/studio/model"
import {
  SourceError,
  companyAds,
  fetchVideo,
  searchAdvertisers,
  searchVideos,
  trendingVideos,
} from "@/lib/studio/scrapecreators.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.studio"

const id = z.uuid()
const query = z.string().trim().min(2).max(100)
const link = z.url().max(2000)

const body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("brand"), domain: z.string().max(300) }),
  z.object({
    intent: z.literal("brandVoice"),
    id,
    voice: z.string().trim().max(1000),
  }),
  z.object({ intent: z.literal("brandUse"), id }),
  z.object({ intent: z.literal("brandRemove"), id }),
  z.object({ intent: z.literal("advertisers"), query }),
  z.object({
    intent: z.literal("ads"),
    pageId: z.string().regex(/^\d{1,30}$/),
  }),
  z.object({
    intent: z.literal("videos"),
    platform: z.enum(PLATFORMS),
    query: query.optional(),
  }),
  z.object({ intent: z.literal("video"), url: link }),
  z.object({ intent: z.literal("product"), url: link }),
  z.object({
    intent: z.literal("board"),
    source: studioSource,
    language: z.string().max(5),
  }),
  z.object({ intent: z.literal("comic"), id }),
  z.object({ intent: z.literal("boardRemove"), id }),
])

const fail = (code: string, status: number) =>
  Response.json({ error: code }, { status })

function failure(e: unknown) {
  if (e instanceof SourceError) {
    if (e.code === "setup") console.error("Studio source refused", e.message)
    return fail(e.code, e.code === "missing" ? 404 : 503)
  }
  if (e instanceof NoBoard) return fail("noBoard", 422)
  console.error("Studio failed", e)
  return fail("generic", 502)
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("generic", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return fail("generic", 401)
  if (!viewer.labs.machines) return fail("generic", 404)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("invalid", 400)
  const r = parsed.data
  const signal = request.signal

  // Paid first, refunded if the work fails, like every render.
  const charged = async (
    kind: Operation,
    work: () => Promise<unknown>,
    free = false
  ) => {
    const job = crypto.randomUUID()
    if (!free) {
      const spent = await supabase.rpc("spend_credits", {
        p_cost: COSTS[kind],
        p_kind: kind,
        p_job: job,
      })
      if (spent.error?.code === "P0402") return fail("credits", 402)
      if (spent.error) return fail("generic", 500)
    }
    try {
      return Response.json(await work())
    } catch (e) {
      if (!free) await supabase.rpc("refund_credits", { p_job: job })
      return failure(e)
    }
  }

  switch (r.intent) {
    case "brand": {
      const domain = toDomain(r.domain)
      if (!domain) return fail("invalid", 400)
      // Reading a site again would cost credits and lose the edited voice.
      const { data: existing } = await supabase
        .from("comic_brand_kits")
        .select("id")
        .eq("domain", domain)
        .maybeSingle()
      if (existing) return Response.json({ id: existing.id })
      return charged("brand_kit", async () => {
        const data = await fetchBrand(domain, signal)
        const { count } = await supabase
          .from("comic_brand_kits")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
        const { data: kit, error } = await supabase
          .from("comic_brand_kits")
          .insert({
            domain,
            ...data,
            voice: data.slogan,
            active: !count,
          })
          .select("id")
          .single()
        if (error) throw new Error(error.message)
        return { id: kit.id }
      })
    }
    case "brandVoice": {
      const { error } = await supabase
        .from("comic_brand_kits")
        .update({ voice: r.voice })
        .eq("id", r.id)
      return error ? fail("generic", 500) : Response.json({ ok: true })
    }
    case "brandUse": {
      // In this order: the index allows one active kit per person.
      await supabase
        .from("comic_brand_kits")
        .update({ active: false })
        .eq("user_id", viewer.id)
      const { error } = await supabase
        .from("comic_brand_kits")
        .update({ active: true })
        .eq("id", r.id)
      return error ? fail("generic", 500) : Response.json({ ok: true })
    }
    case "brandRemove": {
      const { error } = await supabase
        .from("comic_brand_kits")
        .delete()
        .eq("id", r.id)
      return error ? fail("generic", 500) : Response.json({ ok: true })
    }
    case "advertisers":
      return charged("studio_lookup", async () => ({
        advertisers: await searchAdvertisers(r.query, signal),
      }))
    case "ads":
      return charged("studio_lookup", async () => ({
        ads: rankAds(await companyAds(r.pageId, signal)),
      }))
    case "videos":
      if (!r.query && r.platform === "tiktok") return fail("invalid", 400)
      return charged("studio_lookup", async () => ({
        videos: rankVideos(
          r.query
            ? await searchVideos(r.platform, r.query, signal)
            : await trendingVideos(
                r.platform as Exclude<typeof r.platform, "tiktok">,
                signal
              )
        ),
      }))
    case "video":
      if (!platformOf(r.url)) return fail("unsupported", 400)
      return charged("studio_lookup", async () => ({
        video: await fetchVideo(r.url, signal),
      }))
    case "product":
      if (!r.url.startsWith("https://")) return fail("invalid", 400)
      return charged("studio_lookup", async () => ({
        product: await fetchProduct(r.url, signal),
      }))
    case "board": {
      const { data: brand } = await supabase
        .from("comic_brand_kits")
        .select("id, name, description, voice")
        .eq("active", true)
        .maybeSingle()
      const language = isLocale(r.language) ? r.language : "en"
      const write = async () => {
        const out = await writeBoard(
          viewer.id,
          r.source,
          brand,
          language,
          signal
        )
        const { data, error } = await supabase
          .from("comic_studio_boards")
          .insert({
            kind: r.source.kind,
            title: sourceTitle(r.source),
            source: r.source,
            board: out.board,
            brand_id: brand?.id ?? null,
            project_id: null,
            prompt: out.prompt,
          })
          .select("id")
          .single()
        if (error) throw new Error(error.message)
        return { id: data.id }
      }
      const openrouter = await payingConnection(viewer.id)
      if (!openrouter && !process.env.ANTHROPIC_API_KEY)
        return fail("setup", 503)
      return charged("studio_board", write, !!openrouter)
    }
    case "comic": {
      const { data: row } = await supabase
        .from("comic_studio_boards")
        .select("*")
        .eq("id", r.id)
        .maybeSingle()
      if (!row) return fail("generic", 404)
      if (row.project_id) return Response.json({ project: row.project_id })
      const project = await supabase
        .from("comic_projects")
        .insert({
          title: row.board.hook.slice(0, 120),
          data: comicFromBoard(row.board),
        })
        .select("id")
        .single()
      if (project.error) return fail("generic", 500)
      await supabase
        .from("comic_studio_boards")
        .update({ project_id: project.data.id })
        .eq("id", r.id)
      return Response.json({ project: project.data.id })
    }
    case "boardRemove": {
      const { error } = await supabase
        .from("comic_studio_boards")
        .delete()
        .eq("id", r.id)
      return error ? fail("generic", 500) : Response.json({ ok: true })
    }
  }
}
