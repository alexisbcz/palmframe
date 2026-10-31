import { createHash } from "node:crypto"

import { stripTags } from "./inline"
import type { SegmentKind } from "./model"

// Requests are sized in characters of source: enough context for a model to
// keep a voice, small enough that a lost reply costs little.
export const CHUNK_CHARS = 6_000
export const MAX_CHUNK_SEGMENTS = 60
const MEMORY_MIN_CHARS = 12

export interface ChunkInput {
  id: string
  kind: SegmentKind
  source: string
  source_hash: string
  group_key: string | null
}

export interface Chunk<T extends ChunkInput = ChunkInput> {
  segments: T[]
  chars: number
}

// A chunk ends at a segment, never inside one, and prefers not to split a
// table, a list or a footnote from its own parts. Oversized groups still split
// so a thousand-row table can't become a single request.
export function chunkSegments<T extends ChunkInput>(
  segments: T[],
  limit = CHUNK_CHARS
): Chunk<T>[] {
  const chunks: Chunk<T>[] = []
  let current: Chunk<T> = { segments: [], chars: 0 }
  const flush = () => {
    if (current.segments.length) chunks.push(current)
    current = { segments: [], chars: 0 }
  }
  let i = 0
  while (i < segments.length) {
    const first = segments[i]!
    let j = i + 1
    if (first.group_key)
      while (j < segments.length && segments[j]!.group_key === first.group_key)
        j++
    const run = segments.slice(i, j)
    const chars = run.reduce((n, s) => n + s.source.length, 0)
    if (
      current.chars + chars > limit ||
      current.segments.length + run.length > MAX_CHUNK_SEGMENTS
    )
      flush()
    if (chars > limit || run.length > MAX_CHUNK_SEGMENTS) {
      for (const segment of run) {
        if (
          current.chars + segment.source.length > limit ||
          current.segments.length >= MAX_CHUNK_SEGMENTS
        )
          flush()
        current.segments.push(segment)
        current.chars += segment.source.length
      }
    } else {
      current.segments.push(...run)
      current.chars += chars
    }
    i = j
  }
  flush()
  return chunks
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim()

// Same words and same tags: the same segment, wherever it occurs.
export const sourceHash = (source: string) =>
  createHash("sha256").update(normalize(source)).digest("hex")

// "Yes." can be said by anyone, and French or Japanese would word it
// differently for each. Repeats shorter than this translate in context.
export const memorable = (source: string) =>
  stripTags(source).trim().length >= MEMORY_MIN_CHARS

const LETTERS = /\p{L}/u

// Is there anything to translate? Decides `fixed` at ingest.
export function translatable(kind: SegmentKind, source: string) {
  if (kind === "code" || kind === "rule") return false
  return LETTERS.test(stripTags(source))
}
