import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

// FLUX.2 Klein 4B through mflux (MLX), for model sheets and for panels
// drawn from them. Local only, like ComfyUI: it needs Apple silicon.
const BIN = process.env.MFLUX_BIN ?? join(homedir(), ".local/bin")
const MODEL =
  process.env.KLEIN_MODEL ?? "mflux-community/flux2-klein-4b-mflux-q8"
export const KLEIN_TIMEOUT_MS = 300_000

export const kleinAvailable = () =>
  existsSync(join(BIN, "mflux-generate-flux2-edit"))

export interface KleinRequest {
  prompt: string
  width: number
  height: number
  seed: number
  // Images to draw from (data URLs or http URLs), in the order the prompt
  // refers to them. None: plain text-to-image.
  refs: string[]
}

async function toBytes(ref: string) {
  if (ref.startsWith("data:")) {
    return Buffer.from(ref.slice(ref.indexOf(",") + 1), "base64")
  }
  const res = await fetch(ref)
  if (!res.ok)
    throw new Error(`Could not fetch a reference image (${res.status}).`)
  return Buffer.from(await res.arrayBuffer())
}

// One render at a time: two Klein processes don't fit in 24 GB.
let queue: Promise<unknown> = Promise.resolve()

export function renderKlein(r: KleinRequest, signal: AbortSignal) {
  const run = queue.then(() => renderNow(r, signal))
  queue = run.catch(() => {})
  return run
}

async function renderNow(r: KleinRequest, signal: AbortSignal) {
  if (signal.aborted) throw new Error("Cancelled")
  const dir = await mkdtemp(join(tmpdir(), "klein-"))
  try {
    const refs = await Promise.all(
      r.refs.map(async (ref, i) => {
        const path = join(dir, `ref-${i}.png`)
        await writeFile(path, await toBytes(ref))
        return path
      })
    )
    const out = join(dir, "out.png")
    const args = [
      "--model",
      MODEL,
      "--base-model",
      "flux2-klein-4b",
      ...(refs.length ? ["--image-paths", ...refs] : []),
      "--prompt",
      r.prompt,
      "--width",
      String(r.width),
      "--height",
      String(r.height),
      "--seed",
      String(r.seed),
      "--output",
      out,
    ]
    const bin = join(
      BIN,
      refs.length ? "mflux-generate-flux2-edit" : "mflux-generate-flux2"
    )
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] })
      let stderr = ""
      child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)))
      const timer = setTimeout(() => child.kill(), KLEIN_TIMEOUT_MS)
      const abort = () => child.kill()
      signal.addEventListener("abort", abort, { once: true })
      child.on("error", reject)
      child.on("close", (code) => {
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        if (signal.aborted) reject(new Error("Cancelled"))
        else if (code === 0) resolve()
        else
          reject(
            new Error(
              `Klein failed: ${stderr.trim().split("\n").at(-1) ?? code}`
            )
          )
      })
    })
    return await readFile(out)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
