import type { MachineDraftRow } from "@/lib/database"

import type { DismissReason, Item, RunDecision } from "./model"

export interface Filed {
  text: string
  scene: string
  alt: string
  // Only ever items from the inbox, however the agent cites them.
  sources: Item[]
  link: string | null
  // What the agent read beyond the headlines, which also counts as evidence.
  read: string
  prompt: string
}

// How a run of the agent ended. A pass, a refusal and running out of turns all
// file nothing and all cost the same, so they have to stay apart here.
export type AgentResult =
  | { decision: "filed"; filed: Filed; prompt: string }
  | {
      decision: Extract<
        RunDecision,
        "passed" | "refused" | "exhausted" | "invalid"
      >
      reason: string
      prompt: string
    }

// What the agent remembers. Only `delivered` was really seen by anyone, so only
// it counts as the outlet's own voice; the rest just stops repeats.
export interface Memory {
  delivered: string[]
  inReview: string[]
  dismissed: { story: string; reason: DismissReason | null }[]
}

export const NO_MEMORY: Memory = { delivered: [], inReview: [], dismissed: [] }

const MAX_DELIVERED = 15
const MAX_IN_REVIEW = 15
const MAX_DISMISSED = 10
const MAX_STORY = 120

type MemoryRow = Pick<
  MachineDraftRow,
  "text" | "status" | "receipts" | "sources" | "signal" | "dismiss_reason"
>

// The story a draft was about, in its sources' words. Held and unreviewed text
// never goes back to the agent, so its own unchecked lines can't teach it.
const storyOf = (d: MemoryRow) =>
  (d.sources[0]?.title ?? d.signal?.title ?? "").slice(0, MAX_STORY)

// A post with receipts went out only if an account took it. One with none went
// to a public page alone, which is the only way that happens.
const wasDelivered = (d: MemoryRow) =>
  d.status === "published" &&
  (!d.receipts.length || d.receipts.some((r) => r.postId && !r.error))

export function splitMemory(rows: MemoryRow[]): Memory {
  const story = (list: MemoryRow[]) =>
    list.flatMap((d) => {
      const s = storyOf(d)
      return s ? [s] : []
    })
  const dismissed = rows.filter((d) => d.status === "dismissed")
  const delivered = rows.filter(wasDelivered)
  return {
    delivered: delivered.slice(0, MAX_DELIVERED).map((d) => d.text),
    inReview: story(
      rows.filter((d) => d.status !== "dismissed" && !wasDelivered(d))
    ).slice(0, MAX_IN_REVIEW),
    dismissed: dismissed.slice(0, MAX_DISMISSED).flatMap((d) => {
      const s = storyOf(d)
      return s ? [{ story: s, reason: d.dismiss_reason }] : []
    }),
  }
}

// Fenced as data, with short ids, so URLs never travel through the model.
export function inboxBrief(items: Item[], memory: Memory = NO_MEMORY) {
  return JSON.stringify({
    inbox: items.map((i, id) => ({
      id,
      source: i.source,
      title: i.title,
      summary: i.summary,
      at: new Date(i.at).toISOString(),
    })),
    recent_posts: memory.delivered,
    ...(memory.inReview.length && {
      already_waiting_do_not_repeat: memory.inReview,
    }),
    ...(memory.dismissed.length && {
      rejected_by_the_owner_do_not_repeat: memory.dismissed,
    }),
  })
}

export interface Input {
  text?: unknown
  scene?: unknown
  alt?: unknown
  item_ids?: unknown
}

export function toFiled(
  input: Input,
  items: Item[],
  read: string,
  prompt: string
): Filed | null {
  const text = typeof input.text === "string" ? input.text.trim() : ""
  if (!text) return null
  const ids = Array.isArray(input.item_ids) ? input.item_ids : []
  const sources = [...new Set(ids)].flatMap((id) => {
    const item = typeof id === "number" ? items[id] : undefined
    return item ? [item] : []
  })
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : ""
  return {
    text: text.slice(0, 500),
    scene: str(input.scene, 1000),
    alt: str(input.alt, 500),
    sources,
    link: sources[0]?.url ?? null,
    read,
    prompt,
  }
}

const MAX_REASON = 500

export function fromTool(
  input: Input,
  items: Item[],
  read: string,
  prompt: string
): AgentResult {
  const filed = toFiled(input, items, read, prompt)
  return filed
    ? { decision: "filed", filed, prompt }
    : { decision: "invalid", reason: "It filed an empty post.", prompt }
}

export const passed = (reason: unknown, prompt: string): AgentResult => ({
  decision: "passed",
  reason: typeof reason === "string" ? reason.trim().slice(0, MAX_REASON) : "",
  prompt,
})

// How many items came from each source: what a run saw, or what it cited.
export function tally(items: Pick<Item, "source">[]) {
  const counts: Record<string, number> = {}
  for (const { source } of items) counts[source] = (counts[source] ?? 0) + 1
  return counts
}
