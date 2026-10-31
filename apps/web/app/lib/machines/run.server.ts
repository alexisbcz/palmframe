import { COSTS } from "@/lib/credits"
import type { MachineRow } from "@/lib/database"
import { resumeStalled, startMachineStory } from "@/lib/media/pipeline.server"
import { OpenRouterError, payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { runAgent } from "./agent.server"
import { type Detector, createDetector } from "./detect"
import { FeedBusy, readFeed } from "./feeds.server"
import {
  MAX_FAILURES,
  evidenceOf,
  freshItems,
  holdReason,
  isDue,
  nextRunAt,
} from "./gate"
import { drawPost, imageAvailable } from "./image.server"
import {
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
  const results = await Promise.all(
    config.feeds.map((feed) =>
      readFeed(feed, now, abort).catch((e) => {
        if (!(e instanceof FeedBusy)) {
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
      : null,
    allFailed: !!config.feeds.length && problems.length === config.feeds.length,
  }
}

const dayStart = (now: number) =>
  `${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`

// One edition: read the inbox, let the agent pick, then decide in plain code
// whether the post may go out by itself.
async function edition(
  l: Listener,
  now: number,
  deadline: number,
  origin: string
) {
  const { machine, config } = l
  const admin = supabaseAdmin()
  const abort = AbortSignal.timeout(Math.max(1_000, deadline - Date.now()))

  const heard = await gather(config, now, abort)
  await stored(heard.items, machine)
  l.error = heard.error

  const { count: today } = await admin
    .from("comic_machine_drafts")
    .select("id", { count: "exact", head: true })
    .eq("machine_id", machine.id)
    .gte("created_at", dayStart(now))
  if ((today ?? 0) >= config.dailyCap)
    return { drafts: 0, failed: heard.allFailed }

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
  if (!inbox.length) return { drafts: 0, failed: heard.allFailed }

  const connection = await payingConnection(machine.user_id)
  if (!connection && !process.env.ANTHROPIC_API_KEY)
    return { drafts: 0, failed: heard.allFailed }
  const job = `machine:${machine.id}:${Math.floor(now / 60_000)}`
  if (!connection) await spend(machine.user_id, "machine_run", job)

  const { data: posts } = await admin
    .from("comic_machine_drafts")
    .select("text")
    .eq("machine_id", machine.id)
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(15)
  const { data: brand } = await admin
    .from("comic_brand_kits")
    .select("name, voice")
    .eq("user_id", machine.user_id)
    .eq("active", true)
    .maybeSingle()

  let filed
  try {
    filed = await runAgent(
      { name: machine.name, config },
      brand?.voice ? `${brand.name}: ${brand.voice}` : "",
      inbox,
      (posts ?? []).map((p) => p.text),
      connection,
      abort
    )
  } catch (e) {
    if (!connection) await refund(machine.user_id, job)
    if (e instanceof OpenRouterError && e.status === 402)
      throw new OutOfCredits(e.message)
    throw e
  }

  // Everything it was shown has had its chance, so nothing is read twice.
  await admin
    .from("comic_machine_items")
    .update({ status: "skipped" })
    .eq("machine_id", machine.id)
    .eq("status", "new")
    .in(
      "key",
      inbox.slice(0, 30).map((i) => i.key)
    )
  if (!filed) return { drafts: 0, failed: heard.allFailed }

  // Names the picture, and makes each post its own row.
  const draftKey = crypto.randomUUID()
  let imageUrl: string | null = null
  if (config.image && filed.scene && imageAvailable(connection)) {
    const imageJob = `machine-image:${draftKey}`
    try {
      if (!connection) await spend(machine.user_id, "machine_image", imageJob)
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
        if (!connection) await refund(machine.user_id, imageJob)
      }
    }
  }

  const held = holdReason(
    filed.text,
    `${evidenceOf(filed.sources)}\n${filed.read}`,
    filed.sources
  )
  const auto = machine.publish_mode === "auto" && !held
  const { error } = await admin.from("comic_machine_drafts").insert({
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
    held: machine.publish_mode === "auto" ? held : null,
    status: auto ? "approved" : "new",
  })
  if (error) throw new Error(error.message)
  await admin
    .from("comic_machine_items")
    .update({ status: "used" })
    .eq("machine_id", machine.id)
    .in(
      "key",
      filed.sources.map((i) => i.key)
    )
  // A Story is an extra. It can't cost the machine the post it just filed.
  await startMachineStory(
    machine,
    config.media,
    filed.sources[0],
    draftKey,
    origin
  ).catch((e) => console.error("Machine story didn't start", machine.id, e))
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
    if (result?.published) published++
    if (result?.errors.length)
      await supabaseAdmin()
        .from("comic_machines")
        .update({ last_error: result.errors[0]!.error })
        .eq("id", machine.id)
  }
  return published
}

export async function runMachines(origin: string) {
  const now = Date.now()
  const deadline = now + DEADLINE_MS
  const admin = supabaseAdmin()
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

  const claimed: Listener[] = []
  for (const l of editions.slice(0, MAX_EDITIONS_PER_RUN)) {
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
      if (Date.now() + EDITION_MS > deadline) return
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

  await resumeStalled(origin).catch((e) =>
    console.error("Media runs not resumed", e)
  )
  const published = await publishQueue(machines, deadline + 20_000)
  await admin
    .from("comic_machine_items")
    .delete()
    .lt("created_at", new Date(now - INBOX_DAYS * 86_400_000).toISOString())
  return {
    machines: listeners.length,
    signals: listeners.reduce((n, l) => n + l.signals.length, 0),
    editions: claimed.length,
    drafts,
    published,
    errors: listeners.filter((l) => l.error).length,
  }
}
