// Scheduling the fleet. pg_cron wakes /api/autopilot/tick once a minute; the
// tick kicks one worker per due agent, and each worker leases its agent so two
// processes never open the same durable session.
import { COSTS } from "@/lib/credits"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { readLabs } from "@/lib/tools/catalog"

import { logEvent, work, type Wake } from "./agent.server"
import type { AgentRow } from "./database"

const LEASE_MS = 6 * 60_000
// What one worker spends before it stores the session and hands over.
export const SLICE_MS = Number(process.env.AUTOPILOT_SLICE_MS) || 230_000
const MAX_KICKS = 25

const table = () => supabaseAdmin().from("comic_autopilot_agents")

export type WakeRequest =
  { kind: "run"; note?: string } | { kind: "resume" } | { kind: "inbox" }

export async function kickAgent(origin: string, id: string, wake: WakeRequest) {
  const secret = process.env.MACHINES_CRON_SECRET?.trim()
  if (!secret) throw new Error("MACHINES_CRON_SECRET is not set.")
  const call = fetch(`${origin}/api/autopilot/work`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id, wake }),
  }).catch((e) => console.error("Autopilot kick failed", id, e))
  // Long enough for the request to leave; the next function does the work.
  await Promise.race([call, new Promise((r) => setTimeout(r, 1_500))])
}

async function lease(id: string) {
  const now = new Date()
  const { data } = await table()
    .update({ leased_until: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq("id", id)
    .or(`leased_until.is.null,leased_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle()
  return data as AgentRow | null
}

async function spentThisWeek(agent: AgentRow) {
  const { count } = await supabaseAdmin()
    .from("comic_autopilot_events")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agent.id)
    .eq("kind", "run_start")
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
  return (count ?? 0) * COSTS.autopilot_run
}

// Posts a run filed in earlier slices, counted from its start event.
async function filedSinceStart(agent: AgentRow) {
  const admin = supabaseAdmin()
  const { data: start } = await admin
    .from("comic_autopilot_events")
    .select("created_at")
    .eq("agent_id", agent.id)
    .eq("kind", "run_start")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!start) return 0
  const { count } = await admin
    .from("comic_autopilot_posts")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agent.id)
    .gte("created_at", start.created_at)
  return count ?? 0
}

const later = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString()

// One worker's slice of an agent's life.
export async function runSlice(
  id: string,
  request: WakeRequest,
  origin: string
) {
  const agent = await lease(id)
  if (!agent) return "busy"
  const admin = supabaseAdmin()
  const release = (fields: Partial<AgentRow>) =>
    table()
      .update({ ...fields, leased_until: null })
      .eq("id", id)

  // Messages that arrived while it was busy go in with whatever runs now.
  const inbox = agent.inbox ?? []
  let wake: Wake =
    request.kind === "run"
      ? {
          kind: "run",
          slot: new Date().toISOString().slice(0, 16),
          note: request.note,
        }
      : inbox.length
        ? { kind: "messages", items: inbox }
        : { kind: "resume" }

  let job = ""
  if (wake.kind === "run") {
    if (
      (await spentThisWeek(agent)) + COSTS.autopilot_run >
      agent.max_credits_per_week
    ) {
      await release({
        last_error: "Weekly credit cap reached.",
        next_run_at: later(agent.cadence),
        state: "sleeping",
      })
      await logEvent(
        agent,
        "error",
        "Skipped a run: weekly credit cap reached."
      )
      return "capped"
    }
    job = `autopilot:${agent.id}:${wake.slot}`
    const spent = await admin.rpc("spend_credits_for", {
      p_user: agent.user_id,
      p_cost: COSTS.autopilot_run,
      p_kind: "autopilot_run",
      p_job: job,
    })
    if (spent.error) {
      const why =
        spent.error.code === "P0402" ? "Out of credits." : "Couldn't charge."
      await release({
        last_error: why,
        next_run_at: later(agent.cadence),
        state: "sleeping",
      })
      await logEvent(agent, "error", `Skipped a run: ${why}`)
      return "credits"
    }
    await logEvent(agent, "run_start", `Started run ${agent.runs + 1}`)
  }
  if (inbox.length) {
    await table().update({ inbox: [] }).eq("id", id)
    if (wake.kind === "run")
      wake = {
        ...wake,
        note: [wake.note, ...inbox.map((m) => `The creator says: ${m.text}`)]
          .filter(Boolean)
          .join("\n\n"),
      }
  }

  await table().update({ state: "running", last_error: "" }).eq("id", id)
  try {
    const { outcome, filed } = await work(agent, wake, SLICE_MS)
    if (outcome === "pending") {
      // Still working: store and hand over to a fresh function.
      await release({ state: "running" })
      await kickAgent(origin, id, { kind: "resume" })
      return "continued"
    }
    // A run ends here whether it started in this slice or an earlier worker's.
    const ended = wake.kind === "run" || agent.state === "running"
    await release({
      state: agent.enabled ? "sleeping" : "idle",
      ...(ended && {
        runs: agent.runs + 1,
        last_run_at: new Date().toISOString(),
        next_run_at: agent.enabled ? later(agent.cadence) : null,
      }),
    })
    if (ended) {
      const total = wake.kind === "run" ? filed : await filedSinceStart(agent)
      await logEvent(
        agent,
        "run_end",
        total
          ? `Filed ${total} post${total > 1 ? "s" : ""}`
          : "Finished the run"
      )
    } else await logEvent(agent, "reply", "Answered your message")
    // Something arrived during the run.
    const { data: fresh } = await table().select("inbox").eq("id", id).single()
    if (fresh?.inbox?.length) await kickAgent(origin, id, { kind: "inbox" })
    return "done"
  } catch (e) {
    const why = e instanceof Error ? e.message : "The run failed."
    console.error("Autopilot run failed", id, e)
    if (job)
      await admin.rpc("refund_credits_for", {
        p_user: agent.user_id,
        p_job: job,
      })
    await release({
      state: "failed",
      last_error: why.slice(0, 300),
      next_run_at: later(Math.min(agent.cadence, 60)),
    })
    await logEvent(agent, "error", why)
    return "failed"
  }
}

export async function tick(origin: string) {
  const now = new Date().toISOString()
  const out: Record<string, string> = {}
  const free = `leased_until.is.null,leased_until.lt.${now}`

  // Runs a worker dropped (timeout, crash, deploy): the session resumes them.
  const { data: stalled } = await table()
    .select("id")
    .eq("state", "running")
    .or(free)
    .limit(MAX_KICKS)
  for (const a of stalled ?? []) {
    out[a.id] = "resume"
    await kickAgent(origin, a.id, { kind: "resume" })
  }

  const { data: due } = await table()
    .select("id, user_id")
    .eq("enabled", true)
    .lte("next_run_at", now)
    .neq("state", "running")
    .or(free)
    .order("next_run_at")
    .limit(MAX_KICKS)
  const owners = new Map<string, boolean>()
  for (const a of due ?? []) {
    // The Labs switch is the off switch for the whole fleet.
    if (!owners.has(a.user_id)) {
      const { data } = await supabaseAdmin().auth.admin.getUserById(a.user_id)
      owners.set(a.user_id, readLabs(data.user?.user_metadata?.labs).autopilot)
    }
    if (!owners.get(a.user_id)) {
      await table().update({ enabled: false, state: "idle" }).eq("id", a.id)
      continue
    }
    out[a.id] = "run"
    await kickAgent(origin, a.id, { kind: "run" })
  }
  return out
}
