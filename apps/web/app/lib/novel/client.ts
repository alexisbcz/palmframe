import { strToU8, zipSync } from "fflate"

import { uploadDataUrl } from "@/lib/cloud"
import { NOVEL_AUDIO_BUCKET } from "@/lib/database"
import type { Supabase } from "@/lib/supabase.browser"

import { keyPixels, opaqueBounds } from "./chroma"
import type { Novel, Track } from "./model"
import { assetUrl } from "./paper"
import { exportRenpy } from "./renpy"
import { renderRecipe, toWav } from "./synth"

// Everything the editor does outside the document: drawing, uploading, saving.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number
  ) {
    super(message)
  }
}

async function failure(res: Response) {
  const body = (await res.json().catch(() => null)) as {
    error?: string
    code?: string
  } | null
  return new ApiError(
    body?.error ?? `Failed (${res.status})`,
    body?.code,
    res.status
  )
}

export async function writeRequest<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch("/api/novels/write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as T
}

export async function drawRequest(
  body: {
    prompt: string
    width: number
    height: number
    seed: number
    refs?: string[]
  },
  signal?: AbortSignal
) {
  const res = await fetch("/api/novels/art", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw await failure(res)
  const credits = res.headers.get("x-credits")
  return { image: await res.blob(), credits: credits ? Number(credits) : null }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not read the image."))
    img.src = src
  })
}

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Could not read the file."))
    reader.readAsDataURL(blob)
  })
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Could not encode the image.")),
      type,
      quality
    )
  )
}

// Any picture as a data URL, no longer than `maxSide`, optionally with its flat
// background lifted off.
export async function prepareImage(
  source: Blob | string,
  {
    maxSide = 1920,
    cutOut = false,
  }: { maxSide?: number; cutOut?: boolean } = {}
) {
  const url = typeof source === "string" ? source : URL.createObjectURL(source)
  try {
    const img = await loadImage(url)
    const scale = Math.min(
      1,
      maxSide / Math.max(img.naturalWidth, img.naturalHeight)
    )
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    let canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, w, h)
    if (cutOut) {
      const data = ctx.getImageData(0, 0, w, h)
      keyPixels(data.data, w, h)
      ctx.putImageData(data, 0, 0)
      const box = opaqueBounds(data.data, w, h)
      if (box) {
        const crop = document.createElement("canvas")
        crop.width = box.right - box.left + 1
        crop.height = h - box.top
        crop.getContext("2d")!.drawImage(canvas, -box.left, -box.top)
        canvas = crop
      }
    }
    return toDataUrl(await canvasBlob(canvas, "image/webp", 0.92))
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url)
  }
}

export interface Storage {
  image: (dataUrl: string) => Promise<string>
  audio: (blob: Blob) => Promise<string>
}

// Signed in, files go to the buckets. In a local draft they stay inline.
export function storageFor(
  supabase: Supabase | null,
  userId: string | null
): Storage {
  if (!supabase || !userId) return { image: async (d) => d, audio: toDataUrl }
  return {
    image: (d) => uploadDataUrl(supabase, userId, d),
    async audio(blob) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await blob.arrayBuffer()
      )
      const hash = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      const ext = blob.type.split("/")[1]?.split(";")[0] ?? "bin"
      const path = `${userId}/${hash}.${ext}`
      const bucket = supabase.storage.from(NOVEL_AUDIO_BUCKET)
      const { error } = await bucket.upload(path, blob, {
        contentType: blob.type.split(";")[0],
        cacheControl: "31536000",
      })
      if (error && !/exists|duplicate/i.test(error.message)) throw error
      return bucket.getPublicUrl(path).data.publicUrl
    },
  }
}

// A local draft, in IndexedDB because inline images overflow localStorage.
const DB = "palmframe-novels"
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore("drafts")
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

export async function saveDraft(novel: Novel) {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite")
    tx.objectStore("drafts").put(novel, "draft")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadDraft(): Promise<unknown> {
  const db = await open()
  const value = await new Promise<unknown>((resolve, reject) => {
    const req = db.transaction("drafts").objectStore("drafts").get("draft")
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return value
}

async function rasterize(url: string, width: number, height: number) {
  const img = await loadImage(assetUrl(url))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height)
  return new Uint8Array(
    await (await canvasBlob(canvas, "image/png")).arrayBuffer()
  )
}

async function fileBytes(source: string) {
  const res = await fetch(source)
  if (!res.ok) throw new Error(`Could not fetch ${source}`)
  return new Uint8Array(await res.arrayBuffer())
}

export function saveFile(
  name: string,
  bytes: Uint8Array | string,
  type: string
) {
  const blob = new Blob([bytes as BlobPart], { type })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// A Ren'Py project folder as a zip: open it from the Ren'Py launcher.
export async function renpyZip(
  novel: Novel,
  onProgress?: (done: number, total: number) => void
) {
  const { script, files } = exportRenpy(novel)
  const zip: Record<string, Uint8Array> = {
    "game/script.rpy": strToU8(script),
    "README.txt": strToU8(
      `${novel.title}\n\nPut this folder in your Ren'Py projects directory, then pick it in the Ren'Py launcher.\n`
    ),
  }
  let done = 0
  for (const f of files) {
    onProgress?.(done++, files.length)
    const path = `game/${f.path}`
    if (f.recipe) {
      const track = novel.tracks.find((t: Track) => t.id === f.recipe)!
      zip[path] = toWav(await renderRecipe(track.recipe!))
    } else if (f.source.startsWith("flat:")) {
      zip[path] = await rasterize(f.source, 1920, 1080)
    } else if (f.source.startsWith("paper:")) {
      zip[path] = await rasterize(f.source, 720, 1200)
    } else zip[path] = await fileBytes(f.source)
  }
  onProgress?.(files.length, files.length)
  return zipSync(zip, { level: 1 })
}
