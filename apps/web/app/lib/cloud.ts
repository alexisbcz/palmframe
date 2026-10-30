import { pageDoc, type ComicProject } from "@/components/comic-canvas/model"
import { renderToBlob, type ImageCache } from "@/components/comic-canvas/render"

import { COMICS_BUCKET } from "./database"
import type { Supabase } from "./supabase.browser"

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// Data URL -> public URL, shared by every save in this tab.
const uploaded = new Map<string, Promise<string>>()

// Stores an inline image once, under its content hash, and returns its URL.
export function uploadDataUrl(supabase: Supabase, userId: string, dataUrl: string) {
  let pending = uploaded.get(dataUrl)
  if (!pending) {
    pending = (async () => {
      const blob = await (await fetch(dataUrl)).blob()
      const path = `${userId}/images/${await sha256(blob)}.${EXT[blob.type] ?? "png"}`
      const bucket = supabase.storage.from(COMICS_BUCKET)
      const { error } = await bucket.upload(path, blob, {
        contentType: blob.type,
        cacheControl: "31536000",
      })
      // Same hash, same bytes: an existing file is the one we wanted.
      if (error && !/exists|duplicate/i.test(error.message)) throw error
      return bucket.getPublicUrl(path).data.publicUrl
    })()
    pending.catch(() => uploaded.delete(dataUrl))
    uploaded.set(dataUrl, pending)
  }
  return pending
}

function collectDataUrls(value: unknown, found: Set<string>) {
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) found.add(value)
  } else if (Array.isArray(value)) {
    for (const v of value) collectDataUrls(v, found)
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectDataUrls(v, found)
  }
}

function replaceStrings(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === "string") return map.get(value) ?? value
  if (Array.isArray(value)) return value.map((v) => replaceStrings(v, map))
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceStrings(v, map)])
    )
  return value
}

// The project as stored: every inline image (panels, portraits) moved to
// the bucket, so rows stay small and images load from a CDN.
export async function withStoredImages(
  supabase: Supabase,
  userId: string,
  project: ComicProject
): Promise<ComicProject> {
  const found = new Set<string>()
  collectDataUrls(project, found)
  if (!found.size) return project
  const map = new Map<string, string>()
  await Promise.all(
    [...found].map(async (d) =>
      map.set(d, await uploadDataUrl(supabase, userId, d))
    )
  )
  return replaceStrings(project, map) as ComicProject
}

// A small JPEG of the first slide for the projects list.
export async function uploadCover(
  supabase: Supabase,
  userId: string,
  projectId: string,
  project: ComicProject,
  images: ImageCache
) {
  const doc = pageDoc(project, 0)
  const blob = await renderToBlob(
    doc,
    images,
    "image/jpeg",
    360 / doc.width,
    0.8
  )
  if (!blob) return null
  const path = `${userId}/covers/${projectId}.jpg`
  const bucket = supabase.storage.from(COMICS_BUCKET)
  const { error } = await bucket.upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "60",
    upsert: true,
  })
  if (error) throw error
  return `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
}
