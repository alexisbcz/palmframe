import bidiFactory from "bidi-js"
import PDFDocument from "pdfkit"

import { imageSize, sniffKind } from "@/lib/comic-import/sniff"

import { isRtl } from "../model"
import {
  inlineRuns,
  layoutItems,
  textOf,
  type ExportBook,
  type ExportSegment,
  type InlineRun,
} from "./common"
import { loadFont, type FontKey } from "./fonts.server"

// pdfkit draws glyphs and shapes them; it doesn't lay out mixed scripts or
// reorder right-to-left text. So lines are built here: split the text by font,
// break it into lines, then order each line with the Unicode bidi algorithm.
const PAGE = { width: 419.53, height: 595.28 }
const MARGIN = { x: 54, top: 60, bottom: 64 }
const WIDTH = PAGE.width - MARGIN.x * 2
const BODY = 10.5

const bidi = bidiFactory()

// Without features, pdfkit shapes word by word and sets the words left to
// right, which turns a right-to-left run's word order backwards.
const WHOLE_RUN = { features: [] as PDFKit.Mixins.OpenTypeFeatures[] }

function scriptFont(ch: string, han: FontKey): FontKey | null {
  const c = ch.codePointAt(0)!
  if (c < 0x0590) return null
  if (c <= 0x05ff || (c >= 0xfb1d && c <= 0xfb4f)) return "hebrew"
  if (
    (c >= 0x0600 && c <= 0x08ff) ||
    (c >= 0xfb50 && c <= 0xfdff) ||
    (c >= 0xfe70 && c <= 0xfeff)
  )
    return "arabic"
  if (c >= 0x0900 && c <= 0x097f) return "devanagari"
  if (c >= 0x0e00 && c <= 0x0e7f) return "thai"
  if ((c >= 0xac00 && c <= 0xd7af) || (c >= 0x1100 && c <= 0x11ff)) return "kr"
  if (
    (c >= 0x2e80 && c <= 0x9fff) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xff00 && c <= 0xffef) ||
    (c >= 0x20000 && c <= 0x3ffff)
  )
    return han
  return null
}

const hanFont = (lang: string): FontKey =>
  lang === "ko"
    ? "kr"
    : lang === "zh-Hans"
      ? "sc"
      : lang === "zh-Hant"
        ? "tc"
        : "jp"

interface Piece {
  text: string
  font: FontKey
  size: number
  rise: number
  href?: string
  underline?: boolean
  strike?: boolean
  color: string
  level: number
}

interface Style {
  size: number
  color: string
  bold?: boolean
  italic?: boolean
}

const latinFor = (run: InlineRun, style: Style): FontKey =>
  run.bold || style.bold
    ? "latinBold"
    : run.italic || style.italic
      ? "latinItalic"
      : "latin"

// Words a line may break between. CJK and Thai have no spaces: their
// characters break anywhere, with closing punctuation kept on its line.
const CJK_BREAK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
const NO_LINE_START = /^[、。，．！？）」』】》〉…ー々ゝゞ]/u

function tokenize(text: string) {
  const tokens: string[] = []
  let word = ""
  for (const ch of text) {
    if (ch === " " || ch === "\n") {
      if (word) tokens.push(word)
      word = ""
      tokens.push(" ")
    } else if (CJK_BREAK.test(ch)) {
      if (word) tokens.push(word)
      word = ""
      if (NO_LINE_START.test(ch) && tokens.length)
        tokens[tokens.length - 1] += ch
      else tokens.push(ch)
    } else if (NO_LINE_START.test(ch) && !word && tokens.length)
      tokens[tokens.length - 1] += ch
    else word += ch
  }
  if (word) tokens.push(word)
  return tokens
}

class Writer {
  y = MARGIN.top
  private widths = new Map<string, number>()
  private used = new Set<FontKey>()
  pageNumber = 1

  constructor(
    readonly doc: InstanceType<typeof PDFDocument>,
    readonly book: ExportBook,
    readonly fonts: Set<FontKey>
  ) {}

  width(text: string, font: FontKey, size: number) {
    const key = `${font}:${size}:${text}`
    let w = this.widths.get(key)
    if (w === undefined) {
      w = this.doc.font(font).fontSize(size).widthOfString(text, WHOLE_RUN)
      this.widths.set(key, w)
    }
    return w
  }

  pieces(runs: InlineRun[], style: Style, lang: string) {
    const han = hanFont(lang)
    const out: Omit<Piece, "level">[] = []
    for (const run of runs) {
      if (!run.text) continue
      const base = latinFor(run, style)
      const size = run.sup || run.sub ? style.size * 0.68 : style.size
      const rise = run.sup
        ? style.size * 0.34
        : run.sub
          ? -style.size * 0.12
          : 0
      let current = ""
      let font: FontKey | null = null
      const flush = () => {
        if (current)
          out.push({
            text: current,
            font: font ?? base,
            size,
            rise,
            href: run.href,
            underline: run.underline,
            strike: run.strike,
            color: style.color,
          })
        current = ""
      }
      for (const ch of run.text) {
        const script = scriptFont(ch, han)
        // Spaces and marks stay with the run they're in.
        if (script !== font && !(ch === " " && current)) {
          flush()
          font = script
        }
        current += ch
      }
      flush()
    }
    return out
  }

  // One paragraph. Returns nothing; it moves `y` and adds pages as needed.
  paragraph(
    runs: InlineRun[],
    style: Style,
    lang: string,
    options: {
      leading?: number
      after?: number
      indent?: number
      // A table cell: where its column starts, and how wide it is.
      offset?: number
      column?: number
    } = {}
  ) {
    const rtl = isRtl(lang)
    const leading =
      options.leading ??
      style.size * (/^(ja|ko|zh)/.test(lang) || rtl ? 1.75 : 1.5)
    const indent = options.indent ?? 0
    const offset = options.offset ?? 0
    const width = (options.column ?? WIDTH) - indent

    const lines: Omit<Piece, "level">[][] = []
    let line: Omit<Piece, "level">[] = []
    let used = 0
    const newLine = () => {
      while (line.at(-1)?.text === " ") line.pop()
      lines.push(line)
      line = []
      used = 0
    }
    const split: InlineRun[][] = [[]]
    for (const run of runs)
      if (run.br) split.push([])
      else split.at(-1)!.push(run)
    for (const [i, group] of split.entries()) {
      if (i > 0) newLine()
      for (const piece of this.pieces(group, style, lang)) {
        for (const token of tokenize(piece.text)) {
          const w = this.width(token, piece.font, piece.size)
          if (token === " " && !line.length) continue
          if (used + w > width && line.length) newLine()
          if (token === " " && !line.length) continue
          const last = line.at(-1)
          const same =
            last &&
            last.font === piece.font &&
            last.size === piece.size &&
            last.rise === piece.rise &&
            last.href === piece.href &&
            last.underline === piece.underline &&
            last.strike === piece.strike
          if (same) last.text += token
          else line.push({ ...piece, text: token })
          used += w
        }
      }
    }
    newLine()

    for (const pieces of lines) {
      if (this.y + leading > PAGE.height - MARGIN.bottom) this.addPage()
      this.drawLine(
        pieces,
        rtl,
        leading,
        rtl ? offset + width : offset + indent
      )
      this.y += leading
    }
    this.y += options.after ?? style.size * 0.55
  }

  private drawLine(
    pieces: Omit<Piece, "level">[],
    rtl: boolean,
    leading: number,
    // From the left margin: the line's start, or its end when right-to-left.
    edge: number
  ) {
    const text = pieces.map((p) => p.text).join("")
    const { levels } = bidi.getEmbeddingLevels(text, rtl ? "rtl" : "ltr")
    // Each piece splits where the level changes, so an English name in an
    // Arabic line is one run, drawn left to right, in its right place.
    const runs: Piece[] = []
    let at = 0
    for (const piece of pieces) {
      let start = 0
      const units = [...piece.text]
      let offset = 0
      const levelAt = (i: number) => levels[at + i] ?? 0
      let level = levelAt(0)
      for (let i = 0; i < units.length; i++) {
        const here = levelAt(offset)
        if (here !== level) {
          runs.push({
            ...piece,
            text: units.slice(start, i).join(""),
            level,
          })
          start = i
          level = here
        }
        offset += units[i]!.length
      }
      runs.push({ ...piece, text: units.slice(start).join(""), level })
      at += piece.text.length
    }
    // Rule L2: reverse runs at each level, from the highest down.
    let top = Math.max(0, ...runs.map((r) => r.level))
    const lowestOdd = Math.min(
      ...runs.map((r) => (r.level % 2 ? r.level : Infinity))
    )
    for (; top >= lowestOdd && Number.isFinite(lowestOdd); top--) {
      let i = 0
      while (i < runs.length) {
        if (runs[i]!.level >= top) {
          let j = i
          while (j + 1 < runs.length && runs[j + 1]!.level >= top) j++
          const part = runs.slice(i, j + 1).reverse()
          runs.splice(i, j - i + 1, ...part)
          i = j + 1
        } else i++
      }
    }
    const total = runs.reduce(
      (n, r) => n + this.width(r.text, r.font, r.size),
      0
    )
    let x = MARGIN.x + edge - (rtl ? total : 0)
    const baseline = this.y + leading * 0.2
    for (const run of runs) {
      const w = this.width(run.text, run.font, run.size)
      this.doc
        .font(run.font)
        .fontSize(run.size)
        .fillColor(run.color)
        .text(run.text, x, baseline - run.rise, {
          ...WHOLE_RUN,
          lineBreak: false,
          underline: run.underline,
          strike: run.strike,
          ...(run.href && { link: run.href }),
        })
      x += w
    }
  }

  footer() {
    this.doc
      .font("latin")
      .fontSize(8.5)
      .fillColor("#666666")
      .text(
        String(this.pageNumber),
        MARGIN.x,
        PAGE.height - MARGIN.bottom + 28,
        { width: WIDTH, align: "center", lineBreak: false }
      )
  }

  addPage() {
    this.footer()
    this.doc.addPage()
    this.pageNumber++
    this.y = MARGIN.top
  }

  table(rows: ExportSegment[][]) {
    const lang = this.book.targetLang
    const rtl = isRtl(lang)
    const cols = Math.max(...rows.map((r) => r.length))
    const cell = WIDTH / cols
    const bottom = PAGE.height - MARGIN.bottom
    const rule = (y: number) =>
      this.doc
        .moveTo(MARGIN.x, y)
        .lineTo(MARGIN.x + WIDTH, y)
        .lineWidth(0.4)
        .strokeColor("#999999")
        .stroke()
    for (const row of rows) {
      if (this.y + 40 > bottom) this.addPage()
      rule(this.y)
      this.y += 4
      const top = this.y
      const page = this.pageNumber
      let lowest = top
      for (const [i, c] of row.entries()) {
        if (this.pageNumber === page) this.y = top
        const at = rtl ? cols - 1 - i : i
        this.paragraph(
          inlineRuns(textOf(c), c.tags),
          { size: BODY - 1, color: "#111111", bold: c.cell?.header },
          lang,
          { offset: at * cell + 2, column: cell - 6, after: 2 }
        )
        lowest = Math.max(lowest, this.y)
      }
      this.y = this.pageNumber === page ? lowest : this.y
    }
    rule(this.y)
    this.y += 12
  }

  async image(s: ExportSegment) {
    const bytes = s.asset ? await this.book.asset(s.asset) : null
    const kind = bytes ? sniffKind(bytes) : null
    const size = bytes && imageSize(bytes)
    if (!bytes || !size || (kind !== "png" && kind !== "jpeg")) return
    const scale = Math.min(
      1,
      WIDTH / size.width,
      (PAGE.height - MARGIN.top - MARGIN.bottom) / size.height
    )
    const height = size.height * scale
    if (this.y + height > PAGE.height - MARGIN.bottom) this.addPage()
    this.doc.image(Buffer.from(bytes), MARGIN.x, this.y, {
      width: size.width * scale,
      height,
    })
    this.y += height + 10
  }
}

// Every font this book's text needs, and nothing else: a Japanese face is more
// than ten times the size of the whole book.
function neededFonts(book: ExportBook) {
  const fonts = new Set<FontKey>(["latin", "latinBold", "latinItalic"])
  const han = hanFont(book.targetLang)
  const scan = (text: string) => {
    for (const ch of text) {
      const font = scriptFont(ch, han)
      if (font) fonts.add(font)
    }
  }
  for (const chapter of book.chapters)
    for (const s of chapter.segments) {
      scan(textOf(s))
      if (book.bilingual) scan(s.source)
    }
  scan(book.title)
  scan(book.author)
  return fonts
}

export async function buildPdf(book: ExportBook) {
  const fonts = neededFonts(book)
  const loaded = await Promise.all(
    [...fonts].map(async (key) => [key, await loadFont(key)] as const)
  )
  const titleSegment = book.chapters
    .flatMap((c) => c.segments)
    .find((s) => s.locator === "meta:title")
  const title = (titleSegment?.target ?? book.title).replace(/<[^>]+>/g, "")
  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margins: {
      top: MARGIN.top,
      bottom: 0,
      left: MARGIN.x,
      right: MARGIN.x,
    },
    bufferPages: false,
    autoFirstPage: true,
    font: null as unknown as string,
    pdfVersion: "1.7",
    lang: book.targetLang,
    displayTitle: true,
    info: { Title: title, Author: book.author },
  } as PDFKit.PDFDocumentOptions)
  const chunks: Buffer[] = []
  doc.on("data", (b: Buffer) => chunks.push(b))
  const ended = new Promise<void>((resolve) => doc.on("end", () => resolve()))
  for (const [key, bytes] of loaded) doc.registerFont(key, bytes)

  const w = new Writer(doc, book, fonts)
  const lang = book.targetLang
  const black = "#111111"
  const grey = "#666666"

  w.y = 180
  w.paragraph([{ text: title }], { size: 22, color: black, bold: true }, lang, {
    after: 12,
    leading: 30,
  })
  if (book.author)
    w.paragraph([{ text: book.author }], { size: 12, color: grey }, lang)
  w.addPage()

  let first = true
  for (const chapter of book.chapters) {
    if (chapter.segments.every((s) => s.kind === "meta")) continue
    if (!first) w.addPage()
    first = false
    const heading = chapter.segments.find((s) => s.kind === "heading")
    const label = heading
      ? inlineRuns(textOf(heading), heading.tags)
          .map((r) => r.text)
          .join("")
      : chapter.title
    if (label) doc.outline.addItem(label)
    for (const item of layoutItems(chapter.segments)) {
      if (item.type === "table") {
        w.table(item.rows)
        continue
      }
      const s = item.segment
      if (s.kind === "rule") {
        w.paragraph([{ text: "* * *" }], { size: BODY, color: grey }, "en")
        continue
      }
      if (s.kind === "image") {
        await w.image(s)
        continue
      }
      if (s.kind === "code") {
        w.paragraph(
          inlineRuns(s.source, s.tags),
          { size: BODY - 1.5, color: black },
          "en"
        )
        continue
      }
      const heading = s.kind === "heading"
      const level = s.level ?? 2
      const style: Style = heading
        ? {
            size: level <= 1 ? 18 : level === 2 ? 14 : 12,
            color: black,
            bold: true,
          }
        : s.kind === "footnote"
          ? { size: BODY - 2, color: black }
          : s.kind === "quote"
            ? { size: BODY, color: black, italic: true }
            : { size: BODY, color: black }
      if (book.bilingual && !heading)
        w.paragraph(
          inlineRuns(s.source, s.tags),
          { size: style.size - 1, color: grey },
          book.sourceLang,
          { after: 3 }
        )
      w.paragraph(inlineRuns(textOf(s), s.tags), style, lang, {
        indent: s.kind === "quote" || s.kind === "list_item" ? 14 : 0,
        after: heading ? style.size * 0.8 : undefined,
      })
    }
  }
  w.footer()
  doc.end()
  await ended
  return new Uint8Array(Buffer.concat(chunks))
}
