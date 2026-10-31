import { COSTS } from "@/lib/credits"
import { leadSchema } from "@/lib/deepdive/model"
import { fail as failDive, kick } from "@/lib/deepdive/run.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.deep-dives"

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

const MAX_RUNNING = 2

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("generic", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return fail("generic", 401)
  if (!viewer.labs.machines) return fail("generic", 404)
  const body = (await request.json().catch(() => null)) as { lead?: unknown }
  const lead = leadSchema.safeParse(body?.lead)
  if (!lead.success) return fail("invalid", 400)

  const admin = supabaseAdmin()
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
    .insert({ user_id: viewer.id, lead: lead.data, job })
    .select("id")
    .single()
  if (error) {
    await supabase.rpc("refund_credits", { p_job: job })
    return fail("generic", 500)
  }
  try {
    await kick(new URL(request.url).origin, data.id)
  } catch (e) {
    console.error("Deep dive didn't start", data.id, e)
    await failDive({ id: data.id, user_id: viewer.id, job }, "It couldn't start.")
    return fail("generic", 500)
  }
  return Response.json({ id: data.id, balance: spent.data })
}
