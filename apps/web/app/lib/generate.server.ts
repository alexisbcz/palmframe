import { type Operation } from "./credits"
import { kleinAvailable, renderKlein } from "./klein.server"

// Renders a comic panel with Anima Turbo through a local ComfyUI.
// Same model stack as ~/palmframe/livepose, without the pose adapter.
const COMFY = process.env.COMFY_URL ?? "http://127.0.0.1:8188"
const TIMEOUT_MS = 180_000

export interface GenerateRequest {
  prompt: string
  negative: string
  width: number
  height: number
  seed: number
  steps: number
  // "klein" draws with FLUX.2 Klein from `refs` (character model sheets),
  // for faces and outfits that hold from panel to panel.
  engine: "anima" | "klein"
  refs: string[]
}

function workflow(r: GenerateRequest) {
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
      inputs: { clip: ["3", 0], text: r.negative },
    },
    "7": {
      class_type: "EmptyLatentImage",
      inputs: { width: r.width, height: r.height, batch_size: 1 },
    },
    "13": { class_type: "CFGZeroStar", inputs: { model: ["1", 0] } },
    "14": {
      class_type: "KSampler",
      inputs: {
        model: ["13", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["7", 0],
        seed: r.seed,
        steps: r.steps,
        cfg: 1,
        sampler_name: "er_sde",
        scheduler: "simple",
        denoise: 1,
      },
    },
    "15": {
      class_type: "VAEDecode",
      inputs: { samples: ["14", 0], vae: ["4", 0] },
    },
    "16": { class_type: "PreviewImage", inputs: { images: ["15", 0] } },
  }
}

export function parse(body: unknown): GenerateRequest | null {
  const b = body as Partial<GenerateRequest>
  const int = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Math.round(v)))
      : null
  const width = int(b?.width, 256, 1536)
  const height = int(b?.height, 256, 1536)
  const seed = int(b?.seed, 0, 2 ** 32 - 1)
  const steps = int(b?.steps, 1, 30)
  if (
    typeof b?.prompt !== "string" ||
    !b.prompt.trim() ||
    !width ||
    !height ||
    seed === null ||
    !steps
  ) {
    return null
  }
  return {
    prompt: b.prompt,
    negative: typeof b.negative === "string" ? b.negative : "",
    // The latent is 8x downscaled and patched, so keep sides on a 64px grid.
    width: Math.round(width / 64) * 64,
    height: Math.round(height / 64) * 64,
    seed,
    steps,
    engine: b.engine === "klein" ? "klein" : "anima",
    refs: Array.isArray(b.refs)
      ? b.refs.filter((x): x is string => typeof x === "string").slice(0, 4)
      : [],
  }
}

export const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

// What a request costs, from what it asks for: sheets are Klein without
// references, reference panels are Klein with them.
export function operation(r: GenerateRequest): Operation {
  if (r.engine === "klein") return r.refs.length ? "panel_ref" : "sheet"
  return "panel"
}


export async function render(
  r: GenerateRequest,
  request: Request
): Promise<Response> {
  const t0 = performance.now()
  if (r.engine === "klein") {
    if (!kleinAvailable())
      return error(
        "FLUX.2 Klein is not installed: install mflux (uv tool install mflux), or set MFLUX_BIN.",
        501
      )
    try {
      const png = await renderKlein(r, request.signal)
      return new Response(new Uint8Array(png), {
        headers: {
          "content-type": "image/png",
          "x-render-ms": String(Math.round(performance.now() - t0)),
          "x-seed": String(r.seed),
          "cache-control": "no-store",
        },
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return error(message, message === "Cancelled" ? 499 : 502)
    }
  }

  let queued: Response
  try {
    queued = await fetch(`${COMFY}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: workflow(r) }),
    })
  } catch {
    return error(
      `ComfyUI is not reachable at ${COMFY}. Start it, or set COMFY_URL.`,
      502
    )
  }
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
    if (h.status?.status_str === "error") {
      return error(
        `ComfyUI failed: ${JSON.stringify(h.status.messages?.at(-1) ?? h.status)}`,
        502
      )
    }
    const img = h.outputs?.["16"]?.images?.[0]
    if (!img) continue
    const qs = new URLSearchParams({
      filename: img.filename,
      subfolder: img.subfolder,
      type: img.type,
    })
    const file = await fetch(`${COMFY}/view?${qs}`)
    return new Response(file.body, {
      headers: {
        "content-type": file.headers.get("content-type") ?? "image/png",
        "x-render-ms": String(Math.round(performance.now() - t0)),
        "x-seed": String(r.seed),
        "cache-control": "no-store",
      },
    })
  }
  return error("Timed out waiting for ComfyUI.", 504)
}
