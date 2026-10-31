import { COSTS } from "@/lib/credits"
import type { MachineRow, MachineRunRow } from "@/lib/database"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { type DayUsage, PUBLISHED_TRACK, X_LINK_CREDITS } from "./gate"
import { AGENT_DECISIONS, type RunDecision } from "./model"

// One row per edition, whatever happened, written only by the server. It is
// also where the day's limits are read from, so a failed read stops the run.
export const dayStart = (now: number) =>
  `${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`

type Fields = Partial<
  Pick<
    MachineRunRow,
    | "reason"
    | "credits"
    | "prompt"
    | "agent_text"
    | "draft_id"
    | "shown"
    | "cited"
    | "job"
  >
>

const row = (machine: MachineRow, decision: RunDecision, fields: Fields) => ({
  machine_id: machine.id,
  user_id: machine.user_id,
  decision,
  ...fields,
})

// Written before the agent starts, so a function killed mid-run still counts
// as an attempt.
export async function openRun(machine: MachineRow, fields: Fields) {
  const { data, error } = await supabaseAdmin()
    .from("comic_machine_runs")
    .insert(row(machine, "running", fields))
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function closeRun(
  id: string,
  decision: RunDecision,
  fields: Fields
) {
  const { error } = await supabaseAdmin()
    .from("comic_machine_runs")
    .update({ decision, ...fields })
    .eq("id", id)
  if (error) console.error("Machine run not recorded", id, error.message)
}

// An edition that never reached the agent. Losing this row costs a line of
// history and nothing else, so it can't fail the run.
export async function noteRun(
  machine: MachineRow,
  decision: RunDecision,
  fields: Fields = {}
) {
  const { error } = await supabaseAdmin()
    .from("comic_machine_runs")
    .insert(row(machine, decision, fields))
  if (error)
    console.error("Machine run not recorded", machine.id, error.message)
}

// credit_ledger can't answer this: image jobs carry no machine id, and renders
// are charged outside any run. Refunded renders still count, which errs towards
// stopping early.
export async function dayUsage(
  machine: MachineRow,
  now: number
): Promise<DayUsage> {
  const admin = supabaseAdmin()
  const today = dayStart(now)
  const [runs, posts, renders, linked] = await Promise.all([
    admin
      .from("comic_machine_runs")
      .select("decision, credits")
      .eq("machine_id", machine.id)
      .gte("created_at", today),
    admin
      .from("comic_machine_drafts")
      .select("id", { count: "exact", head: true })
      .eq("machine_id", machine.id)
      .in("status", PUBLISHED_TRACK)
      .is("held", null)
      .gte("created_at", today),
    admin
      .from("comic_media_renditions")
      .select("id", { count: "exact", head: true })
      .eq("machine_id", machine.id)
      .gte("created_at", today),
    admin
      .from("comic_machine_drafts")
      .select("receipts")
      .eq("machine_id", machine.id)
      .not("link", "is", null)
      .gte("published_at", today),
  ])
  const failure = runs.error ?? posts.error ?? renders.error ?? linked.error
  if (failure) throw new Error(failure.message)
  const rows = runs.data ?? []
  const onX = (linked.data ?? []).filter((d) =>
    d.receipts.some((r) => r.platform === "twitter" && r.postId && !r.error)
  ).length
  const agent: readonly RunDecision[] = AGENT_DECISIONS
  return {
    posts: posts.count ?? 0,
    attempts: rows.filter((r) => agent.includes(r.decision)).length,
    credits:
      rows.reduce((sum, r) => sum + r.credits, 0) +
      (renders.count ?? 0) * COSTS.media_render +
      onX * X_LINK_CREDITS,
  }
}
