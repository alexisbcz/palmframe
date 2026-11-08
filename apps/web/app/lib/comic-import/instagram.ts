// Instagram as a source of style pages: an account's recent posts, or a few
// post links. Only what's shared by the server and the browser lives here.

// One picture of a post. Both addresses point at our proxy, since Instagram's
// CDN won't hand its images to a canvas on another site.
export interface InstagramImage {
  id: string
  label: string
  thumb: string
  full: string
}

export interface InstagramListing {
  // The account the images came from, without the "@".
  author: string
  images: InstagramImage[]
  // Pass back as `after` for the next page of an account's posts.
  next: string | null
}

export type InstagramSource =
  { kind: "account"; handle: string } | { kind: "posts"; urls: string[] }

export const MAX_INSTAGRAM_POSTS = 8
export const INSTAGRAM_IMAGE_PATH = "/api/styles/instagram"

const HANDLE = /^[a-z0-9._]{1,30}$/i
const POST_PATH =
  /^\/(?:[a-z0-9._]+\/)?(p|reel|reels|tv)\/([a-z0-9_-]{5,})\/?$/i
// Instagram paths that aren't accounts.
const RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "explore",
  "stories",
  "accounts",
  "direct",
])

const instagramUrl = (raw: string) => {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "")
    return host === "instagram.com" || host === "instagr.am" ? u : null
  } catch {
    return null
  }
}

// "@handle", "handle", a profile link, or one or more post links separated by
// spaces, commas or lines. Anything else is null.
export function parseInstagramSource(input: string): InstagramSource | null {
  const parts = input
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
  if (!parts.length) return null

  if (parts.length === 1) {
    const only = parts[0]!.replace(/^@/, "")
    if (HANDLE.test(only) && !only.includes("instagram.com"))
      return RESERVED.has(only.toLowerCase())
        ? null
        : { kind: "account", handle: only.toLowerCase() }
    const u = instagramUrl(parts[0]!)
    const segments = u?.pathname.split("/").filter(Boolean) ?? []
    if (
      u &&
      segments.length === 1 &&
      HANDLE.test(segments[0]!) &&
      !RESERVED.has(segments[0]!.toLowerCase())
    )
      return { kind: "account", handle: segments[0]!.toLowerCase() }
  }

  const urls: string[] = []
  for (const part of parts) {
    const u = instagramUrl(part)
    const m = u?.pathname.match(POST_PATH)
    if (!m) return null
    const kind = m[1]!.toLowerCase() === "p" ? "p" : "reel"
    const url = `https://www.instagram.com/${kind}/${m[2]}/`
    if (!urls.includes(url)) urls.push(url)
  }
  return urls.length
    ? { kind: "posts", urls: urls.slice(0, MAX_INSTAGRAM_POSTS) }
    : null
}

// Only Instagram's own image hosts go through the proxy.
export function isInstagramImageUrl(raw: string) {
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase()
    return (
      u.protocol === "https:" &&
      !u.port &&
      !u.username &&
      (host.endsWith(".cdninstagram.com") || host.endsWith(".fbcdn.net"))
    )
  } catch {
    return false
  }
}

export const proxied = (url: string) =>
  `${INSTAGRAM_IMAGE_PATH}?image=${encodeURIComponent(url)}`

// ScrapeCreators' answers, down to images. Every field may be missing: these
// mirror pages that Instagram changes.
type Json = Record<string, any>

const THUMB_SIDE = 480

interface Candidate {
  url: string
  side: number
}

const candidates = (list: unknown, url: string, width: string) =>
  (Array.isArray(list) ? list : []).flatMap((c: Json): Candidate[] => {
    const u = c?.[url]
    return typeof u === "string" && isInstagramImageUrl(u)
      ? [{ url: u, side: Number(c?.[width]) || 0 }]
      : []
  })

// The largest for the page, the smallest that still fills a thumbnail.
function pair(list: Candidate[]) {
  if (!list.length) return null
  const sorted = [...list].sort((a, b) => b.side - a.side)
  const full = sorted[0]!
  const thumb = [...sorted].reverse().find((c) => c.side >= THUMB_SIDE) ?? full
  return { full: proxied(full.url), thumb: proxied(thumb.url) }
}

const label = (code: string, index: number, count: number) =>
  count > 1 ? `${code} · ${index + 1}/${count}` : code

// One item of /v2/instagram/user/posts. A carousel gives every slide, a reel
// its cover.
export function fromFeedItem(item: Json): InstagramImage[] {
  const code = String(item?.code ?? item?.id ?? "")
  if (!code) return []
  const slides: Json[] = item?.carousel_media?.length
    ? item.carousel_media
    : [item]
  return slides.flatMap((slide, i) => {
    const urls = pair(
      candidates(slide?.image_versions2?.candidates, "url", "width")
    )
    return urls
      ? [{ id: `${code}-${i}`, label: label(code, i, slides.length), ...urls }]
      : []
  })
}

// /v1/instagram/post, which answers in Instagram's GraphQL shape.
export function fromPost(d: Json): {
  author: string
  images: InstagramImage[]
} {
  const m = d?.data?.xdt_shortcode_media
  const code = String(m?.shortcode ?? m?.id ?? "")
  if (!code) return { author: "", images: [] }
  const edges: Json[] = m?.edge_sidecar_to_children?.edges ?? []
  const slides: Json[] = edges.length ? edges.map((e) => e?.node) : [m]
  const images = slides.flatMap((slide, i) => {
    const urls = pair([
      ...candidates(slide?.display_resources, "src", "config_width"),
      ...candidates([{ src: slide?.display_url }], "src", "none"),
    ])
    return urls
      ? [{ id: `${code}-${i}`, label: label(code, i, slides.length), ...urls }]
      : []
  })
  return { author: String(m?.owner?.username ?? ""), images }
}
