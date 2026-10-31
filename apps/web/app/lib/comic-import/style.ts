import { MAX_REFS } from "@/components/comic-canvas/model"

import { MAX_STYLE_SLOTS } from "./limits"

// What a vision model wrote about how a comic is drawn. `prose` feeds models
// that read sentences, `tags` and `negative` feed Anima.
export interface StyleAnalysis {
  prose: string
  tags: string[]
  negative: string[]
}

// A saved style as the editor sees it.
export interface ComicStyle {
  id: string
  name: string
  status: "draft" | "ready"
  pages: number
  cover: string | null
  analysis: StyleAnalysis | null
}

const MAX_PROSE = 1_200
const MAX_TAG = 40
const MAX_TAGS = 24

const tagList = (value: unknown, max: number) =>
  (Array.isArray(value) ? value : [])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase().replace(/[,\n]/g, " ").slice(0, MAX_TAG))
    .filter(Boolean)
    .slice(0, max)

// A model's reply, kept in shape. It goes into prompts, so nothing unbounded.
export function cleanAnalysis(value: unknown): StyleAnalysis | null {
  const v = value as Partial<Record<keyof StyleAnalysis, unknown>> | null
  const prose = typeof v?.prose === "string" ? v.prose.trim() : ""
  if (!prose) return null
  return {
    prose: prose.slice(0, MAX_PROSE),
    tags: tagList(v?.tags, MAX_TAGS),
    negative: tagList(v?.negative, 12),
  }
}

// How many reference slots a style takes in a render: two when there's room,
// one when the cast and the world want them, never the guide's.
export function styleSlots(wanted: number, guide: boolean, pages: number) {
  const free = MAX_REFS - (guide ? 1 : 0) - wanted
  return Math.min(Math.max(free, 1), MAX_STYLE_SLOTS, pages)
}

// Which pages a render gets. The seed walks the set, so a long comic sees all
// of them, and a locked seed redraws from the same ones.
export function pickPages<T>(pages: T[], slots: number, seed: number) {
  const count = Math.min(slots, pages.length)
  const start = pages.length ? Math.abs(Math.trunc(seed)) % pages.length : 0
  return Array.from(
    { length: count },
    (_, i) => pages[(start + i) % pages.length]!
  )
}
