import { escapeText } from "../inline"
import type { Block, ParsedChapter, SegmentKind } from "../model"
import { splitByHeadings } from "./text"

// A PDF page is loose runs of text at coordinates. This puts them back into
// reading order and paragraphs. No model is involved: it's geometry, so it
// runs on every page for free and tests stay honest.
export interface PdfItem {
  str: string
  x: number
  y: number
  width: number
  size: number
  bold?: boolean
}

export interface PdfPage {
  number: number
  width: number
  height: number
  items: PdfItem[]
}

export interface PageBlock {
  kind: SegmentKind
  text: string
  level?: number
  size?: number
  // True when the block starts a new paragraph for certain, by its indent.
  fresh?: boolean
  ocr?: number
}

export interface LaidOutPage {
  number: number
  blocks: PageBlock[]
}

interface Fragment {
  x0: number
  x1: number
  y: number
  size: number
  text: string
  bold: boolean
}

const median = (values: number[]) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}]/gu
const LTR_LETTER = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/gu

// Items on one baseline become lines, then split wherever the gap is too wide
// to be a space: that's a gutter, and the two sides read separately.
function fragments(page: PdfPage): Fragment[] {
  const items = page.items
    .filter((i) => i.str.trim() || i.str === " ")
    .sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: PdfItem[][] = []
  for (const item of items) {
    const line = lines.at(-1)
    const tolerance = Math.max(item.size * 0.4, 1)
    if (line && Math.abs(line[0]!.y - item.y) <= tolerance) line.push(item)
    else lines.push([item])
  }
  const out: Fragment[] = []
  for (const line of lines) {
    // By letters: a line's spaces are items too, and they have no direction.
    const text = line.map((i) => i.str).join("")
    const rtl =
      (text.match(RTL_LETTER)?.length ?? 0) >
      (text.match(LTR_LETTER)?.length ?? 0)
    // Reading order: from the right edge in a right-to-left line.
    line.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x))
    let current: Fragment | null = null
    for (const item of line) {
      const gap: number = current
        ? rtl
          ? current.x0 - (item.x + item.width)
          : item.x - current.x1
        : 0
      const wide = item.size * 1.6
      if (!current || gap > wide) {
        if (current) out.push(current)
        current = {
          x0: item.x,
          x1: item.x + item.width,
          y: item.y,
          size: item.size,
          text: item.str,
          bold: !!item.bold,
        }
      } else {
        const joint =
          gap > item.size * 0.12 &&
          !current.text.endsWith(" ") &&
          !item.str.startsWith(" ") &&
          !CJK.test(item.str[0] ?? "")
        current.text += (joint ? " " : "") + item.str
        current.x0 = Math.min(current.x0, item.x)
        current.x1 = Math.max(current.x1, item.x + item.width)
        current.size = Math.max(current.size, item.size)
        current.bold &&= !!item.bold
      }
    }
    if (current) out.push(current)
  }
  return out
    .map((f) => ({ ...f, text: f.text.replace(/\s+/g, " ").trim() }))
    .filter((f) => f.text)
}

const BIN = 2

// A column of empty paper running down the page. Lines that span it are
// titles; everything else sits on one side.
function findGutter(frags: Fragment[]) {
  if (frags.length < 6) return null
  const left = Math.min(...frags.map((f) => f.x0))
  const right = Math.max(...frags.map((f) => f.x1))
  const span = right - left
  if (span < 120) return null
  const bins = new Uint16Array(Math.ceil(span / BIN) + 1)
  const body = frags.filter((f) => f.x1 - f.x0 < span * 0.62)
  if (body.length < 6) return null
  for (const f of body)
    for (
      let b = Math.floor((f.x0 - left) / BIN);
      b <= Math.floor((f.x1 - left) / BIN);
      b++
    )
      bins[b]!++
  let best: { from: number; to: number } | null = null
  let start = -1
  const lower = Math.floor(bins.length * 0.2)
  const upper = Math.ceil(bins.length * 0.8)
  for (let b = lower; b <= upper; b++) {
    if (bins[b] === 0 && b < upper) {
      if (start < 0) start = b
    } else if (start >= 0) {
      if (!best || b - start > best.to - best.from)
        best = { from: start, to: b }
      start = -1
    }
  }
  if (!best || (best.to - best.from) * BIN < 8) return null
  const gutter = left + ((best.from + best.to) / 2) * BIN
  const sideL = body.filter((f) => f.x1 <= gutter).length
  const sideR = body.filter((f) => f.x0 >= gutter).length
  return sideL >= 3 && sideR >= 3 ? gutter : null
}

// Reading order: top to bottom, with full-width lines cutting the columns
// into bands, each read left column then right. Three columns are two nested.
function readingOrder(frags: Fragment[], depth = 0): Fragment[][] {
  const gutter = depth < 3 ? findGutter(frags) : null
  if (gutter === null) return [frags.sort((a, b) => b.y - a.y || a.x0 - b.x0)]
  const spanners = frags
    .filter((f) => f.x0 < gutter && f.x1 > gutter)
    .sort((a, b) => b.y - a.y)
  const columns: Fragment[][] = []
  let top = Infinity
  for (const cut of [...spanners, null]) {
    const floor = cut ? cut.y : -Infinity
    const band = frags.filter(
      (f) => f !== cut && f.y < top && f.y > floor && !spanners.includes(f)
    )
    const left = band.filter((f) => f.x1 <= gutter)
    const right = band.filter((f) => f.x0 >= gutter)
    if (left.length) columns.push(...readingOrder(left, depth + 1))
    if (right.length) columns.push(...readingOrder(right, depth + 1))
    if (cut) {
      columns.push([cut])
      top = cut.y
    }
  }
  return columns
}

const TERMINAL = /[.!?…:;"”»’)\]。！？」』]$/
const normalize = (s: string) => s.replace(/\d+/g, "#").toLowerCase().trim()

// Running heads and folios: the same line, digits aside, on many pages.
export function repeatedLines(pages: PdfPage[]) {
  const counts = new Map<string, number>()
  for (const page of pages) {
    const frags = fragments(page)
    if (!frags.length) continue
    const top = Math.max(...frags.map((f) => f.y))
    const bottom = Math.min(...frags.map((f) => f.y))
    const seen = new Set(
      frags
        .filter((f) => f.y === top || f.y === bottom)
        .map((f) => normalize(f.text))
    )
    for (const line of seen) counts.set(line, (counts.get(line) ?? 0) + 1)
  }
  const floor = Math.max(3, Math.ceil(pages.length * 0.3))
  return new Set([...counts].filter(([, n]) => n >= floor).map(([l]) => l))
}

const isFolio = (s: string) =>
  /^[-–—\s]*([0-9]{1,4}|[ivxlc]{1,7})[-–—\s]*$/i.test(s)

export function bodySize(pages: PdfPage[]) {
  const weights = new Map<number, number>()
  for (const page of pages)
    for (const item of page.items) {
      const size = Math.round(item.size * 2) / 2
      weights.set(size, (weights.get(size) ?? 0) + item.str.length)
    }
  return [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11
}

const join = (a: string, b: string) => {
  if (/\p{Ll}-$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b
  const glued = CJK.test(a.at(-1) ?? "") && CJK.test(b[0] ?? "")
  return glued ? a + b : `${a} ${b}`
}

export function layoutPage(
  page: PdfPage,
  body: number,
  repeated: Set<string>
): LaidOutPage {
  let frags = fragments(page)
  if (frags.length) {
    const top = Math.max(...frags.map((f) => f.y))
    const bottom = Math.min(...frags.map((f) => f.y))
    frags = frags.filter(
      (f) =>
        !(
          (f.y === top || f.y === bottom) &&
          (repeated.has(normalize(f.text)) || isFolio(f.text))
        )
    )
  }

  // Small text below everything else, usually under a rule, is a footnote.
  const bodyFrags = frags.filter((f) => f.size >= body * 0.92)
  const floor = bodyFrags.length ? Math.min(...bodyFrags.map((f) => f.y)) : 0
  const noteFrags = frags.filter(
    (f) => f.size < body * 0.92 && f.y < floor && bodyFrags.length > 0
  )
  const main = frags.filter((f) => !noteFrags.includes(f))

  const blocks: PageBlock[] = []
  for (const column of readingOrder(main)) {
    const left = median(column.map((f) => f.x0))
    const right = Math.max(...column.map((f) => f.x1))
    const gaps = column
      .slice(1)
      .map((f, i) => column[i]!.y - f.y)
      .filter((g) => g > 0)
    const leading = median(gaps) || body * 1.3
    let open: PageBlock | null = null
    let prev: Fragment | null = null
    for (const f of column) {
      const big = f.size >= body * 1.18
      const gap: number = prev ? prev.y - f.y : 0
      const indented = f.x0 - left > f.size * 0.7 && f.x1 - f.x0 < right - left
      const shortBefore =
        !!prev &&
        prev.x1 < right - (right - left) * 0.2 &&
        TERMINAL.test(prev.text)
      const sameSize = !!open && Math.abs((open.size ?? 0) - f.size) < 0.6
      const continues =
        !!open &&
        sameSize &&
        gap > 0 &&
        gap <= leading * 1.45 &&
        !indented &&
        !shortBefore &&
        !(open.kind === "heading" && !big)
      if (continues) open!.text = join(open!.text, f.text)
      else {
        if (open) blocks.push(open)
        const boldHead = f.bold && f.text.length < 80 && !TERMINAL.test(f.text)
        open = {
          kind: big || boldHead ? "heading" : "paragraph",
          text: f.text,
          size: f.size,
          fresh: indented,
        }
      }
      prev = f
    }
    if (open) blocks.push(open)
  }

  const notes = noteFrags.sort((a, b) => b.y - a.y || a.x0 - b.x0)
  let note: PageBlock | null = null
  for (const f of notes) {
    const starts = /^(\d{1,3}[.):]?\s|[*†‡§]\s?)/.test(f.text)
    if (note && !starts) note.text = join(note.text, f.text)
    else {
      if (note) blocks.push(note)
      note = { kind: "footnote", text: f.text, size: f.size }
    }
  }
  if (note) blocks.push(note)
  return { number: page.number, blocks }
}

export interface OutlineEntry {
  title: string
  page: number
}

function headingLevels(pages: LaidOutPage[]) {
  const sizes = [
    ...new Set(
      pages.flatMap((p) =>
        p.blocks.flatMap((b) =>
          b.kind === "heading" && b.size ? [Math.round(b.size)] : []
        )
      )
    ),
  ].sort((a, b) => b - a)
  return new Map(sizes.map((s, i) => [s, Math.min(i + 1, 6)]))
}

const toBlock = (b: PageBlock, page: number, locator: string): Block => ({
  kind: b.kind,
  text: escapeText(b.text),
  tags: [],
  page,
  locator,
  ...(b.level && { level: b.level }),
  ...(b.ocr !== undefined && { ocr: b.ocr }),
})

// Pages, some typeset and some read from scans, into one book. A paragraph
// that runs over a page break joins back up; so does one that a footnote
// interrupted, because notes wait at the end of the chapter.
export function assemblePages(
  pages: LaidOutPage[],
  outline: OutlineEntry[]
): ParsedChapter[] {
  const levels = headingLevels(pages)
  const starts = new Map<number, string>()
  for (const entry of outline)
    if (!starts.has(entry.page)) starts.set(entry.page, entry.title)

  const chapters: ParsedChapter[] = []
  let current: ParsedChapter = { title: "", blocks: [] }
  let notes: Block[] = []
  let ordinal = 0
  const close = () => {
    current.blocks.push(...notes)
    notes = []
    if (current.blocks.length) chapters.push(current)
  }
  for (const page of [...pages].sort((a, b) => a.number - b.number)) {
    if (starts.has(page.number)) {
      close()
      current = { title: starts.get(page.number)!, blocks: [] }
    }
    let first = true
    for (const b of page.blocks) {
      const block = toBlock(
        {
          ...b,
          level:
            b.kind === "heading"
              ? (b.level ?? levels.get(Math.round(b.size ?? 0)) ?? 2)
              : b.level,
        },
        page.number,
        `page:${page.number}#${ordinal++}`
      )
      if (block.kind === "footnote") {
        notes.push(block)
        continue
      }
      const last = current.blocks.at(-1)
      if (
        first &&
        !b.fresh &&
        last?.kind === "paragraph" &&
        block.kind === "paragraph" &&
        !TERMINAL.test(last.text.trimEnd()) &&
        /^\p{Ll}/u.test(block.text)
      )
        last.text = join(last.text, block.text)
      else current.blocks.push(block)
      first = false
    }
  }
  close()
  if (outline.length) return chapters
  return splitByHeadings(chapters.flatMap((c) => c.blocks))
}
