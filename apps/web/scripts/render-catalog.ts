// Draws the official catalog's images into public/catalog with Pruna. Skips
// what exists, so it can be rerun after adding assets or to fill in failures.
//   bun --env-file=.env scripts/render-catalog.ts
import { existsSync, mkdirSync } from "node:fs"

import { assetPrompt, sheetPrompt } from "../app/components/catalog/prompts"
import { dominantColor, RATIO } from "../app/components/catalog/model"
import { SEED, seedImage } from "../app/components/catalog/seed"
import type { Look } from "../app/components/comic-canvas/model"

// Run with bun, whose types the app doesn't load.
declare const Bun: any

const API = "https://api.pruna.ai/v1"
const KEY = process.env.PRUNA_API_KEY
if (!KEY) throw new Error("PRUNA_API_KEY must be set.")

const OUT = "public/catalog"
const COLORS = "app/components/catalog/seed-colors.json"
mkdirSync(OUT, { recursive: true })

const ASPECT = (ratio: number) =>
  ratio > 1.2 ? "3:2" : ratio < 0.9 ? "3:4" : "1:1"

async function predict(model: string, input: object) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/predictions`, {
      method: "POST",
      headers: {
        apikey: KEY!,
        Model: model,
        "Try-Sync": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({ input }),
    })
    const json = (await res.json()) as {
      generation_url?: string
      message?: string
    }
    if (json.generation_url) {
      const file = await fetch(json.generation_url, {
        headers: { apikey: KEY! },
      })
      if (file.ok) return new Uint8Array(await file.arrayBuffer())
    }
    if (attempt === 2) throw new Error(json.message ?? `HTTP ${res.status}`)
    await new Promise((r) => setTimeout(r, 2000))
  }
}

async function upload(bytes: Uint8Array) {
  const form = new FormData()
  form.append(
    "content",
    new Blob([bytes as BlobPart], { type: "image/jpeg" }),
    "ref.jpg"
  )
  const res = await fetch(`${API}/files`, {
    method: "POST",
    headers: { apikey: KEY! },
    body: form,
  })
  const json = (await res.json()) as { id?: string; urls?: { get?: string } }
  if (!json.id) throw new Error(`Upload failed (${res.status})`)
  return json.urls?.get ?? `${API}/files/${json.id}`
}

async function webp(bytes: Uint8Array, path: string, width: number) {
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-y",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vf",
      `scale=${width}:-2`,
      "-quality",
      "78",
      path,
    ],
    { stdin: bytes, stderr: "inherit" }
  )
  if ((await proc.exited) !== 0) throw new Error(`ffmpeg failed for ${path}`)
}

async function jpeg(path: string) {
  const proc = Bun.spawn(
    ["ffmpeg", "-loglevel", "error", "-i", path, "-f", "mjpeg", "pipe:1"],
    { stdout: "pipe" }
  )
  return new Uint8Array(await new Response(proc.stdout).arrayBuffer())
}

async function colorOf(path: string) {
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-loglevel",
      "error",
      "-i",
      path,
      "-vf",
      "scale=32:32",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { stdout: "pipe" }
  )
  return dominantColor(
    new Uint8Array(await new Response(proc.stdout).arrayBuffer())
  )
}

const words = (tags: string[]) => tags.join(", ")
const failures: string[] = []
let drawn = 0

async function draw(s: (typeof SEED)[number]) {
  const look: Look = {
    style: s.art ?? "graphic",
    palette: null,
    saturation: "balanced",
    ...(s.payload.type === "look" && s.payload.look),
    ...(s.payload.type === "look" && { recipe: s.payload.recipe }),
  }
  const text = s.scene ?? ("tags" in s.payload ? words(s.payload.tags) : "")
  const cover = `${OUT}/${s.id}.webp`
  const sheet = `${OUT}/${s.id}-sheet.webp`
  const needsSheet = s.payload.type === "character"
  if (existsSync(cover) && (!needsSheet || existsSync(sheet))) return
  if (!existsSync(cover)) {
    const image = await predict("p-image", {
      prompt: assetPrompt(s.scene ? "story" : s.kind, { words: text }, look),
      aspect_ratio: ASPECT(RATIO[s.kind]),
    })
    await webp(image, cover, s.kind === "location" ? 1024 : 720)
    drawn++
  }
  if (needsSheet) {
    const file = await upload(await jpeg(cover))
    const edited = await predict("p-image-edit", {
      prompt: sheetPrompt(
        s.kind === "creature" ? "creature" : "person",
        text,
        look
      ),
      images: [file],
      aspect_ratio: "3:2",
    })
    await webp(edited, sheet, 1280)
    drawn++
  }
  console.log("drew", s.id)
}

const queue = SEED.filter(seedImage)
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift())
      await draw(s).catch((e) => {
        failures.push(s!.id)
        console.error("failed", s!.id, e.message)
      })
  })
)

const colors: Record<string, string> = {}
for (const s of SEED.filter(seedImage)) {
  const path = `${OUT}/${s.id}.webp`
  if (existsSync(path)) colors[s.id] = await colorOf(path)
}
await Bun.write(COLORS, `${JSON.stringify(colors, null, 2)}\n`)
console.log(`${drawn} images drawn, ${failures.length} failed`, failures)
