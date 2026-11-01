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

export function inlineRuns(line: string): Run[] {
  const out: Run[] = []
  const re = /(\*\*\*|\*\*|\*)(?=\S)(.+?)(?<=\S)\1/g
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

export const proseLines = (body: string) =>
  body.split("\n").filter((l) => l.trim())
