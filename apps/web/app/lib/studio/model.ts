import { z } from "zod"

// Studio's shared shapes: what a source looks like once normalized, and the
// storyboard everything turns into. Safe to import in the browser.
export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const
export type Platform = (typeof PLATFORMS)[number]

const text = (max: number) => z.string().max(max)
const count = z.number().min(0).nullable()
const httpsUrl = z
  .url()
  .max(2000)
  .refine((u) => u.startsWith("https://"))

export const videoSchema = z.object({
  platform: z.enum(PLATFORMS),
  id: text(100),
  url: httpsUrl,
  title: text(600),
  author: text(120),
  thumbnail: httpsUrl.nullable(),
  views: count,
  likes: count,
  comments: count,
  shares: count,
  postedAt: z.string().max(40).nullable(),
  seconds: z.number().min(0).nullable(),
  transcript: text(8000).default(""),
})
export type Video = z.infer<typeof videoSchema>

export const adSchema = z.object({
  id: text(40),
  page: text(200),
  body: text(2000),
  title: text(300),
  cta: text(60),
  format: text(30),
  image: httpsUrl.nullable(),
  link: httpsUrl.nullable(),
  url: httpsUrl,
  startedAt: z.string().max(40).nullable(),
  days: z.number().min(0),
  variants: z.number().min(1),
  platforms: z.array(text(30)).max(10),
  active: z.boolean(),
})
export type Ad = z.infer<typeof adSchema>

export const productSchema = z.object({
  url: httpsUrl,
  name: text(300),
  brand: text(200),
  description: text(3000),
  price: z.number().nullable(),
  currency: text(10),
  image: httpsUrl.nullable(),
  features: z.array(text(300)).max(12),
  audience: z.array(text(120)).max(8),
})
export type Product = z.infer<typeof productSchema>

export const studioSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ad"), ad: adSchema }),
  z.object({ kind: z.literal("video"), video: videoSchema }),
  z.object({ kind: z.literal("product"), product: productSchema }),
])
export type StudioSource = z.infer<typeof studioSource>

export const sourceTitle = (s: StudioSource) =>
  (s.kind === "ad"
    ? `${s.ad.page}: ${s.ad.title || s.ad.body}`
    : s.kind === "video"
      ? s.video.title || `@${s.video.author}`
      : s.product.name
  ).slice(0, 200) || "Untitled"

export interface Advertiser {
  pageId: string
  name: string
  image: string | null
  category: string
  likes: number | null
  instagram: string | null
  verified: boolean
}

export interface BrandColor {
  hex: string
  name: string
}
export interface BrandLogo {
  url: string
  mode: string
  type: string
}
export interface BrandFont {
  family: string
  role: "headings" | "body"
}

export const MIN_SCENES = 3
export const MAX_SCENES = 6

export const boardSchema = z.object({
  hook: z.string().min(1).max(300),
  angle: z.string().max(500),
  whyItWorks: z.array(z.string().max(300)).max(5),
  postText: z.string().max(600),
  scenes: z
    .array(
      z.object({
        scene: z.string().min(1).max(1000),
        caption: z.string().max(200),
      })
    )
    .min(MIN_SCENES)
    .max(MAX_SCENES),
})
export type Board = z.infer<typeof boardSchema>

export const BOARD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "angle", "whyItWorks", "postText", "scenes"],
  properties: {
    hook: { type: "string" },
    angle: { type: "string" },
    whyItWorks: { type: "array", items: { type: "string" } },
    postText: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scene", "caption"],
        properties: {
          scene: { type: "string" },
          caption: { type: "string" },
        },
      },
    },
  },
}

// A share of views that reacted, or null when a platform hides a number.
export function engagement(
  v: Pick<Video, "views" | "likes" | "comments" | "shares">
) {
  if (!v.views || v.likes === null) return null
  return ((v.likes + (v.comments ?? 0) + (v.shares ?? 0)) / v.views) * 100
}

// Advertisers stop paying for what doesn't work, so age and variants are the
// best public hint that an ad earns its keep.
export const adScore = (ad: Pick<Ad, "days" | "variants" | "active">) =>
  (ad.active ? ad.days : ad.days / 2) * Math.sqrt(ad.variants)

export const rankAds = <T extends Pick<Ad, "days" | "variants" | "active">>(
  ads: T[]
) => [...ads].sort((a, b) => adScore(b) - adScore(a))

// Search results repeat a video that matches twice, as a video and as a short.
export function rankVideos<T extends Pick<Video, "views" | "platform" | "id">>(
  videos: T[]
) {
  const seen = new Set<string>()
  return videos
    .filter((v) => {
      const key = `${v.platform}:${v.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
}

const HOSTS: [RegExp, Platform][] = [
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
]

export function platformOf(url: string): Platform | null {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:") return null
    return HOSTS.find(([re]) => re.test(u.hostname))?.[1] ?? null
  } catch {
    return null
  }
}

// "https://www.Acme.com/about" and "acme.com" both mean acme.com.
export function toDomain(input: string) {
  const raw = input.trim().toLowerCase()
  if (!raw || /\s/.test(raw)) return null
  try {
    const host = new URL(
      raw.includes("://") ? raw : `https://${raw}`
    ).hostname.replace(/^www\./, "")
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null
  } catch {
    return null
  }
}
