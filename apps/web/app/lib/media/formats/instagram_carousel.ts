import type { Finding } from "@/lib/deepdive/model"
import { INSTAGRAM_LIMITS, checkPublish } from "@/lib/instagram-limits"

import type { FormatDefinition, Rendition } from "../model"
import { assetProblems, hostOf, impersonates, warning } from "./visual-checks"

// The comic editor's 4:5 page, so a deck opens there unchanged.
export const SLIDE_WIDTH = 1080
export const SLIDE_HEIGHT = 1350

export const MIN_SLIDES = 5
export const MAX_SLIDES = INSTAGRAM_LIMITS.slides
export const COVER_WORDS = 12
export const SLIDE_WORDS = 28
// What fits the comic editor's caption box at its font size, on four lines.
export const SLIDE_CHARS = 160
export const SLIDE_SENTENCES = 2
export const ALT_CHARS = 1000

const brief = `You are adapting a researched story into an Instagram carousel of ${MIN_SLIDES} to ${MAX_SLIDES} slides. Each slide is one part. It must claim nothing the story doesn't.

Slides:
- Slide 1 stops the scroll: the most surprising concrete detail or number from the story, at most ${COVER_WORDS} words, one statement, never a question. The story must pay it off.
- One idea per slide: at most ${SLIDE_WORDS} words, ${SLIDE_CHARS} characters and ${SLIDE_SENTENCES} sentences. If you need "and also", make another slide.
- Keep the story's order: the hook, why it matters, how the money works, what could kill it.
- The last slide is the closing: the one idea a reader can steal. No chart on it.
- Attach a figure or map asset only where the data earns it: a real comparison, a trend, money flowing, places that matter. One lonely number is a "stat" figure at most. Every value comes from the story's facts, with its sourceUrl.
- On a slide with no figure, you may attach an illustration: a scene of objects and places, wordless, with unnamed people at most, and alt text.

Honesty:
- An estimate stays an estimate. If the story calls a number an estimate or napkin math, the slide says "estimated" or "napkin math" next to it, and the figure's series entry has estimate: true.
- Claims stay claims: "he says", "according to the site".
- The outlet tells the story. Never write in a real person's voice, invent a quote or draw a recognisable real person.

meta:
- caption: at most ${INSTAGRAM_LIMITS.caption} characters. Opens with a line worth reading, adds what didn't fit, and ends with "Sources:" and the site names you used. At most ${INSTAGRAM_LIMITS.suggestedHashtags} hashtags.
- alt: one line per slide, in order, each describing that slide for someone who can't see it, numbers included.

Plain words, no exclamation marks, no em dashes, no hashtags on slides.`

export const altTexts = (r: Rendition) =>
  (r.meta.alt ?? "").split("\n").map((line) => line.trim())

const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const sentences = (s: string) =>
  s.split(/(?<=[.!?])\s+/).filter((p) => p.trim()).length

const LIMIT_MESSAGES = {
  slides: (v: number, l: number) =>
    `${v} slides, Instagram posts at most ${l}.`,
  aspect: () => `Slides must stay within Instagram's 4:5 to 1.91:1.`,
  size: () => `A slide is over the image size limit.`,
  caption: (v: number, l: number) => `Caption is ${v} characters, cut to ${l}.`,
  hashtags: (v: number, l: number) => `${v} hashtags, the limit is ${l}.`,
  mentions: (v: number, l: number) => `${v} mentions, the limit is ${l}.`,
}

function check(r: Rendition) {
  const problems: string[] = []
  const findings: Finding[] = []
  const { parts } = r
  const caption = r.meta.caption ?? ""

  if (!r.title.trim()) problems.push("The carousel has no title.")
  if (parts.length < MIN_SLIDES)
    problems.push(`${parts.length} slides, need at least ${MIN_SLIDES}.`)

  for (const c of checkPublish({
    as: "feed",
    slides: parts.length,
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    bytes: [],
    caption,
  })) {
    if (c.level === "ok") continue
    const say =
      c.message === "suggestedHashtags"
        ? `${c.value} hashtags, Instagram now caps them at ${c.limit}.`
        : c.message === "storyAspect"
          ? "A story must be 9:16."
          : LIMIT_MESSAGES[c.message](c.value, c.limit)
    if (c.level === "block") problems.push(say)
    else findings.push(warning(0, `carousel.${c.id}`, say))
  }

  parts.forEach((part, i) => {
    const n = i + 1
    const text = part.text.trim()
    if (!text) problems.push(`Slide ${n} is empty.`)
    const count = words(text)
    const cover = i === 0
    if (cover && count > COVER_WORDS)
      problems.push(`Slide 1 is ${count} words, the hook takes ${COVER_WORDS}.`)
    if (cover && text.endsWith("?"))
      problems.push("Slide 1 is a question. Open on the fact itself.")
    if (count > SLIDE_WORDS)
      problems.push(`Slide ${n} is ${count} words, cut to ${SLIDE_WORDS}.`)
    if (text.length > SLIDE_CHARS)
      problems.push(
        `Slide ${n} is ${text.length} characters, cut to ${SLIDE_CHARS}.`
      )
    if (sentences(text) > SLIDE_SENTENCES)
      problems.push(`Slide ${n} carries more than one idea. Split it.`)
    if (/#[\p{L}\p{N}_]/u.test(text))
      problems.push(`Slide ${n}: hashtags belong in the caption.`)
    if (impersonates(text))
      problems.push(`Slide ${n} speaks as someone. The outlet narrates.`)
    problems.push(...assetProblems(part, n, text))
    const asset = part.asset
    if (asset && asset.kind !== "illustration") {
      if (i === parts.length - 1)
        problems.push("The closing slide carries the takeaway, not a chart.")
      const host = hostOf(asset.sourceUrl)
      if (caption && !caption.toLowerCase().includes(host.toLowerCase()))
        problems.push(`The caption must credit ${host} as a source.`)
    }
  })

  const seen = new Set<string>()
  for (const part of parts) {
    if (seen.has(part.text)) problems.push(`A slide repeats: "${part.text}".`)
    seen.add(part.text)
  }

  if (!caption.trim()) problems.push("meta.caption is missing.")
  if (!/\bsources?\b/i.test(caption))
    problems.push('The caption must end with "Sources:" and the sites used.')
  if (impersonates(caption))
    problems.push("The caption speaks as someone. The outlet narrates.")

  const alts = altTexts(r)
  if (alts.length !== parts.length || alts.some((a) => !a))
    problems.push(
      `meta.alt needs one line per slide: ${parts.length} slides, ${alts.filter(Boolean).length} lines.`
    )
  alts.forEach((alt, i) => {
    if (alt.length > ALT_CHARS)
      problems.push(`Alt text ${i + 1} is over ${ALT_CHARS} characters.`)
  })

  return { findings, problems }
}

export const instagramCarousel: FormatDefinition = {
  id: "instagram_carousel",
  brief,
  check,
}
