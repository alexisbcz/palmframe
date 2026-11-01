// Comics to anime, shared by server and UI. No secrets and no I/O here.

export const ANIME_BUCKET = "anime"
export const MAX_SHOTS = 120
export const MAX_DIALOGUE = 8
export const MAX_LINE = 400
export const DEFAULT_VIDEO_MODEL = "kwaivgi/kling-v3.0-std"
export const DEFAULT_SPEECH_MODEL = "google/gemini-3.8-flash-tts"
export const DEFAULT_RESOLUTION = "720p"

export const CAMERAS = [
  "auto",
  "cel",
  "ova",
  "theatrical",
  "digital",
  "dv",
] as const
export const LENSES = [
  "auto",
  "wide",
  "normal",
  "tele",
  "anamorphic",
  "vintage",
] as const
export const APERTURES = ["auto", "f14", "f28", "f56", "f11"] as const
export const MOVEMENTS = [
  "auto",
  "still",
  "push",
  "pull",
  "pan",
  "tilt",
  "orbit",
  "crane",
  "handheld",
  "whip",
  "parallax",
] as const
export const LIGHTS = [
  "auto",
  "day",
  "golden",
  "night",
  "neon",
  "rain",
  "backlit",
] as const
export const LOOKS = [
  "tv90s",
  "seinen",
  "shonen",
  "ghibli",
  "noir",
  "cyber",
] as const

export type CameraId = (typeof CAMERAS)[number]
export type LensId = (typeof LENSES)[number]
export type ApertureId = (typeof APERTURES)[number]
export type MovementId = (typeof MOVEMENTS)[number]
export type LightId = (typeof LIGHTS)[number]
export type LookId = (typeof LOOKS)[number]

export interface CameraSetup {
  camera: CameraId
  lens: LensId
  aperture: ApertureId
  movement: MovementId
  light: LightId
}

export const AUTO_SETUP: CameraSetup = {
  camera: "auto",
  lens: "auto",
  aperture: "auto",
  movement: "auto",
  light: "auto",
}

export const ASPECTS = ["16:9", "9:16"] as const
export type Aspect = (typeof ASPECTS)[number]
export const SOUNDS = ["voices", "model", "silent"] as const
export type Sound = (typeof SOUNDS)[number]
export const DUB_LANGUAGES = [
  "source",
  "en",
  "fr",
  "es",
  "de",
  "it",
  "ja",
] as const
export type DubLanguage = (typeof DUB_LANGUAGES)[number]

export interface EpisodeSettings {
  look: LookId
  aspect: Aspect
  videoModel: string
  resolution: string
  // voices: spoken lines from the speech model, over the clip's ambience.
  // model: whatever the video model makes. silent: no audio track from it.
  sound: Sound
  speechModel: string
  dub: DubLanguage
  subtitles: boolean
  fades: boolean
  titleCard: boolean
}

export const DEFAULT_SETTINGS: EpisodeSettings = {
  look: "tv90s",
  aspect: "16:9",
  videoModel: DEFAULT_VIDEO_MODEL,
  resolution: DEFAULT_RESOLUTION,
  sound: "voices",
  speechModel: DEFAULT_SPEECH_MODEL,
  dub: "source",
  subtitles: true,
  fades: true,
  titleCard: true,
}

// Gemini's prebuilt voices, which speak every language this app offers.
export const VOICES = [
  "Kore",
  "Puck",
  "Charon",
  "Fenrir",
  "Aoede",
  "Leda",
  "Orus",
  "Zephyr",
] as const
export const NARRATOR = "Narrator"

export interface CastMember {
  name: string
  // What a keyframe must keep: face, hair, build, clothes.
  description: string
  voice: string
}

export interface Line {
  speaker: string
  text: string
  // How it's said, for the speech model.
  delivery: string
}

export type StageStatus = "none" | "queued" | "working" | "ready" | "failed"
export type VideoStatus =
  "none" | "queued" | "submitting" | "rendering" | "ready" | "failed"

export const isSetup = (v: unknown): v is CameraSetup => {
  const c = v as CameraSetup
  return (
    !!c &&
    CAMERAS.includes(c.camera) &&
    LENSES.includes(c.lens) &&
    APERTURES.includes(c.aperture) &&
    MOVEMENTS.includes(c.movement) &&
    LIGHTS.includes(c.light)
  )
}

export function cleanLines(value: unknown): Line[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_DIALOGUE).flatMap((l) => {
    const { speaker, text, delivery } = (l ?? {}) as Partial<Line>
    if (typeof text !== "string" || !text.trim()) return []
    return [
      {
        speaker: typeof speaker === "string" ? speaker.slice(0, 60) : NARRATOR,
        text: text.trim().slice(0, MAX_LINE),
        delivery: typeof delivery === "string" ? delivery.slice(0, 120) : "",
      },
    ]
  })
}

// Prompt words. English on purpose: they go to models, never to people.
const CAMERA_WORDS: Record<CameraId, string> = {
  auto: "",
  cel: "shot on 35mm film over hand-painted cels, soft grain and gentle gate weave",
  ova: "1980s OVA photography, rich painted highlights and airbrushed glow",
  theatrical:
    "theatrical anime feature photography, composited with deep layered backgrounds",
  digital: "clean modern digital anime compositing, crisp lines",
  dv: "low-resolution DV camcorder texture, slight interlacing and blooming highlights",
}
const LENS_WORDS: Record<LensId, string> = {
  auto: "",
  wide: "wide-angle perspective with exaggerated depth",
  normal: "natural 50mm perspective",
  tele: "compressed telephoto perspective",
  anamorphic: "anamorphic lens with oval bokeh and horizontal flares",
  vintage: "vintage lens with halation around bright edges",
}
const APERTURE_WORDS: Record<ApertureId, string> = {
  auto: "",
  f14: "very shallow depth of field, background melting into blur",
  f28: "shallow depth of field",
  f56: "moderate depth of field",
  f11: "deep focus, everything sharp",
}
const MOVEMENT_WORDS: Record<MovementId, string> = {
  auto: "",
  still: "locked-off camera, no camera movement",
  push: "slow push-in toward the subject",
  pull: "slow pull-back revealing the surroundings",
  pan: "smooth horizontal pan following the action",
  tilt: "slow vertical tilt across the scene",
  orbit: "camera arcs around the subject",
  crane: "rising crane move",
  handheld: "tense handheld camera shake",
  whip: "fast whip pan with speed lines and impact frames",
  parallax:
    "multiplane parallax, foreground and background layers sliding at different speeds",
}
const LIGHT_WORDS: Record<LightId, string> = {
  auto: "",
  day: "flat bright daylight",
  golden: "warm golden hour light with long shadows",
  night: "cool moonlit night",
  neon: "saturated neon light from signs",
  rain: "overcast rain, wet reflections",
  backlit: "strong backlight with a rim of light on the figures",
}
const LOOK_WORDS: Record<LookId, string> = {
  tv90s: "1990s television anime, hand-painted cels, muted palette, film grain",
  seinen:
    "mature seinen anime, restrained colour, precise linework, realistic proportions",
  shonen:
    "high-energy shonen anime, bold shadows, vivid colour, dynamic linework",
  ghibli:
    "soft hand-painted feature animation, watercolour backgrounds, gentle light",
  noir: "high-contrast noir anime, heavy blacks, a single accent colour",
  cyber: "cyberpunk anime, dense detail, teal and magenta light",
}

const join = (parts: string[]) => parts.filter(Boolean).join(", ")

export function cameraWords(c: CameraSetup) {
  return join([
    CAMERA_WORDS[c.camera],
    LENS_WORDS[c.lens],
    APERTURE_WORDS[c.aperture],
    LIGHT_WORDS[c.light],
  ])
}

export const castNotes = (cast: CastMember[]) =>
  cast.map((c) => `${c.name}: ${c.description}`).join("\n")

export function keyframePrompt(
  shot: { action: string; camera: CameraSetup },
  settings: EpisodeSettings,
  cast: CastMember[],
  anchors: number
) {
  return [
    `Image 1 is a panel from a comic. Redraw it as one finished frame of an anime: ${LOOK_WORDS[settings.look]}.`,
    `Keep the composition, the characters, their clothes, their poses and what is happening. Fill a ${settings.aspect} frame, extending the scene past the panel's edges where needed.`,
    "Remove every speech balloon, caption, sound effect, title, signature, page number and panel border, and repaint what they covered. The result holds no text at all.",
    anchors
      ? `The next ${anchors === 1 ? "image is a finished frame" : `${anchors} images are finished frames`} from the same show. Match their character designs, line weight and palette exactly.`
      : "",
    shot.action ? `What happens: ${shot.action}` : "",
    cameraWords(shot.camera),
    cast.length ? `Characters who may appear:\n${castNotes(cast)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function videoPrompt(
  shot: { action: string; camera: CameraSetup; dialogue: Line[] },
  settings: EpisodeSettings
) {
  const sound =
    settings.sound === "voices"
      ? "Sound: ambience and effects only, nobody speaks, no music."
      : settings.sound === "model" && shot.dialogue.length
        ? `Spoken: ${shot.dialogue.map((l) => `${l.speaker}: "${l.text}"`).join(" ")}`
        : ""
  return [
    shot.action,
    MOVEMENT_WORDS[shot.camera.movement],
    cameraWords(shot.camera),
    `Hand-drawn 2D anime animation, ${LOOK_WORDS[settings.look]}. Keep the art style, character designs and colours of the first frame.`,
    "No text, no subtitles, no logos.",
    sound,
  ]
    .filter(Boolean)
    .join(" ")
}

// A video model as OpenRouter lists it, reduced to what the app reads.
export interface VideoModel {
  id: string
  name: string
  durations: number[]
  resolutions: string[]
  aspects: string[]
  audio: boolean
  skus: Record<string, string>
}

const DIMENSIONS: Record<string, [number, number]> = {
  "480p": [854, 480],
  "720p": [1280, 720],
  "768p": [1366, 768],
  "1080p": [1920, 1080],
  "2k": [2560, 1440],
  "4k": [3840, 2160],
}

// Dollars for one clip, or null when a model prices in a way this can't read.
// Model pricing is a mess of SKU names, so unknown means unknown, never zero.
export function clipCost(
  m: Pick<VideoModel, "skus">,
  resolution: string,
  seconds: number,
  audio: boolean
) {
  const res = resolution.toLowerCase()
  const sku = (name: string) => {
    const hit = Object.entries(m.skus).find(
      ([k]) => k.toLowerCase() === name.toLowerCase()
    )
    const value = hit ? Number(hit[1]) : NaN
    return Number.isFinite(value) ? value : null
  }
  const dollars = audio
    ? [
        `duration_seconds_with_audio_${res}`,
        `duration_seconds_${res}_with_audio`,
        "duration_seconds_with_audio",
      ]
    : [
        `duration_seconds_without_audio_${res}`,
        "duration_seconds_without_audio",
      ]
  for (const name of [
    ...dollars,
    `image_to_video_duration_seconds_${res}`,
    `duration_seconds_${res}`,
    "duration_seconds",
  ]) {
    const rate = sku(name)
    if (rate !== null) return rate * seconds
  }
  for (const name of [
    `cents_per_video_output_second_${res}`,
    `cents_per_second_output_${res}`,
    "cents_per_second_output",
  ]) {
    const rate = sku(name)
    if (rate !== null) return (rate / 100) * seconds
  }
  const size = DIMENSIONS[res]
  const token =
    sku(`video_tokens_${res}`) ??
    (audio ? null : sku("video_tokens_without_audio")) ??
    sku("video_tokens")
  // Seedance bills (height × width × fps × seconds) / 1024 tokens.
  if (token !== null && size)
    return ((size[0] * size[1] * 24 * seconds) / 1024) * token
  return null
}

export const nearest = (values: number[], target: number) =>
  values.reduce(
    (best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best),
    values[0] ?? target
  )

// What a request may carry: a duration or resolution from the shot or an
// earlier model may not exist on the chosen one, and the API refuses those.
export function fitToModel(
  m: VideoModel,
  settings: EpisodeSettings,
  duration: number
) {
  return {
    duration: m.durations.length ? nearest(m.durations, duration) : duration,
    resolution: m.resolutions.includes(settings.resolution)
      ? settings.resolution
      : (m.resolutions[0] ?? settings.resolution),
    audio: m.audio && settings.sound !== "silent",
  }
}

export interface Cost {
  usd: number
  // Clips with no price, left out of `usd`.
  unknown: number
}

export function estimate(
  m: VideoModel | undefined,
  settings: EpisodeSettings,
  durations: number[]
): Cost {
  if (!m) return { usd: 0, unknown: durations.length }
  let usd = 0
  let unknown = 0
  for (const d of durations) {
    const fit = fitToModel(m, settings, d)
    const cost = clipCost(m, fit.resolution, fit.duration, fit.audio)
    if (cost === null) unknown++
    else usd += cost
  }
  return { usd, unknown }
}

export interface ShotClip {
  id: string
  duration: number
  lines: Line[]
}

export interface Caption {
  start: number
  end: number
  speaker: string
  text: string
}

export const FADE_SECONDS = 0.25
export const TITLE_SECONDS = 2.5

// Where everything lands in the finished episode, in seconds. Each line's
// share of its shot follows its length, since a clip has no timing of its own.
export function timeline(clips: ShotClip[], title: boolean) {
  let cursor = title ? TITLE_SECONDS : 0
  const captions: Caption[] = []
  const shots = clips.map((clip) => {
    const start = cursor
    const chars = clip.lines.reduce((n, l) => n + l.text.length, 0)
    let at = start
    for (const line of clip.lines) {
      const share = chars ? line.text.length / chars : 0
      const end = at + share * clip.duration
      captions.push({ start: at, end, speaker: line.speaker, text: line.text })
      at = end
    }
    cursor += clip.duration
    return { id: clip.id, start, end: cursor }
  })
  return { shots, captions, duration: cursor }
}

const stamp = (seconds: number) => {
  const ms = Math.round(seconds * 1000)
  const pad = (n: number, size = 2) => String(n).padStart(size, "0")
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

export const toSrt = (captions: Caption[]) =>
  captions
    .map(
      (c, i) =>
        `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.speaker === NARRATOR ? "" : `${c.speaker}: `}${c.text}\n`
    )
    .join("\n")

// The longest stretch of a line that fits, broken at spaces, for burn-in.
export function wrapCaption(
  text: string,
  fits: (line: string) => boolean,
  maxLines = 3
) {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (fits(next) || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, maxLines)
}

export function outputSize(aspect: Aspect, resolution: string) {
  const [w, h] = DIMENSIONS[resolution.toLowerCase()] ?? [1280, 720]
  // Encoders want even sides, and a browser won't encode 4K in sensible time.
  const short = Math.min(h, 1080)
  const long = Math.round(((w / h) * short) / 2) * 2
  return aspect === "16:9"
    ? { width: long, height: short }
    : { width: short, height: long }
}
