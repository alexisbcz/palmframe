import { describe, expect, test } from "bun:test"

import {
  ModelTooLarge,
  createModelStore,
  type ModelCache,
  type ModelCloud,
} from "./assets"

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer

function fakes(userId: string | null = "u1") {
  const local = new Map<string, ArrayBuffer>()
  const remote = new Map<string, ArrayBuffer>()
  const calls = { uploads: 0, exists: 0 }
  const state = { failUpload: false }
  const cache: ModelCache = {
    get: async (hash) => local.get(hash) ?? null,
    put: async (hash, bytes) => void local.set(hash, bytes),
  }
  const cloud: ModelCloud = {
    userId: async () => userId,
    exists: async (path) => {
      calls.exists += 1
      return remote.has(path)
    },
    upload: async (path, bytes) => {
      calls.uploads += 1
      if (state.failUpload) throw new Error("offline")
      remote.set(path, bytes)
    },
    download: async (path) => remote.get(path) ?? null,
  }
  return { local, remote, cache, cloud, calls, state }
}

const file = (text = "vrm bytes") => new File([text], "Hero.vrm")
const settle = () => new Promise((r) => setTimeout(r, 0))

describe("the model store", () => {
  test("keeps an upload in the browser and the owner's folder", async () => {
    const f = fakes()
    const { model, synced } = await createModelStore(f.cloud, f.cache).store(
      file()
    )
    expect(model.name).toBe("Hero")
    expect(synced).toBe(true)
    expect(f.local.has(model.hash)).toBe(true)
    expect([...f.remote.keys()]).toEqual([`u1/${model.hash}`])
  })

  test("a second device downloads the model, then keeps it", async () => {
    const f = fakes()
    const { model } = await createModelStore(f.cloud, f.cache).store(file())
    f.local.clear()
    const other = createModelStore(f.cloud, f.cache)
    const bytes = await other.read(model.hash)
    expect(new TextDecoder().decode(bytes!)).toBe("vrm bytes")
    expect(f.local.has(model.hash)).toBe(true)
  })

  test("a model only in this browser reaches the bucket once", async () => {
    const f = fakes()
    const store = createModelStore(f.cloud, f.cache)
    f.local.set("abc", bytesOf("old"))
    await store.read("abc")
    await store.read("abc")
    await settle()
    expect(f.calls.uploads).toBe(1)
    expect(f.calls.exists).toBe(1)
    expect(f.remote.has("u1/abc")).toBe(true)
  })

  test("doesn't upload what the bucket already has", async () => {
    const f = fakes()
    f.local.set("abc", bytesOf("old"))
    f.remote.set("u1/abc", bytesOf("old"))
    await createModelStore(f.cloud, f.cache).read("abc")
    await settle()
    expect(f.calls.uploads).toBe(0)
  })

  test("signed out, models stay in the browser", async () => {
    const f = fakes(null)
    const store = createModelStore(f.cloud, f.cache)
    const { model, synced } = await store.store(file())
    expect(synced).toBe(false)
    expect(f.remote.size).toBe(0)
    expect(await store.read(model.hash)).not.toBeNull()
    expect(await store.read("missing")).toBeNull()
  })

  test("a failed upload keeps the model and says so", async () => {
    const f = fakes()
    f.state.failUpload = true
    const { model, synced } = await createModelStore(f.cloud, f.cache).store(
      file()
    )
    expect(synced).toBe(false)
    expect(f.local.has(model.hash)).toBe(true)
  })

  test("a failed backfill is tried again", async () => {
    const f = fakes()
    const store = createModelStore(f.cloud, f.cache)
    f.local.set("abc", bytesOf("old"))
    f.state.failUpload = true
    await store.read("abc")
    await settle()
    f.state.failUpload = false
    await store.read("abc")
    await settle()
    expect(f.remote.has("u1/abc")).toBe(true)
  })

  test("reads the owner's folder, not another user's", async () => {
    const f = fakes("u2")
    f.remote.set("u1/abc", bytesOf("theirs"))
    expect(await createModelStore(f.cloud, f.cache).read("abc")).toBeNull()
  })

  test("refuses a model over the limit", async () => {
    const f = fakes()
    const big = new File([new Uint8Array(1)], "big.vrm")
    Object.defineProperty(big, "size", { value: 201 * 1024 * 1024 })
    await expect(
      createModelStore(f.cloud, f.cache).store(big)
    ).rejects.toBeInstanceOf(ModelTooLarge)
  })
})
