import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  API,
  OpenRouterError,
  completeJson,
  fail,
  generateImage,
  headers,
  type OpenRouterConnection,
} from "@/lib/openrouter.server"

import { VOICES, type VideoModel } from "./model"

export interface Direction {
  cast: { name: string; description: string; voice: string }[]
  shots: {
    index: number
    skip: boolean
    action: string
    duration: number
    movement: string
    light: string
    lines: { speaker: string; text: string; delivery: string }[]
  }[]
}

export interface VideoRequest {
  model: string
  prompt: string
  firstFrame: string
  duration: number
  resolution: string
  aspect: string
  audio: boolean
  seed: number
}

export type VideoPoll =
  | { status: "working" }
  | { status: "done"; cost: number | null }
  | { status: "failed"; error: string }

export interface Provider {
  direct(r: {
    system: string
    user: string
    schema: object
    images: string[]
  }): Promise<Direction>
  keyframe(r: {
    prompt: string
    width: number
    height: number
    refs: string[]
  }): Promise<{ bytes: Uint8Array; type: string }>
  speech(r: {
    model: string
    text: string
    voice: string
    delivery: string
  }): Promise<Uint8Array>
  submit(r: VideoRequest): Promise<string>
  poll(job: string): Promise<VideoPoll>
  download(job: string): Promise<Uint8Array>
}

interface ListedVideoModel {
  id: string
  name?: string
  supported_durations?: number[] | null
  supported_resolutions?: string[] | null
  supported_aspect_ratios?: string[] | null
  supported_frame_images?: string[] | null
  generate_audio?: boolean | null
  pricing_skus?: Record<string, string> | null
}

// A first frame is the whole idea here, so nothing else qualifies.
export const toVideoModels = (data: ListedVideoModel[]): VideoModel[] =>
  data
    .filter((m) => m.supported_frame_images?.includes("first_frame"))
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      durations: m.supported_durations ?? [],
      resolutions: m.supported_resolutions ?? [],
      aspects: m.supported_aspect_ratios ?? [],
      audio: m.generate_audio === true,
      skus: m.pricing_skus ?? {},
    }))

let models: { at: number; list: VideoModel[] } | null = null

export async function videoModels() {
  if (models && Date.now() - models.at < 3_600_000) return models.list
  const res = await fetch(`${API}/videos/models`)
  if (!res.ok) return models?.list ?? []
  const { data } = (await res.json()) as { data: ListedVideoModel[] }
  const list = toVideoModels(data)
  if (list.length) models = { at: Date.now(), list }
  return list
}

export function videoBody(r: VideoRequest) {
  return {
    model: r.model,
    prompt: r.prompt,
    duration: r.duration,
    resolution: r.resolution,
    aspect_ratio: r.aspect,
    generate_audio: r.audio,
    seed: r.seed,
    frame_images: [
      {
        type: "image_url",
        image_url: { url: r.firstFrame },
        frame_type: "first_frame",
      },
    ],
  }
}

export function readPoll(body: {
  status?: string
  error?: string
  usage?: { cost?: number | null }
}): VideoPoll {
  if (body.status === "completed")
    return { status: "done", cost: body.usage?.cost ?? null }
  if (
    body.status === "failed" ||
    body.status === "cancelled" ||
    body.status === "expired"
  )
    return { status: "failed", error: body.error ?? body.status }
  return { status: "working" }
}

export function openRouterProvider(c: OpenRouterConnection): Provider {
  return {
    async direct(r) {
      return (await completeJson(c, r)) as Direction
    },
    async keyframe(r) {
      const { bytes, type } = await generateImage(c, r)
      return { bytes, type }
    },
    async speech(r) {
      const res = await fetch(`${API}/audio/speech`, {
        method: "POST",
        headers: headers(c.key),
        body: JSON.stringify({
          model: r.model,
          input: r.text,
          voice: r.voice,
          response_format: "mp3",
          ...(r.delivery && { instructions: r.delivery }),
        }),
      })
      if (!res.ok) await fail(res)
      return new Uint8Array(await res.arrayBuffer())
    },
    async submit(r) {
      const res = await fetch(`${API}/videos`, {
        method: "POST",
        headers: headers(c.key),
        body: JSON.stringify(videoBody(r)),
      })
      if (!res.ok) await fail(res)
      const { id } = (await res.json()) as { id?: string }
      if (!id) throw new OpenRouterError("OpenRouter returned no job.", 502)
      return id
    },
    async poll(job) {
      const res = await fetch(`${API}/videos/${encodeURIComponent(job)}`, {
        headers: headers(c.key),
      })
      if (!res.ok) await fail(res)
      return readPoll(await res.json())
    },
    async download(job) {
      const res = await fetch(
        `${API}/videos/${encodeURIComponent(job)}/content?index=0`,
        { headers: headers(c.key) }
      )
      if (!res.ok) await fail(res)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}

// Fails closed like the books fake: a developer's machine only, never any
// Vercel deployment, however the flag got there.
export const fakeEnabled = () =>
  process.env.ANIME_AI_FAKE === "1" &&
  !process.env.VERCEL &&
  !process.env.VERCEL_ENV &&
  (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args])
    child.on("error", reject)
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))
    )
  })
}

async function inTemp<T>(work: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "anime-fake-"))
  try {
    return await work(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const fakeClips = new Map<string, Uint8Array>()

// Spends nothing and proves nothing about art: it lets the pipeline around the
// models run end to end. Keyframes are the panel itself, clips a slow zoom on
// the first frame over a tone, and speech a shorter tone.
export function fakeProvider(): Provider {
  return {
    async direct(r) {
      const count = Number(/PANELS: (\d+)/.exec(r.user)?.[1] ?? 0)
      return {
        cast: [
          {
            name: "Mara",
            description: "A tall clerk with short black hair and a red coat.",
            voice: VOICES[0],
          },
        ],
        shots: Array.from({ length: count }, (_, index) => ({
          index,
          skip: false,
          action: `Panel ${index + 1}: the scene comes to life.`,
          duration: 3 + (index % 3),
          movement: ["push", "pan", "parallax"][index % 3]!,
          light: "auto",
          lines: [
            {
              speaker: "Mara",
              text: `This is line ${index + 1}, spoken by a fake voice.`,
              delivery: "calm",
            },
          ],
        })),
      }
    },
    async keyframe(r) {
      const url = r.refs[0]!
      return {
        bytes: Buffer.from(url.slice(url.indexOf(",") + 1), "base64"),
        type: "image/jpeg",
      }
    },
    speech: () =>
      inTemp(async (dir) => {
        const out = join(dir, "voice.mp3")
        await ffmpeg([
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=1.5",
          "-ar",
          "48000",
          out,
        ])
        return new Uint8Array(await readFile(out))
      }),
    submit: (r) =>
      inTemp(async (dir) => {
        const url = r.firstFrame
        const image = join(dir, "first.jpg")
        await writeFile(
          image,
          Buffer.from(url.slice(url.indexOf(",") + 1), "base64")
        )
        const out = join(dir, "clip.mp4")
        const size = r.aspect === "16:9" ? "1280x720" : "720x1280"
        const [w, h] = size.split("x")
        await ffmpeg([
          "-loop",
          "1",
          "-i",
          image,
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=110",
          "-t",
          String(r.duration),
          "-vf",
          `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='1+0.002*on':d=1:s=${size}:fps=24,format=yuv420p`,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-shortest",
          out,
        ])
        const id = `fake-${crypto.randomUUID()}`
        fakeClips.set(id, new Uint8Array(await readFile(out)))
        return id
      }),
    poll: async () => ({ status: "done", cost: 0 }),
    download: async (job) => {
      const clip = fakeClips.get(job)
      if (!clip) throw new OpenRouterError("Fake clip lost.", 404)
      return clip
    },
  }
}
