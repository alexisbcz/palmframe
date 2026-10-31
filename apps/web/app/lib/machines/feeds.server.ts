import { lookup } from "node:dns/promises"

import { searchVideos } from "@/lib/studio/scrapecreators.server"

import {
  isPrivateAddress,
  parseFeed,
  parseGdelt,
  parseHackerNews,
  stripHtml,
} from "./feeds"
import type { Feed, Item } from "./model"

const TIMEOUT_MS = 10_000
const MAX_BYTES = 2_000_000
const MAX_REDIRECTS = 3
const MAX_ARTICLE = 6_000
// GDELT allows one request every five seconds, for this whole server.
const GDELT_GAP_MS = 5_500

export class FeedBusy extends Error {}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new Error("Only https is fetched.")
  if (url.port && url.port !== "443") throw new Error("Unusual port.")
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
    throw new Error("That address isn't public.")
}

// For URLs from owners and from feeds. Every hop is checked, because a public
// page can redirect to an internal one.
export async function fetchPublic(raw: string, signal?: AbortSignal) {
  let url = new URL(raw)
  const abort = AbortSignal.any([
    AbortSignal.timeout(TIMEOUT_MS),
    ...(signal ? [signal] : []),
  ])
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url)
    const res = await fetch(url, {
      redirect: "manual",
      signal: abort,
      headers: {
        "user-agent": "PalmframeMachines/1.0 (+https://www.palmframe.com)",
      },
    })
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location")
      await res.body?.cancel()
      if (!next) throw new Error("Redirect without a target.")
      url = new URL(next, url)
      continue
    }
    if (res.status === 429 || res.status >= 500)
      throw new FeedBusy(`${url.hostname} ${res.status}`)
    if (!res.ok) throw new Error(`${url.hostname} ${res.status}`)
    const declared = Number(res.headers.get("content-length") ?? 0)
    if (declared > MAX_BYTES) throw new Error("Too large.")
    const reader = res.body?.getReader()
    if (!reader) return ""
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_BYTES) {
        await reader.cancel()
        throw new Error("Too large.")
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString("utf8")
  }
  throw new Error("Too many redirects.")
}

export async function readArticle(url: string, signal?: AbortSignal) {
  return stripHtml(await fetchPublic(url, signal)).slice(0, MAX_ARTICLE)
}

let gdeltNext = 0
async function gdelt(query: string, now: number, signal?: AbortSignal) {
  const wait = gdeltNext - Date.now()
  gdeltNext = Math.max(gdeltNext, Date.now()) + GDELT_GAP_MS
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  const params = new URLSearchParams({
    query: /\s/.test(query) ? `"${query}"` : query,
    mode: "artlist",
    format: "json",
    maxrecords: "25",
    sort: "datedesc",
    timespan: "24h",
  })
  const text = await fetchPublic(
    `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
    signal
  )
  // Rate limits arrive as a sentence with a 200 status.
  if (!text.startsWith("{")) throw new FeedBusy("GDELT is rate limiting.")
  return parseGdelt(JSON.parse(text), now)
}

export async function readFeed(
  feed: Feed,
  now: number,
  signal?: AbortSignal
): Promise<Item[]> {
  switch (feed.kind) {
    case "rss":
      return parseFeed(
        await fetchPublic(feed.url, signal),
        new URL(feed.url).hostname,
        now
      )
    case "news":
      return gdelt(feed.query, now, signal)
    case "hackernews": {
      const text = await fetchPublic(
        "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25&attributesToRetrieve=title,url,objectID,points,num_comments,created_at_i&attributesToHighlight=",
        signal
      )
      return parseHackerNews(JSON.parse(text), now)
    }
    case "tiktok":
    case "youtube": {
      const videos = await searchVideos(feed.kind, feed.query, signal)
      return videos.slice(0, 15).flatMap((v): Item[] => {
        if (!v.url.startsWith("https://")) return []
        return [
          {
            key: `${feed.kind}:${v.id}`.slice(0, 300),
            source: feed.kind === "tiktok" ? "TikTok" : "YouTube",
            title: (v.title || v.url).slice(0, 500),
            summary: `${v.views} views, ${v.likes} likes.`,
            url: v.url,
            at: v.postedAt ? Date.parse(v.postedAt) || now : now,
          },
        ]
      })
    }
  }
}
