import type { AgentMessage } from "@earendil-works/pi-agent-core"

import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { workOn } from "./agent.server"
import type { LogLine } from "./model"
import type { Run } from "./tools.server"

const SLICE_MS = 235_000
const LEASE_MS = 280_000
const MAX_SLICES = 8

const table = () => supabaseAdmin().from("comic_deep_dives")

// Functions stop after a few minutes and research takes longer, so a run is a
// chain of stretches. Each hands the next its saved conversation.
export async function kick(origin: string, id: string) {
  const secret = process.env.MACHINES_CRON_SECRET?.trim()
  if (!secret) throw new Error("MACHINES_CRON_SECRET is not set.")
  const call = fetch(`${origin}/api/deep-dives/work`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id }),
  }).catch((e) => console.error("Deep dive kick failed", id, e))
  // Long enough for the request to leave; the next function does the work.
  await Promise.race([call, new Promise((r) => setTimeout(r, 1_500))])
}

async function fail(row: { id: string; user_id: string; job: string }, why: string) {
  await table()
    .update({ status: "failed", problems: [why], leased_until: null })
    .eq("id", row.id)
  await supabaseAdmin().rpc("refund_credits_for", {
    p_user: row.user_id,
    p_job: row.job,
  })
}

export async function runSlice(id: string, origin: string) {
  const now = new Date()
  const { data: rows } = await table()
    .update({
      status: "running",
      leased_until: new Date(now.getTime() + LEASE_MS).toISOString(),
    })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .or(`leased_until.is.null,leased_until.lt.${now.toISOString()}`)
    .select("*")
  const row = rows?.[0]
  // Someone else holds it, or it has finished.
  if (!row) return "skipped"
  if (row.slices >= MAX_SLICES) {
    await fail(row, "The research ran too long.")
    return "failed"
  }

  const run: Run = {
    sources: row.sources,
    facts: row.facts,
    log: row.log,
    findings: row.findings,
    problems: row.problems,
    submits: row.submits,
    article: row.body ? { title: row.title, dek: row.dek, body: row.body } : null,
    done: false,
  }
  const save = (messages?: AgentMessage[]) =>
    table()
      .update({
        ...(messages && { messages }),
        log: run.log,
        facts: run.facts,
        sources: run.sources,
        findings: run.findings,
        problems: run.problems,
        submits: run.submits,
        ...(run.article && {
          title: run.article.title.slice(0, 300),
          dek: run.article.dek.slice(0, 500),
          body: run.article.body,
        }),
      })
      .eq("id", id)

  let messages: AgentMessage[]
  try {
    messages = await workOn(row.lead, row.messages, run, SLICE_MS, {
      log(tool, label) {
        const line: LogLine = { at: Date.now(), tool, label: label.slice(0, 200) }
        run.log.push(line)
      },
      async checkpoint(m) {
        await save(m)
      },
    })
  } catch (e) {
    console.error("Deep dive failed", id, e)
    await fail(row, "The agent stopped with an error.")
    return "failed"
  }
  await save(messages)
  if (run.done) {
    await table()
      .update({
        status: run.problems.length ? "review" : "done",
        leased_until: null,
      })
      .eq("id", id)
    return "finished"
  }
  await table()
    .update({ slices: row.slices + 1, leased_until: null })
    .eq("id", id)
  await kick(origin, id)
  return "continued"
}
