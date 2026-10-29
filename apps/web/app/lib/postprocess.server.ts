import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

// Post-processing of a panel's image through the local ComfyUI: upscale,
// background removal, face enhance and restyle. Each takes image bytes and
// gives back a PNG. Local only, like api.generate.
const COMFY = process.env.COMFY_URL ?? "http://127.0.0.1:8188"
const COMFY_DIR = process.env.COMFY_DIR ?? join(homedir(), "ComfyUI")
const PYTHON = process.env.COMFY_PYTHON ?? join(COMFY_DIR, ".venv/bin/python")
const FACE_MODEL =
  process.env.FACE_MODEL ??
  join(COMFY_DIR, "models/detection/anime_face_detect_v1.4_s.onnx")
const DETECT = join(process.cwd(), "scripts/detect-faces.py")
export const UPSCALE_MODEL =
  process.env.UPSCALE_MODEL ?? "RealESRGAN_x4plus_anime_6B.pth"
export const BG_MODEL = process.env.BG_MODEL ?? "birefnet.safetensors"
const TIMEOUT_MS = 120_000

// The longest side an upscale may reach, and what it starts from at most:
// the 6-block ESRGAN stays well under a minute on an M4 Pro at this size.
const MAX_SIDE = 4096
const MAX_UPSCALE_INPUT = 1280
// Anima's img2img resolution: ~0.6 MP, like a fresh panel.
const RESTYLE_AREA = 640 * 960
// Faces are redrawn at 640 px and 6 steps: four faces fit in ~40 s.
const FACE_SIZE = 640
const FACE_STEPS = 6
const MAX_FACES = 4

export type PostprocessOp = "upscale" | "remove_bg" | "face_fix" | "restyle"

export interface PostprocessRequest {
  op: PostprocessOp
  // A data URL or an http(s) URL (the storage bucket).
  image: string
  scale: 2 | 4
  // img2img denoise for face_fix and restyle.
  strength: number
  prompt: string
  negative: string
  seed: number
}

export class PostprocessError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export async function imageBytes(src: string) {
  if (src.startsWith("data:"))
    return Buffer.from(src.slice(src.indexOf(",") + 1), "base64")
  if (!/^https?:\/\//.test(src))
    throw new PostprocessError("The image must be a data or http URL.", 400)
  const res = await fetch(src)
  if (!res.ok)
    throw new PostprocessError(
      `Could not fetch the image (${res.status}).`,
      502
    )
  return Buffer.from(await res.arrayBuffer())
}

// Width and height from a PNG, JPEG or WebP header.
export function imageSize(b: Buffer): { width: number; height: number } {
  if (b.readUInt32BE(0) === 0x89504e47)
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = b.toString("ascii", 12, 16)
    if (chunk === "VP8X")
      return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 }
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    return {
      width: b.readUInt16LE(26) & 0x3fff,
      height: b.readUInt16LE(28) & 0x3fff,
    }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i < b.length) {
      if (b[i] !== 0xff) break
      const marker = b[i + 1]!
      const length = b.readUInt16BE(i + 2)
      // Start-of-frame markers, except DHT, JPG and DAC.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      )
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
      i += 2 + length
    }
  }
  throw new PostprocessError("Unsupported image: use PNG, JPEG or WebP.", 400)
}

const snap = (n: number) => Math.max(256, Math.round(n / 64) * 64)

// Uploaded under input/palmframe; ComfyUI has no delete, so names are unique.
async function upload(bytes: Buffer) {
  const form = new FormData()
  form.append(
    "image",
    new Blob([new Uint8Array(bytes)]),
    `${crypto.randomUUID()}.png`
  )
  form.append("subfolder", "palmframe")
  form.append("type", "input")
  let res: Response
  try {
    res = await fetch(`${COMFY}/upload/image`, { method: "POST", body: form })
  } catch {
    throw new PostprocessError(
      `ComfyUI is not reachable at ${COMFY}. Start it, or set COMFY_URL.`,
      502
    )
  }
  if (!res.ok)
    throw new PostprocessError(
      `ComfyUI refused the image (${res.status}).`,
      502
    )
  const { name, subfolder } = (await res.json()) as {
    name: string
    subfolder: string
  }
  return subfolder ? `${subfolder}/${name}` : name
}

type Workflow = Record<string, { class_type: string; inputs: object }>

// Queues a workflow and waits for the image of node "out".
async function run(workflow: Workflow, signal: AbortSignal) {
  const t0 = performance.now()
  const queued = await fetch(`${COMFY}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  })
  const body = await queued.json()
  if (!queued.ok)
    throw new PostprocessError(
      `ComfyUI rejected the job: ${JSON.stringify(body.node_errors ?? body.error ?? body)}`,
      502
    )
  const id = body.prompt_id as string
  while (performance.now() - t0 < TIMEOUT_MS) {
    if (signal.aborted) {
      await fetch(`${COMFY}/queue`, {
        method: "POST",
        body: JSON.stringify({ delete: [id] }),
      }).catch(() => {})
      await fetch(`${COMFY}/interrupt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt_id: id }),
      }).catch(() => {})
      throw new PostprocessError("Cancelled", 499)
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
    const h = (await (await fetch(`${COMFY}/history/${id}`)).json())[id]
    if (!h) continue
    if (h.status?.status_str === "error")
      throw new PostprocessError(
        `ComfyUI failed: ${JSON.stringify(h.status.messages?.at(-1) ?? h.status)}`,
        502
      )
    const img = h.outputs?.out?.images?.[0]
    if (!img) continue
    const qs = new URLSearchParams({
      filename: img.filename,
      subfolder: img.subfolder,
      type: img.type,
    })
    const file = await fetch(`${COMFY}/view?${qs}`)
    return Buffer.from(await file.arrayBuffer())
  }
  throw new PostprocessError("Timed out waiting for ComfyUI.", 504)
}

// Anima Turbo, as in api.generate.
function anima(prompt: string, negative: string): Workflow {
  return {
    unet: {
      class_type: "UNETLoader",
      inputs: {
        unet_name: "anima-turbo-v1.1.safetensors",
        weight_dtype: "default",
      },
    },
    clip: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen_3_06b_base.safetensors",
        type: "stable_diffusion",
        device: "default",
      },
    },
    vae: {
      class_type: "VAELoader",
      inputs: { vae_name: "qwen_image_vae.safetensors" },
    },
    pos: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["clip", 0], text: prompt },
    },
    neg: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["clip", 0], text: negative },
    },
    model: { class_type: "CFGZeroStar", inputs: { model: ["unet", 0] } },
  }
}

// Encode, denoise and decode an image node; adds nodes under `key`.
function img2img(
  w: Workflow,
  key: string,
  image: [string, number],
  seed: number,
  strength: number,
  steps = 8
): [string, number] {
  w[`${key}_enc`] = {
    class_type: "VAEEncode",
    inputs: { pixels: image, vae: ["vae", 0] },
  }
  w[`${key}_ks`] = {
    class_type: "KSampler",
    inputs: {
      model: ["model", 0],
      positive: ["pos", 0],
      negative: ["neg", 0],
      latent_image: [`${key}_enc`, 0],
      seed,
      steps,
      cfg: 1,
      sampler_name: "er_sde",
      scheduler: "simple",
      denoise: strength,
    },
  }
  w[`${key}_dec`] = {
    class_type: "VAEDecode",
    inputs: { samples: [`${key}_ks`, 0], vae: ["vae", 0] },
  }
  return [`${key}_dec`, 0]
}

const load = (name: string) => ({
  class_type: "LoadImage",
  inputs: { image: name },
})
const scale = (image: [string, number], width: number, height: number) => ({
  class_type: "ImageScale",
  inputs: { image, upscale_method: "lanczos", width, height, crop: "disabled" },
})
const output = (images: [string, number]) => ({
  class_type: "PreviewImage",
  inputs: { images },
})

// Anime ESRGAN at 4x, then down to the asked scale. Transparency is kept:
// LoadImage's mask is the inverted alpha, which is what JoinImageWithAlpha
// expects.
export async function upscale(
  bytes: Buffer,
  factor: 2 | 4,
  signal: AbortSignal
) {
  const { width, height } = imageSize(bytes)
  const side = Math.max(width, height)
  const target = Math.min(factor, MAX_SIDE / side)
  if (target < 1.25)
    throw new PostprocessError(
      "This image is already as large as it gets.",
      400
    )
  const pre = Math.min(1, MAX_UPSCALE_INPUT / side)
  const w: Workflow = {
    in: load(await upload(bytes)),
    pre: scale(["in", 0], Math.round(width * pre), Math.round(height * pre)),
    esrgan: {
      class_type: "UpscaleModelLoader",
      inputs: { model_name: UPSCALE_MODEL },
    },
    up: {
      class_type: "ImageUpscaleWithModel",
      inputs: { upscale_model: ["esrgan", 0], image: ["pre", 0] },
    },
    fit: scale(
      ["up", 0],
      Math.round(width * target),
      Math.round(height * target)
    ),
    alpha: {
      class_type: "JoinImageWithAlpha",
      inputs: { image: ["fit", 0], alpha: ["in", 1] },
    },
    out: output(["alpha", 0]),
  }
  return run(w, signal)
}

// BiRefNet cut-out: a PNG with the background transparent.
export async function removeBackground(bytes: Buffer, signal: AbortSignal) {
  imageSize(bytes)
  const w: Workflow = {
    in: load(await upload(bytes)),
    bg: {
      class_type: "LoadBackgroundRemovalModel",
      inputs: { bg_removal_name: BG_MODEL },
    },
    mask: {
      class_type: "RemoveBackground",
      inputs: { bg_removal_model: ["bg", 0], image: ["in", 0] },
    },
    // RemoveBackground gives the subject as 1; JoinImageWithAlpha inverts.
    inv: { class_type: "InvertMask", inputs: { mask: ["mask", 0] } },
    alpha: {
      class_type: "JoinImageWithAlpha",
      inputs: { image: ["in", 0], alpha: ["inv", 0] },
    },
    out: output(["alpha", 0]),
  }
  return run(w, signal)
}

export const faceToolAvailable = () =>
  existsSync(PYTHON) && existsSync(FACE_MODEL) && existsSync(DETECT)

interface Face {
  x: number
  y: number
  width: number
  height: number
}

async function detectFaces(bytes: Buffer, signal: AbortSignal) {
  const dir = await mkdtemp(join(tmpdir(), "faces-"))
  try {
    const path = join(dir, "in.png")
    await writeFile(path, bytes)
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(PYTHON, ["-I", DETECT, FACE_MODEL, path, "0.3"], {
        signal,
      })
      let out = ""
      let err = ""
      child.stdout.on("data", (d) => (out += d))
      child.stderr.on("data", (d) => (err += d))
      child.on("error", reject)
      child.on("close", (code) =>
        code === 0
          ? resolve(out)
          : reject(
              new PostprocessError(`Face detection failed: ${err.trim()}`, 502)
            )
      )
    })
    return (JSON.parse(stdout) as { faces: Face[] }).faces
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// The ADetailer method: find faces, redraw each from a padded square crop
// at Anima's resolution, and paste it back with feathered edges.
export async function enhanceFaces(r: PostprocessRequest, signal: AbortSignal) {
  if (!faceToolAvailable())
    throw new PostprocessError(
      "Face enhance needs ComfyUI's Python and the anime face model (models/detection/anime_face_detect_v1.4_s.onnx).",
      501
    )
  const bytes = await imageBytes(r.image)
  const { width, height } = imageSize(bytes)
  const faces = (await detectFaces(bytes, signal))
    .filter((f) => Math.min(f.width, f.height) >= 16)
    .slice(0, MAX_FACES)
  if (!faces.length) throw new PostprocessError("No faces found.", 422)

  const w: Workflow = {
    ...anima(
      [r.prompt, "face focus, detailed face, detailed eyes"]
        .filter(Boolean)
        .join(", "),
      r.negative
    ),
    in: load(await upload(bytes)),
  }
  let canvas: [string, number] = ["in", 0]
  faces.forEach((f, i) => {
    // A square 1.6x the face, slid back inside the image.
    const side = Math.min(
      Math.round(Math.max(f.width, f.height) * 1.6),
      width,
      height
    )
    const x = Math.round(
      Math.min(width - side, Math.max(0, f.x + f.width / 2 - side / 2))
    )
    const y = Math.round(
      Math.min(height - side, Math.max(0, f.y + f.height / 2 - side / 2))
    )
    const size = Math.min(896, Math.max(FACE_SIZE, snap(side)))
    const k = `f${i}`
    w[`${k}_crop`] = {
      class_type: "ImageCrop",
      inputs: { image: ["in", 0], width: side, height: side, x, y },
    }
    w[`${k}_up`] = scale([`${k}_crop`, 0], size, size)
    const drawn = img2img(
      w,
      k,
      [`${k}_up`, 0],
      r.seed + i,
      r.strength,
      FACE_STEPS
    )
    w[`${k}_down`] = scale(drawn, side, side)
    const feather = Math.round(side * 0.15)
    w[`${k}_solid`] = {
      class_type: "SolidMask",
      inputs: { value: 1, width: side, height: side },
    }
    w[`${k}_mask`] = {
      class_type: "FeatherMask",
      inputs: {
        mask: [`${k}_solid`, 0],
        left: feather,
        top: feather,
        right: feather,
        bottom: feather,
      },
    }
    w[`${k}_paste`] = {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: canvas,
        source: [`${k}_down`, 0],
        x,
        y,
        resize_source: false,
        mask: [`${k}_mask`, 0],
      },
    }
    canvas = [`${k}_paste`, 0]
  })
  w.out = output(canvas)
  return { png: await run(w, signal), faces: faces.length }
}

// Redraws the whole image with Anima at ~0.6 MP, keeping its aspect ratio.
export async function restyle(r: PostprocessRequest, signal: AbortSignal) {
  const bytes = await imageBytes(r.image)
  const { width, height } = imageSize(bytes)
  const ratio = Math.min(4, Math.max(0.25, width / height))
  const rw = Math.min(1536, snap(Math.sqrt(RESTYLE_AREA * ratio)))
  const rh = Math.min(
    1536,
    snap(RESTYLE_AREA / Math.sqrt(RESTYLE_AREA * ratio))
  )
  const w: Workflow = {
    ...anima(r.prompt, r.negative),
    in: load(await upload(bytes)),
    fit: scale(["in", 0], rw, rh),
  }
  w.out = output(img2img(w, "re", ["fit", 0], r.seed, r.strength))
  return run(w, signal)
}
