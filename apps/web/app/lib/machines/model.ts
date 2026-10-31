import { z } from "zod"

// Content machines: small media outlets. Each one hears its sources, an agent
// decides what is worth a post, and the post goes out on a schedule.
// Shared by the browser (the live wire) and the server (the scheduled runner),
// so a machine fires on the same events in both.
export const SOURCES = ["bluesky", "wikipedia", "crypto"] as const
export type SourceId = (typeof SOURCES)[number]

export const MAX_MACHINES = 5

export interface SourceInfo {
  // Text sources fire on a count of matches; level sources on a size of move.
  kind: "text" | "level"
  needsKeywords: boolean
  home: string
}

export const SOURCE_INFO: Record<SourceId, SourceInfo> = {
  bluesky: { kind: "text", needsKeywords: true, home: "https://bsky.app" },
  wikipedia: {
    kind: "text",
    needsKeywords: false,
    home: "https://www.wikipedia.org",
  },
  crypto: { kind: "level", needsKeywords: false, home: "https://coinbase.com" },
}

const word = z.string().trim().min(1).max(60)

// Sources polled on the machine's schedule, next to its live stream.
export const FEED_KINDS = [
  "rss",
  "news",
  "hackernews",
  "tiktok",
  "youtube",
] as const
export const MAX_FEEDS = 8

export const feedSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rss"),
    url: z.url().startsWith("https://").max(500),
  }),
  z.object({ kind: z.literal("news"), query: word }),
  z.object({ kind: z.literal("hackernews") }),
  z.object({ kind: z.literal("tiktok"), query: word }),
  z.object({ kind: z.literal("youtube"), query: word }),
])
export type Feed = z.infer<typeof feedSchema>

export const OUTPUT_PLATFORMS = [
  "bluesky",
  "twitter",
  "threads",
  "linkedin",
  "instagram",
] as const
export type OutputPlatform = (typeof OUTPUT_PLATFORMS)[number]

export const outputSchema = z.object({
  platform: z.enum(OUTPUT_PLATFORMS),
  accountId: z.string().min(1).max(100),
  username: z.string().max(200),
})
export type MachineOutput = z.infer<typeof outputSchema>

export const PUBLISH_MODES = ["review", "auto"] as const
export type PublishMode = (typeof PUBLISH_MODES)[number]

export const EVERY_MINUTES = [15, 30, 60, 180, 360, 720, 1440] as const

export const machineConfig = z.object({
  keywords: z.array(word).max(20).default([]),
  exclude: z.array(word).max(20).default([]),
  // Text sources: matches needed. Prices: percent.
  threshold: z.number().min(0.1).max(1000),
  windowMinutes: z.number().int().min(1).max(1440),
  // How long one subject stays quiet after firing.
  cooldownMinutes: z.number().int().min(1).max(10080),
  dailyCap: z.number().int().min(1).max(20),
  // Who the posts are for, and how they sound.
  voice: z.string().trim().max(600).default(""),
  language: z
    .string()
    .regex(/^[a-z]{2}$/)
    .default("en"),
  // What this outlet covers: the agent's editorial brief.
  mission: z.string().trim().max(1000).default(""),
  feeds: z.array(feedSchema).max(MAX_FEEDS).default([]),
  // Whether the live stream counts as a source. Machines from before the
  // agent have no such field, and they do listen.
  listen: z.boolean().default(true),
  // How often the agent wakes up to read its inbox.
  everyMinutes: z.number().int().min(15).max(1440).default(60),
  // Draw a picture for each post.
  image: z.boolean().default(false),
})
export type MachineConfig = z.infer<typeof machineConfig>

export const machineInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  source: z.enum(SOURCES),
  config: machineConfig,
  publish_mode: z.enum(PUBLISH_MODES).default("review"),
  outputs: z.array(outputSchema).max(5).default([]),
  public: z.boolean().default(false),
})

// One thing a source said, before any filtering.
export type Reading =
  | {
      kind: "text"
      source: SourceId
      // What the burst counts: an article, or null for the matched keyword.
      subject: string | null
      text: string
      url: string
      at: number
      lang?: string
    }
  | {
      kind: "level"
      source: SourceId
      subject: string
      label: string
      value: number
      url: string
      at: number
    }

export type Measure =
  | { type: "count"; count: number; minutes: number }
  | {
      type: "move"
      from: number
      to: number
      // Percent.
      change: number
      minutes: number
    }

// A moment worth a post. `facts` is all the writer may claim.
export const signalSchema = z.object({
  id: z.string().min(1).max(300),
  source: z.enum(SOURCES),
  title: z.string().max(300),
  facts: z.string().max(600),
  samples: z.array(z.string().max(500)).max(5),
  url: z.url().refine((u) => u.startsWith("https://")),
  at: z.number(),
  measure: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("count"),
      count: z.number(),
      minutes: z.number(),
    }),
    z.object({
      type: z.literal("move"),
      from: z.number(),
      to: z.number(),
      change: z.number(),
      minutes: z.number(),
    }),
  ]),
})
export type Signal = z.infer<typeof signalSchema>

// One thing a machine heard, ready for the agent to read.
export interface Item {
  key: string
  source: string
  title: string
  summary: string
  url: string
  at: number
}

// What a post stands on: enough to show its evidence once the inbox is pruned.
export interface PostSource {
  title: string
  url: string
  source: string
}

export interface PublishReceipt {
  accountId: string
  platform: OutputPlatform
  username: string
  url: string | null
  postId: string | null
  error: string | null
}

export const slugify = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")

export interface MachinePreset {
  id: "crypto" | "wikipedia" | "bluesky" | "newsroom" | "hackernews"
  source: SourceId
  config: MachineConfig
}

const base = {
  exclude: [],
  voice: "",
  language: "en",
  dailyCap: 5,
  mission: "",
  feeds: [],
  listen: true,
  everyMinutes: 60,
  image: false,
}

export const PRESETS: MachinePreset[] = [
  {
    // The closest thing to a news account: reads, picks, posts on the hour.
    id: "newsroom",
    source: "wikipedia",
    config: {
      ...base,
      mission:
        "A fast news flash account on AI. Post the single most important new fact, with the number first when there is one.",
      feeds: [{ kind: "news", query: "artificial intelligence" }],
      listen: false,
      keywords: [],
      threshold: 8,
      windowMinutes: 15,
      cooldownMinutes: 720,
    },
  },
  {
    id: "hackernews",
    source: "wikipedia",
    config: {
      ...base,
      mission:
        "What builders are reading today. Pick the story that matters most and say why in one line.",
      feeds: [{ kind: "hackernews" }],
      listen: false,
      everyMinutes: 180,
      keywords: [],
      threshold: 8,
      windowMinutes: 15,
      cooldownMinutes: 720,
    },
  },
  {
    // A page suddenly being rewritten is usually breaking news.
    id: "wikipedia",
    source: "wikipedia",
    config: {
      ...base,
      keywords: [],
      threshold: 8,
      windowMinutes: 15,
      cooldownMinutes: 720,
    },
  },
  {
    id: "bluesky",
    source: "bluesky",
    config: {
      ...base,
      keywords: ["webtoon", "manga", "comic book"],
      threshold: 25,
      windowMinutes: 10,
      cooldownMinutes: 360,
    },
  },
  {
    id: "crypto",
    source: "crypto",
    config: {
      ...base,
      keywords: ["BTC", "ETH", "SOL"],
      threshold: 2,
      windowMinutes: 60,
      cooldownMinutes: 240,
    },
  },
]
