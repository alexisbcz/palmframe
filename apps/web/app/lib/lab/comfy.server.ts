import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import {
  mkdir,
  open,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { Readable } from "node:stream"

import {
  toExample,
  workflow,
  type CivitaiExample,
  type CivitaiMeta,
  type ExampleQuery,
  type LabRequest,
} from "./model"
import { graphRequest, pngPrompt } from "./png"

const COMFY = process.env.COMFY_URL ?? "http://127.0.0.1:8188"
const COMFY_DIR = process.env.COMFY_DIR ?? join(homedir(), "ComfyUI")
// Base models at full steps take minutes on a laptop.
const RENDER_MS = 1_200_000

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
    const [models, loras, clips] = await Promise.all([
      list("diffusion_models"),
      list("loras"),
      list("text_encoders"),
    ])
    return { running: true, models, loras, clips }
  } catch {
    const none: string[] = []
    return { running: false, models: none, loras: none, clips: none }
  }
}

const OUTPUT = join(COMFY_DIR, "output")
const RENDER_FILE = /^lab_\d+_\.png$/
const MAX_RENDERS = 60

export interface Render {
  file: string
  at: number
  settings: LabRequest
}

// Past renders, newest first, each with the settings its file carries.
export async function renders(): Promise<Render[]> {
  const files = await readdir(OUTPUT).catch(() => [] as string[])
  const dated = await Promise.all(
    files
      .filter((f) => RENDER_FILE.test(f))
      .map(async (file) => ({
        file,
        at: (await stat(join(OUTPUT, file))).mtimeMs,
      }))
  )
  dated.sort((a, b) => b.at - a.at)
  const found = await Promise.all(
    dated.slice(0, MAX_RENDERS).map(async (r) => {
      const handle = await open(join(OUTPUT, r.file))
      const head = new Uint8Array(256 * 1024)
      const { bytesRead } = await handle.read(head, 0, head.length, 0)
      await handle.close()
      const settings = graphRequest(pngPrompt(head.subarray(0, bytesRead)))
      return settings ? { ...r, settings } : []
    })
  )
  return found.flat()
}

// By exact name only, so a request can't walk out of the folder.
export function renderFile(file: string) {
  if (!RENDER_FILE.test(file) || !existsSync(join(OUTPUT, file))) return null
  return Readable.toWeb(
    createReadStream(join(OUTPUT, file))
  ) as unknown as ReadableStream
}

const WORDS_FILE = join(COMFY_DIR, "user", "lab-lora-words.json")

async function fileHash(path: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

// What each LoRA is called in a prompt, asked of Civitai by file hash once and
// kept. A LoRA it doesn't know is remembered as having no words.
export async function loraWords(loras: string[]) {
  const known = (await readFile(WORDS_FILE, "utf8")
    .then(JSON.parse)
    .catch(() => ({}))) as Record<string, string[]>
  const missing = loras.filter((l) => !known[l])
  if (!missing.length) return known
  await Promise.all(
    missing.map(async (file) => {
      try {
        const hash = await fileHash(join(COMFY_DIR, "models/loras", file))
        const res = await fetch(
          `https://civitai.com/api/v1/model-versions/by-hash/${hash}`,
          { signal: AbortSignal.timeout(6_000) }
        )
        if (res.status === 404) known[file] = []
        else if (res.ok) {
          const body = (await res.json()) as { trainedWords?: string[] }
          known[file] = (body.trainedWords ?? []).slice(0, 8)
        }
      } catch {
        // Offline: left out, so the next visit asks again.
      }
    })
  )
  await mkdir(join(COMFY_DIR, "user"), { recursive: true })
  await writeFile(WORDS_FILE, JSON.stringify(known, null, 2))
  return known
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

// Only Cancel stops a render. A reload drops the page's request, and minutes of
// GPU time shouldn't go with it: the image still lands in the output folder.
export async function cancelRender() {
  await fetch(`${COMFY}/queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clear: true }),
  }).catch(() => {})
  await fetch(`${COMFY}/interrupt`, { method: "POST" }).catch(() => {})
}

export async function render(r: LabRequest) {
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
    await new Promise((resolve) => setTimeout(resolve, 300))
    const h = (await (await fetch(`${COMFY}/history/${id}`)).json())[id]
    if (!h) continue
    if (h.status?.status_str === "error")
      throw new Error(JSON.stringify(h.status.messages?.at(-1)).slice(0, 600))
    const image = h.outputs?.["16"]?.images?.[0]
    if (!image) continue
    return {
      file: image.filename as string,
      ms: Math.round(performance.now() - t0),
    }
  }
  throw new Error("ComfyUI took too long.")
}

// Civitai answers without a key. One raises its rate limit, and is optional.
function civitaiHeaders(): HeadersInit {
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

// What Civitai says publicly about an image or a model version. Null when it
// isn't shared there, which is common.
export async function civitaiMeta(target: {
  kind: "image" | "version"
  id: string
}): Promise<CivitaiMeta | null> {
  const url =
    target.kind === "version"
      ? `https://civitai.com/api/v1/model-versions/${target.id}`
      : `https://civitai.com/api/v1/images?imageId=${target.id}&nsfw=true&withMeta=true`
  const res = await fetch(url, {
    headers: civitaiHeaders(),
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) return null
  const body = (await res.json()) as {
    images?: { meta?: CivitaiMeta | null }[]
    items?: { meta?: CivitaiMeta | null }[]
  }
  const list = body.images ?? body.items ?? []
  return list.find((i) => i.meta?.prompt || i.meta?.comfy)?.meta ?? null
}
