import { z } from "zod"

import { FORMATS } from "@/lib/media/model"

import { DATASET_IDS, isDatasetKey } from "./datasets"
import { type Line, STYLES, isFar, lineSchema } from "./stance"

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

// Sources polled on the machine's schedule, next to its live stream. These are
// the ones an owner types. A dataset is picked from a list, and a rival is another
// of their machines: see the two last entries of `feedSchema`.
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
  // Every known id parses, so a dataset closed later doesn't break the machines
  // holding it. Whether one may be read is `selectable`, checked by the save
  // and again by the reader.
  z.object({ kind: z.literal("dataset"), preset: z.enum(DATASET_IDS) }),
  z.object({ kind: z.literal("rival"), machine: z.uuid() }),
])
export type Feed = z.infer<typeof feedSchema>
export type TypedFeed = Extract<Feed, { kind: (typeof FEED_KINDS)[number] }>

// Machines this one reads as rivals, from a config that may predate the field.
export const rivalsOf = (config: unknown) => {
  const feeds = (config as { feeds?: Feed[] } | null)?.feeds ?? []
  return feeds.flatMap((f) => (f.kind === "rival" ? [f.machine] : []))
}

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

// Off unless asked for: a Story costs far more than a post.
export const MAX_STORIES_PER_DAY = 3
export const mediaConfig = z.object({
  enabled: z.boolean().default(false),
  formats: z.array(z.enum(FORMATS)).max(FORMATS.length).default([]),
  storiesPerDay: z.number().int().min(1).max(MAX_STORIES_PER_DAY).default(1),
})
export type MediaConfig = z.infer<typeof mediaConfig>
export const NO_MEDIA: MediaConfig = {
  enabled: false,
  formats: [],
  storiesPerDay: 1,
}

// A starting guess, to set again from the run ledger after a week of real
// machines. It covers ten runs, five pictures and one Story in five formats.
export const DEFAULT_CREDITS_PER_DAY = 200
export const MIN_CREDITS_PER_DAY = 10
export const MAX_CREDITS_PER_DAY = 5000

export const machineConfig = z.object({
  keywords: z.array(word).max(20).default([]),
  exclude: z.array(word).max(20).default([]),
  // Text sources: matches needed. Prices: percent.
  threshold: z.number().min(0.1).max(1000),
  windowMinutes: z.number().int().min(1).max(1440),
  // How long one subject stays quiet after firing.
  cooldownMinutes: z.number().int().min(1).max(10080),
  dailyCap: z.number().int().min(1).max(20),
  // Everything this machine may spend in a UTC day. Past it, the machine keeps
  // listening and goes back to work the next day.
  maxCreditsPerDay: z
    .number()
    .int()
    .min(MIN_CREDITS_PER_DAY)
    .max(MAX_CREDITS_PER_DAY)
    .default(DEFAULT_CREDITS_PER_DAY),
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
  // Research the post's lead into a Story and render it into these formats.
  media: mediaConfig.default(NO_MEDIA),
  // A declared political line, or null for an outlet without one.
  line: lineSchema.nullable().default(null),
  // How the take sounds, on its own or on top of a line.
  style: z.enum(STYLES).default("plain"),
})
export type MachineConfig = z.infer<typeof machineConfig>

// What a line machine can't be, in the first version. Pictures and Stories
// aren't read by the standards desk the way a post is, and Instagram can't post
// without a picture. The database enforces the rest: see the guard trigger.
export function lineProblems(m: {
  config: { line: Line | null; image: boolean; media: MediaConfig }
  public: boolean
  publish_mode: PublishMode
  outputs: MachineOutput[]
}) {
  const { line, image, media } = m.config
  if (!line) return []
  return [
    !m.public && "A line machine needs its public page.",
    image && "A line machine doesn't draw pictures.",
    media.enabled && "A line machine doesn't make Stories.",
    m.outputs.some((o) => o.platform === "instagram") &&
      "A line machine can't post to Instagram, which needs a picture.",
    isFar(line) &&
      m.publish_mode === "auto" &&
      "A far stance is reviewed by a person, always.",
  ].filter((p) => typeof p === "string")
}

export const machineInput = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(80),
    source: z.enum(SOURCES),
    config: machineConfig,
    publish_mode: z.enum(PUBLISH_MODES).default("review"),
    outputs: z.array(outputSchema).max(5).default([]),
    public: z.boolean().default(false),
  })
  .superRefine((m, ctx) => {
    for (const message of lineProblems(m))
      ctx.addIssue({ code: "custom", message })
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
  // A foil is there to be answered, and is never evidence. Anything else is a fact.
  role?: "fact" | "foil"
}

export const isFoil = (item: Pick<Item, "role">) => item.role === "foil"

// Pages the agent may not open: a dataset's page holds the fields its allowlist
// drops, and what it reads counts as evidence, which a foil must never become.
export const isReadable = (item: Pick<Item, "key" | "role">) =>
  !isDatasetKey(item.key) && !isFoil(item)

// What a post stands on: enough to show its evidence once the inbox is pruned.
export interface PostSource {
  title: string
  url: string
  source: string
  // Set on a rival's post it answered, so nothing reads that answer in turn.
  role?: "foil"
}

// Why an owner threw a post away. A closed list, because it goes back to the
// agent as memory and shows up in six languages.
export const DISMISS_REASONS = ["wrong", "dull", "repeat", "tone"] as const
export type DismissReason = (typeof DISMISS_REASONS)[number]

// How an edition ended, one ledger row each. The first group started the
// agent, so it counts towards the attempts ceiling; `running` is a row whose
// run hasn't finished, or never will.
export const AGENT_DECISIONS = [
  "running",
  "filed",
  "passed",
  "refused",
  "exhausted",
  "invalid",
  "failed",
  "blocked",
] as const
export const RUN_DECISIONS = [
  ...AGENT_DECISIONS,
  "empty",
  "capped",
  "ceiling",
  "breaker",
  "no_writer",
  "no_credits",
  "deadline",
  "error",
  "frozen",
  "no_calendar",
  "not_public",
  "no_desk",
] as const
export type RunDecision = (typeof RUN_DECISIONS)[number]

// A machine's last_error is either a sentence or one of these codes, which the
// page words in the reader's language.
export const NOTICES = [
  "budget",
  "unreadable",
  "refused",
  "frozen",
  "no_calendar",
  "not_public",
  "no_desk",
] as const
export type Notice = (typeof NOTICES)[number]

export function noticeOf(lastError: string) {
  const [code, ...rest] = lastError.split(":")
  const notice = NOTICES.find((n) => n === code)
  return notice ? { notice, detail: rest.join(":") } : null
}

export interface PublishReceipt {
  accountId: string
  platform: OutputPlatform
  username: string
  url: string | null
  postId: string | null
  error: string | null
  // Set once someone retracts the post: taken down here, or left to do by hand.
  retraction?: "removed" | "manual"
}

// Why a published post came down. A closed list, because it shows publicly in
// six languages.
export const RETRACT_REASONS = [
  "error",
  "source",
  "standards",
  "owner",
] as const
export type RetractReason = (typeof RETRACT_REASONS)[number]

// Where the publishing service can take a post down. Instagram can't, so the
// owner has to delete it there, and the page says so.
export const RETRACTABLE: Record<OutputPlatform, boolean> = {
  bluesky: true,
  twitter: true,
  threads: true,
  linkedin: true,
  instagram: false,
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
  id:
    | "crypto"
    | "wikipedia"
    | "bluesky"
    | "newsroom"
    | "hackernews"
    | "rejectedBin"
    | "foreignObject"
    | "rappelConso"
  source: SourceId
  config: MachineConfig
}

const base = {
  exclude: [],
  voice: "",
  language: "en",
  dailyCap: 5,
  maxCreditsPerDay: DEFAULT_CREDITS_PER_DAY,
  mission: "",
  feeds: [],
  listen: true,
  everyMinutes: 60,
  image: false,
  media: NO_MEDIA,
  line: null,
  style: "plain" as const,
}

// A dataset desk reads once a day, files at most one post, and starts in review
// like every machine. The style sends it past the standards desk, and a quiet day
// is normal: some of these only move a few times a month.
const desk = {
  ...base,
  dailyCap: 1,
  listen: false,
  everyMinutes: 1440,
  style: "deadpan" as const,
  keywords: [],
  threshold: 8,
  windowMinutes: 15,
  cooldownMinutes: 720,
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
  {
    id: "rejectedBin",
    source: "wikipedia",
    config: {
      ...desk,
      mission:
        "Petitions the UK Parliament refused as irrelevant. State the petition's own wording and its official category, and let them do the work. Laugh at the idea, never at whoever signed it.",
      feeds: [{ kind: "dataset", preset: "rejectedBin" }],
    },
  },
  {
    id: "foreignObject",
    source: "wikipedia",
    config: {
      ...desk,
      mission:
        "US food recalls for what got into the food. State the object, the product and the firm exactly as the recall does. A recall where nobody was hurt is the only kind this covers.",
      feeds: [{ kind: "dataset", preset: "foreignObject" }],
    },
  },
  {
    id: "rappelConso",
    source: "wikipedia",
    config: {
      ...desk,
      language: "fr",
      mission:
        "French food recalls for what got into the food. State the object, the product and the brand exactly as the notice does. A recall where nobody was hurt is the only kind this covers.",
      feeds: [{ kind: "dataset", preset: "rappelConso" }],
    },
  },
]
