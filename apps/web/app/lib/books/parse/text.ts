import { InlineWriter, plainBlock } from "../inline"
import type { Block, ParsedBook, ParsedChapter } from "../model"
import { Element, find, findAll, parseHtml, sanitize, textOf } from "../xml"
import { collectUnits } from "./units"

const CHAPTER =
  /^(chapter|chapitre|cap[ií]tulo|capitolo|kapitel|part|partie|parte|teil|book|livre|libro|prologue|prologo|prólogo|prolog|epilogue|épilogue|epilogo|epílogo|introduction|einleitung|introducci[oó]n|introduzione)\b[^\n]{0,80}$|^第[0-9一二三四五六七八九十百千]+[章話部]/i

const lines = (s: string) => s.replace(/\r\n?/g, "\n").replace(/^﻿/, "")

// Plain text: blank lines end paragraphs, and lines wrapped at a fixed width
// join up again. A line like "Chapter 3" starts a chapter.
export function parseText(source: string): ParsedBook {
  const chapters: ParsedChapter[] = []
  let current: ParsedChapter = { title: "", blocks: [] }
  const push = () => {
    if (current.blocks.length) chapters.push(current)
  }
  let ordinal = 0
  for (const para of lines(source).split(/\n[ \t]*\n+/)) {
    const raw = para.trim()
    if (!raw) continue
    if (/^([*\-_=~#] ?){3,}$/.test(raw)) {
      current.blocks.push({ kind: "rule", text: "", tags: [] })
      continue
    }
    const joined = raw.replace(/-\n(?=\p{Ll})/gu, "").replace(/\s*\n\s*/g, " ")
    const locator = `p#${ordinal++}`
    if (CHAPTER.test(joined) && joined.length < 90) {
      push()
      current = {
        title: joined,
        blocks: [plainBlock("heading", joined, { level: 1, locator })],
      }
    } else current.blocks.push(plainBlock("paragraph", joined, { locator }))
  }
  push()
  return {
    meta: { title: "", author: "", language: null },
    chapters,
    assets: [],
    scans: [],
    warnings: [],
  }
}

function inlineMarkdown(s: string) {
  const w = new InlineWriter()
  const walk = (text: string) => {
    let at = 0
    const pattern =
      /(\*\*|__)(.+?)\1|(\*|_)(?=\S)(.+?)(?<=\S)\3|`([^`]+)`|!\[([^\]]*)\]\(([^)\s]+)[^)]*\)|\[([^\]]+)\]\(([^)\s]+)[^)]*\)|\[\^([^\]]+)\]|~~(.+?)~~/g
    for (const m of text.matchAll(pattern)) {
      if (m.index > at) w.plain(text.slice(at, m.index))
      at = m.index + m[0].length
      if (m[1]) {
        const id = w.open("b")
        walk(m[2]!)
        w.close(id)
      } else if (m[3]) {
        const id = w.open("i")
        walk(m[4]!)
        w.close(id)
      } else if (m[5] !== undefined) {
        const id = w.open("code")
        w.plain(m[5])
        w.close(id)
      } else if (m[7]) {
        w.plain(m[6] ?? "")
      } else if (m[9]) {
        const id = w.open("a", m[9])
        walk(m[8]!)
        w.close(id)
      } else if (m[10]) w.empty("noteref", `#fn-${m[10]}`)
      else if (m[11]) {
        const id = w.open("s")
        walk(m[11])
        w.close(id)
      }
    }
    if (at < text.length) w.plain(text.slice(at))
  }
  walk(s)
  return { text: w.text, tags: w.tags }
}

export function parseMarkdown(source: string): ParsedBook {
  const all = lines(source).split("\n")
  const meta = { title: "", author: "", language: null as string | null }
  let i = 0
  if (all[0]?.trim() === "---") {
    const end = all.indexOf("---", 1)
    if (end > 0) {
      for (const line of all.slice(1, end)) {
        const [key, ...rest] = line.split(":")
        const value = rest
          .join(":")
          .trim()
          .replace(/^["']|["']$/g, "")
        if (key?.trim() === "title") meta.title = value
        if (key?.trim() === "author") meta.author = value
        if (key?.trim() === "lang" || key?.trim() === "language")
          meta.language = value
      }
      i = end + 1
    }
  }

  const blocks: Block[] = []
  let groups = 0
  let ordinal = 0
  const add = (block: Block) =>
    blocks.push({ ...block, locator: `p#${ordinal++}` })
  let para: string[] = []
  const flush = () => {
    if (para.length)
      add({
        kind: "paragraph",
        ...inlineMarkdown(para.join(" ").replace(/\s+/g, " ").trim()),
      })
    para = []
  }

  for (; i < all.length; i++) {
    const line = all[i]!
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    const fence = /^(```|~~~)/.exec(trimmed)
    if (fence) {
      flush()
      const body: string[] = []
      for (i++; i < all.length && !all[i]!.trim().startsWith(fence[1]!); i++)
        body.push(all[i]!)
      add(plainBlock("code", body.join("\n")))
      continue
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(trimmed)
    if (heading) {
      flush()
      add({
        kind: "heading",
        level: heading[1]!.length,
        ...inlineMarkdown(heading[2]!),
      })
      continue
    }
    const next = all[i + 1]?.trim() ?? ""
    if (para.length === 0 && /^=+$/.test(next) && trimmed) {
      add({ kind: "heading", level: 1, ...inlineMarkdown(trimmed) })
      i++
      continue
    }
    if (para.length === 0 && /^-{2,}$/.test(next) && trimmed) {
      add({ kind: "heading", level: 2, ...inlineMarkdown(trimmed) })
      i++
      continue
    }
    if (/^([*\-_] ?){3,}$/.test(trimmed)) {
      flush()
      add({ kind: "rule", text: "", tags: [] })
      continue
    }
    const image = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(trimmed)
    if (image) {
      flush()
      add(plainBlock("image", image[1] ?? ""))
      continue
    }
    const note = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(trimmed)
    if (note) {
      flush()
      add({
        kind: "footnote",
        group: `fn-${note[1]}`,
        ...inlineMarkdown(note[2]!),
      })
      continue
    }
    if (trimmed.startsWith(">")) {
      flush()
      add({ kind: "quote", ...inlineMarkdown(trimmed.replace(/^>\s?/, "")) })
      continue
    }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (item) {
      flush()
      const prev = blocks.at(-1)
      const group = prev?.kind === "list_item" ? prev.group : `l${++groups}`
      add({ kind: "list_item", group, ...inlineMarkdown(item[1]!) })
      continue
    }
    if (trimmed.startsWith("|") && /^\|?[\s:|-]+\|?$/.test(next)) {
      flush()
      const group = `t${++groups}`
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim())
      cells(trimmed).forEach((c, col) =>
        add({
          kind: "table_cell",
          group,
          cell: { row: 0, col, header: true },
          ...inlineMarkdown(c),
        })
      )
      i += 2
      let row = 1
      for (; i < all.length && all[i]!.trim().startsWith("|"); i++, row++)
        cells(all[i]!).forEach((c, col) =>
          add({
            kind: "table_cell",
            group,
            cell: { row, col },
            ...inlineMarkdown(c),
          })
        )
      i--
      continue
    }
    para.push(trimmed)
  }
  flush()
  return {
    meta,
    chapters: splitByHeadings(blocks),
    assets: [],
    scans: [],
    warnings: [],
  }
}

// One heading level starts chapters: the top one in use, if it occurs twice.
export function splitByHeadings(blocks: Block[]): ParsedChapter[] {
  const counts = new Map<number, number>()
  for (const b of blocks)
    if (b.kind === "heading")
      counts.set(b.level ?? 1, (counts.get(b.level ?? 1) ?? 0) + 1)
  const level = [...counts.keys()]
    .sort((a, b) => a - b)
    .find((l) => counts.get(l)! >= 2)
  const chapters: ParsedChapter[] = []
  let current: ParsedChapter = { title: "", blocks: [] }
  for (const block of blocks) {
    if (block.kind === "heading" && block.level === level) {
      if (current.blocks.length) chapters.push(current)
      current = {
        title: block.text.replace(/<\/?[gx]\d+\/?>/g, ""),
        blocks: [],
      }
    } else if (!current.title && block.kind === "heading")
      current.title = block.text.replace(/<\/?[gx]\d+\/?>/g, "")
    current.blocks.push(block)
  }
  if (current.blocks.length) chapters.push(current)
  return chapters
}

export function parseHtmlBook(source: string): ParsedBook {
  const doc = parseHtml(source)
  sanitize(doc)
  const body = find(doc, "body")
  const root =
    body ??
    (() => {
      const wrapper = new Element("body", {})
      wrapper.children = doc.children
      return wrapper
    })()
  const blocks = collectUnits(root, "body")
    .map((u) => u.block)
    .map((b) => (b.kind === "image" ? { ...b, asset: undefined } : b))
  const meta = (name: string) =>
    findAll(doc, "meta").find((m) => m.attribs.name === name)?.attribs.content
  const title = find(doc, "title")
  return {
    meta: {
      title: title ? textOf(title).trim() : "",
      author: meta("author") ?? "",
      language: find(doc, "html")?.attribs.lang ?? null,
    },
    chapters: splitByHeadings(blocks),
    assets: [],
    scans: [],
    warnings: [],
  }
}
