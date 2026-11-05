// Civitai's public gallery: which images to ask for, and what of each one is
// worth prompting from. Shared by the server, the Lab and the comic editor.

export interface CivitaiMeta {
  prompt?: string
  negativePrompt?: string
  seed?: number
  Size?: string
  resources?: { type?: string; name?: string; weight?: number }[]
  comfy?: unknown
}

export function metaLoras(meta: CivitaiMeta) {
  const found = (meta.resources ?? [])
    .filter((r) => r.type === "lora" && r.name)
    .map((r) => ({ name: r.name!, strength: r.weight ?? 1 }))
  let comfy = meta.comfy
  try {
    if (typeof comfy === "string") comfy = JSON.parse(comfy)
  } catch {
    comfy = null
  }
  const nodes = (comfy as { prompt?: Record<string, { inputs?: object }> })
    ?.prompt
  for (const node of Object.values(nodes ?? {}))
    for (const value of Object.values(node.inputs ?? {})) {
      const lora = value as { on?: boolean; lora?: string; strength?: number }
      if (lora?.on && typeof lora.lora === "string")
        found.push({ name: lora.lora, strength: lora.strength ?? 1 })
    }
  return found
}

// Civitai shares finished, often upscaled images. The frame keeps their shape
// at about a megapixel, which is what these models are trained to draw.
const TARGET_PIXELS = 1024 * 1024
export function fitSize(size?: string) {
  const [w, h] = (size ?? "").split("x").map(Number)
  if (!w || !h) return []
  const scale = Math.min(1, Math.sqrt(TARGET_PIXELS / (w * h)))
  const round = (n: number) =>
    Math.min(2048, Math.max(256, Math.round((n * scale) / 16) * 16))
  return [round(w), round(h)]
}

// What Civitai calls the family a checkpoint belongs to, so its gallery can be
// filtered to images the model on this Mac could have drawn.
export const CIVITAI_BASES = [
  "Anima",
  "Flux.2 Klein 4B",
  "Flux.2 Klein 9B",
  "Qwen",
  "Illustrious",
  "NoobAI",
  "Pony",
  "SDXL 1.0",
  "Flux.1 D",
  "ZImageTurbo",
] as const
export type CivitaiBase = (typeof CIVITAI_BASES)[number]

export function civitaiBase(model: string): CivitaiBase {
  const m = model.toLowerCase()
  if (m.includes("klein"))
    return m.includes("9b") ? "Flux.2 Klein 9B" : "Flux.2 Klein 4B"
  if (m.includes("qwen")) return "Qwen"
  if (m.includes("illustrious")) return "Illustrious"
  if (m.includes("noob")) return "NoobAI"
  if (m.includes("pony")) return "Pony"
  if (m.includes("z_image") || m.includes("zimage")) return "ZImageTurbo"
  return "Anima"
}

export const EXAMPLE_SORTS = [
  "Most Reactions",
  "Most Comments",
  "Newest",
] as const
export const EXAMPLE_PERIODS = [
  "Day",
  "Week",
  "Month",
  "Year",
  "AllTime",
] as const

// How explicit the gallery may get. Civitai's levels nest (Mature includes
// Soft), so each one is a ceiling; "Only" leaves the safe images out.
export const EXAMPLE_RATINGS = ["None", "Soft", "Mature", "X", "Only"] as const
export type ExampleRating = (typeof EXAMPLE_RATINGS)[number]
const LEVELS = ["None", "Soft", "Mature", "X"]

// The value Civitai's `nsfw` parameter takes for a rating.
export const civitaiNsfw = (rating: ExampleRating) =>
  rating === "Only" ? "true" : rating

export function allowedLevel(level: string | undefined, rating: ExampleRating) {
  const rank = LEVELS.indexOf(level ?? "None")
  if (rank < 0) return false
  return rating === "Only" ? rank > 0 : rank <= LEVELS.indexOf(rating)
}

export interface ExampleQuery {
  base: CivitaiBase
  sort: (typeof EXAMPLE_SORTS)[number]
  period: (typeof EXAMPLE_PERIODS)[number]
  rating: ExampleRating
  cursor: string | null
}

const oneOf = <T extends string>(
  list: readonly T[],
  value: unknown,
  fallback: T
) => (list.includes(value as T) ? (value as T) : fallback)

// Only names from the lists and a cursor of Civitai's own shape reach its API.
export function exampleQuery(params: URLSearchParams): ExampleQuery {
  const cursor = params.get("cursor")
  return {
    base: oneOf(CIVITAI_BASES, params.get("base"), "Anima"),
    sort: oneOf(EXAMPLE_SORTS, params.get("sort"), "Most Reactions"),
    period: oneOf(EXAMPLE_PERIODS, params.get("period"), "Week"),
    rating: oneOf(EXAMPLE_RATINGS, params.get("rating"), "None"),
    cursor: cursor && /^[\w:|.-]{1,80}$/.test(cursor) ? cursor : null,
  }
}

export interface CivitaiExample {
  id: number
  thumb: string
  width: number
  height: number
  // Civitai's level for the image: None, Soft, Mature or X.
  level: string
  username: string | null
  reactions: number
  model: string | null
  steps: number | null
  cfg: number | null
  sampler: string | null
  // Slimmed to what `fromCivitai` reads: LoRAs come out of the workflow here.
  meta: CivitaiMeta
}

interface CivitaiImage {
  id?: number
  url?: string
  width?: number
  height?: number
  nsfwLevel?: string
  username?: string | null
  stats?: Record<string, number>
  meta?: (CivitaiMeta & Record<string, unknown>) | null
}

const thumbUrl = (url: string) =>
  url.replace(/\/original=true\//, "/width=450/")

// A gallery entry worth prompting from: within the asked rating, from
// Civitai's image host, and carrying the prompt it was made with.
export function toExample(
  image: CivitaiImage,
  rating: ExampleRating = "None"
): CivitaiExample | null {
  const meta = image.meta
  if (!image.id || !image.url || !meta?.prompt) return null
  if (!allowedLevel(image.nsfwLevel, rating)) return null
  let host: string
  try {
    host = new URL(image.url).hostname
  } catch {
    return null
  }
  if (host !== "image.civitai.com") return null
  const stats = image.stats ?? {}
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? NaN))
  const steps = num(meta.steps)
  const cfg = num(meta.cfgScale)
  return {
    id: image.id,
    thumb: thumbUrl(image.url),
    width: image.width ?? 1,
    height: image.height ?? 1,
    level: image.nsfwLevel ?? "None",
    username: image.username ?? null,
    reactions:
      (stats.likeCount ?? 0) +
      (stats.heartCount ?? 0) +
      (stats.laughCount ?? 0),
    model: typeof meta.Model === "string" ? meta.Model : null,
    steps: Number.isFinite(steps) ? steps : null,
    cfg: Number.isFinite(cfg) ? cfg : null,
    sampler: typeof meta.sampler === "string" ? meta.sampler : null,
    meta: {
      prompt: String(meta.prompt).slice(0, 8_000),
      ...(typeof meta.negativePrompt === "string" && {
        negativePrompt: meta.negativePrompt.slice(0, 8_000),
      }),
      ...(Number.isFinite(num(meta.seed)) && { seed: num(meta.seed) }),
      ...(typeof meta.Size === "string" && { Size: meta.Size }),
      resources: metaLoras(meta)
        .filter((l, i, all) => all.findIndex((x) => x.name === l.name) === i)
        .map((l) => ({
          type: "lora",
          name: l.name,
          weight: l.strength,
        })),
    },
  }
}

// The prompt as words alone: the editor can't load another site's LoRAs, and
// their `<lora:…>` tags would only confuse the model.
export function plainPrompt(prompt: string) {
  return prompt
    .replace(/<lora:[^>]*>/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,(\s*,)+/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
}
