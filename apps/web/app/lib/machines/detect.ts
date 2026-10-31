import type { MachineConfig, Measure, Reading, Signal, SourceId } from "./model"

// The filter, pure and with no clock of its own: time comes from each reading,
// so replayed history fires exactly as live events do. State is plain JSON,
// which lets the scheduled runner keep it between runs.
export interface DetectorState {
  // When this machine last heard from the stream.
  cursor?: number
  // Drafts the scheduled runner paid for on this UTC day, the daily cap's count.
  written?: { day: string; count: number }
  points?: Record<string, { v: number; at: number }[]>
  hits?: Record<string, { at: number[]; samples: string[]; url: string }>
  fired?: Record<string, number>
}

const MINUTE = 60_000
const MAX_SUBJECTS = 400
const CHECKPOINTS = 12
const SAMPLES = 5

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Whole words in any script, so "art" doesn't match "party".
export function compileWords(words: string[]) {
  if (!words.length) return null
  const alternatives = words.map(escape).join("|")
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(${alternatives})(?![\\p{L}\\p{N}])`,
    "iu"
  )
}

export interface Detector {
  step(reading: Reading): Signal | null
  matches(reading: Reading): boolean
  state: DetectorState
}

const minutes = (n: number) => `${n} minute${n === 1 ? "" : "s"}`

const money = (v: number) =>
  `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 4 : 2 })}`

function describe(reading: Reading, measure: Measure) {
  if (reading.kind === "text" && measure.type === "count") {
    const one = measure.count === 1
    const place =
      reading.source === "wikipedia"
        ? `edit${one ? "" : "s"} to the Wikipedia article "${reading.subject}"`
        : `Bluesky post${one ? "" : "s"} mentioning "${reading.subject}"`
    return `${measure.count} ${place} within ${minutes(measure.minutes)}.`
  }
  if (reading.kind === "level" && measure.type === "move") {
    const sign = measure.change > 0 ? "+" : ""
    return `${reading.label} moved ${sign}${measure.change.toFixed(1)}% from ${money(measure.from)} to ${money(measure.to)} within ${minutes(measure.minutes)}.`
  }
  return ""
}

// Oversized maps lose their stalest subjects first.
function trim<T>(map: Record<string, T>, last: (value: T) => number) {
  const keys = Object.keys(map)
  if (keys.length <= MAX_SUBJECTS) return
  keys
    .sort((a, b) => last(map[a]!) - last(map[b]!))
    .slice(0, keys.length - MAX_SUBJECTS)
    .forEach((k) => delete map[k])
}

export function createDetector(
  source: SourceId,
  config: MachineConfig,
  state: DetectorState = {}
): Detector {
  const include = compileWords(config.keywords)
  const exclude = compileWords(config.exclude)
  const windowMs = config.windowMinutes * MINUTE
  const cooldownMs = config.cooldownMinutes * MINUTE
  const points = (state.points ??= {})
  const hits = (state.hits ??= {})
  const fired = (state.fired ??= {})

  const keywordOf = (reading: Extract<Reading, { kind: "text" }>) =>
    include?.exec(reading.text)?.[1]?.toLowerCase() ?? null

  const matches = (reading: Reading) => {
    if (reading.source !== source) return false
    if (reading.kind === "level") {
      return !exclude?.test(`${reading.label} ${reading.subject}`)
    }
    if (reading.lang && reading.lang !== config.language) return false
    if (exclude?.test(reading.text)) return false
    return !include || keywordOf(reading) !== null
  }

  const quiet = (key: string, at: number) =>
    at - (fired[key] ?? -Infinity) < cooldownMs

  const signal = (key: string, reading: Reading, measure: Measure) => {
    fired[key] = reading.at
    trim(fired, (at) => at)
    const samples = hits[key]?.samples ?? []
    return {
      // The same cooldown slot gives the same id, on every run.
      id: `${source}:${key}:${Math.floor(reading.at / cooldownMs)}`.slice(
        0,
        300
      ),
      source,
      title: reading.kind === "text" ? (reading.subject ?? key) : reading.label,
      facts: describe(reading, measure),
      samples,
      url:
        reading.kind === "text" ? (hits[key]?.url ?? reading.url) : reading.url,
      at: reading.at,
      measure,
    } satisfies Signal
  }

  const stepText = (reading: Extract<Reading, { kind: "text" }>) => {
    const subject = reading.subject ?? keywordOf(reading)
    if (!subject) return null
    const key = subject.toLowerCase()
    const hit = (hits[key] ??= { at: [], samples: [], url: reading.url })
    hit.at = hit.at.filter((at) => reading.at - at < windowMs)
    hit.at.push(reading.at)
    hit.url = reading.url
    if (reading.text.trim())
      hit.samples = [...hit.samples, reading.text.slice(0, 500)].slice(-SAMPLES)
    trim(hits, (h) => h.at.at(-1) ?? 0)
    if (hit.at.length < config.threshold || quiet(key, reading.at)) return null
    const span = reading.at - hit.at[0]!
    const fire = signal(
      key,
      { ...reading, subject },
      {
        type: "count",
        count: hit.at.length,
        minutes: Math.max(1, Math.ceil(span / MINUTE)),
      }
    )
    delete hits[key]
    return fire
  }

  const stepLevel = (reading: Extract<Reading, { kind: "level" }>) => {
    const key = reading.subject
    const list = (points[key] ??= []).filter(
      (p) => reading.at - p.at <= windowMs
    )
    // The furthest point in the window, in either direction.
    const change = (p: { v: number }) => ((reading.value - p.v) / p.v) * 100
    const anchor = list.reduce<{ v: number; at: number } | null>(
      (best, p) =>
        !best || Math.abs(change(p)) > Math.abs(change(best)) ? p : best,
      null
    )
    if (
      !list.length ||
      reading.at - list.at(-1)!.at >= windowMs / CHECKPOINTS
    ) {
      list.push({ v: reading.value, at: reading.at })
    }
    points[key] = list.slice(-CHECKPOINTS - 1)
    trim(points, (p) => p.at(-1)?.at ?? 0)
    if (
      !anchor ||
      Math.abs(change(anchor)) < config.threshold ||
      quiet(key, reading.at)
    )
      return null
    const fire = signal(key, reading, {
      type: "move",
      from: anchor.v,
      to: reading.value,
      change: change(anchor),
      minutes: Math.max(1, Math.ceil((reading.at - anchor.at) / MINUTE)),
    })
    // The next move is measured from here, not from before this one.
    points[key] = [{ v: reading.value, at: reading.at }]
    return fire
  }

  return {
    state,
    matches,
    step(reading) {
      state.cursor = Math.max(state.cursor ?? 0, reading.at)
      if (!matches(reading)) return null
      return reading.kind === "text" ? stepText(reading) : stepLevel(reading)
    },
  }
}
