import type { Finding } from "@/lib/deepdive/model"

import type {
  AssetSpec,
  FormatDefinition,
  Part,
  RenderedAsset,
  Rendition,
} from "../model"
import { assetProblems, hostOf, impersonates, warning } from "./visual-checks"

export const WORDS_PER_MINUTE = 150
export const TITLE_CHARS = 100
export const DESCRIPTION_CHARS = 5000
export const MIN_CHAPTERS = 3
// YouTube ignores chapter lists with a shorter gap.
export const MIN_CHAPTER_SECONDS = 10
// A chapter should open on a scene; the estimate leaves this much play.
const CHAPTER_SLOP = 3
const MIN_SCENE_SECONDS = 2
// One still doesn't hold longer than this.
const LONG_SCENE_SECONDS = 60
export const TARGET_SECONDS = { min: 180, max: 600 }
// The publishing service's cap for a channel that isn't phone-verified.
export const UNVERIFIED_SECONDS = 15 * 60
// YouTube treats vertical video of this length or less as a Short.
export const SHORT_SECONDS = 180
export const SHORT_TARGET_SECONDS = 60

const brief = `You are adapting a researched story into a YouTube video package. It must claim nothing the story doesn't. Each part is one scene. Make a long video (meta.kind "video") unless the request asks for a Short (meta.kind "short").

Every scene:
- voiceover: the exact words spoken, also shown as captions. Write for the ear, short sentences. ${WORDS_PER_MINUTE} words is one minute.
- text: on-screen direction: what the viewer sees and how it moves. The viewer never reads this.
- asset: a figure or map where the data earns it, with sourceUrl, else an illustration: a wordless scene of objects and places, unnamed people at most, with alt text.

Long video:
- ${TARGET_SECONDS.min / 60} to ${TARGET_SECONDS.max / 60} minutes. The first scene opens on the hook, never on a greeting. Keep the story's order: hook, why it matters, how the money works, what could kill it, the takeaway.
- title: at most ${TITLE_CHARS} characters, curiosity from a concrete detail, paid off by the video.
- meta.chapters: one "m:ss Label" per line, the first at 0:00, at least ${MIN_CHAPTERS}, each starting at a scene and at least ${MIN_CHAPTER_SECONDS} seconds apart. A scene starts when the words before it end, at ${WORDS_PER_MINUTE} words per minute.
- meta.thumbnail: one asset spec as JSON. A figure with a single striking "stat", or an illustration. At most five words of text.
- meta.description: at most ${DESCRIPTION_CHARS} characters. A short summary, then the chapters exactly as written, then "Sources:" with one URL per line. No angle brackets.
- meta.tags: optional, comma separated.

Short:
- ${SHORT_TARGET_SECONDS} seconds at most, in 3 to 6 scenes, the single best idea of the story. The first sentence is the hook. No chapters and no thumbnail. Still a title and a description with sources.

Honesty:
- An estimate stays an estimate, in the same sentence as the number: say "we estimate" or "napkin math". The figure's series entry has estimate: true.
- Claims stay claims: "he says", "according to the site".
- The outlet narrates. Never speak as a real person, imitate a real voice, invent a quote or show a recognisable real person.`

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

export const isShort = (r: Rendition) => r.meta.kind === "short"

// Estimated, not measured: a real voiceover replaces these at render time.
export const spokenSeconds = (text: string) =>
  Math.max(MIN_SCENE_SECONDS, (words(text) * 60) / WORDS_PER_MINUTE)

const scenesOf = (parts: Part[]) =>
  parts.map((p) => spokenSeconds(p.voiceover ?? ""))

export const estimatedSeconds = (r: Rendition) =>
  scenesOf(r.parts).reduce((a, b) => a + b, 0)

export function sceneStarts(r: Rendition) {
  let at = 0
  return scenesOf(r.parts).map((s) => {
    const start = at
    at += s
    return start
  })
}

export function formatStamp(seconds: number) {
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const sec = String(s % 60).padStart(2, "0")
  return m < 60
    ? `${m}:${sec}`
    : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${sec}`
}

export interface Chapter {
  seconds: number
  stamp: string
  label: string
}

export function parseChapters(text = ""): Chapter[] {
  const chapters: Chapter[] = []
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^((?:(\d+):)?(\d{1,2}):(\d{2}))\s+(.+)$/)
    if (!m) continue
    chapters.push({
      seconds: Number(m[2] ?? 0) * 3600 + Number(m[3]) * 60 + Number(m[4]),
      stamp: m[1]!,
      label: m[5]!.trim(),
    })
  }
  return chapters
}

// A spec can't sit in `meta`, which holds strings, so the thumbnail is JSON.
export function thumbnailSpec(r: Rendition): AssetSpec | null {
  try {
    const spec = JSON.parse(r.meta.thumbnail ?? "") as AssetSpec
    return ["figure", "map", "illustration"].includes(spec?.kind) ? spec : null
  } catch {
    return null
  }
}

function checkChapters(r: Rendition, problems: string[]) {
  const lines = (r.meta.chapters ?? "").split("\n").filter((l) => l.trim())
  const chapters = parseChapters(r.meta.chapters)
  if (chapters.length !== lines.length)
    problems.push('Every chapter line reads "m:ss Label".')
  if (chapters.length < MIN_CHAPTERS)
    problems.push(`${chapters.length} chapters, need ${MIN_CHAPTERS}.`)
  if (chapters.length && chapters[0]!.seconds !== 0)
    problems.push(`Chapters must start at 0:00, not ${chapters[0]!.stamp}.`)

  const starts = sceneStarts(r)
  chapters.forEach((c, i) => {
    const previous = chapters[i - 1]
    if (previous && c.seconds - previous.seconds < MIN_CHAPTER_SECONDS)
      problems.push(
        `Chapter ${c.stamp} comes under ${MIN_CHAPTER_SECONDS} seconds after ${previous.stamp}.`
      )
    const nearest = starts.reduce(
      (best, s) =>
        Math.abs(s - c.seconds) < Math.abs(best - c.seconds) ? s : best,
      0
    )
    if (Math.abs(nearest - c.seconds) > CHAPTER_SLOP)
      problems.push(
        `Chapter "${c.label}" at ${c.stamp} opens no scene. The nearest starts at ${formatStamp(nearest)}.`
      )
  })

  const description = r.meta.description ?? ""
  for (const c of chapters)
    if (!description.includes(`${c.stamp} ${c.label}`))
      problems.push(
        `The description is missing chapter "${c.stamp} ${c.label}".`
      )
}

function check(r: Rendition) {
  const problems: string[] = []
  const findings: Finding[] = []
  const short = isShort(r)
  const description = r.meta.description ?? ""
  const title = [...r.title].length

  if (r.meta.kind !== "video" && r.meta.kind !== "short")
    problems.push('meta.kind must be "video" or "short".')
  if (!r.title.trim()) problems.push("The video has no title.")
  if (title > TITLE_CHARS)
    problems.push(`Title is ${title} characters, cut to ${TITLE_CHARS}.`)
  if (/[<>]/.test(r.title))
    problems.push("Take the angle brackets out of the title.")
  if (!r.parts.length) problems.push("The video has no scenes.")

  if (!description.trim()) problems.push("meta.description is missing.")
  if ([...description].length > DESCRIPTION_CHARS)
    problems.push(
      `Description is ${[...description].length} characters, cut to ${DESCRIPTION_CHARS}.`
    )
  // The publishing service strips these without saying so.
  if (/[<>]/.test(description))
    problems.push("Take the angle brackets out of the description.")
  if (!/\bsources?\b/i.test(description) || !/https:\/\/\S+/.test(description))
    problems.push('The description needs "Sources:" with their URLs.')

  r.parts.forEach((part, i) => {
    const n = i + 1
    const spoken = part.voiceover?.trim() ?? ""
    if (!spoken) problems.push(`Scene ${n} has no voiceover.`)
    if (!part.text.trim())
      problems.push(`Scene ${n} has no on-screen direction.`)
    if (impersonates(spoken))
      problems.push(`Scene ${n} speaks as someone. The outlet narrates.`)
    problems.push(...assetProblems(part, n, spoken))
    const asset = part.asset
    if (
      asset &&
      asset.kind !== "illustration" &&
      !description.includes(hostOf(asset.sourceUrl))
    )
      problems.push(`The description must credit ${hostOf(asset.sourceUrl)}.`)
    if (spokenSeconds(spoken) > LONG_SCENE_SECONDS)
      findings.push(
        warning(
          n,
          "youtube.scene",
          `Scene ${n} holds one picture over a minute. Split it.`
        )
      )
  })

  const seconds = Math.round(estimatedSeconds(r))
  if (short) {
    if (seconds > SHORT_SECONDS)
      problems.push(
        `About ${seconds}s at ${WORDS_PER_MINUTE} words a minute, a Short ends by ${SHORT_SECONDS}s.`
      )
    else if (seconds > SHORT_TARGET_SECONDS)
      findings.push(
        warning(
          0,
          "youtube.length",
          `About ${seconds}s. Shorts work best under ${SHORT_TARGET_SECONDS}s.`
        )
      )
    if (r.meta.thumbnail)
      findings.push(
        warning(
          0,
          "youtube.thumbnail",
          "Shorts take no custom thumbnail, so this one goes unused."
        )
      )
    if (r.meta.chapters)
      findings.push(warning(0, "youtube.chapters", "Shorts have no chapters."))
    return { findings, problems }
  }

  checkChapters(r, problems)
  const thumbnail = thumbnailSpec(r)
  if (!thumbnail)
    problems.push("meta.thumbnail must be one asset spec, as JSON.")
  else
    problems.push(
      ...assetProblems({ text: "", asset: thumbnail }, 0, r.title).map((p) =>
        p.replace("Part 0", "Thumbnail")
      )
    )
  if (seconds > UNVERIFIED_SECONDS)
    findings.push(
      warning(
        0,
        "youtube.length",
        `About ${seconds}s. Channels that aren't phone-verified stop at ${UNVERIFIED_SECONDS}s.`
      )
    )
  else if (seconds < TARGET_SECONDS.min || seconds > TARGET_SECONDS.max)
    findings.push(
      warning(
        0,
        "youtube.length",
        `About ${seconds}s at ${WORDS_PER_MINUTE} words a minute. Aim for ${TARGET_SECONDS.min}s to ${TARGET_SECONDS.max}s.`
      )
    )
  return { findings, problems }
}

// The model can't time its own scenes, so its chapters snap to the real ones.
export function snapChapters(r: Rendition): Rendition {
  if (r.meta.kind === "short") return r
  const starts = sceneStarts(r)
  const chapters = parseChapters(r.meta.chapters)
  if (!starts.length || !chapters.length) return r
  let description = r.meta.description ?? ""
  const lines = chapters.map((c) => {
    const nearest = starts.reduce((a, b) =>
      Math.abs(b - c.seconds) < Math.abs(a - c.seconds) ? b : a
    )
    const stamp = formatStamp(c.seconds === 0 ? 0 : nearest)
    description = description.replace(
      `${c.stamp} ${c.label}`,
      `${stamp} ${c.label}`
    )
    return `${stamp} ${c.label}`
  })
  return { ...r, meta: { ...r.meta, chapters: lines.join("\n"), description } }
}

export const youtube: FormatDefinition = {
  normalize: snapChapters,
  id: "youtube",
  brief,
  check,
}

// What .github/scripts/render-video.mjs reads.
export interface VideoManifest {
  version: 1
  title: string
  width: number
  height: number
  scenes: {
    image: string | null
    fit: "cover" | "contain"
    caption: string
    voiceover: string
    // Estimated from the words; a voiceover provider's audio overrides it.
    seconds: number
    chapter?: string
  }[]
}

// Scenes whose picture isn't rendered yet play as captions on a dark card.
export function videoManifest(
  r: Rendition,
  assets: RenderedAsset[] = []
): VideoManifest {
  const short = isShort(r)
  const byKey = new Map(assets.map((a) => [JSON.stringify(a.spec), a]))
  const starts = sceneStarts(r)
  const seconds = scenesOf(r.parts)
  const chapterAt = new Map<number, string>()
  if (!short)
    for (const c of parseChapters(r.meta.chapters)) {
      const nearest = starts.reduce(
        (best, s, i) =>
          Math.abs(s - c.seconds) < Math.abs(starts[best]! - c.seconds)
            ? i
            : best,
        0
      )
      chapterAt.set(nearest, c.label)
    }
  return {
    version: 1,
    title: r.title,
    width: short ? 1080 : 1920,
    height: short ? 1920 : 1080,
    scenes: r.parts.map((part, i) => {
      const spoken = part.voiceover ?? ""
      const asset = part.asset
      const chapter = chapterAt.get(i)
      return {
        image: (asset && byKey.get(JSON.stringify(asset))?.url) ?? null,
        fit: asset && asset.kind !== "illustration" ? "contain" : "cover",
        caption: spoken,
        voiceover: spoken,
        seconds: seconds[i]!,
        ...(chapter && { chapter }),
      }
    }),
  }
}

// The request body for the publishing service's POST /posts, once the MP4 sits
// at a public https URL. Nothing calls this yet. It stays private until a person
// flips it, and it discloses AI media, which the service only sets at upload.
export function youtubePostBody(
  r: Rendition,
  video: { url: string; thumbnail?: string; accountId: string }
) {
  const tags = (r.meta.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
  return {
    content: r.meta.description ?? "",
    ...(tags.length && { tags }),
    mediaItems: [
      {
        type: "video",
        url: video.url,
        ...(video.thumbnail && !isShort(r) && { thumbnail: video.thumbnail }),
      },
    ],
    platforms: [
      {
        platform: "youtube",
        accountId: video.accountId,
        platformSpecificData: {
          title: r.title,
          visibility: "private",
          madeForKids: false,
          containsSyntheticMedia: true,
        },
      },
    ],
    publishNow: true,
    metadata: { source: "palmframe-media" },
  }
}
