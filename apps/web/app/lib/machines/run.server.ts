import { COSTS } from "@/lib/credits"
import type { MachineRow } from "@/lib/database"
import { resumeStalled, startMachineStory } from "@/lib/media/pipeline.server"
import { OpenRouterError, payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { splitMemory, tally } from "./agent.logic"
import { runAgent } from "./agent.server"
import { machinesHalted } from "./control.server"
import { type Detector, createDetector } from "./detect"
import { FeedBusy, FeedUnreadable, NotModified, readFeed } from "./feeds.server"
import {
  HOLD_MS,
  MAX_FAILURES,
  budgetStop,
  evidenceLimit,
  evidenceOf,
  freshItems,
  holdReason,
  isDue,
  nextRunAt,
} from "./gate"
import { drawPost, imageAvailable } from "./image.server"
import { closeRun, dayUsage, noteRun, openRun } from "./ledger.server"
import {
  type Feed,
  type Item,
  type Reading,
  type Signal,
  type SourceId,
  SOURCES,
  machineConfig,
} from "./model"
import { publishDraft } from "./publish.server"
import { openSource } from "./sources"

// One wake-up of the scheduled runner. Functions can't hold a socket for
// long, so each source is heard briefly: Bluesky and Wikipedia replay what
// happened since the last run, and prices are compared across runs.
const LISTEN_MS = 30_000
const REPLAY_LIMIT_MS = 30 * 60_000
const DEADLINE_MS = 110_000
const MAX_MACHINES_PER_RUN = 50
const MAX_EDITIONS_PER_RUN = 8
// A new edition takes this long at worst; later machines wait for the next tick.
const EDITION_MS = 45_000
const INBOX_DAYS = 14
const LEDGER_DAYS = 90
// Enough to fill all three memory lists after the ones that don't count.
const MEMORY_ROWS = 60
const REPLAYS: SourceId[] = ["bluesky", "wikipedia"]

interface Listener {
  machine: MachineRow
  config: ReturnType<typeof machineConfig.parse>
  detector: Detector
  from: number
  signals: Signal[]
  error: string | null
  // A ledger row already says how this edition ended.
  recorded: boolean
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
    recorded: false,
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

const SIGNAL_SOURCE: Record<SourceId, string> = {
  bluesky: "Bluesky",
  wikipedia: "Wikipedia",
  crypto: "Coinbase",
}

const signalItem = (s: Signal): Item => ({
  key: `signal:${s.id}`.slice(0, 300),
  source: SIGNAL_SOURCE[s.source],
  title: s.title,
  summary: s.facts,
  url: s.url,
  at: s.at,
})

class OutOfCredits extends Error {}

async function spend(
  userId: string,
  kind: "machine_run" | "machine_image",
  job: string
) {
  const { error } = await supabaseAdmin().rpc("spend_credits_for", {
    p_user: userId,
    p_cost: COSTS[kind],
    p_kind: kind,
    p_job: job,
  })
  if (error?.code === "P0402") throw new OutOfCredits(error.message)
  // A rerun of the same job: it has already been paid for.
  if (error && error.code !== "23505") throw new Error(error.message)
}

const refund = (userId: string, job: string) =>
  supabaseAdmin().rpc("refund_credits_for", { p_user: userId, p_job: job })

async function stored(rows: Item[], machine: MachineRow) {
  if (!rows.length) return
  const { error } = await supabaseAdmin()
    .from("comic_machine_items")
    .upsert(
      rows.map((i) => ({
        machine_id: machine.id,
        user_id: machine.user_id,
        key: i.key,
        source: i.source,
        title: i.title,
        summary: i.summary,
        url: i.url,
        published_at: new Date(i.at).toISOString(),
      })),
      { onConflict: "machine_id,key", ignoreDuplicates: true }
    )
  if (error) throw new Error(error.message)
}

// Hears the polled sources. One broken feed doesn't stop the others, and a
// busy one simply gets asked again next time.
async function gather(
  config: Listener["config"],
  now: number,
  abort: AbortSignal
) {
  const problems: string[] = []
  const unreadable: string[] = []
  const results = await Promise.all(
    config.feeds.map((feed) =>
      readFeed(feed, now, abort).catch((e) => {
        // Reported, but not a failure: a machine shouldn't be switched off
        // over a feed that used to look fine and has only now been noticed.
        if (e instanceof FeedUnreadable) unreadable.push(e.message)
        else if (!(e instanceof FeedBusy || e instanceof NotModified)) {
          console.error("Machine feed failed", feed.kind, e)
          problems.push(feed.kind === "rss" ? feed.url : feed.kind)
        }
        return [] as Item[]
      })
    )
  )
  return {
    items: results.flat(),
    error: problems.length
      ? `Couldn't read ${problems.join(", ").slice(0, 200)}.`
      : unreadable.length
        ? `unreadable:${unreadable.join(", ").slice(0, 200)}`
        : null,
    allFailed: !!config.feeds.length && problems.length === config.feeds.length,
  }
}

// These two are paid per search, so a machine that can't use today's results
// doesn't buy them.
const isFree = (feed: Feed) => feed.kind !== "tiktok" && feed.kind !== "youtube"

// One edition: read the inbox, let the agent pick, then decide in plain code
// whether the post may go out by itself. Every way out leaves a ledger row.
async function edition(
  l: Listener,
  now: number,
  deadline: number,
  origin: string
) {
  const { machine, config } = l
  const admin = supabaseAdmin()
  const abort = AbortSignal.timeout(Math.max(1_000, deadline - Date.now()))

  // A stopped machine keeps listening, so it has an inbox when it comes back.
  const usage = await dayUsage(machine, now)
  const stop = budgetStop(usage, config, COSTS.machine_run)
  const heard = await gather(
    stop ? { ...config, feeds: config.feeds.filter(isFree) } : config,
    now,
    abort
  )
  await stored(heard.items, machine)
  l.error = heard.error
  const quiet = { drafts: 0, failed: heard.allFailed }
  if (stop) {
    if (stop === "breaker") l.error = "budget"
    await noteRun(machine, stop)
    return quiet
  }

  const { data: rows } = await admin
    .from("comic_machine_items")
    .select("*")
    .eq("machine_id", machine.id)
    .eq("status", "new")
    .order("published_at", { ascending: false })
    .limit(60)
  const inbox = freshItems(
    (rows ?? []).map((r) => ({
      key: r.key,
      source: r.source,
      title: r.title,
      summary: r.summary,
      url: r.url,
      at: Date.parse(r.published_at),
    })),
    now
  )
  if (!inbox.length) {
    await noteRun(machine, "empty")
    return quiet
  }

  const connection = await payingConnection(machine.user_id)
  if (!connection && !process.env.ANTHROPIC_API_KEY) {
    await noteRun(machine, "no_writer")
    return quiet
  }
  const job = `machine:${machine.id}:${Math.floor(now / 60_000)}`
  const shown = inbox.slice(0, 30)
  let credits = connection ? 0 : COSTS.machine_run
  const run = await openRun(machine, {
    job,
    credits,
    shown: tally(shown),
  })
  l.recorded = true
  const endRun = (
    decision: Parameters<typeof closeRun>[1],
    fields: Parameters<typeof closeRun>[2] = {}
  ) => closeRun(run, decision, { credits, ...fields })
  const unpaid = async (e: unknown) => {
    credits = 0
    await endRun(e instanceof OutOfCredits ? "no_credits" : "failed", {
      reason: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
    })
    throw e
  }

  if (!connection)
    await spend(machine.user_id, "machine_run", job).catch(unpaid)

  const { data: drafts } = await admin
    .from("comic_machine_drafts")
    .select("text, status, receipts, sources, signal, dismiss_reason")
    .eq("machine_id", machine.id)
    .order("created_at", { ascending: false })
    .limit(MEMORY_ROWS)
  const { data: brand } = await admin
    .from("comic_brand_kits")
    .select("name, voice")
    .eq("user_id", machine.user_id)
    .eq("active", true)
    .maybeSingle()

  let result
  try {
    result = await runAgent(
      { name: machine.name, config },
      brand?.voice ? `${brand.name}: ${brand.voice}` : "",
      inbox,
      splitMemory(drafts ?? []),
      connection,
      abort
    )
  } catch (e) {
    if (!connection) await refund(machine.user_id, job)
    if (e instanceof OpenRouterError && e.status === 402)
      return unpaid(new OutOfCredits(e.message))
    return unpaid(e)
  }

  // Everything it was shown has had its chance, so nothing is read twice.
  await admin
    .from("comic_machine_items")
    .update({ status: "skipped" })
    .eq("machine_id", machine.id)
    .eq("status", "new")
    .in(
      "key",
      shown.map((i) => i.key)
    )
  if (result.decision !== "filed") {
    await endRun(result.decision, {
      reason: result.reason,
      prompt: result.prompt,
    })
    return quiet
  }
  const { filed } = result
  const affordable = (cost: number) =>
    usage.credits + credits + cost <= config.maxCreditsPerDay

  // Names the picture, and makes each post its own row.
  const draftKey = crypto.randomUUID()
  let imageUrl: string | null = null
  const charged = !connection
  if (
    config.image &&
    filed.scene &&
    imageAvailable(connection) &&
    (connection || affordable(COSTS.machine_image))
  ) {
    const imageJob = `machine-image:${draftKey}`
    let paid = false
    try {
      if (charged) {
        await spend(machine.user_id, "machine_image", imageJob)
        paid = true
        credits += COSTS.machine_image
      }
      imageUrl = await drawPost(
        machine.user_id,
        draftKey,
        filed.scene,
        connection,
        abort
      )
    } catch (e) {
      // A post without its picture beats no post.
      if (!(e instanceof OutOfCredits)) {
        console.error("Machine image failed", machine.id, e)
        if (paid) {
          await refund(machine.user_id, imageJob)
          credits -= COSTS.machine_image
        }
      }
    }
  }

  const evidence = `${evidenceOf(filed.sources)}\n${filed.read}`
  const held = holdReason(filed.text, evidence, filed.sources, config.language)
  const auto = machine.publish_mode === "auto" && !held
  const { data: draft, error } = await admin
    .from("comic_machine_drafts")
    .insert({
      machine_id: machine.id,
      user_id: machine.user_id,
      signal_id: `post:${draftKey}`,
      text: filed.text,
      scene: filed.scene,
      alt: filed.alt,
      prompt: filed.prompt,
      sources: filed.sources.map((i) => ({
        title: i.title,
        url: i.url,
        source: i.source,
      })),
      link: filed.link,
      image_url: imageUrl,
      evidence: evidenceLimit(evidence),
      // Stored in review mode too: the reviewer is who the reason is for.
      held,
      status: auto ? "approved" : "new",
    })
    .select("id")
    .single()
  if (error) {
    await endRun("failed", {
      reason: error.message.slice(0, 1000),
      prompt: filed.prompt,
      agent_text: filed.text,
    })
    throw new Error(error.message)
  }
  await admin
    .from("comic_machine_items")
    .update({ status: "used" })
    .eq("machine_id", machine.id)
    .in(
      "key",
      filed.sources.map((i) => i.key)
    )
  // A Story is an extra. It can't cost the machine the post it just filed, and
  // nothing pays for research on a post that may never go out.
  if (!held && affordable(COSTS.deep_dive)) {
    const started = await startMachineStory(
      machine,
      config.media,
      filed.sources[0],
      draftKey,
      origin
    ).catch((e) => {
      console.error("Machine story didn't start", machine.id, e)
      return false
    })
    if (started) credits += COSTS.deep_dive
  }
  await endRun("filed", {
    prompt: filed.prompt,
    agent_text: filed.text,
    draft_id: draft.id,
    cited: tally(filed.sources),
  })
  return { drafts: 1, failed: false }
}

// Everything approved, whether by a person or by an auto machine.
async function publishQueue(machines: MachineRow[], deadline: number) {
  const byId = new Map(machines.map((m) => [m.id, m]))
  const { data } = await supabaseAdmin()
    .from("comic_machine_drafts")
    .select("id, machine_id")
    .eq("status", "approved")
    .order("created_at")
    .limit(20)
  let published = 0
  for (const row of data ?? []) {
    if (Date.now() > deadline) break
    const machine = byId.get(row.machine_id)
    if (!machine) continue
    const result = await publishDraft(row.id, machine)
    if (result?.halted) break
    if (result?.published) published++
    if (result?.errors.length)
      await supabaseAdmin()
        .from("comic_machines")
        .update({ last_error: result.errors[0]!.error })
        .eq("id", machine.id)
  }
  return published
}

// Held posts nobody got to. They've left the cap already, so this only clears
// them from the owner's queue.
async function expireHeld(now: number) {
  const { error } = await supabaseAdmin()
    .from("comic_machine_drafts")
    .update({ status: "expired" })
    .eq("status", "new")
    .not("held", "is", null)
    .lt("created_at", new Date(now - HOLD_MS).toISOString())
  if (error) console.error("Held posts not expired", error.message)
}

export async function runMachines(origin: string) {
  const now = Date.now()
  const deadline = now + DEADLINE_MS
  const admin = supabaseAdmin()
  const summary = {
    machines: 0,
    signals: 0,
    editions: 0,
    drafts: 0,
    published: 0,
    errors: 0,
    halted: false,
  }
  // Before anything that spends or sends, including resuming stalled Stories.
  if (await machinesHalted()) return { ...summary, halted: true }
  await expireHeld(now)

  const { data, error } = await admin
    .from("comic_machines")
    .select("*")
    .eq("enabled", true)
    .order("next_run_at", { ascending: true, nullsFirst: true })
    .limit(MAX_MACHINES_PER_RUN)
  if (error) throw new Error(error.message)
  const machines = data ?? []

  const listeners = machines.flatMap((m) => listener(m) ?? [])
  await Promise.all(
    SOURCES.map((source) => {
      const heard = listeners.filter(
        (l) => l.machine.source === source && l.config.listen
      )
      return heard.length ? listen(source, heard, now) : null
    })
  )

  let drafts = 0
  const editions: Listener[] = []
  await Promise.all(
    listeners.map(async (l) => {
      const signals = l.signals.map(signalItem)
      await stored(signals, l.machine).catch((e) => {
        console.error("Machine signals not stored", l.machine.id, e)
      })
      // A burst on the wire wakes the agent before its next scheduled read.
      if (signals.length || isDue(l.machine.next_run_at, now)) editions.push(l)
      await admin
        .from("comic_machines")
        .update({ state: l.detector.state })
        .eq("id", l.machine.id)
    })
  )

  // The wire took up to 30 seconds, so a halt may have come in since.
  const halted = await machinesHalted()
  const claimed: Listener[] = []
  for (const l of halted ? [] : editions.slice(0, MAX_EDITIONS_PER_RUN)) {
    // Moving next_run_at first means an overlapping run skips this machine.
    let claim = admin
      .from("comic_machines")
      .update({ next_run_at: nextRunAt(now, l.config.everyMinutes) })
      .eq("id", l.machine.id)
    claim = l.machine.next_run_at
      ? claim.eq("next_run_at", l.machine.next_run_at)
      : claim.is("next_run_at", null)
    const { data: won } = await claim.select("id")
    if (won?.length) claimed.push(l)
  }

  await Promise.all(
    claimed.map(async (l) => {
      if (Date.now() + EDITION_MS > deadline) {
        await noteRun(l.machine, "deadline")
        return
      }
      let failures = 0
      try {
        const r = await edition(l, now, deadline, origin)
        drafts += r.drafts
        failures = r.failed ? l.machine.failures + 1 : 0
      } catch (e) {
        console.error("Machine edition failed", l.machine.id, e)
        failures = l.machine.failures + 1
        l.error =
          e instanceof OutOfCredits
            ? "Out of credits, so this machine is paused."
            : "The last run failed. It will try again."
        if (e instanceof OutOfCredits) failures = MAX_FAILURES
        if (!l.recorded)
          await noteRun(l.machine, "error", {
            reason: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
          })
      }
      const stopped = failures >= MAX_FAILURES
      await admin
        .from("comic_machines")
        .update({
          last_run_at: new Date().toISOString(),
          last_error:
            stopped && !(l.error ?? "").startsWith("Out of credits")
              ? "Paused after repeated failures. Check its sources, then turn it back on."
              : l.error,
          failures: stopped ? 0 : failures,
          ...(stopped && { enabled: false }),
        })
        .eq("id", l.machine.id)
    })
  )

  if (!halted)
    await resumeStalled(origin).catch((e) =>
      console.error("Media runs not resumed", e)
    )
  const published = await publishQueue(machines, deadline + 20_000)
  await admin
    .from("comic_machine_items")
    .delete()
    .lt("created_at", new Date(now - INBOX_DAYS * 86_400_000).toISOString())
  await admin
    .from("comic_machine_runs")
    .delete()
    .lt("created_at", new Date(now - LEDGER_DAYS * 86_400_000).toISOString())
  return {
    ...summary,
    halted,
    machines: listeners.length,
    signals: listeners.reduce((n, l) => n + l.signals.length, 0),
    editions: claimed.length,
    drafts,
    published,
    errors: listeners.filter((l) => l.error).length,
  }
}
