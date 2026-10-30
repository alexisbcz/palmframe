import { COSTS, type Operation } from "@/lib/credits"
import { kleinAvailable, renderKlein } from "@/lib/klein.server"
import { IMAGE_MODELS } from "@/lib/image-models"
import { imageResponse, payingConnection } from "@/lib/openrouter.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.edit"

// Edits a panel's image. "edit" follows an instruction with FLUX.2 Klein;
// "vary" (img2img) and "inpaint" (masked) redraw it with Anima Turbo
// through ComfyUI. The client crops, scales and pastes back: the server
// only sees the pixels to redraw, at the size to render.
const COMFY = process.env.COMFY_URL ?? "http://127.0.0.1:8188"
const TIMEOUT_MS = 120_000
// Klein edit with one reference: ~35 s at 0.6 MP warm on the M4 Pro,
// ~73 s at 1.5 MP. Stay under a minute.
const KLEIN_MAX_AREA = 1024 * 640
// Lettering is done in the canvas, never generated.
const NO_TEXT =
  "No text, no letters, no speech bubbles, no captions, no panel borders."
const NO_TEXT_TAGS = "text, speech bubble, letters, watermark, signature"

export type EditMode = "edit" | "vary" | "inpaint"
export type EditKind = "edit" | "vary" | "inpaint" | "erase" | "outpaint"

export interface EditRequest {
  mode: EditMode
  // What the ledger calls it; inpaint covers erase and outpaint too.
  kind: EditKind
  // Data URLs. The mask is white where the image is redrawn.
  image: string
  mask?: string
  prompt: string
  negative: string
  width: number
  height: number
  seed: number
  steps: number
  // How far img2img and inpaint move from the image: 0 to 1.
  strength: number
}

const MAX_DATA_URL = 16_000_000

function parse(body: unknown): EditRequest | null {
  const b = body as Partial<EditRequest>
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : null
  const dataUrl = (v: unknown) =>
    typeof v === "string" &&
    v.startsWith("data:image/") &&
    v.length < MAX_DATA_URL
      ? v
      : null
  const mode = (["edit", "vary", "inpaint"] as const).find((m) => m === b?.mode)
  const image = dataUrl(b?.image)
  const width = num(b?.width, 256, 1536)
  const height = num(b?.height, 256, 1536)
  const seed = num(b?.seed, 0, 2 ** 32 - 1)
  if (!mode || !image || !width || !height || seed === null) return null
  if (typeof b.prompt !== "string" || (mode === "edit" && !b.prompt.trim()))
    return null
  const mask = dataUrl(b.mask) ?? undefined
  if (mode === "inpaint" && !mask) return null
  const kind: EditKind =
    mode === "inpaint"
      ? b.kind === "erase" || b.kind === "outpaint"
        ? b.kind
        : "inpaint"
      : mode
  let w = width
  let h = height
  if (mode === "edit" && w * h > KLEIN_MAX_AREA) {
    const s = Math.sqrt(KLEIN_MAX_AREA / (w * h))
    w *= s
    h *= s
  }
  // The latent is 8x downscaled and patched, so keep sides on a 64px grid.
  const snap = (n: number) => Math.max(256, Math.floor(n / 64) * 64)
  return {
    mode,
    kind,
    image,
    mask,
    prompt: b.prompt.slice(0, 4000),
    negative: typeof b.negative === "string" ? b.negative.slice(0, 2000) : "",
    width: snap(w),
    height: snap(h),
    seed: Math.round(seed),
    steps: Math.round(num(b.steps, 1, 30) ?? 8),
    strength: num(b.strength, 0.05, 1) ?? 0.5,
  }
}

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

// Same contract as /api/generate: signed in, charged before the render and
// refunded if it fails; signed out, only allowed off Vercel.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const r = parse(await request.json().catch(() => null))
  if (!r)
    return error(
      "Invalid request: mode, image (data URL), width, height, seed, and a prompt for edits or a mask for inpaint are required.",
      400
    )
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) {
    if (process.env.VERCEL) return error("Sign in to edit.", 401)
    return render(r, request)
  }

  // A connected OpenRouter account pays instead of credits.
  const openrouter = await payingConnection(viewer.id)
  if (openrouter)
    return imageResponse(openrouter, viaOpenRouter(r), request.signal)

  const job = crypto.randomUUID()
  const op: Operation = r.kind
  const spent = await supabase.rpc("spend_credits", {
    p_cost: COSTS[op],
    p_kind: op,
    p_job: job,
  })
  if (spent.error)
    return spent.error.code === "P0402"
      ? Response.json(
          { error: spent.error.message, code: "insufficient_credits" },
          { status: 402 }
        )
      : error(`Could not charge credits: ${spent.error.message}`, 500)

  let res: Response
  try {
    res = await render(r, request)
  } catch (e) {
    res = error(e instanceof Error ? e.message : String(e), 500)
  }
  if (res.ok) {
    res.headers.set("x-credits", String(spent.data))
    return res
  }
  const refunded = await supabase.rpc("refund_credits", { p_job: job })
  if (!refunded.error) res.headers.set("x-credits", String(refunded.data))
  return res
}

// OpenRouter models edit from reference images, not latents: the panel goes
// first, the mask second, and the prompt says what to change. The client
// still pastes back through the mask, so pixels outside it stay put.
function viaOpenRouter(r: EditRequest) {
  const keep =
    "Keep the same composition, framing, characters, art style, line work and colors."
  const base = { width: r.width, height: r.height, seed: r.seed }
  if (r.mode === "edit")
    return {
      ...base,
      prompt: `${r.prompt.trim().replace(/\.?$/, ".")} Keep everything else exactly the same. ${keep} ${NO_TEXT}`,
      refs: [r.image],
    }
  if (r.mode === "vary")
    return {
      ...base,
      prompt: `Redraw this image as a ${r.strength < 0.35 ? "very close" : r.strength < 0.65 ? "close" : "loose"} variation: ${r.strength < 0.65 ? "same scene and poses, small changes in details" : "same scene, free to change poses, angle and details"}. ${keep}${r.prompt.trim() ? ` The scene: ${r.prompt.trim()}` : ""} ${NO_TEXT}`,
      refs: [r.image],
    }
  const what =
    r.kind === "erase"
      ? "the background only, with the object removed as if it was never there"
      : r.kind === "outpaint"
        ? "a natural continuation of the picture beyond its edges"
        : r.prompt.trim()
  return {
    ...base,
    prompt: `The second image is a black and white mask of the first. Redraw only the white area of the first image so it shows ${what}. Leave the black area exactly as it is, and match its art style, lighting and colors so the change blends in. ${NO_TEXT}`,
    refs: [r.image, r.mask!],
  }
}

const png = (bytes: BodyInit | null, t0: number, r: EditRequest) =>
  new Response(bytes, {
    headers: {
      "content-type": "image/png",
      "x-render-ms": String(Math.round(performance.now() - t0)),
      "x-seed": String(r.seed),
      "x-model": IMAGE_MODELS[r.mode === "edit" ? "klein" : "anima"],
      "cache-control": "no-store",
    },
  })

async function render(r: EditRequest, request: Request): Promise<Response> {
  const t0 = performance.now()
  if (r.mode === "edit") {
    if (!kleinAvailable())
      return error(
        "FLUX.2 Klein is not installed: install mflux (uv tool install mflux), or set MFLUX_BIN.",
        501
      )
    try {
      const out = await renderKlein(
        {
          prompt: `${r.prompt.trim().replace(/\.?$/, ".")} Keep everything else exactly the same: same composition, framing, characters, art style, line work and colors. ${NO_TEXT}`,
          width: r.width,
          height: r.height,
          seed: r.seed,
          refs: [r.image],
        },
        request.signal
      )
      return png(new Uint8Array(out), t0, r)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return error(message, message === "Cancelled" ? 499 : 502)
    }
  }

  let image: string
  let mask: string | undefined
  try {
    image = await upload(r.image)
    if (r.mask) mask = await upload(r.mask)
  } catch {
    return error(
      `ComfyUI is not reachable at ${COMFY}. Start it, or set COMFY_URL.`,
      502
    )
  }
  const queued = await fetch(`${COMFY}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow(r, image, mask) }),
  })
  const body = await queued.json()
  if (!queued.ok)
    return error(
      `ComfyUI rejected the job: ${JSON.stringify(body.node_errors ?? body.error ?? body)}`,
      502
    )
  const id = body.prompt_id as string

  while (performance.now() - t0 < TIMEOUT_MS) {
    if (request.signal.aborted) {
      await fetch(`${COMFY}/queue`, {
        method: "POST",
        body: JSON.stringify({ delete: [id] }),
      }).catch(() => {})
      return error("Cancelled", 499)
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
    const h = (await (await fetch(`${COMFY}/history/${id}`)).json())[id]
    if (!h) continue
    if (h.status?.status_str === "error")
      return error(
        `ComfyUI failed: ${JSON.stringify(h.status.messages?.at(-1) ?? h.status)}`,
        502
      )
    const img = h.outputs?.["16"]?.images?.[0]
    if (!img) continue
    const qs = new URLSearchParams({
      filename: img.filename,
      subfolder: img.subfolder,
      type: img.type,
    })
    const file = await fetch(`${COMFY}/view?${qs}`)
    return png(file.body, t0, r)
  }
  return error("Timed out waiting for ComfyUI.", 504)
}

// Into ComfyUI's temp folder, which it empties on start, not its inputs.
async function upload(dataUrl: string) {
  const comma = dataUrl.indexOf(",")
  const type = dataUrl.slice(5, dataUrl.indexOf(";"))
  const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64")
  const form = new FormData()
  form.append(
    "image",
    new Blob([bytes], { type }),
    `palmframe-edit-${crypto.randomUUID()}.${type.split("/")[1] ?? "png"}`
  )
  form.append("type", "temp")
  form.append("overwrite", "true")
  const res = await fetch(`${COMFY}/upload/image`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const { name } = (await res.json()) as { name: string }
  return `${name} [temp]`
}

// Anima Turbo from an image: the same stack as /api/generate, with the
// image encoded as the starting latent. With a mask, only the masked part
// is noised, and differential diffusion follows the mask's soft edge.
function workflow(r: EditRequest, image: string, mask?: string) {
  const masked = !!mask
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: "anima-turbo-v1.1.safetensors",
        weight_dtype: "default",
      },
    },
    "3": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen_3_06b_base.safetensors",
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
      inputs: {
        clip: ["3", 0],
        text: [r.negative, NO_TEXT_TAGS].filter(Boolean).join(", "),
      },
    },
    "20": { class_type: "LoadImage", inputs: { image } },
    "21": {
      class_type: "ImageScale",
      inputs: {
        image: ["20", 0],
        upscale_method: "lanczos",
        width: r.width,
        height: r.height,
        crop: "disabled",
      },
    },
    "22": {
      class_type: "VAEEncode",
      inputs: { pixels: ["21", 0], vae: ["4", 0] },
    },
    ...(masked && {
      "23": {
        class_type: "LoadImageMask",
        inputs: { image: mask, channel: "red" },
      },
      "24": {
        class_type: "SetLatentNoiseMask",
        inputs: { samples: ["22", 0], mask: ["23", 0] },
      },
      "25": {
        class_type: "DifferentialDiffusion",
        inputs: { model: ["13", 0] },
      },
    }),
    "13": { class_type: "CFGZeroStar", inputs: { model: ["1", 0] } },
    "14": {
      class_type: "KSampler",
      inputs: {
        model: masked ? ["25", 0] : ["13", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: masked ? ["24", 0] : ["22", 0],
        seed: r.seed,
        steps: r.steps,
        cfg: 1,
        sampler_name: "er_sde",
        scheduler: "simple",
        denoise: r.strength,
      },
    },
    "15": {
      class_type: "VAEDecode",
      inputs: { samples: ["14", 0], vae: ["4", 0] },
    },
    "16": { class_type: "PreviewImage", inputs: { images: ["15", 0] } },
  }
}
