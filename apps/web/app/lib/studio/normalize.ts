import type { Ad, Advertiser, Video } from "./model"

// ScrapeCreators' answers, down to the shapes Studio uses. Every field is
// treated as maybe-missing: these mirror third-party pages that change.
type Json = Record<string, any>

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v
  return typeof n === "number" && Number.isFinite(n) ? n : null
}
const str = (v: unknown, max = 600) =>
  typeof v === "string" ? v.slice(0, max) : ""
const https = (v: unknown) =>
  typeof v === "string" && v.startsWith("https://") ? v.slice(0, 2000) : null
const iso = (seconds: unknown) => {
  const n = num(seconds)
  return n ? new Date(n * 1000).toISOString() : null
}

export function fromTikTok(a: Json): Video | null {
  if (!a?.aweme_id) return null
  const s = a.statistics ?? {}
  const author = str(a.author?.unique_id, 120)
  return {
    platform: "tiktok",
    id: String(a.aweme_id),
    // share_url carries tracking parameters that say who shared it.
    url: `https://www.tiktok.com/@${author || "_"}/video/${a.aweme_id}`,
    title: str(a.desc),
    author,
    thumbnail: https(a.video?.cover?.url_list?.[0]),
    views: num(s.play_count),
    likes: num(s.digg_count),
    comments: num(s.comment_count),
    shares: num(s.share_count),
    postedAt: iso(a.create_time),
    seconds: num(a.video?.duration) ? a.video.duration / 1000 : null,
    transcript: "",
  }
}

export function fromReel(r: Json): Video | null {
  const url = https(r?.url)
  if (!r?.id || !url) return null
  return {
    platform: "instagram",
    id: String(r.id),
    url,
    title: str(r.caption),
    author: str(r.user?.username ?? r.owner?.username, 120),
    thumbnail: https(r.image_url ?? r.thumbnail_src ?? r.display_url),
    views: num(r.play_count ?? r.video_play_count ?? r.video_view_count),
    likes: num(r.like_count),
    comments: num(r.comment_count),
    shares: null,
    postedAt: str(r.taken_at, 40) || null,
    seconds: num(r.video_duration),
    transcript: "",
  }
}

export function fromInstagramPost(d: Json, url: string): Video | null {
  const m = d?.data?.xdt_shortcode_media
  if (!m?.id) return null
  return {
    platform: "instagram",
    id: String(m.id),
    url,
    title: str(m.edge_media_to_caption?.edges?.[0]?.node?.text),
    author: str(m.owner?.username, 120),
    thumbnail: https(m.thumbnail_src ?? m.display_url),
    views: num(m.video_play_count ?? m.video_view_count),
    likes: num(m.edge_media_preview_like?.count),
    comments: num(m.comment_count ?? m.edge_media_preview_comment?.count),
    shares: null,
    postedAt: iso(m.taken_at_timestamp),
    seconds: num(m.video_duration),
    transcript: "",
  }
}

export function fromYouTube(v: Json): Video | null {
  const url =
    https(v?.url) ?? (v?.id ? `https://www.youtube.com/watch?v=${v.id}` : null)
  if (!v?.id || !url) return null
  return {
    platform: "youtube",
    id: String(v.id),
    url,
    title: str(v.title),
    author: str(v.channel?.title ?? v.channel?.handle, 120),
    thumbnail: https(v.thumbnail),
    views: num(v.viewCountInt),
    likes: num(v.likeCountInt),
    comments: num(v.commentCountInt),
    shares: null,
    postedAt: str(v.publishDate ?? v.publishedTime, 40) || null,
    seconds: num(v.durationMs) ? v.durationMs / 1000 : num(v.lengthSeconds),
    transcript: "",
  }
}

const DAY = 86_400

export function fromMetaAd(a: Json, nowSeconds: number): Ad | null {
  const s = a?.snapshot
  if (!a?.ad_archive_id || !s) return null
  const card = s.cards?.[0] ?? {}
  const started = num(a.start_date)
  const ended = a.is_active ? nowSeconds : (num(a.end_date) ?? nowSeconds)
  return {
    id: String(a.ad_archive_id),
    page: str(a.page_name ?? s.page_name, 200),
    body: str(s.body?.text ?? card.body, 2000),
    title: str(s.title ?? card.title, 300),
    cta: str(s.cta_text ?? card.cta_text, 60),
    format: str(s.display_format, 30),
    image: https(
      card.resized_image_url ??
        card.original_image_url ??
        card.video_preview_image_url ??
        s.images?.[0]?.resized_image_url ??
        s.images?.[0]?.original_image_url ??
        s.videos?.[0]?.video_preview_image_url
    ),
    link: https(s.link_url ?? card.link_url),
    url: `https://www.facebook.com/ads/library/?id=${a.ad_archive_id}`,
    startedAt: iso(started),
    days: started ? Math.max(0, Math.round((ended - started) / DAY)) : 0,
    variants: Math.max(1, num(a.collation_count) ?? 1),
    platforms: (Array.isArray(a.publisher_platform) ? a.publisher_platform : [])
      .map((p: unknown) => str(p, 30))
      .slice(0, 10),
    active: a.is_active === true,
  }
}

export function fromAdvertiser(c: Json): Advertiser | null {
  if (!c?.page_id || !c.name) return null
  return {
    pageId: String(c.page_id),
    name: str(c.name, 200),
    image: https(c.image_uri),
    category: str(c.category, 120),
    likes: num(c.likes),
    instagram: str(c.ig_username, 120) || null,
    verified: c.verification === "BLUE_VERIFIED",
  }
}

export const compact = <T>(items: (T | null)[]) =>
  items.filter((x): x is T => x !== null)
