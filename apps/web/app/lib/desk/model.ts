import type { Level } from "./vale/vale"
import { DEFAULT_STYLES } from "./styles"

// A manuscript. Text is plain lines, because three very different kinds of
// writing share one editor: prose (a line is a paragraph, *italic*, **bold**,
// *** a scene break), verse (a line is a line) and Fountain.

export const KINDS = ["novel", "poetry", "screenplay"] as const
export type Kind = (typeof KINDS)[number]

export const STATUSES = ["idea", "draft", "revised", "final"] as const
export type Status = (typeof STATUSES)[number]

export interface Part {
  id: string
  title: string
  synopsis: string
  status: Status
  body: string
  // Poetry: the form it's held to.
  form?: string
}

export interface CustomRule {
  name: string
  source: string
}

export const CLOTHS = {
  oxblood: "#6d2a26",
  bottle: "#23483b",
  ink: "#1e2f4d",
  ochre: "#a87a2c",
  graphite: "#34343a",
  bone: "#d9cfba",
} as const
export type Cloth = keyof typeof CLOTHS

export const LIGHTS = ["lamp", "morning", "dusk"] as const
export type Light = (typeof LIGHTS)[number]

export interface Manuscript {
  v: 1
  kind: Kind
  title: string
  subtitle: string
  author: string
  contact: string
  language: "en" | "fr"
  parts: Part[]
  styles: string[]
  mutedRules: string[]
  accepted: string[]
  minLevel: Level
  customRules: CustomRule[]
  dailyGoal: number
  totalGoal: number
  // ISO date to words added that day.
  log: Record<string, number>
  cloth: Cloth
  // Screenplay: the colour of the current revision pages.
  revision: string
}

export const REVISIONS = [
  "white",
  "blue",
  "pink",
  "yellow",
  "green",
  "goldenrod",
]

export const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3)

export function newPart(title = "", body = "", form?: string): Part {
  return {
    id: newId(),
    title,
    synopsis: "",
    status: "draft",
    body,
    ...(form && { form }),
  }
}

export function emptyManuscript(kind: Kind, title = ""): Manuscript {
  return {
    v: 1,
    kind,
    title,
    subtitle: "",
    author: "",
    contact: "",
    language: "en",
    parts: [newPart("", "", kind === "poetry" ? "free" : undefined)],
    styles: DEFAULT_STYLES[kind],
    mutedRules: [],
    accepted: [],
    minLevel: "suggestion",
    customRules: [],
    dailyGoal: kind === "poetry" ? 100 : 1000,
    totalGoal: kind === "novel" ? 80000 : kind === "poetry" ? 8000 : 20000,
    log: {},
    cloth:
      kind === "screenplay"
        ? "ochre"
        : kind === "poetry"
          ? "bottle"
          : "oxblood",
    revision: "white",
  }
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max) : ""

// Rows come back as they were saved, but they may predate a field.
export function toManuscript(raw: unknown): Manuscript {
  const r = (raw ?? {}) as Partial<Manuscript>
  const kind = KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : "novel"
  const base = emptyManuscript(kind)
  const parts =
    Array.isArray(r.parts) && r.parts.length
      ? r.parts.map((p) => ({
          ...newPart(),
          ...p,
          id: str(p.id, 40) || newId(),
          title: str(p.title, 200),
          synopsis: str(p.synopsis, 2000),
          status: STATUSES.includes(p.status) ? p.status : "draft",
          body: str(p.body, 3_000_000),
        }))
      : base.parts
  return {
    ...base,
    ...r,
    v: 1,
    kind,
    parts,
    title: str(r.title, 200),
    log: r.log && typeof r.log === "object" ? r.log : {},
    styles: Array.isArray(r.styles) ? r.styles : base.styles,
    mutedRules: Array.isArray(r.mutedRules) ? r.mutedRules : [],
    accepted: Array.isArray(r.accepted) ? r.accepted : [],
    customRules: Array.isArray(r.customRules) ? r.customRules : [],
    cloth: r.cloth && r.cloth in CLOTHS ? r.cloth : base.cloth,
  }
}

export const countWords = (text: string) =>
  text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0

export const totalWords = (m: Manuscript) =>
  m.parts.reduce((n, p) => n + countWords(p.body), 0)

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function streak(
  log: Record<string, number>,
  goal: number,
  today = new Date()
) {
  let n = 0
  const d = new Date(today)
  // Today doesn't break a streak before it's over.
  if ((log[dayKey(d)] ?? 0) < goal) d.setDate(d.getDate() - 1)
  while ((log[dayKey(d)] ?? 0) >= goal) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

// Inline marks in prose ------------------------------------------------------

export interface Run {
  text: string
  italic?: boolean
  bold?: boolean
}

const MARKED = /(\*\*\*|\*\*|\*)(?=[^\s*])(.+?)(?<=[^\s*])\1/g

export function inlineRuns(line: string): Run[] {
  const out: Run[] = []
  const re = new RegExp(MARKED)
  let at = 0
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) })
    const mark = m[1]!
    out.push({
      text: m[2]!,
      ...(mark !== "**" && { italic: true }),
      ...(mark !== "*" && { bold: true }),
    })
    at = m.index + m[0].length
  }
  if (at < line.length) out.push({ text: line.slice(at) })
  return out
}

export const isSceneBreak = (line: string) =>
  /^\s*(?:\*\s*\*\s*\*|#|⁂)\s*$/.test(line)

// A span of marked text, as offsets into its line.
export interface Span {
  from: number
  to: number
  size: number
}

export function markSpans(line: string): Span[] {
  if (isSceneBreak(line)) return []
  return [...line.matchAll(MARKED)].map((m) => ({
    from: m.index,
    to: m.index + m[0].length,
    size: m[1]!.length,
  }))
}

// The ranges of a line taken up by asterisks that are formatting, in order.
export function markersOf(line: string) {
  return markSpans(line).flatMap(({ from, to, size }) => [
    { from, to: from + size },
    { from: to - size, to },
  ])
}

interface Letter {
  ch: string
  at: number
  italic: boolean
  bold: boolean
}

function lettersOf(line: string) {
  const spans = markSpans(line)
  const out: Letter[] = []
  for (let at = 0; at < line.length; at++) {
    const s = spans.find((x) => x.from <= at && at < x.to)
    if (s && (at < s.from + s.size || at >= s.to - s.size)) continue
    out.push({
      ch: line[at]!,
      at,
      italic: !!s && s.size !== 2,
      bold: !!s && s.size !== 1,
    })
  }
  return out
}

// What a reader sees between two offsets of a line.
export const readableBetween = (line: string, from: number, to: number) =>
  lettersOf(line)
    .filter((l) => l.at >= from && l.at < to)
    .map((l) => l.ch)
    .join("")

// What a reader sees of a body: the words, without the asterisks around them.
export const readable = (body: string) =>
  body
    .split("\n")
    .map((l) => readableBetween(l, 0, l.length))
    .join("\n")

const write = (letters: Letter[]) => {
  let out = ""
  for (let i = 0; i < letters.length;) {
    const { italic, bold } = letters[i]!
    let end = i
    while (letters[end]?.italic === italic && letters[end]?.bold === bold) end++
    const text = letters
      .slice(i, end)
      .map((l) => l.ch)
      .join("")
    const mark = "*".repeat((italic ? 1 : 0) + (bold ? 2 : 0))
    // A marker can't sit against a space, so spaces stay outside it.
    const [, lead, core, tail] = /^(\s*)(.*?)(\s*)$/s.exec(text)!
    out += core ? `${lead}${mark}${core}${mark}${tail}` : text
    i = end
  }
  return out
}

// Bold or italic on or off for part of a line, the way a word processor does
// it: a span can be split, and bold survives italic being taken off. With no
// selection it acts on the marked span or the word under the caret.
export function toggleInline(
  line: string,
  start: number,
  end: number,
  flag: "italic" | "bold"
) {
  const letters = lettersOf(line)
  const seen = (offset: number) => letters.filter((l) => l.at < offset).length
  const caret = seen(start)
  let a = caret
  let b = seen(end)
  if (a === b) {
    const span = markSpans(line).find(
      (s) => s.from + s.size <= start && start <= s.to - s.size
    )
    if (span) {
      a = seen(span.from + span.size)
      b = seen(span.to - span.size)
    } else {
      const text = letters.map((l) => l.ch).join("")
      a -= /[\p{L}'’-]*$/u.exec(text.slice(0, a))![0].length
      b += /^[\p{L}'’-]*/u.exec(text.slice(b))![0].length
    }
    if (a === b) return null
  }
  const on = !letters.slice(a, b).every((l) => l[flag] || !l.ch.trim())
  const out = write(
    letters.map((l, i) => (i >= a && i < b ? { ...l, [flag]: on } : l))
  )
  const placed = lettersOf(out)
  const before = (i: number) => placed[i]?.at ?? out.length
  const after = (i: number) => (i ? placed[i - 1]!.at + 1 : before(0))
  if (start !== end) return { line: out, start: before(a), end: after(b) }
  const at = caret >= b ? after(b) : before(Math.max(caret, a))
  return { line: out, start: at, end: at }
}

export const proseLines = (body: string) =>
  body.split("\n").filter((l) => l.trim())
