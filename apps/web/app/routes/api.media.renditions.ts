import { z } from "zod"

import { COSTS } from "@/lib/credits"
import { availableFormats } from "@/lib/media/formats"
import { FORMATS } from "@/lib/media/model"
import { queueRendition } from "@/lib/media/render.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.media.renditions"

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

const input = z.object({ deepDiveId: z.uuid(), format: z.enum(FORMATS) })
const MAX_RUNNING = 6

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("generic", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return fail("generic", 401)
  if (!viewer.labs.machines) return fail("generic", 404)
  const body = input.safeParse(await request.json().catch(() => null))
  if (!body.success) return fail("invalid", 400)
  const { deepDiveId, format } = body.data
  if (!availableFormats().includes(format)) return fail("unsupported", 400)

  // Read as the viewer, so someone else's Story is simply not there.
  const { data: dive } = await supabase
    .from("comic_deep_dives")
    .select("id, status")
    .eq("id", deepDiveId)
    .maybeSingle()
  if (!dive) return fail("missing", 404)
  if (dive.status !== "done" && dive.status !== "review")
    return fail("invalid", 400)

  const { count } = await supabaseAdmin()
    .from("comic_media_renditions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.id)
    .in("status", ["queued", "running"])
  if ((count ?? 0) >= MAX_RUNNING) return fail("busy", 429)

  const job = crypto.randomUUID()
  const spent = await supabase.rpc("spend_credits", {
    p_cost: COSTS.media_render,
    p_kind: "media_render",
    p_job: job,
  })
  if (spent.error?.code === "P0402") return fail("credits", 402)
  if (spent.error) return fail("generic", 500)
  try {
    const { id, started } = await queueRendition(
      { user_id: viewer.id, deep_dive_id: deepDiveId, format, job },
      new URL(request.url).origin
    )
    return started
      ? Response.json({ id, balance: spent.data })
      : fail("generic", 500)
  } catch (e) {
    await supabase.rpc("refund_credits", { p_job: job })
    // The partial unique index: this format is already there.
    if ((e as { code?: string }).code === "23505") return fail("busy", 409)
    console.error("Rendition not queued", e)
    return fail("generic", 500)
  }
}
