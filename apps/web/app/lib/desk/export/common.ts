import { paginate, parseScript, type ScriptLine } from "../fountain"
import {
  inlineRuns,
  isSceneBreak,
  type Manuscript,
  type Part,
  type Run,
} from "../model"

export type FormatId =
  | "pdf"
  | "manuscript"
  | "epub"
  | "tex"
  | "docx"
  | "fountain"
  | "fdx"
  | "html"
  | "md"
  | "rtf"
  | "txt"

export const FORMATS: Record<
  FormatId,
  { ext: string; mime: string; for: Manuscript["kind"][] }
> = {
  pdf: {
    ext: "pdf",
    mime: "application/pdf",
    for: ["novel", "poetry", "screenplay"],
  },
  manuscript: { ext: "pdf", mime: "application/pdf", for: ["novel"] },
  epub: {
    ext: "epub",
    mime: "application/epub+zip",
    for: ["novel", "poetry", "screenplay"],
  },
  tex: {
    ext: "tex",
    mime: "application/x-tex",
    for: ["novel", "poetry", "screenplay"],
  },
  docx: {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    for: ["novel", "poetry", "screenplay"],
  },
  fountain: { ext: "fountain", mime: "text/plain", for: ["screenplay"] },
  fdx: { ext: "fdx", mime: "application/xml", for: ["screenplay"] },
  html: {
    ext: "html",
    mime: "text/html",
    for: ["novel", "poetry", "screenplay"],
  },
  md: { ext: "md", mime: "text/markdown", for: ["novel", "poetry"] },
  rtf: { ext: "rtf", mime: "application/rtf", for: ["novel", "poetry"] },
  txt: {
    ext: "txt",
    mime: "text/plain",
    for: ["novel", "poetry", "screenplay"],
  },
}

export const TRIMS = {
  "5x8": { label: "5 × 8 in", w: 360, h: 576 },
  "5.5x8.5": { label: "5.5 × 8.5 in", w: 396, h: 612 },
  "6x9": { label: "6 × 9 in", w: 432, h: 648 },
  a5: { label: "A5", w: 419.53, h: 595.28 },
} as const
export type Trim = keyof typeof TRIMS

// Every format needs a title to hold on to, even before the writer has one.
export const titled = (m: Manuscript): Manuscript =>
  m.title.trim() ? m : { ...m, title: "Untitled" }

export const safeName = (s: string) =>
  s
    .trim()
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "manuscript"

export const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// A part as blocks: what every format lays out in its own way.
export type Block =
  | { t: "p"; runs: Run[]; first: boolean }
  | { t: "break" }
  | { t: "stanza"; lines: string[] }
  | { t: "script"; line: ScriptLine }

export function proseBlocks(part: Part): Block[] {
  const out: Block[] = []
  let first = true
  for (const line of part.body.split("\n")) {
    if (!line.trim()) continue
    if (isSceneBreak(line)) {
      out.push({ t: "break" })
      first = true
      continue
    }
    out.push({ t: "p", runs: inlineRuns(line.trim()), first })
    first = false
  }
  return out
}

export function stanzas(part: Part): Block[] {
  return part.body
    .split(/\n\s*\n/)
    .map((s) => s.split("\n").filter((l) => l.trim()))
    .filter((l) => l.length)
    .map((lines) => ({ t: "stanza", lines }))
}

export const scriptOf = (m: Manuscript) =>
  parseScript(m.parts.map((p) => p.body).join("\n\n"))

export const pagesOf = (m: Manuscript) => paginate(scriptOf(m))

export const blocksOf = (m: Manuscript, part: Part): Block[] =>
  m.kind === "poetry" ? stanzas(part) : proseBlocks(part)

export const partLabel = (m: Manuscript, part: Part, i: number) =>
  part.title.trim() || (m.parts.length > 1 ? String(i + 1) : "")

export const plain = (runs: Run[]) => runs.map((r) => r.text).join("")

export const byline = (m: Manuscript) => m.author.trim()
