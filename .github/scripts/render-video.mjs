// Turns a video manifest (lib/media/formats/youtube.ts, videoManifest) into an
// MP4: one still per scene, captions burned in, voiceover when a provider gives
// one, a silent track when it doesn't. Runs on a GitHub runner because a Vercel
// function can't encode this in 300s. Node built-ins and ffmpeg only.
//
//   node render-video.mjs <manifest path or https url> [--out dir]
//
// Writes video.mp4 and render.json (real durations and chapters) to the out dir.

import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)

const FPS = 30
const FONT = "Inter"
// Dark enough for white captions when a scene has no picture yet.
const CARD = "0x14161a"
const MAX_SCENES = 60
const MAX_SECONDS = 20 * 60
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const AUDIO_TAIL = 0.3
const SIZES = new Set(["1920x1080", "1080x1920"])

// The one place text-to-speech plugs in. Return the path of an audio file
// ffmpeg can read, or null to leave the scene silent with captions. The project
// has no text-to-speech key, so nothing is spoken today.
export async function voiceover(_text, _context) {
  return null
}

const stamp = (seconds) => {
  const s = Math.floor(seconds + 0.001)
  const m = Math.floor(s / 60)
  const sec = String(s % 60).padStart(2, "0")
  if (m < 60) return `${m}:${sec}`
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${sec}`
}

// A number must never lose its label on screen, so a sentence that calls itself
// an estimate stays one caption, however long.
const LABELLED = /\b(estimat|napkin|approx|rough)/i

export function cues(text, maxChars) {
  const out = []
  for (const sentence of text.trim().split(/(?<=[.!?])\s+/)) {
    if (LABELLED.test(sentence)) {
      out.push(sentence)
      continue
    }
    let line = ""
    for (const word of sentence.split(/\s+/).filter(Boolean)) {
      if (line && line.length + word.length + 1 > maxChars) {
        out.push(line)
        line = ""
      }
      line = line ? `${line} ${word}` : word
    }
    if (line) out.push(line)
  }
  return out
}

const assTime = (t) => {
  const cs = Math.round(t * 100)
  const h = Math.floor(cs / 360000)
  const m = String(Math.floor(cs / 6000) % 60).padStart(2, "0")
  const s = String(Math.floor(cs / 100) % 60).padStart(2, "0")
  return `${h}:${m}:${s}.${String(cs % 100).padStart(2, "0")}`
}

// ASS can't escape a backslash, so a word joiner keeps it from starting a tag.
const assText = (s) =>
  s.replace(/\\/g, "\\\u2060").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\s+/g, " ")

// Timed by share of the words: close to speech without an aligner.
export function subtitles(text, seconds, { width, height, card }) {
  const vertical = height > width
  const size = card ? (vertical ? 84 : 76) : vertical ? 68 : 54
  const margin = vertical ? 96 : 200
  // Shorts keep the bottom fifth clear of the app's own buttons and title.
  const marginV = vertical ? 420 : 72
  const align = card ? 5 : 2
  const lines = cues(text, vertical ? 44 : 80)
  const total = lines.reduce((n, l) => n + l.split(/\s+/).length, 0) || 1
  let at = 0
  const events = lines.map((line) => {
    const end = Math.min(seconds, at + (seconds * line.split(/\s+/).length) / total)
    const row = `Dialogue: 0,${assTime(at)},${assTime(end)},Caption,,0,0,0,,${assText(line)}`
    at = end
    return row
  })
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${FONT},${size},&H00FFFFFF,&H00FFFFFF,&H30000000,&H30000000,-1,0,0,0,100,100,0,0,3,14,0,${align},${margin},${margin},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`
}

// Charts are read, so they sit whole and still, above the captions, which would
// otherwise cover their labels. Pictures get a slow push.
export function picture({ fit, frames, width, height }) {
  if (fit === "contain") {
    const area = height - (height > width ? 640 : 240)
    return `scale=${width}:${area}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(${area}-ih)/2:color=white`
  }
  const cover = `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2}`
  return `${cover},zoompan=z='1+0.05*on/${frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${width}x${height}:fps=${FPS}`
}

export function parseManifest(value) {
  const m = value
  const fail = (why) => {
    throw new Error(`Bad manifest: ${why}`)
  }
  if (m?.version !== 1) fail("version must be 1")
  if (!SIZES.has(`${m.width}x${m.height}`)) fail("size must be 1920x1080 or 1080x1920")
  if (!Array.isArray(m.scenes) || !m.scenes.length) fail("no scenes")
  if (m.scenes.length > MAX_SCENES) fail(`over ${MAX_SCENES} scenes`)
  let total = 0
  for (const [i, s] of m.scenes.entries()) {
    if (typeof s.caption !== "string" || !s.caption.trim()) fail(`scene ${i + 1} has no caption`)
    if (!(s.seconds > 0)) fail(`scene ${i + 1} has no duration`)
    if (s.image !== null && typeof s.image !== "string") fail(`scene ${i + 1} image`)
    if (s.fit !== "cover" && s.fit !== "contain") fail(`scene ${i + 1} fit`)
    total += s.seconds
  }
  if (total > MAX_SECONDS) fail(`over ${MAX_SECONDS} seconds`)
  return m
}

async function fetchImage(url, to) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Image ${url}: ${res.status}`)
  const type = res.headers.get("content-type") ?? ""
  if (!type.startsWith("image/")) throw new Error(`Image ${url}: got ${type}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`Image ${url}: too large`)
  await writeFile(to, bytes)
  return to
}

// A manifest from the web may only name https images, so a dispatch can't read
// files off the runner into a video. Local paths are for local manifests.
async function sceneImage(image, to, base) {
  if (!image) return null
  if (image.startsWith("https://")) return fetchImage(image, to)
  if (!base) throw new Error(`Image must be https: ${image}`)
  return resolve(base, image)
}

async function seconds(path, ffprobe) {
  const { stdout } = await run(ffprobe, [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path,
  ])
  const value = Number(stdout.trim())
  if (!(value > 0)) throw new Error(`No duration for ${path}`)
  return value
}

// Burned-in captions need libass. Failing here beats a captionless video.
async function assertCaptions(ffmpeg) {
  const { stdout } = await run(ffmpeg, ["-hide_banner", "-filters"], {
    maxBuffer: 1 << 22,
  })
  if (!/\sass\s/.test(stdout))
    throw new Error(`${ffmpeg} has no libass, so it can't burn in captions.`)
}

async function encodeScene(scene, i, ctx) {
  const { width, height, work, ffmpeg, ffprobe, provide, base } = ctx
  const name = String(i + 1).padStart(3, "0")
  const image = await sceneImage(scene.image, join(work, `in-${name}`), base)
  const audio = await provide(scene.voiceover ?? "", { index: i, work })
  const length = audio
    ? (await seconds(audio, ffprobe)) + AUDIO_TAIL
    : scene.seconds
  const frames = Math.max(1, Math.round(length * FPS))
  const duration = frames / FPS
  const ass = `${name}.ass`
  await writeFile(
    join(work, ass),
    subtitles(scene.caption, duration, { width, height, card: !image })
  )

  const still = scene.fit === "contain"
  const video = image
    ? [...(still ? ["-loop", "1", "-framerate", String(FPS)] : []), "-i", image]
    : ["-f", "lavfi", "-i", `color=c=${CARD}:s=${width}x${height}:r=${FPS}`]
  const sound = audio
    ? ["-i", audio]
    : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
  const graph = [
    image ? picture({ fit: scene.fit, frames, width, height }) : "null",
    // Relative on purpose: the filter's own parser trips on paths with colons.
    `ass=${ass}`,
    "format=yuv420p",
  ].join(",")
  const out = `${name}.mp4`
  await run(
    ffmpeg,
    [
      "-y", "-hide_banner", "-loglevel", "error",
      ...video, ...sound,
      "-filter_complex", `[0:v]${graph}[v];[1:a]aresample=48000,apad[a]`,
      "-map", "[v]", "-map", "[a]",
      "-frames:v", String(frames), "-t", String(duration), "-r", String(FPS),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k", "-ac", "2",
      out,
    ],
    { cwd: work, maxBuffer: 1 << 22 }
  )
  return { file: out, duration, voiced: !!audio }
}

export async function render(manifest, options) {
  const { outDir, base = null, provide = voiceover } = options
  const ffmpeg = options.ffmpeg ?? process.env.FFMPEG ?? "ffmpeg"
  const ffprobe = options.ffprobe ?? process.env.FFPROBE ?? "ffprobe"
  const m = parseManifest(manifest)
  await assertCaptions(ffmpeg)
  await mkdir(outDir, { recursive: true })
  const work = await mkdtemp(join(tmpdir(), "render-video-"))
  try {
    const ctx = { width: m.width, height: m.height, work, ffmpeg, ffprobe, provide, base }
    const parts = []
    for (const [i, scene] of m.scenes.entries()) {
      parts.push(await encodeScene(scene, i, ctx))
      console.log(`Scene ${i + 1}/${m.scenes.length}: ${parts.at(-1).duration.toFixed(1)}s`)
    }
    await writeFile(
      join(work, "scenes.txt"),
      parts.map((p) => `file '${p.file}'`).join("\n")
    )
    const video = join(resolve(outDir), "video.mp4")
    await run(
      ffmpeg,
      [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", "scenes.txt",
        "-c", "copy", "-movflags", "+faststart", video,
      ],
      { cwd: work, maxBuffer: 1 << 22 }
    )

    let at = 0
    const chapters = []
    for (const [i, part] of parts.entries()) {
      if (m.scenes[i].chapter)
        chapters.push({ at: stamp(at), title: m.scenes[i].chapter })
      at += part.duration
    }
    const report = {
      seconds: await seconds(video, ffprobe),
      scenes: parts.length,
      voiced: parts.filter((p) => p.voiced).length,
      bytes: (await stat(video)).size,
      // Real voiceover shifts every start, so these replace the estimated ones.
      chapters,
    }
    await writeFile(join(outDir, "render.json"), JSON.stringify(report, null, 2))
    return report
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const flag = args.indexOf("--out")
  const outDir = flag >= 0 ? args.splice(flag, 2)[1] : "render-out"
  const source = args[0]
  if (!source) throw new Error("Usage: render-video.mjs <manifest> [--out dir]")
  const remote = source.startsWith("https://")
  const text = remote
    ? await fetch(source, { signal: AbortSignal.timeout(60_000) }).then((r) => {
        if (!r.ok) throw new Error(`Manifest: ${r.status}`)
        return r.text()
      })
    : await readFile(source, "utf8")
  const report = await render(JSON.parse(text), {
    outDir,
    base: remote ? null : dirname(resolve(source)),
  })
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
