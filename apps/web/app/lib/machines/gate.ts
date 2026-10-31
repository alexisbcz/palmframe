import type { Item, OutputPlatform } from "./model"

// The agent's output is untrusted: it read strangers' text. Everything between
// it and a public post is plain code in this file.
export const LIMITS: Record<OutputPlatform, number> = {
  bluesky: 300,
  twitter: 280,
  threads: 500,
  linkedin: 3000,
  instagram: 2200,
}
// X counts every link as this many characters, however long it is.
const X_LINK = 23

export const NEEDS_IMAGE: OutputPlatform[] = ["instagram"]
export const MAX_FAILURES = 3
export const FRESH_MS = 48 * 3_600_000

const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].length

// Digit runs, however they are grouped: "1,200" and "1 200" are both 1200.
const numbers = (s: string) =>
  (s.match(/\d+(?:[.,\u00a0\u202f ]\d{3})*(?:[.,]\d+)?/g) ?? []).map((n) =>
    n.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "")
  )

// Numbers a post states that none of its sources do. News accounts live on
// numbers, and a made-up one is the worst thing this can publish. Rounded or
// reformatted figures end up here too; they cost a human glance, not a post.
export function unsupportedNumbers(text: string, evidence: string) {
  const known = new Set(numbers(evidence))
  return [
    ...new Set(numbers(text).filter((n) => n.length > 1 && !known.has(n))),
  ]
}

export const evidenceOf = (items: Item[]) =>
  items.map((i) => `${i.title} ${i.summary}`).join("\n")

// Why this can't go out by itself, or null when it can.
export function holdReason(
  text: string,
  evidence: string,
  sources: Item[]
): string | null {
  if (!sources.length) return "It doesn't cite anything the machine heard."
  const made = unsupportedNumbers(text, evidence)
  if (made.length)
    return `It states ${made.slice(0, 3).join(", ")}, which the sources don't.`
  return null
}

// A post's words and link fitted to one platform. Bluesky counts links in
// full, so a long one is dropped before the words are cut.
export function compose(
  text: string,
  link: string | null,
  platform: OutputPlatform
) {
  const limit = LIMITS[platform]
  const body = text.trim()
  if (!link || platform === "instagram") return clip(body, limit)
  const cost = platform === "twitter" ? X_LINK : graphemes(link)
  if (graphemes(body) + 2 + cost <= limit) return `${body}\n\n${link}`
  if (platform === "bluesky" && cost > 100) return clip(body, limit)
  return `${clip(body, limit - 2 - cost)}\n\n${link}`
}

function clip(s: string, max: number) {
  const parts = [...new Intl.Segmenter().segment(s)].map((p) => p.segment)
  return parts.length <= max
    ? s
    : `${parts
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
}

export function nextRunAt(now: number, everyMinutes: number) {
  return new Date(now + everyMinutes * 60_000).toISOString()
}

export function isDue(nextRun: string | null, now: number) {
  return !nextRun || Date.parse(nextRun) <= now
}

// One outlet shouldn't reach a person twice from the same story in a row.
export function freshItems(items: Item[], now: number) {
  return items.filter((i) => now - i.at <= FRESH_MS).sort((a, b) => b.at - a.at)
}
