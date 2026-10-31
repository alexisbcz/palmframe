// Just enough Markdown for an article. It turns into React elements, never an
// HTML string, because the text comes from a model that read strangers' pages.
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em"; text: string }
  | { kind: "link"; text: string; href: string }

export type Block =
  | { kind: "heading"; level: 2 | 3; text: Inline[] }
  | { kind: "paragraph"; text: Inline[] }
  | { kind: "quote"; text: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }

export const safeHref = (url: string) => {
  try {
    return new URL(url).protocol === "https:" ? url : null
  } catch {
    return null
  }
}

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\(([^)\s]+)\)/g

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let at = 0
  for (const m of s.matchAll(INLINE)) {
    if (m.index > at) out.push({ kind: "text", text: s.slice(at, m.index) })
    if (m[1]) out.push({ kind: "strong", text: m[1] })
    else if (m[2]) out.push({ kind: "em", text: m[2] })
    else {
      const href = safeHref(m[4]!)
      out.push(
        href
          ? { kind: "link", text: m[3]!, href }
          : { kind: "text", text: m[3]! }
      )
    }
    at = m.index + m[0].length
  }
  if (at < s.length) out.push({ kind: "text", text: s.slice(at) })
  return out
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of md.split(/\n\s*\n/)) {
    const lines = chunk.trim().split("\n")
    const first = lines[0] ?? ""
    if (!first) continue
    const heading = first.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length > 2 ? 3 : 2,
        text: parseInline(heading[2]!),
      })
      if (lines.length > 1)
        blocks.push({
          kind: "paragraph",
          text: parseInline(lines.slice(1).join(" ")),
        })
    } else if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
      blocks.push({
        kind: "list",
        ordered: false,
        items: lines.map((l) => parseInline(l.replace(/^\s*[-*]\s+/, ""))),
      })
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
      blocks.push({
        kind: "list",
        ordered: true,
        items: lines.map((l) => parseInline(l.replace(/^\s*\d+[.)]\s+/, ""))),
      })
    else if (lines.every((l) => l.startsWith(">")))
      blocks.push({
        kind: "quote",
        text: parseInline(lines.map((l) => l.replace(/^>\s?/, "")).join(" ")),
      })
    else blocks.push({ kind: "paragraph", text: parseInline(lines.join(" ")) })
  }
  return blocks
}
