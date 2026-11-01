import PDFDocument from "pdfkit"

import { paginate } from "../fountain"
import type { Manuscript, Run } from "../model"
import {
  blocksOf,
  partLabel,
  scriptOf,
  titled,
  TRIMS,
  type Trim,
} from "./common"
import { deskFont } from "./fonts.server"

// Books, manuscripts and scripts as print-ready PDF. Fonts embed, so a book
// looks the same on any printer. Scripts place every line on a fixed grid, the
// way a typewriter would: 6 lines to the inch, 10 characters to the inch.

type Doc = PDFKit.PDFDocument

async function done(doc: Doc) {
  const chunks: Buffer[] = []
  return new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))))
    doc.on("error", reject)
    doc.end()
  })
}

const meta = (m: Manuscript) => ({
  Title: m.title || "Untitled",
  Author: m.author,
  Creator: "Palmframe",
})

async function register(doc: Doc, family: "garamond" | "courier") {
  for (const style of ["Regular", "Italic", "Bold", "BoldItalic"] as const)
    doc.registerFont(
      `${family}-${style}`,
      Buffer.from(await deskFont(family, style))
    )
}

const face = (family: string, r: Run) =>
  `${family}-${r.bold && r.italic ? "BoldItalic" : r.bold ? "Bold" : r.italic ? "Italic" : "Regular"}`

function runs(
  doc: Doc,
  family: string,
  list: Run[],
  options: PDFKit.Mixins.TextOptions
) {
  list.forEach((r, i) => {
    doc
      .font(face(family, r))
      .text(r.text, { ...options, continued: i < list.length - 1 })
  })
}

// Book ----------------------------------------------------------------------

async function book(m: Manuscript, trim: Trim) {
  const { w, h } = TRIMS[trim]
  const margin = {
    top: h * 0.1,
    bottom: h * 0.115,
    inner: w * 0.15,
    outer: w * 0.115,
  }
  const size = trim === "6x9" ? 11.5 : 11
  const leading = size * 1.32
  const doc = new PDFDocument({
    size: [w, h],
    autoFirstPage: false,
    bufferPages: true,
    info: meta(m),
    margins: {
      top: margin.top,
      bottom: margin.bottom,
      left: margin.inner,
      right: margin.outer,
    },
  })
  await register(doc, "garamond")
  const addPage = () => {
    // Facing pages: the gutter swaps sides.
    const odd = doc.bufferedPageRange().count % 2 === 0
    doc.addPage({
      size: [w, h],
      margins: {
        top: margin.top,
        bottom: margin.bottom,
        left: odd ? margin.inner : margin.outer,
        right: odd ? margin.outer : margin.inner,
      },
    })
  }
  const recto = () => {
    addPage()
    if (doc.bufferedPageRange().count % 2 === 0) addPage()
  }
  doc.on("pageAdded", () => {})

  // Half title and title.
  recto()
  doc.font("garamond-Regular").fontSize(size * 2.4)
  doc.y = h * 0.28
  doc.text(m.title || " ", { align: "center" })
  if (m.subtitle)
    doc
      .moveDown(0.6)
      .fontSize(size * 1.2)
      .font("garamond-Italic")
      .text(m.subtitle, { align: "center" })
  doc.y = h * 0.62
  doc
    .font("garamond-Regular")
    .fontSize(size * 1.3)
    .text(m.author || " ", { align: "center" })
  const numbered = doc.bufferedPageRange().count

  const width = () =>
    doc.page.width - doc.page.margins.left - doc.page.margins.right
  const bottom = () => doc.page.height - doc.page.margins.bottom

  m.parts.forEach((part, i) => {
    recto()
    const label = partLabel(m, part, i)
    doc.y = h * (m.kind === "poetry" ? 0.13 : 0.22)
    if (label) {
      doc
        .font("garamond-Regular")
        .fontSize(size * 1.5)
        .text(label, { align: "center" })
      doc.moveDown(m.kind === "poetry" ? 1.2 : 2.2)
    }
    doc.fontSize(size)
    for (const b of blocksOf(m, part)) {
      if (b.t === "stanza") {
        // A stanza stays whole unless it outgrows a page.
        const need = b.lines.length * leading
        if (doc.y + need > bottom() && need < bottom() - margin.top) addPage()
        for (const line of b.lines) {
          doc.font("garamond-Regular").fontSize(size)
          const x = doc.page.margins.left + width() * 0.04
          doc.text(line, x, doc.y, {
            width: width() * 0.96,
            lineGap: leading - doc.currentLineHeight(),
            indent: 0,
          })
        }
        doc.y += leading * 0.75
        doc.x = doc.page.margins.left
      } else if (b.t === "break") {
        doc
          .moveDown(0.5)
          .font("garamond-Regular")
          .text("* * *", doc.page.margins.left, doc.y, {
            align: "center",
            width: width(),
          })
        doc.moveDown(0.5)
      } else if (b.t === "p") {
        // Two lines at the foot, or the paragraph starts overleaf.
        if (doc.y + leading * 2 > bottom()) addPage()
        doc.fontSize(size)
        doc.x = doc.page.margins.left
        runs(doc, "garamond", b.runs, {
          align: "justify",
          width: width(),
          indent: b.first ? 0 : size * 1.4,
          lineGap: leading - size * 1.17,
        })
      }
    }
  })

  // Running folios, once the page count is known.
  const range = doc.bufferedPageRange()
  for (let n = numbered; n < range.count; n++) {
    doc.switchToPage(n)
    const bottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.font("garamond-Regular").fontSize(size * 0.85)
    doc.text(String(n - numbered + 1), 0, h - margin.bottom * 0.6, {
      width: w,
      align: "center",
      lineBreak: false,
    })
    doc.page.margins.bottom = bottomMargin
  }
  return done(doc)
}

// Standard manuscript format, for agents and editors ------------------------

async function manuscript(m: Manuscript) {
  const doc = new PDFDocument({
    size: "LETTER",
    autoFirstPage: false,
    bufferPages: true,
    info: meta(m),
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
  })
  await register(doc, "courier")
  const size = 12
  const add = () =>
    doc.addPage({
      size: "LETTER",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
    })
  add()
  doc.font("courier-Regular").fontSize(size)
  doc.text([m.author, m.contact].filter(Boolean).join("\n") || " ", 72, 72)
  const words = m.parts.reduce(
    (n, p) => n + (p.body.match(/\S+/g)?.length ?? 0),
    0
  )
  const rounded = Math.round(words / 100) * 100
  doc.text(`about ${rounded.toLocaleString("en-US")} words`, 72, 72, {
    align: "right",
    width: 468,
  })
  doc.text(m.title.toUpperCase(), 72, 340, { align: "center", width: 468 })
  doc
    .moveDown(1)
    .text(m.author ? `by ${m.author}` : " ", { align: "center", width: 468 })
  m.parts.forEach((part, i) => {
    add()
    const label = partLabel(m, part, i)
    doc.y = 240
    doc.font("courier-Regular").fontSize(size)
    if (label)
      doc.text(label, 72, 240, { align: "center", width: 468 }).moveDown(2)
    for (const b of blocksOf(m, part)) {
      if (b.t === "p") {
        doc.x = 72
        runs(doc, "courier", b.runs, {
          width: 468,
          indent: 36,
          lineGap: 13,
          align: "left",
        })
      } else if (b.t === "break") {
        doc.text("#", 72, doc.y, { align: "center", width: 468, lineGap: 13 })
      }
    }
  })
  const range = doc.bufferedPageRange()
  const surname = m.author.trim().split(/\s+/).pop() ?? ""
  const short = (m.title.split(/\s+/).slice(0, 3).join(" ") || "").toUpperCase()
  for (let n = 1; n < range.count; n++) {
    doc.switchToPage(n)
    doc.page.margins.top = 0
    doc.font("courier-Regular").fontSize(size)
    doc.text(`${surname} / ${short} / ${n}`, 72, 40, {
      align: "right",
      width: 468,
      lineBreak: false,
    })
  }
  return done(doc)
}

// Screenplay ----------------------------------------------------------------

const CHAR = 7.2 // 10 pitch
const LINE = 12 // 6 lines to the inch
const X: Record<string, number> = {
  character: 36.5,
  contd: 36.5,
  more: 36.5,
  parenthetical: 30.5,
  dialogue: 24.5,
  lyric: 24.5,
}

async function script(m: Manuscript) {
  const doc = new PDFDocument({
    size: "LETTER",
    autoFirstPage: false,
    info: meta(m),
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  })
  await register(doc, "courier")
  const add = () =>
    doc.addPage({
      size: "LETTER",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  add()
  doc.font("courier-Regular").fontSize(12)
  doc.text(m.title.toUpperCase() || " ", 0, 280, {
    align: "center",
    width: 612,
    lineBreak: false,
  })
  if (m.author) {
    doc.text("Written by", 0, 340, {
      align: "center",
      width: 612,
      lineBreak: false,
    })
    doc.text(m.author, 0, 370, {
      align: "center",
      width: 612,
      lineBreak: false,
    })
  }
  if (m.contact) doc.text(m.contact, 108, 660, { lineBreak: true, width: 300 })

  for (const page of paginate(scriptOf(m))) {
    add()
    doc.font("courier-Regular").fontSize(12)
    if (page.number > 1)
      doc.text(`${page.number}.`, 612 - 72 - CHAR * 5, 36, {
        width: CHAR * 5,
        align: "right",
        lineBreak: false,
      })
    page.lines.forEach((l, i) => {
      if (l.type === "blank" || !l.text) return
      const y = 72 + i * LINE
      const put = (x: number) =>
        doc.text(l.text, x, y, { lineBreak: false, width: 612 })
      if (l.type === "transition") {
        const x = 612 - 72 - l.text.length * CHAR
        put(x)
      } else if (l.type === "centered") {
        put((108 + (612 - 72)) / 2 - (l.text.length * CHAR) / 2)
      } else if (l.type === "scene") {
        doc.font("courier-Bold")
        put(108)
        doc.font("courier-Regular")
      } else {
        put(108 + ((X[l.type] ?? 15) - 15) * CHAR)
      }
    })
  }
  return done(doc)
}

export function toPdf(
  source: Manuscript,
  style: "book" | "manuscript",
  trim: Trim
) {
  const m = titled(source)
  if (m.kind === "screenplay") return script(m)
  return style === "manuscript" && m.kind === "novel"
    ? manuscript(m)
    : book(m, trim)
}
