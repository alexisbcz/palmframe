import {
  addedTag,
  checkTags,
  escapeText,
  parseInline,
  stripTags,
  tagMap,
  type InlineNode,
} from "./inline"
import type { InlineTag } from "./model"

// The editor's document and a segment's tagged text, each from the other. The
// tagged text stays the stored form: the engine, the checks and every export
// read it, and the editor is only a better way of changing it.
export const TAG_MARK = "bookTagMark"
export const TAG_ATOM = "bookTagAtom"
// Added formatting grows as you type, like bold in any editor. An original tag
// doesn't, because it may be a link or a note that ends exactly where it ends.
export const ADDED_MARK = "bookAddedMark"

export interface RichMark {
  type: typeof TAG_MARK | typeof ADDED_MARK
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

// Added formatting sits inside the original's, whatever the order it was added.
const rank = (id: string) => (id[1] === "0" ? 1e6 : 0) + Number(id.slice(1))
const byRank = (a: RichMark, b: RichMark) => rank(a.attrs.id) - rank(b.attrs.id)

export function toDoc(text: string, tags: InlineTag[]): RichDoc {
  const kinds = tagMap(tags)
  const kind = (id: string) => kinds.get(id)?.type ?? "span"
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
        const type = addedTag(node.id) ? ADDED_MARK : TAG_MARK
        walk(node.children, [...marks, { type, attrs }])
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

export type WordedTag = InlineTag & { words?: string }

// Each tag with the words it covers in the source, so a tag whose type says
// little can still be told apart and put in the right place.
function withWords(source: string, tags: InlineTag[]): WordedTag[] {
  const words = new Map<string, string>()
  const text = (nodes: InlineNode[]): string =>
    nodes
      .map((node) => {
        if ("text" in node) return node.text
        const inner = text(node.children)
        words.set(node.id, inner.trim())
        return inner
      })
      .join("")
  text(parseInline(source))
  return tags.map((tag) => ({ ...tag, words: words.get(tag.id) || undefined }))
}

const isSpan = (id: string, tags: InlineTag[]) =>
  tags.find((t) => t.id === id)?.type === "span"

// Styling tags that cover the whole source. They have only one possible place,
// so nobody should have to place them. Spaces around them don't count.
function wholeLineSpans(source: string, tags: InlineTag[]) {
  const ids: string[] = []
  const solid = (nodes: InlineNode[]) =>
    nodes.filter((n) => !("text" in n) || n.text.trim())
  let nodes = solid(parseInline(source))
  while (nodes.length === 1) {
    const only = nodes[0]!
    if ("text" in only || !only.children.length || !isSpan(only.id, tags)) break
    ids.push(only.id)
    nodes = solid(only.children)
  }
  return ids
}

export function carryWholeLine(
  source: string,
  target: string,
  tags: InlineTag[]
) {
  if (!stripTags(target).trim()) return target
  const missing = new Set(checkTags(source, target)?.missing ?? [])
  const ids = wholeLineSpans(source, tags).filter((id) => missing.has(id))
  const open = ids.map((id) => `<${id}>`).join("")
  const close = [...ids]
    .reverse()
    .map((id) => `</${id}>`)
    .join("")
  return open + target + close
}

// The source's tags the translation hasn't placed yet.
export function tagsToPlace(source: string, target: string, tags: InlineTag[]) {
  const missing = new Set(checkTags(source, target)?.missing ?? [])
  for (const id of wholeLineSpans(source, tags)) missing.delete(id)
  return withWords(
    source,
    tags.filter((t) => missing.has(t.id))
  )
}

export const tagsInSource = (source: string, tags: InlineTag[]) => {
  const missing = new Set(checkTags(source, "")?.missing ?? [])
  return withWords(
    source,
    tags.filter((t) => missing.has(t.id))
  )
}
