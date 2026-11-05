// Context.dev: news search, web search, page scraping and brand facts. Every
// call spends the account's credits, so the agent gets narrow, capped tools.
// Docs: https://docs.context.dev/llms.txt

const API = "https://api.context.dev/v1"
const TIMEOUT_MS = 60_000

export const contextDevAvailable = () =>
  !!process.env.CONTEXT_DEV_API_KEY?.trim()

async function post(path: string, body: unknown, signal?: AbortSignal) {
  const key = process.env.CONTEXT_DEV_API_KEY?.trim()
  if (!key) throw new Error("Context.dev isn't set up.")
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([
      AbortSignal.timeout(TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]),
  })
  if (!res.ok) throw new Error(`Context.dev ${res.status}`)
  return (await res.json()) as Record<string, any>
}

export interface NewsHit {
  url: string
  title: string
  outlet: string
  published: string | null
  summary: string
}

export async function searchNews(
  query: string,
  signal?: AbortSignal
): Promise<NewsHit[]> {
  const d = await post(
    "news/search",
    {
      searchBy: { type: "natural_language", query },
      sortBy: { type: "relevance" },
      limit: 10,
    },
    signal
  )
  return (d.data ?? []).map((a: any) => ({
    url: String(a.url ?? ""),
    title: String(a.title ?? ""),
    outlet: String(a.source?.name ?? a.source?.domain ?? ""),
    published: a.published_at ?? null,
    summary: String(a.description ?? "").slice(0, 1_200),
  }))
}

export interface WebHit {
  url: string
  title: string
  snippet: string
}

export async function searchWeb(
  query: string,
  signal?: AbortSignal
): Promise<WebHit[]> {
  const d = await post(
    "web/search",
    {
      query,
      numResults: 8,
      descriptionMaxCharacters: 600,
      timeoutOpts: { milliseconds: 30_000, behavior: "return-partial" },
    },
    signal
  )
  return (d.results ?? []).map((r: any) => ({
    url: String(r.url ?? ""),
    title: String(r.title ?? ""),
    snippet: String(r.description ?? ""),
  }))
}

// LinkedIn pages cost two orders of magnitude more to scrape; never send them.
const EXPENSIVE = /(^|\.)linkedin\.com$/i

export async function scrapePage(url: string, signal?: AbortSignal) {
  if (EXPENSIVE.test(new URL(url).hostname))
    throw new Error("LinkedIn pages can't be read here.")
  const d = await post(
    "web/scrape",
    { url, formats: { markdown: true } },
    signal
  )
  return {
    title: String(d.metadata?.title ?? new URL(url).hostname),
    markdown: String(d.markdown?.data ?? ""),
  }
}

export interface Brand {
  domain: string
  name: string
  description: string
  slogan: string
  colors: string[]
  logo: string | null
  socials: string[]
}

export async function brandFor(
  domain: string,
  signal?: AbortSignal
): Promise<Brand> {
  const d = await post(
    "brand/retrieve",
    {
      type: "by_domain",
      domain,
      timeoutOpts: { milliseconds: 45_000, behavior: "return-partial" },
    },
    signal
  )
  const b = d.brand ?? {}
  return {
    domain: String(b.domain ?? domain),
    name: String(b.title ?? ""),
    description: String(b.description ?? "").slice(0, 1_500),
    slogan: String(b.slogan ?? ""),
    colors: (b.colors ?? [])
      .map((c: any) => String(c?.hex ?? ""))
      .filter(Boolean)
      .slice(0, 6),
    logo:
      (b.logos ?? []).find((l: any) => l?.mode === "dark")?.url ??
      b.logos?.[0]?.url ??
      null,
    socials: (b.socials ?? [])
      .map((s: any) => String(s?.url ?? ""))
      .filter(Boolean)
      .slice(0, 8),
  }
}
