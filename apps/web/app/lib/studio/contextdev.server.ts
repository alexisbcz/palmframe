import type { BrandColor, BrandFont, BrandLogo, Product } from "./model"
import { SourceError } from "./scrapecreators.server"

const API = "https://api.context.dev/v1"
const TIMEOUT_MS = 60_000

type Json = Record<string, any>

export const contextAvailable = () => !!process.env.CONTEXT_DEV_API_KEY?.trim()

async function call(path: string, init: RequestInit, signal?: AbortSignal) {
  const key = process.env.CONTEXT_DEV_API_KEY?.trim()
  if (!key) throw new SourceError("CONTEXT_DEV_API_KEY is not set.", "setup")
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.any([
      AbortSignal.timeout(TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]),
  })
  if (res.status === 404)
    throw new SourceError("Nothing found there", "missing")
  if (res.status === 401 || res.status === 402 || res.status === 403)
    throw new SourceError(`context.dev refused (${res.status})`, "setup")
  if (!res.ok) throw new SourceError(`context.dev ${res.status}`, "busy")
  return (await res.json()) as Json
}

const https = (v: unknown) =>
  typeof v === "string" && v.startsWith("https://") ? v.slice(0, 2000) : null

export interface BrandData {
  name: string
  slogan: string
  description: string
  colors: BrandColor[]
  logos: BrandLogo[]
  fonts: BrandFont[]
}

export function toBrand(domain: string, b: Json, s: Json | null): BrandData {
  const colors: BrandColor[] = (b?.colors ?? [])
    .filter((c: Json) => /^#[0-9a-f]{6}$/i.test(c?.hex))
    .slice(0, 8)
    .map((c: Json) => ({ hex: c.hex, name: String(c.name ?? "").slice(0, 60) }))
  const logos: BrandLogo[] = (b?.logos ?? []).slice(0, 6).flatMap((l: Json) => {
    const url = https(l?.url)
    return url
      ? [{ url, mode: String(l.mode ?? ""), type: String(l.type ?? "") }]
      : []
  })
  const family = (t: Json | undefined) =>
    typeof t?.fontFamily === "string" ? t.fontFamily.slice(0, 80) : null
  const headings = family(s?.typography?.headings?.h1)
  const body = family(s?.typography?.p)
  return {
    name: String(b?.title || domain).slice(0, 120),
    slogan: String(b?.slogan ?? "").slice(0, 300),
    description: String(b?.description ?? "").slice(0, 2000),
    colors,
    logos,
    fonts: [
      ...(headings ? [{ family: headings, role: "headings" as const }] : []),
      ...(body && body !== headings
        ? [{ family: body, role: "body" as const }]
        : []),
    ],
  }
}

export async function fetchBrand(domain: string, signal?: AbortSignal) {
  const [brand, style] = await Promise.all([
    call(
      "/brand/retrieve",
      { method: "POST", body: JSON.stringify({ type: "by_domain", domain }) },
      signal
    ),
    // The palette and logos still make a kit when a site's fonts can't be read.
    call(
      `/web/styleguide?${new URLSearchParams({ domain })}`,
      { method: "GET" },
      signal
    ).catch(() => null),
  ])
  if (!brand.brand) throw new SourceError("No brand found", "missing")
  if (brand.brand.is_nsfw) throw new SourceError("Not available", "missing")
  return toBrand(domain, brand.brand, style?.styleguide ?? null)
}

export function toProduct(url: string, d: Json): Product | null {
  const p = d?.product?.data?.product
  if (!d?.product?.data?.isProductPage || !p?.name) return null
  const texts = (v: unknown, n: number, max: number) =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === "string")
      .slice(0, n)
      .map((x) => x.slice(0, max))
  return {
    url,
    name: String(p.name).slice(0, 300),
    brand: String(p.brand ?? "").slice(0, 200),
    description: String(p.description ?? "").slice(0, 3000),
    price: typeof p.price === "number" ? p.price : null,
    currency: String(p.currency ?? "").slice(0, 10),
    image: https(p.imageUrl) ?? https(p.images?.[0]),
    features: texts(p.features, 12, 300),
    audience: texts(p.targetAudience, 8, 120),
  }
}

export async function fetchProduct(url: string, signal?: AbortSignal) {
  const d = await call(
    "/web/scrape",
    {
      method: "POST",
      body: JSON.stringify({
        url,
        formats: { product: true },
        productParams: { dedupeImages: true },
      }),
    },
    signal
  )
  const product = toProduct(url, d)
  if (!product) throw new SourceError("No product on that page", "missing")
  return product
}
