import { z } from "zod"

import { COSTS } from "@/lib/credits"
import { leadSchema } from "@/lib/deepdive/model"
import { fail as failDive, kick } from "@/lib/deepdive/run.server"
import { TEMPLATE_IDS } from "@/lib/newsroom/templates"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.newsroom"

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

const MAX_RUNNING = 2

const body = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("file"),
    lead: leadSchema,
    template: z.enum(TEMPLATE_IDS),
  }),
  z.object({ intent: z.literal("remove"), id: z.uuid() }),
])

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("generic", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return fail("generic", 401)
  if (!viewer.labs.newsroom) return fail("generic", 404)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("invalid", 400)
  const r = parsed.data
  const admin = supabaseAdmin()

  if (r.intent === "remove") {
    // A running story would keep spending, so only finished ones go.
    const { error } = await admin
      .from("comic_deep_dives")
      .delete()
      .eq("id", r.id)
      .eq("user_id", viewer.id)
      .not("template", "is", null)
      .in("status", ["done", "review", "failed"])
    if (error) return fail("generic", 500)
    return Response.json({ ok: true })
  }

  const { count } = await admin
    .from("comic_deep_dives")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.id)
    .in("status", ["queued", "running"])
  if ((count ?? 0) >= MAX_RUNNING) return fail("busy", 429)

  const job = crypto.randomUUID()
  const spent = await supabase.rpc("spend_credits", {
    p_cost: COSTS.deep_dive,
    p_kind: "deep_dive",
    p_job: job,
  })
  if (spent.error?.code === "P0402") return fail("credits", 402)
  if (spent.error) return fail("generic", 500)
  const { data, error } = await admin
    .from("comic_deep_dives")
    .insert({
      user_id: viewer.id,
      lead: r.lead,
      template: r.template,
      job,
    })
    .select("id")
    .single()
  if (error) {
    await supabase.rpc("refund_credits", { p_job: job })
    return fail("generic", 500)
  }
  try {
    await kick(new URL(request.url).origin, data.id)
  } catch (e) {
    console.error("Newsroom story didn't start", data.id, e)
    await failDive(
      { id: data.id, user_id: viewer.id, job },
      "It couldn't start."
    )
    return fail("generic", 500)
  }
  return Response.json({ id: data.id, balance: spent.data })
}
