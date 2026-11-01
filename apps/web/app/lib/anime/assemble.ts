import {
  AudioSampleSource,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  AudioSample,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  QUALITY_HIGH,
} from "mediabunny"

import {
  FADE_SECONDS,
  TITLE_SECONDS,
  timeline,
  wrapCaption,
  type Caption,
  type ShotClip,
} from "./model"

const FPS = 24
const SAMPLE_RATE = 48_000
const FRAME = 1 / FPS
// Dialogue sits on top: the clip's own sound drops under it.
const AMBIENCE = 0.35
const VOICE_GAIN = 1

export interface AssemblyClip extends ShotClip {
  video: string
  voice: string | null
}

export interface AssemblyOptions {
  title: string
  width: number
  height: number
  subtitles: boolean
  fades: boolean
  titleCard: boolean
  // "No sound": the track stays, silent, so players behave.
  muted: boolean
  onProgress: (share: number) => void
  signal: AbortSignal
}

export class AssemblyError extends Error {
  constructor(readonly code: "no_encoder" | "clip_missing" | "cancelled") {
    super(code)
  }
}

const fetchBlob = async (url: string, signal: AbortSignal) => {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new AssemblyError("clip_missing")
  return res.blob()
}

function cover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number
) {
  const { width, height } = ctx.canvas
  const scale = Math.max(width / sw, height / sh)
  const w = sw * scale
  const h = sh * scale
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h)
}

function drawCaption(ctx: CanvasRenderingContext2D, c: Caption) {
  const { width, height } = ctx.canvas
  const size = Math.round(Math.min(width, height) * 0.045)
  ctx.font = `600 ${size}px "Inter Variable", system-ui, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  const lines = wrapCaption(
    c.text,
    (l) => ctx.measureText(l).width < width * 0.84
  )
  ctx.lineJoin = "round"
  ctx.lineWidth = size * 0.2
  ctx.strokeStyle = "rgba(0,0,0,0.9)"
  ctx.fillStyle = "#fff"
  const lead = size * 1.25
  let y = height - height * 0.06 - (lines.length - 1) * lead
  for (const line of lines) {
    ctx.strokeText(line, width / 2, y)
    ctx.fillText(line, width / 2, y)
    y += lead
  }
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string, at: number) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, width, height)
  const fade = Math.min(1, Math.min(at, TITLE_SECONDS - at) / 0.4)
  ctx.globalAlpha = Math.max(0, fade)
  ctx.fillStyle = "#fff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const size = Math.round(Math.min(width, height) * 0.08)
  ctx.font = `800 ${size}px "Archivo Variable", "Inter Variable", sans-serif`
  const lines = wrapCaption(
    title.toUpperCase(),
    (l) => ctx.measureText(l).width < width * 0.8
  )
  lines.forEach((line, i) =>
    ctx.fillText(
      line,
      width / 2,
      height / 2 + (i - (lines.length - 1) / 2) * size * 1.1
    )
  )
  ctx.globalAlpha = 1
}

// Clip sound under the voices, on one track. A clip with no audio, or audio
// the browser can't read, leaves silence rather than stopping the export.
async function mixAudio(
  blobs: Blob[],
  voices: (Blob | null)[],
  placed: { start: number; end: number }[],
  duration: number
) {
  const length = Math.max(1, Math.ceil(duration * SAMPLE_RATE))
  const mix = new OfflineAudioContext(2, length, SAMPLE_RATE)
  const place = async (blob: Blob, at: number, end: number, gain: number) => {
    const decoded = await mix
      .decodeAudioData(await blob.arrayBuffer())
      .catch(() => null)
    if (!decoded) return false
    const source = mix.createBufferSource()
    source.buffer = decoded
    const node = mix.createGain()
    node.gain.value = gain
    source.connect(node).connect(mix.destination)
    source.start(at, 0, Math.max(0, end - at))
    return true
  }
  for (let i = 0; i < placed.length; i++) {
    const { start, end } = placed[i]!
    const clip = blobs[i]
    const voice = voices[i]
    if (clip) await place(clip, start, end, voice ? AMBIENCE : 1)
    if (voice) await place(voice, start, end, VOICE_GAIN)
  }
  return mix.startRendering()
}

export async function assemble(clips: AssemblyClip[], o: AssemblyOptions) {
  const video = await getFirstEncodableVideoCodec(
    ["avc", "hevc", "vp9", "av1"],
    {
      width: o.width,
      height: o.height,
    }
  )
  const audio = await getFirstEncodableAudioCodec(["aac", "opus"], {
    numberOfChannels: 2,
    sampleRate: SAMPLE_RATE,
  })
  if (!video) throw new AssemblyError("no_encoder")

  const plan = timeline(clips, o.titleCard)
  // Fetching and mixing are the first fifth of the work; frames are the rest.
  const blobs = await Promise.all(
    clips.map((c) => fetchBlob(c.video, o.signal))
  )
  const voices = await Promise.all(
    clips.map((c) => (c.voice ? fetchBlob(c.voice, o.signal) : null))
  )
  o.onProgress(0.08)
  const mixed = await mixAudio(
    o.muted ? [] : blobs,
    voices,
    plan.shots,
    plan.duration
  )
  o.onProgress(0.2)

  const canvas = document.createElement("canvas")
  canvas.width = o.width
  canvas.height = o.height
  const ctx = canvas.getContext("2d", { alpha: false })!

  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  })
  const frames = new CanvasSource(canvas, {
    codec: video,
    bitrate: QUALITY_HIGH,
  })
  output.addVideoTrack(frames, { frameRate: FPS })
  const sound = audio
    ? new AudioSampleSource({ codec: audio, bitrate: QUALITY_HIGH })
    : null
  if (sound) output.addAudioTrack(sound)
  await output.start()

  try {
    let time = 0
    const total = Math.max(1, Math.ceil(plan.duration * FPS))
    const emit = async () => {
      if (o.signal.aborted) throw new AssemblyError("cancelled")
      await frames.add(time, FRAME)
      time += FRAME
      o.onProgress(0.2 + 0.75 * Math.min(1, time / (total * FRAME)))
    }

    if (o.titleCard)
      while (time < TITLE_SECONDS - FRAME / 2) {
        drawTitle(ctx, o.title, time)
        await emit()
      }

    for (let i = 0; i < clips.length; i++) {
      const { start, end } = plan.shots[i]!
      const input = new Input({
        source: new BlobSource(blobs[i]!),
        formats: ALL_FORMATS,
      })
      try {
        const track = await input.getPrimaryVideoTrack()
        if (!track) throw new AssemblyError("clip_missing")
        const sink = new VideoSampleSink(track)
        const length = await input.computeDuration()
        const stamps = function* () {
          for (let t = time; t < end - FRAME / 2; t += FRAME)
            // A clip shorter than its slot holds on its last frame.
            yield Math.min(Math.max(0, t - start), Math.max(0, length - FRAME))
        }
        for await (const sample of sink.samplesAtTimestamps(stamps())) {
          if (sample) {
            ctx.fillStyle = "#000"
            ctx.fillRect(0, 0, o.width, o.height)
            const frame = sample.toVideoFrame()
            cover(ctx, frame, frame.displayWidth, frame.displayHeight)
            frame.close()
            sample.close()
          }
          if (o.fades) {
            const edge = Math.min(time - start, end - time - FRAME)
            if (edge < FADE_SECONDS) {
              ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, edge) / FADE_SECONDS})`
              ctx.fillRect(0, 0, o.width, o.height)
            }
          }
          if (o.subtitles) {
            const now = time
            const line = plan.captions.find(
              (c) => now >= c.start && now < c.end
            )
            if (line) drawCaption(ctx, line)
          }
          await emit()
        }
      } finally {
        input.dispose()
      }
    }

    if (sound) {
      const planar = new Float32Array(mixed.length * 2)
      planar.set(mixed.getChannelData(0), 0)
      planar.set(mixed.getChannelData(1), mixed.length)
      const sample = new AudioSample({
        data: planar,
        format: "f32-planar",
        numberOfChannels: 2,
        sampleRate: SAMPLE_RATE,
        timestamp: 0,
      })
      await sound.add(sample)
      sample.close()
    }
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  }
  o.onProgress(1)
  return new Blob([target.buffer!], { type: "video/mp4" })
}
