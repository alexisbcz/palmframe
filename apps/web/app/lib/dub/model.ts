// A dub as the Booth stores it on the person's own computer. The page holds a
// copy and sends field-level patches, so an edit can't overwrite a take that a
// job has just finished.

export interface Take {
  file: string
  text: string
  voice: string
  seconds: number
  tempo: number
  over: number
  kind: string
  seed: number
}

export interface Line {
  id: string
  start: number
  end: number
  speaker: string
  source: string
  text: string
  delivery: string
  takes: Take[]
  pick: number
}

export type Voice =
  | { kind: "stock"; speaker: string }
  | { kind: "design"; prompt: string }
  | {
      kind: "clone"
      file: string
      refText: string
      seconds?: number
      origin?: string
      consentAt?: string
    }

export interface Speaker {
  id: string
  name: string
  color: string
  voice: Voice
  level?: number
  muted?: boolean
  audition?: string
}

export interface Track {
  index: number
  codec: string
  language: string
  title: string
}

export interface SubtitleTrack extends Track {
  text: boolean
  forced: boolean
}

export interface Render {
  file: string
  subtitles: string
  at: number
  size: number
  language: string
  lines: number
  stems: boolean
}

export interface Mix {
  dub: number
  bed: number
  original: number
  room: number
}

export interface Project {
  id: string
  rev: number
  status: "ingesting" | "ready" | "failed"
  title: string
  source: {
    file: string
    name: string
    duration: number
    subtitles: SubtitleTrack[]
    audio: Track[]
    video: { codec: string; width: number; height: number; fps: number } | null
  }
  sourceLang: string
  targetLang: string
  lines: Line[]
  speakers: Speaker[]
  script: { kind: string; language: string; title: string } | null
  stems: boolean
  mix: Mix
  renders: Render[]
}

export interface Job {
  id: string
  project: string
  kind: string
  label: string
  state: "queued" | "running" | "done" | "failed" | "cancelled"
  progress: number
  error: string
  createdAt: number
  lines: string[]
  line?: string | null
}

export interface Shelf {
  id: string
  title: string
  status: Project["status"]
  updatedAt: number
  duration: number
  targetLang: string
  lines: number
  takes: number
  renders: number
}

export interface BoothStatus {
  version: string
  ffmpeg: boolean
  speech: boolean
  models: Record<"clone" | "stock" | "design" | "whisper", boolean>
  voices: string[]
  languages: Record<string, string>
  home: string
  free: number
}

export type Patch = {
  title?: string
  targetLang?: string
  sourceLang?: string
  mix?: Partial<Mix>
  lines?: Record<string, Partial<Line>>
  speakers?: Record<string, Partial<Speaker>>
  addLines?: {
    id: string
    start: number
    end: number
    speaker: string
    source?: string
    text?: string
  }[]
  removeLines?: string[]
  addSpeakers?: { id: string; name: string }[]
  removeSpeakers?: string[]
}

export const LANGUAGES = [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "ja",
  "ko",
  "zh",
  "pt",
  "ru",
] as const
export type Language = (typeof LANGUAGES)[number]

export const isLanguage = (v: unknown): v is Language =>
  LANGUAGES.includes(v as Language)

// How the page treats a take: `stale` means the words or the voice moved on
// since it was recorded.
export type LineState = "empty" | "unwritten" | "stale" | "long" | "ready"

export function voiceKey(voice: Voice) {
  const v = voice as Record<string, unknown>
  return JSON.stringify({
    file: v.file ?? null,
    kind: voice.kind,
    prompt: v.prompt ?? null,
    speaker: v.speaker ?? null,
  })
}

export const currentTake = (line: Line): Take | null =>
  line.takes[line.pick] ?? null

export function lineState(line: Line, speaker?: Speaker): LineState {
  if (!line.text.trim()) return "unwritten"
  const take = currentTake(line)
  if (!take) return "empty"
  if (take.text !== line.text) return "stale"
  if (speaker && take.kind !== "mic" && take.voice !== voiceKey(speaker.voice))
    return "stale"
  return take.over > 0.05 ? "long" : "ready"
}

// The lines a "record everything" press should touch.
export function pendingLines(project: Project) {
  const speakers = new Map(project.speakers.map((s) => [s.id, s]))
  return project.lines.filter((l) => {
    const state = lineState(l, speakers.get(l.speaker))
    return state === "empty" || state === "stale"
  })
}

export function progressOf(project: Project) {
  const speakers = new Map(project.speakers.map((s) => [s.id, s]))
  const total = project.lines.length
  let written = 0
  let recorded = 0
  let long = 0
  for (const line of project.lines) {
    const state = lineState(line, speakers.get(line.speaker))
    if (state !== "unwritten") written++
    if (state === "ready" || state === "long") recorded++
    if (state === "long") long++
  }
  return { total, written, recorded, long }
}

// Reading pace, for warning about a line before anyone spends a take on it.
// Characters per second that still sound like speech, by script.
const PACE: Partial<Record<Language, number>> = { ja: 7, zh: 5, ko: 7 }

export function tooLong(text: string, seconds: number, language: string) {
  const pace = PACE[language as Language] ?? 16
  return text.trim().length > Math.max(1, seconds * pace * 1.32)
}

export const roomFor = (seconds: number, language: string) =>
  Math.max(4, Math.round(seconds * (PACE[language as Language] ?? 16)))

// The line under the playhead, by binary search: it runs every frame.
export function lineAt(lines: Line[], time: number) {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid]!.start <= time) {
      found = mid
      low = mid + 1
    } else high = mid - 1
  }
  if (found < 0) return -1
  return time <= lines[found]!.end ? found : -1
}

export function nextLineIndex(lines: Line[], time: number) {
  const i = lines.findIndex((l) => l.start > time + 0.01)
  return i
}

export function previousLineIndex(lines: Line[], time: number) {
  for (let i = lines.length - 1; i >= 0; i--)
    if (lines[i]!.start < time - 0.25) return i
  return -1
}

export function timecode(seconds: number, frames = false) {
  const t = Math.max(0, seconds)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = Math.floor(t % 60)
  const pad = (n: number) => String(n).padStart(2, "0")
  const base = `${h ? `${pad(h)}:` : ""}${pad(m)}:${pad(s)}`
  return frames ? `${base}.${String(Math.floor((t % 1) * 10))}` : base
}

// The best subtitle track to start from. Text beats bitmaps, whole-episode
// dialogue beats signs, and the dub's own language beats everything because
// there's then nothing to translate.
export function bestTrack(tracks: SubtitleTrack[], target: string) {
  const score = (t: SubtitleTrack) =>
    (t.text ? 8 : 0) +
    (t.forced || /sign|song|forced|commentary/i.test(t.title) ? 0 : 4) +
    (t.language === target ? 2 : 0) +
    (t.language === "en" ? 1 : 0)
  return [...tracks].sort((a, b) => score(b) - score(a))[0] ?? null
}

// Lines to send for adaptation, in batches the route will take.
export const BATCH = 40

export function batches<T>(items: T[], size = BATCH) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}
