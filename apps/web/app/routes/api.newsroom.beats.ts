import { z } from "zod"

import { leadSchema } from "@/lib/deepdive/model"
import { scheduleOf } from "@/lib/newsroom/beats.server"
import { nextRun, validTimezone } from "@/lib/newsroom/schedule"
import { storyOptions } from "@/lib/newsroom/styles"
import { TEMPLATE_IDS } from "@/lib/newsroom/templates"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.newsroom.beats"

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

const MAX_BEATS = 20

const beat = z.object({
  name: z.string().trim().min(1).max(80),
  lead: leadSchema,
  template: z.enum(TEMPLATE_IDS),
  options: storyOptions,
  cadence: z.enum(["daily", "weekdays", "weekly"]),
  weekday: z.number().int().min(0).max(6),
  minute_of_day: z.number().int().min(0).max(1439),
  timezone: z.string().max(64).refine(validTimezone),
  enabled: z.boolean(),
  auto_publish: z.boolean(),
  auto_newsletter: z.boolean(),
  auto_social: z.boolean(),
  max_credits_per_week: z.number().int().min(0).max(5000),
})

const body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("save"), id: z.uuid().nullable(), beat }),
  z.object({ intent: z.literal("remove"), id: z.uuid() }),
  z.object({ intent: z.literal("toggle"), id: z.uuid(), on: z.boolean() }),
  z.object({ intent: z.literal("run"), id: z.uuid() }),
])

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("generic", 405)
  const { viewer } = await getViewer(request)
  if (!viewer) return fail("generic", 401)
  if (!viewer.labs.newsroom) return fail("generic", 404)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("invalid", 400)
  const r = parsed.data
  const admin = supabaseAdmin()
  const now = new Date()
  const mine = () =>
    admin.from("comic_newsroom_beats").select("*").eq("user_id", viewer.id)

  if (r.intent === "save") {
    const next = r.beat.enabled
      ? nextRun(scheduleOf(r.beat), now).toISOString()
      : null
    if (r.id) {
      const { error } = await admin
        .from("comic_newsroom_beats")
        .update({ ...r.beat, next_run_at: next, last_error: "" })
        .eq("id", r.id)
        .eq("user_id", viewer.id)
      if (error) return fail("generic", 500)
      return Response.json({ ok: true, id: r.id })
    }
    const { count } = await admin
      .from("comic_newsroom_beats")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewer.id)
    if ((count ?? 0) >= MAX_BEATS) return fail("limit", 409)
    const { data, error } = await admin
      .from("comic_newsroom_beats")
      .insert({ user_id: viewer.id, ...r.beat, next_run_at: next })
      .select("id")
      .single()
    if (error || !data) return fail("generic", 500)
    return Response.json({ ok: true, id: data.id })
  }

  const { data: found } = await mine().eq("id", r.id).maybeSingle()
  if (!found) return fail("missing", 404)

  if (r.intent === "remove") {
    await admin.from("comic_newsroom_beats").delete().eq("id", found.id)
    return Response.json({ ok: true })
  }
  if (r.intent === "toggle") {
    await admin
      .from("comic_newsroom_beats")
      .update({
        enabled: r.on,
        next_run_at: r.on
          ? nextRun(scheduleOf(found), now).toISOString()
          : null,
        last_error: "",
      })
      .eq("id", found.id)
    return Response.json({ ok: true })
  }
  // run: due now, so the next tick (within a minute) files it. The regular
  // schedule carries on after.
  await admin
    .from("comic_newsroom_beats")
    .update({ enabled: true, next_run_at: now.toISOString(), last_error: "" })
    .eq("id", found.id)
  return Response.json({ ok: true })
}
