import type { AssetRef } from "./scene"

// Uploaded 3D models stay in this browser: a VRM runs to tens of MB, and the
// `comics` bucket only takes images. A set refers to one by its content hash.
const DB = "palmframe-set-assets"
const STORE = "models"
const MAX_BYTES = 200 * 1024 * 1024

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

export class ModelTooLarge extends Error {}

export async function storeModel(file: File): Promise<AssetRef> {
  if (file.size > MAX_BYTES) throw new ModelTooLarge()
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const hash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  await run("readwrite", (store) => store.put(bytes, hash))
  return { hash, name: file.name.replace(/\.[^.]+$/, "") }
}

// Null when the model was uploaded in another browser.
export async function readModel(hash: string) {
  const bytes = await run<ArrayBuffer | undefined>("readonly", (store) =>
    store.get(hash)
  )
  return bytes ?? null
}
