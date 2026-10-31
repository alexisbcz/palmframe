import { parseInline, tagMap, type InlineNode } from "../inline"
import type { InlineTag, SegmentKind } from "../model"

export interface ExportSegment {
  kind: SegmentKind
  level: number | null
  group_key: string | null
  cell: { row: number; col: number; header?: boolean } | null
  locator: string | null
  asset: string | null
  source: string
  tags: InlineTag[]
  target: string | null
}

export interface ExportChapter {
  title: string
  segments: ExportSegment[]
}

export interface ExportBook {
  title: string
  author: string
  sourceLang: string
  targetLang: string
  bilingual: boolean
  chapters: ExportChapter[]
  // Reads an image out of the original file.
  asset: (path: string) => Promise<Uint8Array | null>
}

// A translation that never came keeps the original line, so a part-finished
// book still exports whole. The counter says how many.
export const textOf = (s: ExportSegment) =>
  s.target?.trim() ? s.target : s.source

export const missing = (book: ExportBook) =>
  book.chapters
    .flatMap((c) => c.segments)
    .filter((s) => s.kind !== "rule" && s.source.trim() && !s.target?.trim())
    .length

export const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const SAFE_HREF = /^(https?:|mailto:|#)/i

const WRAP: Partial<Record<InlineTag["type"], string>> = {
  b: "strong",
  i: "em",
  u: "u",
  s: "s",
  sup: "sup",
  sub: "sub",
  code: "code",
}

// Inline tags as XHTML for documents built from scratch. Rewritten EPUBs keep
// their own elements instead; see epub.ts.
export function inlineHtml(text: string, tags: InlineTag[]) {
  const map = tagMap(tags)
  const render = (nodes: InlineNode[]): string =>
    nodes
      .map((node) => {
        if ("text" in node) return escapeXml(node.text)
        const tag = map.get(node.id)
        const inner = render(node.children)
        if (!tag) return inner
        if (tag.type === "br") return "<br/>"
        if (tag.type === "img") return ""
        if (tag.type === "noteref") return `<sup>${inner || "*"}</sup>`
        if (tag.type === "a")
          return tag.href && SAFE_HREF.test(tag.href)
            ? `<a href="${escapeXml(tag.href)}">${inner}</a>`
            : inner
        const wrap = WRAP[tag.type]
        return wrap ? `<${wrap}>${inner}</${wrap}>` : inner
      })
      .join("")
  return render(parseInline(text))
}

export interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  sup?: boolean
  sub?: boolean
  code?: boolean
  href?: string
  br?: boolean
}

// Flat runs for formats that have no nesting: DOCX, PDF, Markdown.
export function inlineRuns(text: string, tags: InlineTag[]) {
  const map = tagMap(tags)
  const out: InlineRun[] = []
  const visit = (nodes: InlineNode[], marks: Omit<InlineRun, "text">) => {
    for (const node of nodes) {
      if ("text" in node) {
        out.push({ ...marks, text: node.text })
        continue
      }
      const tag = map.get(node.id)
      if (tag?.type === "br") {
        out.push({ text: "", br: true })
        continue
      }
      const next = { ...marks }
      if (tag?.type === "b") next.bold = true
      if (tag?.type === "i") next.italic = true
      if (tag?.type === "u") next.underline = true
      if (tag?.type === "s") next.strike = true
      if (tag?.type === "sup" || tag?.type === "noteref") next.sup = true
      if (tag?.type === "sub") next.sub = true
      if (tag?.type === "code") next.code = true
      if (tag?.type === "a" && tag.href && SAFE_HREF.test(tag.href))
        next.href = tag.href
      visit(node.children, next)
    }
  }
  visit(parseInline(text), {})
  return out
}

// Table cells come back as a grid; everything else passes through.
export type ExportItem =
  | { type: "segment"; segment: ExportSegment }
  | { type: "table"; rows: ExportSegment[][] }

export function layoutItems(segments: ExportSegment[]): ExportItem[] {
  const items: ExportItem[] = []
  let i = 0
  while (i < segments.length) {
    const s = segments[i]!
    if (s.kind !== "table_cell" || !s.cell) {
      items.push({ type: "segment", segment: s })
      i++
      continue
    }
    const rows: ExportSegment[][] = []
    while (
      i < segments.length &&
      segments[i]!.kind === "table_cell" &&
      segments[i]!.group_key === s.group_key
    ) {
      const cell = segments[i]!
      const row = cell.cell?.row ?? 0
      ;(rows[row] ??= []).push(cell)
      i++
    }
    items.push({ type: "table", rows: rows.filter(Boolean) })
  }
  return items
}
