import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { workflow, type CivitaiMeta, type LabRequest } from "./model"

const COMFY = process.env.COMFY_URL ?? "http://127.0.0.1:8188"
const COMFY_DIR = process.env.COMFY_DIR ?? join(homedir(), "ComfyUI")
const RENDER_MS = 300_000

// Local means served to this machine. The lab can start processes and spends
// the laptop's GPU, so it stays off any deployment, and a page on another site
// can't reach it through the visitor's browser.
export function allowed(request: Request) {
  if (process.env.VERCEL) return false
  const url = new URL(request.url)
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) return false
  const origin = request.headers.get("origin")
  return !origin || new URL(origin).host === url.host
}

async function list(folder: string) {
  const res = await fetch(`${COMFY}/models/${folder}`, {
    signal: AbortSignal.timeout(1_500),
  })
  return (await res.json()) as string[]
}

export async function installed() {
  try {
    const [models, loras] = await Promise.all([
      list("diffusion_models"),
      list("loras"),
    ])
    return { running: true, models, loras }
  } catch {
    return { running: false, models: [] as string[], loras: [] as string[] }
  }
}

export function startComfy() {
  const python = join(COMFY_DIR, ".venv/bin/python")
  if (!existsSync(python)) return false
  spawn(python, ["main.py", "--listen", "127.0.0.1", "--port", "8188"], {
    cwd: COMFY_DIR,
    detached: true,
    stdio: "ignore",
  }).unref()
  return true
}

export async function render(r: LabRequest, signal: AbortSignal) {
  const t0 = performance.now()
  const queued = await fetch(`${COMFY}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow(r) }),
  })
  const body = await queued.json()
  if (!queued.ok)
    throw new Error(
      JSON.stringify(body.node_errors ?? body.error ?? body).slice(0, 600)
    )
  const id = body.prompt_id as string
  while (performance.now() - t0 < RENDER_MS) {
    if (signal.aborted) {
      await fetch(`${COMFY}/queue`, {
        method: "POST",
        body: JSON.stringify({ delete: [id] }),
      }).catch(() => {})
      await fetch(`${COMFY}/interrupt`, { method: "POST" }).catch(() => {})
      throw new Error("Cancelled")
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
    const h = (await (await fetch(`${COMFY}/history/${id}`)).json())[id]
    if (!h) continue
    if (h.status?.status_str === "error")
      throw new Error(JSON.stringify(h.status.messages?.at(-1)).slice(0, 600))
    const image = h.outputs?.["16"]?.images?.[0]
    if (!image) continue
    const file = await fetch(
      `${COMFY}/view?${new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder,
        type: image.type,
      })}`
    )
    return {
      file,
      name: image.filename as string,
      ms: Math.round(performance.now() - t0),
    }
  }
  throw new Error("ComfyUI took too long.")
}

// What Civitai says publicly about an image or a model version. Null when it
// isn't shared there, which is common.
export async function civitaiMeta(target: {
  kind: "image" | "version"
  id: string
}): Promise<CivitaiMeta | null> {
  const url =
    target.kind === "version"
      ? `https://civitai.com/api/v1/model-versions/${target.id}`
      : `https://civitai.com/api/v1/images?imageId=${target.id}&nsfw=true`
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) return null
  const body = (await res.json()) as {
    images?: { meta?: CivitaiMeta | null }[]
    items?: { meta?: CivitaiMeta | null }[]
  }
  const list = body.images ?? body.items ?? []
  return list.find((i) => i.meta?.prompt || i.meta?.comfy)?.meta ?? null
}
