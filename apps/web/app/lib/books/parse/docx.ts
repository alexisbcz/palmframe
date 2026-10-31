import { BookParseError } from "../errors"
import { InlineWriter } from "../inline"
import type { Block, InlineTag, ParsedBook, ParsedChapter } from "../model"
import {
  childElements,
  find,
  findAll,
  isElement,
  localName,
  parseXml,
  textOf,
  type Element,
} from "../xml"
import { openArchive, resolvePath, type Archive } from "./archive"
import { mimeOf } from "./epub"

interface Run {
  text?: string
  type?: "br" | "noteref" | "image"
  value?: string
  marks: string
  href?: string
}

const MARKS: [string, InlineTag["type"]][] = [
  ["b", "b"],
  ["i", "i"],
  ["u", "u"],
  ["s", "s"],
  ["p", "sup"],
  ["d", "sub"],
]

const on = (e: Element | undefined) => {
  const v = e?.attribs["w:val"]
  return !!e && v !== "0" && v !== "false" && v !== "none"
}

function runMarks(run: Element) {
  const props = childElements(run).find((c) => localName(c) === "rpr")
  if (!props) return ""
  const has = (name: string) =>
    childElements(props).find((c) => localName(c) === name)
  const align = has("vertalign")?.attribs["w:val"]
  return [
    on(has("b")) ? "b" : "",
    on(has("i")) ? "i" : "",
    on(has("u")) ? "u" : "",
    on(has("strike")) ? "s" : "",
    align === "superscript" ? "p" : "",
    align === "subscript" ? "d" : "",
  ].join("")
}

function readRuns(
  p: Element,
  links: Map<string, string>,
  out: Run[],
  href?: string
) {
  for (const child of childElements(p)) {
    const name = localName(child)
    if (name === "r") {
      const marks = runMarks(child)
      for (const part of childElements(child)) {
        const kind = localName(part)
        if (kind === "t" || kind === "delText")
          out.push({ text: textOf(part), marks, href })
        else if (kind === "tab") out.push({ text: "\t", marks, href })
        else if (kind === "br" || kind === "cr")
          out.push({ type: "br", marks, href })
        else if (kind === "footnotereference")
          out.push({
            type: "noteref",
            value: part.attribs["w:id"],
            marks: "",
          })
        else if (kind === "drawing" || kind === "pict") {
          const blip = find(part, "blip")
          const id = blip?.attribs["r:embed"]
          if (id) out.push({ type: "image", value: id, marks: "" })
        }
      }
    } else if (name === "hyperlink") {
      const target = links.get(child.attribs["r:id"] ?? "")
      readRuns(child, links, out, target ?? href)
    } else if (name === "smarttag" || name === "sdt" || name === "sdtcontent")
      readRuns(child, links, out, href)
    else if (name === "ins") readRuns(child, links, out, href)
  }
}

// Word splits a sentence into dozens of runs. Neighbours with the same marks
// merge, so the translator sees one piece of text.
function inlineOf(runs: Run[]) {
  const w = new InlineWriter()
  const images: string[] = []
  const notes: string[] = []
  let i = 0
  while (i < runs.length) {
    const run = runs[i]!
    if (run.type === "image") {
      images.push(run.value!)
      i++
      continue
    }
    if (run.type === "noteref") {
      notes.push(run.value!)
      w.empty("noteref", `#fn-${run.value}`)
      i++
      continue
    }
    const opened: string[] = []
    if (run.href) opened.push(w.open("a", run.href))
    for (const [mark, type] of MARKS)
      if (run.marks.includes(mark)) opened.push(w.open(type))
    let j = i
    while (
      j < runs.length &&
      runs[j]!.marks === run.marks &&
      runs[j]!.href === run.href &&
      runs[j]!.type !== "image" &&
      runs[j]!.type !== "noteref"
    ) {
      const part = runs[j]!
      if (part.type === "br") w.empty("br")
      else w.plain(part.text ?? "")
      j++
    }
    for (const id of opened.reverse()) w.close(id)
    i = j
  }
  return {
    text: w.text.replace(/\s+/g, " ").trim(),
    tags: w.tags,
    images,
    notes,
  }
}

async function relationships(archive: Archive, part: string) {
  const dir = part.split("/").slice(0, -1).join("/")
  const name = part.split("/").pop()!
  const rels = `${dir}/_rels/${name}.rels`
  const map = new Map<string, { target: string; external: boolean }>()
  if (!archive.has(rels)) return map
  for (const r of findAll(parseXml(await archive.text(rels)), "relationship"))
    if (r.attribs.Id && r.attribs.Target)
      map.set(r.attribs.Id, {
        target: r.attribs.Target,
        external: r.attribs.TargetMode === "External",
      })
  return map
}

async function headingStyles(archive: Archive) {
  const levels = new Map<string, number>()
  if (!archive.has("word/styles.xml")) return levels
  const doc = parseXml(await archive.text("word/styles.xml"))
  for (const style of findAll(doc, "style")) {
    const id = style.attribs["w:styleId"]
    const name = childElements(style).find((c) => localName(c) === "name")
    const level = /^heading (\d)$/i.exec(name?.attribs["w:val"] ?? "")?.[1]
    if (id && level) levels.set(id, Number(level))
    if (id && /^title$/i.test(name?.attribs["w:val"] ?? "")) levels.set(id, 0)
  }
  return levels
}

const pProp = (p: Element, name: string) => {
  const props = childElements(p).find((c) => localName(c) === "ppr")
  return props && childElements(props).find((c) => localName(c) === name)
}

export async function parseDocx(bytes: Uint8Array): Promise<ParsedBook> {
  const archive = await openArchive(bytes)
  if (!archive.has("word/document.xml"))
    throw new BookParseError("corrupt", "No document part.")
  const doc = parseXml(await archive.text("word/document.xml"))
  const body = find(doc, "body")
  if (!body) throw new BookParseError("corrupt", "No document body.")
  const rels = await relationships(archive, "word/document.xml")
  const links = new Map(
    [...rels].flatMap(([id, r]) =>
      r.external && /^(https?:|mailto:)/i.test(r.target)
        ? [[id, r.target] as const]
        : []
    )
  )
  const headings = await headingStyles(archive)

  const footnotes = new Map<string, Block[]>()
  if (archive.has("word/footnotes.xml")) {
    const notes = parseXml(await archive.text("word/footnotes.xml"))
    for (const note of findAll(notes, "footnote")) {
      const id = note.attribs["w:id"] ?? ""
      if (note.attribs["w:type"]) continue
      const blocks = findAll(note, "p").flatMap((p) => {
        const runs: Run[] = []
        readRuns(p, links, runs)
        const { text, tags } = inlineOf(runs)
        return text
          ? [{ kind: "footnote" as const, text, tags, group: `fn-${id}` }]
          : []
      })
      footnotes.set(id, blocks)
    }
  }

  const assets = new Map<string, ParsedBook["assets"][number]>()
  const chapters: ParsedChapter[] = []
  let current: ParsedChapter = { title: "", blocks: [] }
  let pending: string[] = []
  let tables = 0
  let ordinal = 0

  const finish = () => {
    for (const id of pending) current.blocks.push(...(footnotes.get(id) ?? []))
    pending = []
    if (current.blocks.length) chapters.push(current)
  }
  const paragraph = (p: Element, base: Partial<Block> = {}) => {
    const runs: Run[] = []
    readRuns(p, links, runs)
    const { text, tags, images, notes } = inlineOf(runs)
    pending.push(...notes)
    const style = pProp(p, "pstyle")?.attribs["w:val"]
    const level = style ? headings.get(style) : undefined
    const isList = !!pProp(p, "numpr")
    const out: Block[] = []
    for (const id of images) {
      const rel = rels.get(id)
      const path = rel && resolvePath("word/document.xml", rel.target)
      if (path && archive.has(path)) {
        assets.set(path, {
          id: path,
          name: path.split("/").pop()!,
          mime: mimeOf(path),
        })
        out.push({ kind: "image", text: "", tags: [], asset: path })
      }
    }
    if (text)
      out.push({
        kind:
          level !== undefined
            ? "heading"
            : isList
              ? "list_item"
              : /quote/i.test(style ?? "")
                ? "quote"
                : "paragraph",
        text,
        tags,
        ...(level !== undefined && { level: Math.max(1, level) }),
        ...base,
      })
    return out
  }

  for (const child of childElements(body)) {
    const name = localName(child)
    if (name === "p") {
      for (const block of paragraph(child)) {
        block.locator = `p#${ordinal++}`
        if (block.kind === "heading" && block.level === 1) {
          finish()
          current = { title: plain(block.text), blocks: [] }
        }
        current.blocks.push(block)
      }
    } else if (name === "tbl") {
      const group = `t${++tables}`
      let row = 0
      for (const tr of childElements(child).filter(
        (c) => localName(c) === "tr"
      )) {
        let col = 0
        for (const tc of childElements(tr).filter(
          (c) => localName(c) === "tc"
        )) {
          const blocks = childElements(tc)
            .filter((c) => localName(c) === "p")
            .flatMap((p) => paragraph(p, { group, cell: { row, col } }))
            .filter((b) => b.kind !== "image")
          for (const block of blocks.length
            ? blocks
            : [
                {
                  kind: "table_cell" as const,
                  text: "",
                  tags: [],
                  group,
                  cell: { row, col },
                },
              ])
            current.blocks.push({
              ...block,
              kind: "table_cell",
              locator: `p#${ordinal++}`,
            })
          col++
        }
        row++
      }
    }
  }
  finish()
  if (!isElement(body)) throw new BookParseError("corrupt")

  const meta = { title: "", author: "" }
  if (archive.has("docProps/core.xml")) {
    const core = parseXml(await archive.text("docProps/core.xml"))
    meta.title = textOf(find(core, "title") ?? core).trim()
    meta.author = textOf(find(core, "creator") ?? core).trim()
    if (!find(core, "title")) meta.title = ""
    if (!find(core, "creator")) meta.author = ""
  }
  return {
    meta: { ...meta, language: null },
    chapters,
    assets: [...assets.values()],
    scans: [],
    warnings: [],
  }
}

const plain = (s: string) => s.replace(/<\/?[gx]\d+\/?>/g, "")
