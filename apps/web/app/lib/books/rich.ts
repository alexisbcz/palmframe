import { checkTags, escapeText, parseInline, type InlineNode } from "./inline"
import type { InlineTag } from "./model"

// The editor's document and a segment's tagged text, each from the other. The
// tagged text stays the stored form: the engine, the checks and every export
// read it, and the editor is only a better way of changing it.
export const TAG_MARK = "bookTagMark"
export const TAG_ATOM = "bookTagAtom"

export interface RichMark {
  type: typeof TAG_MARK
  attrs: { id: string; kind: InlineTag["type"] }
}

export interface RichInline {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: RichMark[]
}

export interface RichDoc {
  type: "doc"
  content: { type: "paragraph"; content?: RichInline[] }[]
}

const rank = (id: string) => Number(id.slice(1))
const byRank = (a: RichMark, b: RichMark) => rank(a.attrs.id) - rank(b.attrs.id)

export function toDoc(text: string, tags: InlineTag[]): RichDoc {
  const kinds = new Map(tags.map((t) => [t.id, t.type]))
  const kind = (id: string) => kinds.get(id) ?? "span"
  const content: RichInline[] = []
  const walk = (nodes: InlineNode[], marks: RichMark[]) => {
    const carried = marks.length ? { marks } : {}
    for (const node of nodes) {
      if ("text" in node) {
        node.text.split("\n").forEach((line, i) => {
          if (i) content.push({ type: "hardBreak", ...carried })
          if (line) content.push({ type: "text", text: line, ...carried })
        })
      } else if (node.children.length) {
        const attrs = { id: node.id, kind: kind(node.id) }
        walk(node.children, [...marks, { type: TAG_MARK, attrs }])
      } else {
        // Marks can't sit on nothing, so a tag around no text is a thing too.
        content.push({
          type: TAG_ATOM,
          attrs: { id: node.id, kind: kind(node.id) },
          ...carried,
        })
      }
    }
  }
  walk(parseInline(text), [])
  return {
    type: "doc",
    content: [{ type: "paragraph", ...(content.length ? { content } : {}) }],
  }
}

export function fromDoc(doc: RichDoc) {
  let out = ""
  const open: string[] = []
  const closeTo = (depth: number) => {
    while (open.length > depth) out += `</${open.pop()}>`
  }
  doc.content.forEach((block, i) => {
    if (i) {
      closeTo(0)
      out += "\n"
    }
    for (const node of block.content ?? []) {
      const want = [...(node.marks ?? [])].sort(byRank).map((m) => m.attrs.id)
      let keep = 0
      while (keep < open.length && open[keep] === want[keep]) keep++
      closeTo(keep)
      for (const id of want.slice(keep)) {
        out += `<${id}>`
        open.push(id)
      }
      if (node.type === "text") out += escapeText(node.text ?? "")
      else if (node.type === "hardBreak") out += "\n"
      else if (node.type === TAG_ATOM) {
        const id = String(node.attrs?.id)
        out += id.startsWith("x") ? `<${id}/>` : `<${id}></${id}>`
      }
    }
    closeTo(0)
  })
  return out
}

// What a text becomes after a trip through the editor. Comparing against this,
// and not the stored text, keeps a line nobody touched from counting as edited.
export const normalize = (text: string, tags: InlineTag[]) =>
  fromDoc(toDoc(text, tags))

// The source's tags the translation hasn't placed yet.
export function tagsToPlace(source: string, target: string, tags: InlineTag[]) {
  const missing = new Set(checkTags(source, target)?.missing ?? [])
  return tags.filter((t) => missing.has(t.id))
}

export const tagsInSource = (source: string, tags: InlineTag[]) => {
  const missing = new Set(checkTags(source, "")?.missing ?? [])
  return tags.filter((t) => missing.has(t.id))
}
