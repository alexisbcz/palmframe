import { InlineWriter } from "../inline"
import type { Block, InlineType, SegmentKind } from "../model"
import {
  Element,
  isElement,
  isText,
  localName,
  textOf,
  type ChildNode,
} from "../xml"

// XHTML to blocks. The same walk reads a chapter and later rewrites it: a
// unit's ordinal and its tags' ids come out the same both times, so a
// translation finds its way back to the exact element it came from.
export interface Unit {
  ordinal: number
  nodes: ChildNode[]
  parent: Element
  // The element a whole unit lives in; absent for loose text in a container.
  element?: Element
  block: Block
  // Elements behind each inline tag, for the rewrite.
  inline: Map<string, Element>
  // The `img` an image block's alt text belongs to.
  image?: Element
}

const STRUCTURAL = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "center",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
])

const SKIPPED = new Set([
  "head",
  "script",
  "style",
  "template",
  "noscript",
  "title",
  "meta",
  "link",
])

const INLINE_TYPES: Record<string, InlineType> = {
  b: "b",
  strong: "b",
  i: "i",
  em: "i",
  cite: "i",
  dfn: "i",
  var: "i",
  u: "u",
  ins: "u",
  s: "s",
  del: "s",
  strike: "s",
  sup: "sup",
  sub: "sub",
  code: "code",
  kbd: "code",
  samp: "code",
  tt: "code",
}

const epubType = (e: Element) =>
  `${e.attribs["epub:type"] ?? ""} ${e.attribs.role ?? ""}`.toLowerCase()

const isNoteRef = (e: Element) =>
  /noteref/.test(epubType(e)) ||
  (/^#/.test(e.attribs.href ?? "") &&
    e.children.length > 0 &&
    /^[\s[(]*(\d{1,4}|[*†‡§])[\s\])]*$/.test(textOf(e)) &&
    (localName(e.parent as Element) === "sup" || !!e.attribs["epub:type"]))

const isNoteBox = (e: Element) =>
  /(foot|end|rear)note/.test(epubType(e)) ||
  (["aside", "div", "section", "li", "p"].includes(localName(e)) &&
    /\b(foot|end)note/i.test(e.attribs.class ?? ""))

// One unit's inline content, tagged. Also returns which element each tag was.
function writeInline(nodes: ChildNode[], preserve: boolean) {
  const w = new InlineWriter()
  const inline = new Map<string, Element>()
  const last = () => w.tags.at(-1)!.id
  const visit = (node: ChildNode) => {
    if (isText(node)) {
      w.plain(preserve ? node.data : node.data.replace(/\s+/g, " "))
      return
    }
    if (!isElement(node)) return
    const name = localName(node)
    if (SKIPPED.has(name)) return
    if (name === "br") {
      w.empty("br")
      inline.set(last(), node)
      return
    }
    if (name === "img" || name === "image" || name === "svg") {
      w.empty("img")
      inline.set(last(), node)
      return
    }
    const type: InlineType | null =
      name === "a"
        ? node.attribs.href
          ? isNoteRef(node)
            ? "noteref"
            : "a"
          : "span"
        : (INLINE_TYPES[name] ??
          (Object.keys(node.attribs).length ? "span" : null))
    // A bare wrapper says nothing, and Word exports are full of them.
    if (!type) return node.children.forEach(visit)
    if (!node.children.length) {
      w.empty(type, node.attribs.href)
      inline.set(last(), node)
      return
    }
    const id = w.open(type, node.attribs.href)
    inline.set(id, node)
    node.children.forEach(visit)
    w.close(id)
  }
  nodes.forEach(visit)
  const text = preserve ? w.text : tidy(w.text)
  return { text, tags: w.tags, inline }
}

// Spaces at the edges and around tags collapse the way a browser would.
const tidy = (s: string) =>
  s
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/^ +| +$/g, "")
    .replace(/^((?:<[gx]\d+\/?>)+) +/, "$1")
    .replace(/ +((?:<\/g\d+>)+)$/, "$1")

const blank = (nodes: ChildNode[]) =>
  nodes.every((n) => isText(n) && !n.data.trim())

const isStructural = (n: ChildNode) =>
  isElement(n) && STRUCTURAL.has(localName(n))

const hasStructural = (e: Element) => e.children.some(isStructural)

interface Context {
  kind: SegmentKind
  group?: string
  cell?: Block["cell"]
}

export function collectUnits(body: Element, prefix: string): Unit[] {
  const units: Unit[] = []
  let groups = 0

  const push = (
    parent: Element,
    nodes: ChildNode[],
    ctx: Context,
    element?: Element,
    extra: Partial<Block> = {}
  ) => {
    const preserve = ctx.kind === "code"
    const { text, tags, inline } = writeInline(nodes, preserve)
    const ordinal = units.length
    const block: Block = {
      kind: ctx.kind,
      text,
      tags,
      locator: `${prefix}#${ordinal}`,
      ...(ctx.group && { group: ctx.group }),
      ...(ctx.cell && { cell: ctx.cell }),
      ...extra,
    }
    // A paragraph holding nothing but a picture is a picture.
    const only = tags.length === 1 && tags[0]!.type === "img" && !stripped(text)
    if (only) {
      const image = inline.get(tags[0]!.id)!
      units.push({
        ordinal,
        nodes,
        parent,
        element,
        inline: new Map(),
        image,
        block: {
          ...block,
          kind: "image",
          text: escapeAlt(image.attribs.alt ?? ""),
          tags: [],
          asset: imageHref(image),
        },
      })
      return
    }
    units.push({ ordinal, nodes, parent, element, inline, block })
  }

  const inlineRuns = (e: Element, ctx: Context) => {
    let run: ChildNode[] = []
    const flush = () => {
      if (run.length && !blank(run)) push(e, run, ctx)
      run = []
    }
    for (const child of e.children) {
      if (isStructural(child)) {
        flush()
        visit(child as Element, ctx)
      } else run.push(child)
    }
    flush()
  }

  const visit = (e: Element, ctx: Context) => {
    const name = localName(e)
    if (SKIPPED.has(name)) return
    if (name === "hr") {
      units.push({
        ordinal: units.length,
        nodes: [e],
        parent: e.parent as Element,
        element: e,
        inline: new Map(),
        block: {
          kind: "rule",
          text: "",
          tags: [],
          locator: `${prefix}#${units.length}`,
        },
      })
      return
    }
    if (name === "table") {
      const group = `t${++groups}`
      let row = 0
      for (const tr of [...walkRows(e)]) {
        let col = 0
        for (const cell of tr.children.filter(isElement)) {
          const cname = localName(cell)
          if (cname !== "td" && cname !== "th") continue
          visit(cell, {
            kind: "table_cell",
            group,
            cell: { row, col, ...(cname === "th" && { header: true }) },
          })
          col++
        }
        row++
      }
      for (const caption of e.children.filter(
        (c): c is Element => isElement(c) && localName(c) === "caption"
      ))
        visit(caption, { kind: "caption", group })
      return
    }
    let next = ctx
    if (isNoteBox(e))
      next = { kind: "footnote", group: ctx.group ?? `n${++groups}` }
    else if (name === "blockquote" && ctx.kind === "paragraph")
      next = { kind: "quote" }
    else if (name === "li" && ctx.kind === "paragraph")
      next = { kind: "list_item", group: ctx.group }
    else if ((name === "ul" || name === "ol") && !ctx.group)
      next = { ...ctx, group: `l${++groups}` }
    else if (name === "figcaption" || name === "caption")
      next = { ...ctx, kind: "caption" }
    else if (name === "pre") next = { kind: "code" }

    if (hasStructural(e) && name !== "pre") return inlineRuns(e, next)
    if (blank(e.children)) return
    const heading = /^h([1-6])$/.exec(name)
    if (heading) {
      push(e.parent as Element, e.children, { ...next, kind: "heading" }, e, {
        level: Number(heading[1]),
      })
      return
    }
    if (/(^|\s)(verse|poem|stanza)(\s|$)/i.test(e.attribs.class ?? ""))
      next = { ...next, kind: "verse" }
    push(e.parent as Element, e.children, next, e)
  }

  inlineRuns(body, { kind: "paragraph" })
  return units
}

function* walkRows(table: Element): Generator<Element> {
  for (const child of table.children.filter(isElement)) {
    const name = localName(child)
    if (name === "tr") yield child
    else if (name === "thead" || name === "tbody" || name === "tfoot")
      yield* walkRows(child)
  }
}

const stripped = (s: string) => s.replace(/<\/?[gx]\d+\/?>/g, "").trim()

const escapeAlt = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\s+/g, " ")
    .trim()

export const imageHref = (e: Element) => {
  if (localName(e) === "svg") {
    const inner = e.children.find(
      (c): c is Element => isElement(c) && localName(c) === "image"
    )
    return inner?.attribs["xlink:href"] ?? inner?.attribs.href
  }
  return e.attribs.src ?? e.attribs["xlink:href"] ?? e.attribs.href
}
