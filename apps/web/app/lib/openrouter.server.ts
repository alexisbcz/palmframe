import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

import { supabaseAdmin } from "./supabase-admin.server"

// Bring your own OpenRouter account. A connected key pays for renders, edits
// and story plans instead of Palmframe credits; the local-only tools
// (upscale, cut-out, face fix, restyle) still cost credits.
const API = "https://openrouter.ai/api/v1"

// GPT Image is what Palmframe comics are drawn with; Sonnet plans stories.
export const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2"
export const DEFAULT_TEXT_MODEL = "anthropic/claude-sonnet-5.5"

export interface OpenRouterConnection {
  key: string
  hint: string
  enabled: boolean
  imageModel: string
  textModel: string
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

// AES-256-GCM under OPENROUTER_KEY_SECRET; the stored value is iv + data + tag.
function secret() {
  const s = process.env.OPENROUTER_KEY_SECRET?.trim()
  if (!s) throw new Error("OPENROUTER_KEY_SECRET must be set.")
  return createHash("sha256").update(s).digest()
}

export const openRouterAvailable = () =>
  !!process.env.OPENROUTER_KEY_SECRET?.trim() &&
  !!process.env.SUPABASE_SECRET_KEY?.trim()

function encrypt(key: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", secret(), iv)
  const data = Buffer.concat([cipher.update(key, "utf8"), cipher.final()])
  return Buffer.concat([iv, data, cipher.getAuthTag()]).toString("base64")
}

function decrypt(stored: string) {
  const raw = Buffer.from(stored, "base64")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secret(),
    raw.subarray(0, 12)
  )
  decipher.setAuthTag(raw.subarray(-16))
  return Buffer.concat([
    decipher.update(raw.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8")
}

export async function getConnection(
  userId: string
): Promise<OpenRouterConnection | null> {
  if (!openRouterAvailable()) return null
  const { data } = await supabaseAdmin()
    .from("openrouter_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) return null
  return {
    key: decrypt(data.key_ciphertext),
    hint: data.key_hint,
    enabled: data.enabled,
    imageModel: data.image_model,
    textModel: data.text_model,
  }
}

// The connection that pays for this person's work, if they turned it on.
export async function payingConnection(userId: string) {
  const c = await getConnection(userId)
  return c?.enabled ? c : null
}

export async function saveKey(userId: string, key: string) {
  const existing = await getConnection(userId)
  const { error } = await supabaseAdmin()
    .from("openrouter_connections")
    .upsert({
      user_id: userId,
      key_ciphertext: encrypt(key),
      key_hint: key.slice(-4),
      enabled: true,
      image_model: existing?.imageModel ?? DEFAULT_IMAGE_MODEL,
      text_model: existing?.textModel ?? DEFAULT_TEXT_MODEL,
      updated_at: new Date().toISOString(),
    })
  if (error) throw error
}

export async function updateSettings(
  userId: string,
  patch: { enabled?: boolean; imageModel?: string; textModel?: string }
) {
  const { error } = await supabaseAdmin()
    .from("openrouter_connections")
    .update({
      ...(patch.enabled !== undefined && { enabled: patch.enabled }),
      ...(patch.imageModel && { image_model: patch.imageModel }),
      ...(patch.textModel && { text_model: patch.textModel }),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
  if (error) throw error
}

export async function disconnect(userId: string) {
  const { error } = await supabaseAdmin()
    .from("openrouter_connections")
    .delete()
    .eq("user_id", userId)
  if (error) throw error
}

const headers = (key: string) => ({
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
  "HTTP-Referer": process.env.APP_URL ?? "https://palmframe.app",
  "X-Title": "Palmframe",
})

async function fail(res: Response): Promise<never> {
  const body = await res.json().catch(() => null)
  const message = body?.error?.message ?? `HTTP ${res.status}`
  throw new OpenRouterError(
    res.status === 402
      ? `Your OpenRouter account is out of credits: ${message}`
      : res.status === 401
        ? "OpenRouter rejected the key. Reconnect it in Settings."
        : `OpenRouter: ${message}`,
    res.status
  )
}

// The key's label and spend, to check it and show it in Settings.
export async function keyInfo(key: string, signal?: AbortSignal) {
  const res = await fetch(`${API}/key`, { headers: headers(key), signal })
  if (!res.ok) await fail(res)
  const { data } = (await res.json()) as {
    data: {
      label: string
      limit: number | null
      usage: number
      limit_remaining: number | null
      is_free_tier: boolean
    }
  }
  return data
}

// OAuth with PKCE: the browser goes to OpenRouter, comes back with a code,
// and the code plus the verifier kept in a cookie buys a key.
export function pkce() {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export function authUrl(callback: string, challenge: string) {
  const url = new URL("https://openrouter.ai/auth")
  url.searchParams.set("callback_url", callback)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("key_label", "Palmframe")
  return url.href
}

export async function exchangeCode(code: string, verifier: string) {
  const res = await fetch(`${API}/auth/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
  })
  if (!res.ok) await fail(res)
  const { key } = (await res.json()) as { key: string }
  return key
}

export interface ModelOption {
  id: string
  name: string
  // What sets it apart in the picker: references taken, or context size.
  refs?: number
  context?: number
  // USD per million tokens, for text models.
  price?: { input: number; output: number }
  created: number
}

// Both lists change rarely; kept an hour.
const lists = new Map<string, { at: number; models: ModelOption[] }>()
async function cached(key: string, load: () => Promise<ModelOption[]>) {
  const hit = lists.get(key)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.models
  const models = await load()
  if (models.length) lists.set(key, { at: Date.now(), models })
  return models
}

// The models people can pick from: image models that take reference images,
// so cast model sheets and edits work.
export function imageModels() {
  return cached("image", async () => {
    const res = await fetch(`${API}/images/models`)
    if (!res.ok) return []
    const { data } = (await res.json()) as {
      data: {
        id: string
        name?: string
        created?: number
        architecture?: { input_modalities?: string[] }
        supported_parameters?: { input_references?: { max?: number } }
      }[]
    }
    return data
      .filter((m) => m.architecture?.input_modalities?.includes("image"))
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        refs: m.supported_parameters?.input_references?.max,
        created: m.created ?? 0,
      }))
  })
}

// Story planning asks for JSON against a schema, so only models that
// support structured outputs.
export function textModels() {
  return cached("text", async () => {
    const res = await fetch(`${API}/models`)
    if (!res.ok) return []
    const { data } = (await res.json()) as {
      data: {
        id: string
        name?: string
        created?: number
        context_length?: number
        architecture?: { output_modalities?: string[] }
        pricing?: { prompt?: string; completion?: string }
        supported_parameters?: string[]
      }[]
    }
    const perMillion = (v?: string) => Math.max(0, Number(v ?? 0) * 1e6)
    return data
      .filter(
        (m) =>
          m.architecture?.output_modalities?.includes("text") &&
          m.supported_parameters?.includes("structured_outputs")
      )
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        context: m.context_length,
        price: {
          input: perMillion(m.pricing?.prompt),
          output: perMillion(m.pricing?.completion),
        },
        created: m.created ?? 0,
      }))
  })
}

// Aspect ratios each model accepts, from its endpoints. Kept an hour.
const ratios = new Map<string, { at: number; values: string[] }>()

async function aspectRatios(model: string) {
  const hit = ratios.get(model)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.values
  const res = await fetch(`${API}/images/models/${model}/endpoints`).catch(
    () => null
  )
  const body = res?.ok
    ? ((await res.json()) as {
        endpoints?: {
          supported_parameters?: { aspect_ratio?: { values?: string[] } }
        }[]
      })
    : null
  const values = [
    ...new Set(
      (body?.endpoints ?? []).flatMap(
        (e) => e.supported_parameters?.aspect_ratio?.values ?? []
      )
    ),
  ].filter((v) => /^\d+:\d+$/.test(v))
  ratios.set(model, { at: Date.now(), values })
  return values
}

// The closest ratio the model knows; the client crops to the exact shape.
async function nearestRatio(model: string, width: number, height: number) {
  const values = await aspectRatios(model)
  const target = Math.log(width / height)
  let best: string | undefined
  let gap = Infinity
  for (const v of values) {
    const [w, h] = v.split(":").map(Number)
    const d = Math.abs(Math.log(w! / h!) - target)
    if (d < gap) [best, gap] = [v, d]
  }
  return best
}

export interface ImageRequest {
  prompt: string
  width: number
  height: number
  // Data URLs or http URLs, in the order the prompt refers to them.
  refs: string[]
}

export async function generateImage(
  c: OpenRouterConnection,
  r: ImageRequest,
  signal?: AbortSignal
) {
  const aspect = await nearestRatio(c.imageModel, r.width, r.height)
  const res = await fetch(`${API}/images`, {
    method: "POST",
    headers: headers(c.key),
    signal,
    body: JSON.stringify({
      model: c.imageModel,
      prompt: r.prompt,
      ...(aspect && { aspect_ratio: aspect }),
      ...(r.refs.length && {
        input_references: r.refs.map((url) => ({
          type: "image_url",
          image_url: { url },
        })),
      }),
    }),
  })
  if (!res.ok) await fail(res)
  const body = (await res.json()) as {
    data?: { b64_json?: string; media_type?: string }[]
    usage?: { cost?: number }
  }
  const image = body.data?.[0]
  if (!image?.b64_json)
    throw new OpenRouterError("OpenRouter returned no image.", 502)
  return {
    bytes: Buffer.from(image.b64_json, "base64"),
    type: image.media_type ?? "image/png",
    cost: body.usage?.cost ?? null,
  }
}

// One chat call whose reply must match `schema`. `image`, a data URL, goes
// along with the user text; the connected text model has to read images.
export async function completeJson(
  c: OpenRouterConnection,
  r: {
    system: string
    user: string
    schema: object
    image?: string
    images?: string[]
  },
  signal?: AbortSignal
) {
  const images = r.images ?? (r.image ? [r.image] : [])
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: headers(c.key),
    signal,
    body: JSON.stringify({
      model: c.textModel,
      messages: [
        { role: "system", content: r.system },
        {
          role: "user",
          content: images.length
            ? [
                ...images.map((url) => ({
                  type: "image_url",
                  image_url: { url },
                })),
                { type: "text", text: r.user },
              ]
            : r.user,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "result", strict: true, schema: r.schema },
      },
      max_tokens: 16_000,
    }),
  })
  if (!res.ok) await fail(res)
  const body = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[]
  }
  const choice = body.choices?.[0]
  if (choice?.finish_reason === "length")
    throw new OpenRouterError(
      "The plan came back cut short; try a shorter story.",
      502
    )
  const text = choice?.message?.content
  if (!text) throw new OpenRouterError("OpenRouter returned no plan.", 502)
  return JSON.parse(text) as unknown
}

// An OpenRouter render as the same response the local routes return, marked
// so the client knows no credits moved.
export async function imageResponse(
  c: OpenRouterConnection,
  r: ImageRequest & { seed: number },
  signal: AbortSignal
): Promise<Response> {
  const t0 = performance.now()
  try {
    const image = await generateImage(c, r, signal)
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "content-type": image.type,
        "x-render-ms": String(Math.round(performance.now() - t0)),
        "x-seed": String(r.seed),
        "x-billed": "openrouter",
        "x-model": c.imageModel,
        ...(image.cost !== null && { "x-openrouter-cost": String(image.cost) }),
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    if (signal.aborted)
      return Response.json({ error: "Cancelled" }, { status: 499 })
    const status =
      e instanceof OpenRouterError ? (e.status === 402 ? 402 : 502) : 502
    return Response.json(
      {
        error: e instanceof Error ? e.message : String(e),
        ...(status === 402 && { code: "openrouter_credits" }),
      },
      { status }
    )
  }
}
