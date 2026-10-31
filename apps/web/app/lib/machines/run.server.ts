import type { MachineRow } from "@/lib/database"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { type Detector, createDetector } from "./detect"
import {
  type Reading,
  type Signal,
  type SourceId,
  SOURCES,
  machineConfig,
} from "./model"
import { openSource } from "./sources"
import { OutOfCredits, writeDraft, type Billing } from "./writer.server"

// One wake-up of the scheduled runner. Functions can't hold a socket for
// long, so each source is heard briefly: Bluesky and Wikipedia replay what
// happened since the last run, and prices are compared across runs.
const LISTEN_MS = 30_000
const REPLAY_LIMIT_MS = 30 * 60_000
const DEADLINE_MS = 110_000
const MAX_MACHINES_PER_RUN = 50
const MAX_DRAFTS_PER_RUN = 3
const REPLAYS: SourceId[] = ["bluesky", "wikipedia"]

interface Listener {
  machine: MachineRow
  config: ReturnType<typeof machineConfig.parse>
  detector: Detector
  from: number
  signals: Signal[]
  error: string | null
}

function listener(machine: MachineRow): Listener | null {
  const config = machineConfig.safeParse(machine.config)
  if (!config.success) return null
  const state = machine.state ?? {}
  return {
    machine,
    config: config.data,
    detector: createDetector(machine.source, config.data, state),
    from: state.cursor ?? 0,
    signals: [],
    error: null,
  }
}

async function listen(source: SourceId, listeners: Listener[], now: number) {
  const controller = new AbortController()
  const stop = setTimeout(() => controller.abort(), LISTEN_MS)
  const replays = REPLAYS.includes(source)
  const earliest = Math.min(...listeners.map((l) => l.from))
  // A machine's first run has nothing to catch up on: it starts from now.
  const since =
    replays && earliest > 0
      ? Math.max(earliest, now - REPLAY_LIMIT_MS)
      : undefined
  const onReading = (reading: Reading) => {
    for (const l of listeners) {
      if (reading.at <= l.from) continue
      const signal = l.detector.step(reading)
      if (signal) l.signals.push(signal)
    }
    // Caught up with the present: this run has heard all it needs.
    if (replays && since && reading.at >= now) controller.abort()
  }
  try {
    await openSource(source, {
      keywords: [...new Set(listeners.flatMap((l) => l.config.keywords))],
      since,
      signal: controller.signal,
      onReading,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    for (const l of listeners) l.error = message.slice(0, 300)
  } finally {
    clearTimeout(stop)
  }
}

const billing = (userId: string, job: string): Billing => ({
  async spend(cost) {
    const { error } = await supabaseAdmin().rpc("spend_credits_for", {
      p_user: userId,
      p_cost: cost,
      p_kind: "machine_draft",
      p_job: job,
    })
    if (error?.code === "P0402") throw new OutOfCredits(error.message)
    // A rerun of the same signal: this job has already been paid for.
    if (error && error.code !== "23505") throw new Error(error.message)
  },
  async refund() {
    await supabaseAdmin().rpc("refund_credits_for", {
      p_user: userId,
      p_job: job,
    })
  },
})

async function writeSignals(l: Listener, deadline: number) {
  const { machine, config, detector } = l
  const today = new Date().toISOString().slice(0, 10)
  const state = detector.state
  if (state.written?.day !== today) state.written = { day: today, count: 0 }
  const written = state.written
  let drafts = 0
  for (const signal of l.signals.slice(0, MAX_DRAFTS_PER_RUN)) {
    if (written.count >= config.dailyCap || Date.now() > deadline) break
    try {
      const draft = await writeDraft(
        machine.user_id,
        signal,
        config,
        billing(machine.user_id, `machine:${machine.id}:${signal.id}`),
        AbortSignal.timeout(Math.max(1_000, deadline - Date.now()))
      )
      written.count++
      if (!draft) continue
      const { error } = await supabaseAdmin()
        .from("comic_machine_drafts")
        .upsert(
          {
            machine_id: machine.id,
            user_id: machine.user_id,
            signal_id: signal.id,
            signal,
            ...draft,
          },
          { onConflict: "machine_id,signal_id", ignoreDuplicates: true }
        )
      if (error) throw new Error(error.message)
      drafts++
    } catch (e) {
      // Provider errors stay in the logs; the owner reads this line.
      console.error("Machine draft failed", machine.id, e)
      if (e instanceof OutOfCredits) {
        l.error = "Out of credits, so drafts are paused."
        break
      }
      l.error = "The writer failed on a draft. It will try the next signal."
    }
  }
  return drafts
}

export async function runMachines() {
  const now = Date.now()
  const deadline = now + DEADLINE_MS
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from("comic_machines")
    .select("*")
    .eq("enabled", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(MAX_MACHINES_PER_RUN)
  if (error) throw new Error(error.message)

  const listeners = (data ?? []).flatMap((m) => listener(m) ?? [])
  await Promise.all(
    SOURCES.map((source) => {
      const heard = listeners.filter((l) => l.machine.source === source)
      return heard.length ? listen(source, heard, now) : null
    })
  )

  let drafts = 0
  await Promise.all(
    listeners.map(async (l) => {
      drafts += await writeSignals(l, deadline)
      await admin
        .from("comic_machines")
        .update({
          state: l.detector.state,
          last_run_at: new Date().toISOString(),
          last_error: l.error,
        })
        .eq("id", l.machine.id)
    })
  )
  return {
    machines: listeners.length,
    signals: listeners.reduce((n, l) => n + l.signals.length, 0),
    drafts,
    errors: listeners.filter((l) => l.error).length,
  }
}
