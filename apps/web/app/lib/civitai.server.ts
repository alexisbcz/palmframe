import {
  civitaiNsfw,
  toExample,
  type CivitaiExample,
  type ExampleQuery,
} from "./civitai"

// Civitai answers without a key. One raises its rate limit, and is optional.
export function civitaiHeaders(): HeadersInit {
  const key = process.env.CIVITAI_API_KEY
  return key ? { authorization: `Bearer ${key}` } : {}
}

// Civitai leaves the prompt out of many images, so one of its pages can
// shrink to a handful. A page here keeps reading on until it has enough to
// fill a screen, or Civitai runs out.
const PAGE_ITEMS = 30
const MAX_READS = 3

export async function civitaiExamples(
  q: ExampleQuery
): Promise<{ items: CivitaiExample[]; next: string | null }> {
  const items: CivitaiExample[] = []
  const seen = new Set<number>()
  let cursor = q.cursor
  for (let read = 0; read < MAX_READS; read++) {
    const page = await civitaiPage(q, cursor)
    for (const image of page.items) {
      const example = toExample(image, q.rating)
      if (example && !seen.has(example.id)) {
        seen.add(example.id)
        items.push(example)
      }
    }
    cursor = page.next
    if (!cursor || items.length >= PAGE_ITEMS) break
  }
  return { items, next: cursor }
}

async function civitaiPage(q: ExampleQuery, cursor: string | null) {
  const url = new URL("https://civitai.com/api/v1/images")
  url.searchParams.set("baseModels", q.base)
  url.searchParams.set("sort", q.sort)
  url.searchParams.set("period", q.period)
  url.searchParams.set("nsfw", civitaiNsfw(q.rating))
  url.searchParams.set("withMeta", "true")
  url.searchParams.set("limit", "60")
  if (cursor) url.searchParams.set("cursor", cursor)
  const res = await fetch(url, {
    headers: civitaiHeaders(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Civitai answered ${res.status}.`)
  const body = (await res.json()) as {
    items?: Parameters<typeof toExample>[0][]
    metadata?: { nextCursor?: string | number }
  }
  const next = body.metadata?.nextCursor
  return {
    items: body.items ?? [],
    next:
      next !== undefined && next !== null && next !== "" ? String(next) : null,
  }
}
