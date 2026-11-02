import { COMIC_MODELS_BUCKET } from "@/lib/database"
import type { Supabase } from "@/lib/supabase.browser"

import type { AssetRef } from "./scene"

// Uploaded 3D models live in the owner's private folder of the bucket, so they
// follow them across devices, and in IndexedDB, so a VRM of tens of MB downloads
// once per browser. A set refers to one by its content hash. Signed out, or
// offline, the browser's copy is the only one.
const DB = "palmframe-set-assets"
const STORE = "models"
const MAX_BYTES = 200 * 1024 * 1024
const CONTENT_TYPE = "application/octet-stream"

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
) {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export interface ModelCache {
  get(hash: string): Promise<ArrayBuffer | null>
  put(hash: string, bytes: ArrayBuffer): Promise<void>
}

export interface ModelCloud {
  // Null when signed out.
  userId(): Promise<string | null>
  exists(path: string): Promise<boolean>
  upload(path: string, bytes: ArrayBuffer): Promise<void>
  download(path: string): Promise<ArrayBuffer | null>
}

const browserCache: ModelCache = {
  get: async (hash) =>
    (await run<ArrayBuffer | undefined>("readonly", (s) => s.get(hash))) ??
    null,
  put: async (hash, bytes) => {
    await run("readwrite", (s) => s.put(bytes, hash))
  },
}

export function supabaseModels(supabase: Supabase): ModelCloud {
  const bucket = supabase.storage.from(COMIC_MODELS_BUCKET)
  return {
    userId: async () =>
      (await supabase.auth.getSession()).data.session?.user.id ?? null,
    exists: async (path) => (await bucket.exists(path)).data === true,
    upload: async (path, bytes) => {
      const { error } = await bucket.upload(path, bytes, {
        contentType: CONTENT_TYPE,
        cacheControl: "31536000",
      })
      // Same hash, same bytes: an existing file is the one we wanted.
      if (error && !/exists|duplicate/i.test(error.message)) throw error
    },
    download: async (path) => {
      const { data } = await bucket.download(path)
      return data ? data.arrayBuffer() : null
    },
  }
}

export class ModelTooLarge extends Error {}

async function hashOf(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export interface ModelStore {
  store(file: File): Promise<{ model: AssetRef; synced: boolean }>
  // Null when neither this browser nor the owner's folder has it.
  read(hash: string): Promise<ArrayBuffer | null>
}

export function createModelStore(
  cloud: ModelCloud,
  cache: ModelCache = browserCache
): ModelStore {
  const pathOf = (userId: string, hash: string) => `${userId}/${hash}`

  // Models uploaded before the bucket existed get there the first time they're
  // opened. Once per hash, per tab: checking costs a request.
  const checked = new Set<string>()
  const backfill = async (hash: string, bytes: ArrayBuffer) => {
    if (checked.has(hash)) return
    checked.add(hash)
    const userId = await cloud.userId()
    if (!userId) return
    const path = pathOf(userId, hash)
    if (!(await cloud.exists(path))) await cloud.upload(path, bytes)
  }

  return {
    async store(file) {
      if (file.size > MAX_BYTES) throw new ModelTooLarge()
      const bytes = await file.arrayBuffer()
      const hash = await hashOf(bytes)
      await cache.put(hash, bytes)
      const model = { hash, name: file.name.replace(/\.[^.]+$/, "") }
      // A failed upload shouldn't cost the user the model they just added.
      const synced = await (async () => {
        const userId = await cloud.userId()
        if (!userId) return false
        await cloud.upload(pathOf(userId, hash), bytes)
        checked.add(hash)
        return true
      })().catch(() => false)
      return { model, synced }
    },
    async read(hash) {
      const local = await cache.get(hash).catch(() => null)
      if (local) {
        void backfill(hash, local).catch(() => checked.delete(hash))
        return local
      }
      const userId = await cloud.userId()
      if (!userId) return null
      const bytes = await cloud.download(pathOf(userId, hash))
      if (bytes) await cache.put(hash, bytes).catch(() => {})
      return bytes
    },
  }
}
