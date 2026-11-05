import { toExample, type CivitaiExample, type ExampleQuery } from "./civitai"

// Civitai answers without a key. One raises its rate limit, and is optional.
export function civitaiHeaders(): HeadersInit {
  const key = process.env.CIVITAI_API_KEY
  return key ? { authorization: `Bearer ${key}` } : {}
}

// A page of a base model's gallery, keeping only images that share their
// prompt. Civitai leaves it out of most, so a page asks for plenty.
export async function civitaiExamples(
  q: ExampleQuery
): Promise<{ items: CivitaiExample[]; next: string | null }> {
  const url = new URL("https://civitai.com/api/v1/images")
  url.searchParams.set("baseModels", q.base)
  url.searchParams.set("sort", q.sort)
  url.searchParams.set("period", q.period)
  url.searchParams.set("nsfw", "None")
  url.searchParams.set("withMeta", "true")
  url.searchParams.set("limit", "60")
  if (q.cursor) url.searchParams.set("cursor", q.cursor)
  const res = await fetch(url, {
    headers: civitaiHeaders(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Civitai answered ${res.status}.`)
  const body = (await res.json()) as {
    items?: Parameters<typeof toExample>[0][]
    metadata?: { nextCursor?: string | number }
  }
  return {
    items: (body.items ?? []).flatMap((i) => toExample(i) ?? []),
    next:
      body.metadata?.nextCursor !== undefined
        ? String(body.metadata.nextCursor)
        : null,
  }
}
