import type { Item } from "./model"

// Parsers for polled sources, kept free of network code so they can be tested.
const MAX_ITEMS = 25
const SUMMARY = 600

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

export function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? whole
    const hex = code[1]?.toLowerCase() === "x"
    const n = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10)
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""
  })
}

export const stripHtml = (html: string) =>
  decode(
    html
      .replace(
        /<(script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi,
        " "
      )
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim()

const cdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")

function tag(block: string, ...names: string[]) {
  for (const name of names) {
    const m = block.match(
      new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")
    )
    if (m) return cdata(m[1]!).trim()
  }
  return ""
}

function atomLink(block: string) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]!)
  const best =
    links.find((l) => /rel=["']alternate["']/i.test(l)) ??
    links.find((l) => !/\brel=/i.test(l))
  return best?.match(/href=["']([^"']+)["']/i)?.[1] ?? ""
}

const https = (url: string) => {
  const clean = decode(url).trim()
  return clean.startsWith("https://") && clean.length <= 2000 ? clean : null
}

// RSS 2.0 and Atom. Items without an https link or a title are dropped: a post
// must always be able to point at where it came from.
export function parseFeed(xml: string, source: string, now: number): Item[] {
  const blocks = [
    ...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi),
  ]
  return blocks.slice(0, MAX_ITEMS).flatMap((m) => {
    const block = m[2]!
    const url = https(tag(block, "link") || atomLink(block))
    const title = stripHtml(tag(block, "title")).slice(0, 500)
    if (!url || !title) return []
    const date = Date.parse(
      tag(block, "pubDate", "published", "updated", "dc:date")
    )
    return [
      {
        key: (tag(block, "guid", "id") || url).slice(0, 300),
        source,
        title,
        summary: stripHtml(
          tag(block, "description", "summary", "content", "content:encoded")
        ).slice(0, SUMMARY),
        url,
        at: Number.isNaN(date) ? now : date,
      },
    ]
  })
}

export interface GdeltArticle {
  url?: string
  title?: string
  domain?: string
  seendate?: string
}

export function parseGdelt(body: { articles?: GdeltArticle[] }, now: number) {
  return (body.articles ?? []).slice(0, MAX_ITEMS).flatMap((a): Item[] => {
    const url = a.url && https(a.url)
    if (!url || !a.title) return []
    const d = a.seendate?.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/)
    const at = d
      ? Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +d[4]!, +d[5]!, +d[6]!)
      : now
    return [
      {
        key: url.slice(0, 300),
        source: a.domain?.slice(0, 120) ?? "news",
        title: a.title.slice(0, 500),
        summary: "",
        url,
        at,
      },
    ]
  })
}

export interface HackerNewsHit {
  objectID?: string
  title?: string
  url?: string
  points?: number
  num_comments?: number
  created_at_i?: number
}

export function parseHackerNews(body: { hits?: HackerNewsHit[] }, now: number) {
  return (body.hits ?? []).slice(0, MAX_ITEMS).flatMap((h): Item[] => {
    if (!h.objectID || !h.title) return []
    const url =
      (h.url && https(h.url)) ??
      `https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`
    return [
      {
        key: `hn:${h.objectID}`,
        source: "Hacker News",
        title: h.title.slice(0, 500),
        summary: `${h.points ?? 0} points and ${h.num_comments ?? 0} comments on Hacker News.`,
        url,
        at: h.created_at_i ? h.created_at_i * 1000 : now,
      },
    ]
  })
}

// Addresses a server must never fetch for a stranger's URL.
export function isPrivateAddress(ip: string) {
  const v = ip.toLowerCase().replace(/^::ffff:/, "")
  if (v.includes(":"))
    return (
      v === "::" ||
      v === "::1" ||
      /^f[cd]/.test(v) ||
      /^fe[89ab]/.test(v) ||
      /^ff/.test(v) ||
      v.startsWith("2001:db8") ||
      // IPv4 written as hex after the mapping prefix.
      ip.toLowerCase().startsWith("::ffff:")
    )
  const parts = v.split(".").map(Number)
  if (parts.length !== 4 || parts.some((p) => !(p >= 0 && p <= 255)))
    return true
  const [a, b] = parts as [number, number, number, number]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}
