// What an agent can read: public posts on X, Reddit and TikTok, Google results
// (all through ScrapeCreators, https://scrapecreators.com) and any web page.
// Each returns compact text for the model, plus the links it may cite.
import { parseDocument } from "htmlparser2"
import { textContent } from "domutils"

const API = "https://api.scrapecreators.com"

export interface Found {
  text: string
  links: { title: string; url: string }[]
}

export const researchAvailable = () =>
  !!process.env.SCRAPECREATORS_API_KEY?.trim()

async function sc<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim()
  if (!key)
    throw new Error(
      "Research isn't set up on this server (SCRAPECREATORS_API_KEY)."
    )
  const url = `${API}${path}?${new URLSearchParams(params)}`
  let last = 0
  // ScrapeCreators answers 503 now and then; a second try usually works.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(25_000),
    })
    if (res.ok) return (await res.json()) as T
    last = res.status
    if (res.status !== 503 && res.status !== 502) break
  }
  throw new Error(`Search failed (${last}).`)
}

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

const compact = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1)}M`
    : n >= 1e3
      ? `${(n / 1e3).toFixed(1)}k`
      : `${n}`

type Tweet = {
  rest_id?: string
  legacy?: {
    full_text?: string
    favorite_count?: number
    retweet_count?: number
    reply_count?: number
    created_at?: string
  }
  core?: { user_results?: { result?: { core?: { screen_name?: string } } } }
  views?: { count?: string }
}

export async function searchX(query: string): Promise<Found> {
  const out = await sc<{ posts?: Tweet[] }>("/v1/twitter/search/posts", {
    query,
  })
  const posts = (out.posts ?? [])
    .filter((p) => p.legacy?.full_text)
    .slice(0, 12)
  const links: Found["links"] = []
  const lines = posts.map((p) => {
    const who = p.core?.user_results?.result?.core?.screen_name ?? "unknown"
    const l = p.legacy!
    const url = `https://x.com/${who}/status/${p.rest_id}`
    links.push({ title: `@${who} on X`, url })
    const age = l.created_at
      ? new Date(l.created_at).toISOString().slice(0, 10)
      : ""
    return `@${who} · ${age} · ${compact(l.favorite_count ?? 0)} likes · ${compact(Number(p.views?.count ?? 0))} views\n${clip(l.full_text!.replace(/\s+/g, " "), 400)}\n${url}`
  })
  return {
    text: lines.length
      ? lines.join("\n\n")
      : "No posts found. Try fewer or broader words.",
    links,
  }
}

type RedditPost = {
  title?: string
  subreddit?: string
  score?: number
  num_comments?: number
  url?: string
  permalink?: string
  selftext?: string | null
  created_utc?: number
}

export async function searchReddit(
  query: string,
  timeframe: "day" | "week" | "month" = "week"
): Promise<Found> {
  const out = await sc<{ posts?: RedditPost[] }>("/v1/reddit/search", {
    query,
    sort: "top",
    timeframe,
    trim: "true",
  })
  const posts = (out.posts ?? []).slice(0, 12)
  const links: Found["links"] = []
  const lines = posts.map((p) => {
    const url = p.permalink
      ? `https://www.reddit.com${p.permalink}`
      : (p.url ?? "")
    links.push({ title: `r/${p.subreddit}: ${clip(p.title ?? "", 80)}`, url })
    const body = p.selftext
      ? `\n${clip(p.selftext.replace(/\s+/g, " "), 300)}`
      : ""
    return `r/${p.subreddit} · ${compact(p.score ?? 0)} upvotes · ${compact(p.num_comments ?? 0)} comments\n${p.title}${body}\n${url}`
  })
  return {
    text: lines.length
      ? lines.join("\n\n")
      : "Nothing on Reddit for that. Try broader words.",
    links,
  }
}

export async function searchWeb(query: string): Promise<Found> {
  const out = await sc<{
    results?: { title: string; url: string; description?: string }[]
  }>("/v1/google/search", { query })
  const results = (out.results ?? []).slice(0, 10)
  return {
    text: results.length
      ? results
          .map((r) => `${r.title}\n${clip(r.description ?? "", 280)}\n${r.url}`)
          .join("\n\n")
      : "No results.",
    links: results.map((r) => ({ title: r.title, url: r.url })),
  }
}

type TikTok = {
  aweme_info?: {
    desc?: string
    statistics?: { play_count?: number; digg_count?: number }
    author?: { unique_id?: string }
    aweme_id?: string
  }
}

export async function searchTikTok(query: string): Promise<Found> {
  const out = await sc<{ search_item_list?: TikTok[] }>(
    "/v1/tiktok/search/keyword",
    {
      query,
      sort_by: "relevance",
      date_posted: "this-week",
    }
  )
  const items = (out.search_item_list ?? [])
    .map((i) => i.aweme_info)
    .filter(Boolean)
    .slice(0, 10)
  const links: Found["links"] = []
  const lines = items.map((v) => {
    const url = `https://www.tiktok.com/@${v!.author?.unique_id}/video/${v!.aweme_id}`
    links.push({ title: `@${v!.author?.unique_id} on TikTok`, url })
    return `@${v!.author?.unique_id} · ${compact(v!.statistics?.play_count ?? 0)} plays · ${compact(v!.statistics?.digg_count ?? 0)} likes\n${clip(v!.desc ?? "", 300)}\n${url}`
  })
  return { text: lines.length ? lines.join("\n\n") : "No videos found.", links }
}

const BLOCKED = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/i

export async function readPage(raw: string): Promise<Found> {
  const url = new URL(raw)
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only web links can be read.")
  if (BLOCKED.test(url.hostname)) throw new Error("That address isn't public.")
  const res = await fetch(url, {
    headers: {
      "user-agent": "PalmframeAutopilot/1.0 (+https://www.palmframe.com)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`The page answered ${res.status}.`)
  const type = res.headers.get("content-type") ?? ""
  const body = (await res.text()).slice(0, 1_500_000)
  let title = url.hostname
  let text = body
  if (type.includes("html")) {
    const doc = parseDocument(body)
    const drop = new Set([
      "script",
      "style",
      "noscript",
      "svg",
      "nav",
      "footer",
      "header",
      "form",
    ])
    const walk = (nodes: typeof doc.children): string =>
      nodes
        .map((n) => {
          if ("name" in n && drop.has(n.name)) return ""
          if ("name" in n && n.name === "title") {
            title = textContent(n).trim() || title
            return ""
          }
          if ("children" in n) {
            const inner = walk(n.children as typeof doc.children)
            return "name" in n &&
              /^(p|h[1-6]|li|br|div|tr|article|section)$/.test(n.name)
              ? `${inner}\n`
              : inner
          }
          return "data" in n ? n.data : ""
        })
        .join("")
    text = walk(doc.children)
  }
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
  return {
    text: `${title}\n\n${clip(text, 12_000)}`,
    links: [{ title, url: url.toString() }],
  }
}
