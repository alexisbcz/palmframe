import type { LookupAddress } from "node:dns"
import { lookup } from "node:dns/promises"
import type { IncomingMessage } from "node:http"
import { request } from "node:https"
import { createGunzip } from "node:zlib"

import { searchVideos } from "@/lib/studio/scrapecreators.server"

import { DATASETS, isSocialProfile, parseDataset, selectable } from "./datasets"
import {
  decodeBody,
  entryCount,
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
const FEED_TYPES = /xml|rss|atom|text\/(?:plain|html)/i
const PAGE_TYPES = /html|xml|text\/plain/i
const JSON_TYPES = /json/i

export class FeedBusy extends Error {}
// The page hasn't changed since the validators this was asked with.
export class NotModified extends Error {}
// It answered with entries, and none of them could be used.
export class FeedUnreadable extends Error {}
// It isn't one a machine may read, whatever its stored config says.
export class FeedRefused extends Error {}

interface FetchOptions {
  signal?: AbortSignal
  // Keep the start of a page over the size limit instead of failing.
  truncate?: boolean
  // Content types worth reading. A missing header gets the benefit of the doubt.
  accept?: RegExp
  etag?: string
  lastModified?: string
  // The only hosts this may reach, redirects included.
  hosts?: readonly string[]
}

async function publicAddresses(url: URL) {
  if (url.protocol !== "https:") throw new Error("Only https is fetched.")
  if (url.port && url.port !== "443") throw new Error("Unusual port.")
  if (url.username || url.password) throw new Error("No credentials in URLs.")
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
    throw new Error("That address isn't public.")
  return addresses
}

type LookupCallback = (
  error: Error | null,
  address: string | LookupAddress[],
  family?: number
) => void

// Answers the connection's own DNS question with the addresses already checked.
// Otherwise a host could pass the check and then resolve somewhere private.
export const pinnedLookup =
  (addresses: LookupAddress[]) =>
  (_: string, options: { all?: boolean }, callback: LookupCallback) => {
    if (options.all) callback(null, addresses)
    else callback(null, addresses[0]!.address, addresses[0]!.family)
  }

const open = (
  url: URL,
  addresses: LookupAddress[],
  headers: Record<string, string>,
  signal: AbortSignal,
  method = "GET",
  body?: string
) =>
  new Promise<IncomingMessage>((resolve, reject) => {
    request(
      url,
      { method, headers, signal, lookup: pinnedLookup(addresses) as never },
      resolve
    )
      .on("error", reject)
      .end(body)
  })

function unpacked(res: IncomingMessage) {
  const encoding = res.headers["content-encoding"]
  if (!encoding || encoding === "identity") return res
  if (encoding !== "gzip") throw new Error("Unknown content encoding.")
  const gunzip = createGunzip()
  res.on("error", (e) => gunzip.destroy(e))
  return res.pipe(gunzip)
}

// Counts bytes as they come, after decompression, so a small gzip can't unpack
// into something huge. The declared length is only a shortcut.
async function readBody(res: IncomingMessage, truncate: boolean) {
  if (!truncate && Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
    res.destroy()
    throw new Error("Too large.")
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of unpacked(res) as AsyncIterable<Buffer>) {
    const room = MAX_BYTES - size
    size += chunk.length
    if (size <= MAX_BYTES) {
      chunks.push(chunk)
      continue
    }
    res.destroy()
    if (!truncate) throw new Error("Too large.")
    chunks.push(chunk.subarray(0, room))
    break
  }
  return Buffer.concat(chunks)
}

// For URLs from owners and from feeds. Every hop is checked, because a public
// page can redirect to an internal one.
export async function fetchPublic(raw: string, options: FetchOptions = {}) {
  const {
    signal,
    truncate = false,
    accept,
    etag,
    lastModified,
    hosts,
  } = options
  let url = new URL(raw)
  const abort = AbortSignal.any([
    AbortSignal.timeout(TIMEOUT_MS),
    ...(signal ? [signal] : []),
  ])
  const headers = {
    "user-agent": "PalmframeMachines/1.0 (+https://www.palmframe.com)",
    "accept-encoding": "gzip",
    ...(etag && { "if-none-match": etag }),
    ...(lastModified && { "if-modified-since": lastModified }),
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hosts && !hosts.includes(url.hostname))
      throw new Error(`${url.hostname} isn't an allowed host.`)
    const res = await open(url, await publicAddresses(url), headers, abort)
    const status = res.statusCode ?? 0
    if (status === 304) {
      res.destroy()
      throw new NotModified(url.hostname)
    }
    if (status >= 300 && status < 400) {
      const next = res.headers.location
      res.destroy()
      if (!next) throw new Error("Redirect without a target.")
      url = new URL(next, url)
      continue
    }
    if (status < 200 || status >= 300) {
      res.destroy()
      if (status === 429 || status >= 500)
        throw new FeedBusy(`${url.hostname} ${status}`)
      throw new Error(`${url.hostname} ${status}`)
    }
    const type = res.headers["content-type"] ?? null
    if (accept && type && !accept.test(type)) {
      res.destroy()
      throw new Error(`${url.hostname} sent ${type.slice(0, 60)}.`)
    }
    return decodeBody(await readBody(res, truncate), type)
  }
  throw new Error("Too many redirects.")
}

// One write to a host on a closed list. Same address checks as `fetchPublic`, but
// a redirect is an answer and never followed: the URL can hold a credential, and
// nothing should repeat it to wherever a response points.
export async function sendPublic(
  raw: string,
  options: {
    method: "POST" | "DELETE"
    hosts: readonly string[]
    body?: string
    signal?: AbortSignal
  }
) {
  const { method, hosts, body, signal } = options
  const url = new URL(raw)
  if (!hosts.includes(url.hostname)) throw new Error("Not an allowed host.")
  const res = await open(
    url,
    await publicAddresses(url),
    {
      "user-agent": "PalmframeMachines/1.0 (+https://www.palmframe.com)",
      ...(body && {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
      }),
    },
    AbortSignal.any([
      AbortSignal.timeout(TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]),
    method,
    body
  )
  const header = (name: string) => {
    const value = res.headers[name]
    return Array.isArray(value) ? value[0] : value
  }
  return {
    status: res.statusCode ?? 0,
    retryAfter: header("retry-after") ?? null,
    global: header("x-ratelimit-global") === "true",
    text: (await readBody(res, true)).toString("utf8"),
  }
}

export async function readArticle(url: string, signal?: AbortSignal) {
  const page = await fetchPublic(url, {
    signal,
    truncate: true,
    accept: PAGE_TYPES,
  })
  return stripHtml(page).slice(0, MAX_ARTICLE)
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
    { signal }
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
    case "rss": {
      if (isSocialProfile(feed.url)) throw new FeedRefused(feed.url)
      const xml = await fetchPublic(feed.url, {
        signal,
        truncate: true,
        accept: FEED_TYPES,
      })
      const items = parseFeed(xml, new URL(feed.url).hostname, now)
      if (!items.length && entryCount(xml)) throw new FeedUnreadable(feed.url)
      return items
    }
    case "news":
      return gdelt(feed.query, now, signal)
    case "dataset": {
      const dataset = DATASETS[feed.preset]
      if (!selectable(dataset)) throw new FeedRefused(feed.preset)
      const text = await fetchPublic(dataset.url, {
        signal,
        accept: JSON_TYPES,
        hosts: dataset.hosts,
      })
      const items = parseDataset(feed.preset, JSON.parse(text), now)
      if (!items) throw new FeedUnreadable(feed.preset)
      return items
    }
    // These need the database, so the runner reads them itself.
    case "rival":
      return []
    case "hackernews": {
      const text = await fetchPublic(
        "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25&attributesToRetrieve=title,url,objectID,points,num_comments,created_at_i&attributesToHighlight=",
        { signal }
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
