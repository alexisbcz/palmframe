// The local image lab: one render on this machine's ComfyUI, described by plain
// values so that a URL can carry all of it.

export interface LabLora {
  name: string
  strength: number
}

// Enough to mix styles, before each one costs noticeable memory and time.
export const MAX_LORAS = 6

export interface LabRequest {
  prompt: string
  negative: string
  model: string
  // Some checkpoints ship a tuned text encoder of their own.
  clip: string
  // Applied in order, each on top of the last.
  loras: LabLora[]
  seed: number
  width: number
  height: number
  steps: number
  cfg: number
  sampler: string
}

export const LAB_DEFAULTS: LabRequest = {
  prompt: "",
  negative: "worst quality, low quality, blurry, jpeg artifacts, bad anatomy",
  model: "anima-turbo-v1.1.safetensors",
  clip: "qwen_3_06b_base.safetensors",
  loras: [],
  seed: 0,
  width: 768,
  height: 1024,
  steps: 12,
  cfg: 1,
  sampler: "er_sde",
}

// Civitai names a checkpoint's encoder `<model>_txt.safetensors`.
export function pairedClip(model: string, clips: string[]) {
  const pair = model.replace(/\.safetensors$/i, "_txt.safetensors")
  return clips.includes(pair) ? pair : LAB_DEFAULTS.clip
}

const number = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value ?? NaN)
  return Number.isFinite(n) && value !== "" && value !== null
    ? Math.min(max, Math.max(min, n))
    : fallback
}

// ComfyUI's latents want multiples of 8; 16 keeps every model happy.
const side = (value: unknown, fallback: number) =>
  Math.round(number(value, 256, 2048, fallback) / 16) * 16

const text = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback

// `file.safetensors:0.8` in a URL, or a bare name at full strength.
function parseLora(value: string, fallback: number): LabLora {
  const at = value.lastIndexOf(":")
  const tail = at > 0 ? Number(value.slice(at + 1)) : NaN
  return Number.isFinite(tail)
    ? { name: value.slice(0, at), strength: number(tail, -2, 3, 1) }
    : { name: value, strength: fallback }
}

function toLoras(v: Record<string, unknown>, base: LabLora[]) {
  let found: LabLora[]
  if (Array.isArray(v.loras))
    found = v.loras.flatMap((l: Partial<LabLora>) =>
      typeof l?.name === "string"
        ? [{ name: l.name, strength: number(l.strength, -2, 3, 1) }]
        : []
    )
  else if (v.lora !== undefined) {
    const strength = number(v.strength, -2, 3, 1)
    found = [v.lora]
      .flat()
      .filter((l): l is string => typeof l === "string" && !!l)
      .map((l) => parseLora(l, strength))
  } else return base
  const names = new Set<string>()
  return found
    .filter((l) => !names.has(l.name) && !!names.add(l.name))
    .slice(0, MAX_LORAS)
}

export function toRequest(
  v: Record<string, unknown>,
  base: LabRequest = LAB_DEFAULTS
): LabRequest {
  return {
    prompt: text(v.prompt, base.prompt).slice(0, 8_000),
    negative: text(v.negative, base.negative).slice(0, 8_000),
    model: text(v.model, base.model),
    clip: text(v.clip, base.clip),
    loras: toLoras(v, base.loras),
    seed: Math.trunc(number(v.seed, 0, Number.MAX_SAFE_INTEGER, base.seed)),
    width: side(v.w ?? v.width, base.width),
    height: side(v.h ?? v.height, base.height),
    steps: Math.trunc(number(v.steps, 1, 80, base.steps)),
    cfg: number(v.cfg, 0, 20, base.cfg),
    sampler: text(v.sampler, base.sampler),
  }
}

// The link that brings this exact render back. Defaults stay out of it.
export function labQuery(r: LabRequest) {
  const q = new URLSearchParams()
  const add = (key: string, value: string | number, base: string | number) => {
    if (value !== base) q.set(key, String(value))
  }
  const d = LAB_DEFAULTS
  add("prompt", r.prompt, d.prompt)
  add("negative", r.negative, d.negative)
  add("model", r.model, d.model)
  add("clip", r.clip, d.clip)
  for (const l of r.loras)
    q.append("lora", l.strength === 1 ? l.name : `${l.name}:${l.strength}`)
  add("seed", r.seed, d.seed)
  add("w", r.width, d.width)
  add("h", r.height, d.height)
  add("steps", r.steps, d.steps)
  add("cfg", r.cfg, d.cfg)
  add("sampler", r.sampler, d.sampler)
  return q.toString()
}

const stem = (file: string) =>
  file
    .replace(/\.safetensors$/i, "")
    .split(/[\\/]/)
    .pop()!

const findLora = (name: string, installed: string[]) =>
  installed.find((f) => stem(f).toLowerCase() === stem(name).toLowerCase())

const tagPattern = () => /<lora:([^:>]+)(?::(-?[\d.]+))?>/gi

// `<lora:name:0.8>` in a prompt applies that LoRA. Models never see the tag.
export function splitPrompt(text: string, installed: string[]) {
  const tags: LabLora[] = []
  const unknown: string[] = []
  const prompt = text
    .replace(tagPattern(), (_, name: string, weight?: string) => {
      const file = findLora(name, installed)
      if (file) tags.push({ name: file, strength: number(weight, -2, 3, 1) })
      else unknown.push(name)
      return " "
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,(\s*,)+/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
  return { prompt, tags, unknown }
}

// A tag sets the strength of a LoRA already in the stack.
export function mergeLoras(stack: LabLora[], tags: LabLora[]) {
  const merged = stack.map((l) => tags.find((t) => t.name === l.name) ?? l)
  for (const t of tags)
    if (!merged.some((l) => l.name === t.name)) merged.push(t)
  return merged.slice(0, MAX_LORAS)
}

export interface PromptPart {
  text: string
  lora?: string
  unknown?: boolean
}

// The prompt cut into plain text, LoRA tags and their trigger words.
export function promptParts(
  text: string,
  installed: string[],
  active: string[],
  words: Record<string, string[]>
) {
  const triggers = new Map<string, string>()
  for (const file of active)
    for (const word of words[file] ?? [])
      if (word.trim()) triggers.set(word.toLowerCase(), file)
  const plain = (chunk: string) => {
    if (!triggers.size) return [{ text: chunk }]
    const escaped = [...triggers.keys()]
      .sort((a, b) => b.length - a.length)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    const parts: PromptPart[] = []
    let last = 0
    for (const m of chunk.matchAll(
      new RegExp(
        `(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`,
        "giu"
      )
    )) {
      if (m.index > last) parts.push({ text: chunk.slice(last, m.index) })
      parts.push({ text: m[0], lora: triggers.get(m[0].toLowerCase())! })
      last = m.index + m[0].length
    }
    if (last < chunk.length) parts.push({ text: chunk.slice(last) })
    return parts
  }
  const parts: PromptPart[] = []
  let last = 0
  for (const m of text.matchAll(tagPattern())) {
    if (m.index > last) parts.push(...plain(text.slice(last, m.index)))
    const file = findLora(m[1]!, installed)
    parts.push(
      file ? { text: m[0], lora: file } : { text: m[0], unknown: true }
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(...plain(text.slice(last)))
  return parts
}

// What's being typed at the caret, if it's a mention: `@sm` or `<lora:sm`.
export function mentionAt(text: string, caret: number) {
  const m = /(?:^|[\s,(])(@|<lora:)([^\s,<>:@]*)$/i.exec(text.slice(0, caret))
  if (!m) return null
  return { start: caret - m[1]!.length - m[2]!.length, query: m[2]! }
}

export function insertMention(
  text: string,
  start: number,
  caret: number,
  file: string,
  triggers: string[]
) {
  const present = text.toLowerCase()
  const words = triggers.filter((w) => !present.includes(w.toLowerCase()))
  const insert = `<lora:${stem(file)}:1>${words.length ? ` ${words.join(", ")}` : ""}, `
  return {
    text: text.slice(0, start) + insert + text.slice(caret),
    caret: start + insert.length,
  }
}

export function workflow(r: LabRequest) {
  // Each LoRA loads onto the model the one before it returned.
  const chain = r.loras.map((l, i) => ({
    id: String(20 + i),
    from: i ? String(19 + i) : "1",
    ...l,
  }))
  const tip = [chain.at(-1)?.id ?? "1", 0]
  const graph: Record<
    string,
    { class_type: string; inputs: Record<string, unknown> }
  > = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: r.model, weight_dtype: "default" },
    },
    "3": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: r.clip,
        type: "stable_diffusion",
        device: "default",
      },
    },
    "4": {
      class_type: "VAELoader",
      inputs: { vae_name: "qwen_image_vae.safetensors" },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["3", 0], text: r.prompt },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["3", 0], text: r.negative },
    },
    "7": {
      class_type: "EmptyLatentImage",
      inputs: { width: r.width, height: r.height, batch_size: 1 },
    },
    "13": {
      class_type: "CFGZeroStar",
      inputs: { model: tip },
    },
    "14": {
      class_type: "KSampler",
      inputs: {
        model: ["13", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["7", 0],
        seed: r.seed,
        steps: r.steps,
        cfg: r.cfg,
        sampler_name: r.sampler,
        scheduler: "simple",
        denoise: 1,
      },
    },
    "15": {
      class_type: "VAEDecode",
      inputs: { samples: ["14", 0], vae: ["4", 0] },
    },
    "16": {
      class_type: "SaveImage",
      inputs: { images: ["15", 0], filename_prefix: "lab" },
    },
  }
  for (const l of chain)
    graph[l.id] = {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: [l.from, 0],
        lora_name: l.name,
        strength_model: l.strength,
      },
    }
  return graph
}

const ID = /^\d{1,12}$/

// Which Civitai page a link points to. Only ever an id, so nothing a visitor
// types can steer where the server fetches from.
export function civitaiTarget(link: string) {
  if (ID.test(link)) return { kind: "image", id: link } as const
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (!/^(www\.)?civitai\.(com|red)$/.test(url.hostname)) return null
  const version = url.searchParams.get("modelVersionId")
  if (version && ID.test(version))
    return { kind: "version", id: version } as const
  const image = /^\/images\/(\d{1,12})/.exec(url.pathname)?.[1]
  return image ? ({ kind: "image", id: image } as const) : null
}

export interface CivitaiMeta {
  prompt?: string
  negativePrompt?: string
  seed?: number
  Size?: string
  resources?: { type?: string; name?: string; weight?: number }[]
  comfy?: unknown
}

const baseName = (file: string) =>
  file
    .replace(/\.safetensors$/i, "")
    .split(/[\\/]/)
    .pop()!
    .toLowerCase()

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

// Prompt, seed and size carry over. Steps, CFG and sampler don't: an image made
// on Anima Base at 30 steps would be ruined on Turbo by those numbers.
export function fromCivitai(meta: CivitaiMeta, installed: string[]) {
  const [width, height] = fitSize(meta.Size)
  const loras = metaLoras(meta)
  const match = (name: string) =>
    installed.find((file) => baseName(file) === baseName(name))
  const usable = loras.flatMap((l) => {
    const name = match(l.name)
    return name ? [{ name, strength: l.strength }] : []
  })
  return {
    values: {
      ...(meta.prompt && { prompt: meta.prompt }),
      ...(meta.negativePrompt && { negative: meta.negativePrompt }),
      ...(meta.seed !== undefined && { seed: meta.seed }),
      ...(width && { width }),
      ...(height && { height }),
      ...(usable.length && { loras: usable }),
    },
    missing: loras.filter((l) => !match(l.name)).map((l) => l.name),
  }
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

export interface ExampleQuery {
  base: CivitaiBase
  sort: (typeof EXAMPLE_SORTS)[number]
  period: (typeof EXAMPLE_PERIODS)[number]
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
    cursor: cursor && /^[\w:|.-]{1,80}$/.test(cursor) ? cursor : null,
  }
}

export interface CivitaiExample {
  id: number
  thumb: string
  width: number
  height: number
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

// A gallery entry worth prompting from: safe, from Civitai's image host, and
// carrying the prompt it was made with.
export function toExample(image: CivitaiImage): CivitaiExample | null {
  const meta = image.meta
  if (!image.id || !image.url || !meta?.prompt) return null
  if (image.nsfwLevel && image.nsfwLevel !== "None") return null
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
