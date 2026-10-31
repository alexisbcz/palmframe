import { decodeHTMLStrict } from "entities"

import type { Item } from "./model"

// Parsers for polled sources, kept free of network code so they can be tested.
export const MAX_ITEMS = 25
const SUMMARY = 600
const TITLE_FROM_TEXT = 120

// Strict, so a bare "&copy=1" in a URL's query string stays as it was written.
export const decode = (s: string) => decodeHTMLStrict(s)

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

// Sites still write http:// in feeds they serve over https. A link that can't
// be upgraded is dropped, and the column holding it refuses anything else.
export const https = (url: string) => {
  const clean = decode(url)
    .trim()
    .replace(/^http:\/\//i, "https://")
  return /^https:\/\//i.test(clean) && clean.length <= 2000 ? clean : null
}

// Feeds often escape their HTML: `&lt;p&gt;` has to become a tag before it can
// be stripped, or the tags turn up as text.
const fieldText = (s: string) => stripHtml(decode(s))

const firstLine = (s: string) => {
  if (s.length <= TITLE_FROM_TEXT) return s
  const cut = s.slice(0, TITLE_FROM_TEXT)
  return `${cut.slice(0, cut.lastIndexOf(" ") + 1 || undefined).trimEnd()}…`
}

const entries = (xml: string) => [
  ...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi),
]

// Entries a feed has, before anything is dropped.
export const entryCount = (xml: string) => entries(xml).length

// RSS 2.0 and Atom. Items without a link are dropped: a post must always be
// able to point at where it came from. Social feeds have no titles, so their
// posts stand in for one.
export function parseFeed(xml: string, source: string, now: number): Item[] {
  return entries(xml)
    .slice(0, MAX_ITEMS)
    .flatMap((m) => {
      const block = m[2]!
      const url = https(tag(block, "link") || atomLink(block))
      const summary = fieldText(
        tag(
          block,
          "description",
          "summary",
          "content",
          "content:encoded",
          "media:description"
        )
      ).slice(0, SUMMARY)
      const title =
        fieldText(tag(block, "title")).slice(0, 500) || firstLine(summary)
      if (!url || !title) return []
      const date = Date.parse(
        tag(block, "pubDate", "published", "updated", "dc:date")
      )
      return [
        {
          key: (tag(block, "guid", "id") || url).slice(0, 300),
          source,
          title,
          summary,
          url,
          at: Number.isNaN(date) ? now : date,
        },
      ]
    })
}

// The bytes as the server said they're encoded, or as the document itself says
// when the header doesn't. A label nobody knows reads as UTF-8.
export function decodeBody(bytes: Uint8Array, contentType: string | null) {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 1024))
  const label =
    contentType?.match(/charset=["']?([\w.:-]+)/i)?.[1] ??
    head.match(/^\s*<\?xml[^>]*encoding=["']([\w.:-]+)["']/i)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w.:-]+)/i)?.[1] ??
    "utf-8"
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder("utf-8").decode(bytes)
  }
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
      // Unspecified, loopback, and IPv4 written inside an IPv6 address.
      ip.startsWith("::") ||
      /^f[cd]/.test(v) ||
      /^fe[89a-f]/.test(v) ||
      /^ff/.test(v) ||
      v.startsWith("2001:db8") ||
      // These carry an IPv4 address too, which can be a private one.
      v.startsWith("64:ff9b:") ||
      v.startsWith("2002:")
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
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0)
  )
}
