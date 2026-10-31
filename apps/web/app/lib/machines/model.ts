import { z } from "zod"

// Content machines: a filter over a live public stream that drafts posts.
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
})
export type MachineConfig = z.infer<typeof machineConfig>

export const machineInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  source: z.enum(SOURCES),
  config: machineConfig,
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

export interface MachinePreset {
  id: "crypto" | "wikipedia" | "bluesky"
  source: SourceId
  config: MachineConfig
}

const base = { exclude: [], voice: "", language: "en", dailyCap: 5 }

export const PRESETS: MachinePreset[] = [
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
