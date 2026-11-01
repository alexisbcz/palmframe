import type { Block, InlineTag } from "./model"

// A segment's text keeps inline formatting as tags a model can carry through:
// `<g1>word</g1>` wraps text and `<x2/>` stands alone. Literal angle brackets
// and ampersands are escaped, so these are the only tags that can occur.
const TOKEN = /<(\/?)([gx]\d+)(\/?)>/g

export const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const unescapeText = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

export const stripTags = (s: string) => unescapeText(s.replace(TOKEN, ""))

export type InlineNode =
  { text: string } | { id: string; children: InlineNode[] }

// The tags as a tree. Never throws: tags that don't balance become plain text
// boundaries, because a model's reply is not to be trusted with structure.
export function parseInline(s: string): InlineNode[] {
  const root: InlineNode[] = []
  const stack: { id: string; children: InlineNode[] }[] = []
  const add = (node: InlineNode) => (stack.at(-1)?.children ?? root).push(node)
  let at = 0
  for (const m of s.matchAll(TOKEN)) {
    if (m.index > at) add({ text: unescapeText(s.slice(at, m.index)) })
    at = m.index + m[0].length
    const id = m[2]!
    if (m[3] || id.startsWith("x")) add({ id, children: [] })
    else if (m[1]) {
      const open = stack.map((t) => t.id).lastIndexOf(id)
      if (open >= 0) stack.length = open
    } else {
      const node = { id, children: [] }
      add(node)
      stack.push(node)
    }
  }
  if (at < s.length) add({ text: unescapeText(s.slice(at)) })
  return root
}

// Formatting a person adds that the original line doesn't have. No line needs
// to declare these, so they survive memory and every export. Parsers count from
// 1 without a leading zero and can't produce these ids.
export const ADDED_TAGS: InlineTag[] = [
  { id: "g01", type: "b" },
  { id: "g02", type: "i" },
  { id: "g03", type: "u" },
  { id: "g04", type: "s" },
  { id: "g05", type: "sup" },
  { id: "g06", type: "sub" },
]

export const addedTag = (id: string) => ADDED_TAGS.find((t) => t.id === id)

export interface TagProblem {
  missing: string[]
  extra: string[]
  unbalanced: boolean
}

function tagCounts(s: string) {
  const open = new Set<string>()
  let balanced = true
  const stack: string[] = []
  for (const m of s.matchAll(TOKEN)) {
    const id = m[2]!
    if (m[3] || id.startsWith("x")) open.add(id)
    else if (m[1]) {
      if (stack.pop() !== id) balanced = false
    } else {
      open.add(id)
      stack.push(id)
    }
  }
  // Added on purpose, so never something a translation lost or invented.
  for (const { id } of ADDED_TAGS) open.delete(id)
  return { open, balanced: balanced && !stack.length }
}

// A translation has to carry the same tags as its source, nested properly.
export function checkTags(source: string, target: string): TagProblem | null {
  const a = tagCounts(source)
  const b = tagCounts(target)
  const missing = [...a.open].filter((k) => !b.open.has(k))
  const extra = [...b.open].filter((k) => !a.open.has(k))
  if (!missing.length && !extra.length && b.balanced) return null
  return { missing, extra, unbalanced: !b.balanced }
}

// The fallback when a reply loses its tags twice: keep the words, flag it.
export const stripAllTags = (s: string) => s.replace(TOKEN, "")

const escapeLoose = (s: string) =>
  s
    .replace(/&(?!(?:lt|gt|amp);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

// Literal `<` a model wrote stays text instead of turning into a tag.
export function escapeStrayAngles(s: string) {
  let out = ""
  let at = 0
  for (const m of s.matchAll(TOKEN)) {
    out += escapeLoose(s.slice(at, m.index)) + m[0]
    at = m.index + m[0].length
  }
  return out + escapeLoose(s.slice(at))
}

// How each tag reads on screen, in the editor and everywhere it's only shown.
export const TAG_STYLES: Partial<Record<InlineTag["type"], string>> = {
  b: "font-semibold",
  i: "italic",
  u: "underline underline-offset-2",
  s: "line-through",
  code: "font-mono text-[0.9em]",
  sup: "align-super text-[0.7em]",
  noteref: "align-super text-[0.7em] text-brand",
  sub: "align-sub text-[0.7em]",
  a: "underline decoration-foreground/30 underline-offset-2",
}

export const tagMap = (tags: InlineTag[]) =>
  new Map([...ADDED_TAGS, ...tags].map((t) => [t.id, t]))

// A builder the parsers share: text in, tagged text and its tag list out.
export class InlineWriter {
  text = ""
  tags: InlineTag[] = []
  private next = 1

  plain(s: string) {
    this.text += escapeText(s)
  }

  open(type: InlineTag["type"], href?: string) {
    const id = `g${this.next++}`
    this.tags.push({ id, type, ...(href && { href }) })
    this.text += `<${id}>`
    return id
  }

  close(id: string) {
    this.text += `</${id}>`
  }

  empty(type: InlineTag["type"], href?: string) {
    const id = `x${this.next++}`
    this.tags.push({ id, type, ...(href && { href }) })
    this.text += `<${id}/>`
  }
}

export const plainBlock = (
  kind: Block["kind"],
  text: string,
  extra: Partial<Block> = {}
): Block => ({ kind, text: escapeText(text), tags: [], ...extra })
