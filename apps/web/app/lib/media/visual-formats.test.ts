import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  cues,
  parseManifest,
  subtitles,
  // @ts-expect-error a plain script with no types
} from "../../../../../.github/scripts/render-video.mjs"
import { carouselComic, carouselSlides } from "./carousel"
import { instagramCarousel } from "./formats/instagram_carousel"
import {
  estimatedSeconds,
  parseChapters,
  thumbnailSpec,
  videoManifest,
  youtube,
  youtubePostBody,
} from "./formats/youtube"
import type { AssetSpec, Rendition } from "./model"

const figure: AssetSpec = {
  kind: "figure",
  chart: "bar",
  title: "Revenue by year",
  unit: "USD",
  series: [
    { label: "2024", value: 1_200_000 },
    { label: "2025", value: 4_000_000, estimate: true },
  ],
  sourceUrl: "https://www.example.com/report",
}

const carousel = (): Rendition => ({
  format: "instagram_carousel",
  title: "The laundromat that prints money",
  parts: [
    { text: "One laundromat clears $40,000 a month." },
    { text: "It sits in a town of 900 people." },
    { text: "Revenue hit an estimated $4M last year.", asset: figure },
    { text: "Rent is the bill that could kill it." },
    { text: "Boring businesses hide in plain sight." },
  ],
  meta: {
    caption: "A small town, a big number.\n\nSources: example.com",
    alt: "A headline.\nA town sign.\nA bar chart of revenue.\nA lease.\nA closing line.",
  },
})

describe("instagram carousel check", () => {
  test("a good deck passes", () => {
    assert.deepEqual(instagramCarousel.check(carousel()), {
      findings: [],
      problems: [],
    })
  })

  test("slide count, from Instagram's own limit", () => {
    const few = carousel()
    few.parts = few.parts.slice(0, 4)
    assert.ok(
      instagramCarousel
        .check(few)
        .problems.some((p) => p.includes("at least 5"))
    )
    const many = carousel()
    many.parts = Array.from({ length: 11 }, (_, i) => ({ text: `Slide ${i}.` }))
    assert.ok(
      instagramCarousel
        .check(many)
        .problems.some((p) => p.includes("at most 10"))
    )
  })

  test("the first slide is a short statement", () => {
    const r = carousel()
    r.parts[0]!.text =
      "Why would anyone buy a laundromat in a town this small today, of all days?"
    const { problems } = instagramCarousel.check(r)
    assert.ok(problems.some((p) => p.includes("hook takes 12")))
    assert.ok(problems.some((p) => p.includes("question")))
  })

  test("an estimate keeps its label on the slide", () => {
    const r = carousel()
    r.parts[2]!.text = "Revenue hit $4M last year."
    assert.ok(
      instagramCarousel
        .check(r)
        .problems.some((p) => p.includes("holds an estimate"))
    )
  })

  test("caption limits come from checkPublish, and sources are credited", () => {
    const r = carousel()
    r.meta.caption = `${"x".repeat(2201)} Sources: example.com`
    assert.ok(
      instagramCarousel.check(r).problems.some((p) => p.includes("cut to 2200"))
    )
    r.meta.caption = "Sources: elsewhere.org"
    assert.ok(
      instagramCarousel
        .check(r)
        .problems.some((p) => p.includes("credit example.com"))
    )
    r.meta.caption = "Sources: example.com #a #b #c #d #e #f"
    const { findings, problems } = instagramCarousel.check(r)
    assert.equal(problems.length, 0)
    assert.equal(findings[0]?.level, "warning")
  })

  test("the closing slide has no chart, and alt covers every slide", () => {
    const r = carousel()
    r.parts[4]!.asset = figure
    r.meta.alt = "Only one."
    const { problems } = instagramCarousel.check(r)
    assert.ok(problems.some((p) => p.includes("closing")))
    assert.ok(problems.some((p) => p.includes("one line per slide")))
  })

  test("nobody real speaks", () => {
    const r = carousel()
    r.parts[1]!.text = "Hi, I'm Jane and I own a laundromat."
    assert.ok(
      instagramCarousel.check(r).problems.some((p) => p.includes("speaks as"))
    )
  })
})

describe("carousel output", () => {
  const rendered = {
    spec: figure,
    url: "https://cdn.example.com/f.png",
    width: 1080,
    height: 1350,
    alt: "Chart",
  }

  test("a deck waits for its pictures", () => {
    const waiting = carouselSlides(carousel())
    assert.equal(waiting.ready, false)
    assert.deepEqual(waiting.slides[2]!.pending, figure)
    const deck = carouselSlides(carousel(), [rendered])
    assert.equal(deck.ready, true)
    assert.equal(deck.slides[2]!.image?.fit, "contain")
    assert.deepEqual(
      deck.slides.map((s) => s.role),
      ["cover", "body", "body", "body", "closing"]
    )
    assert.equal(deck.altTexts[3], "A lease.")
  })

  test("the comic has a page per slide, with charts as pictures not prompts", () => {
    const comic = carouselComic(carousel(), [rendered])
    assert.equal(comic.pages.length, 5)
    assert.equal(comic.width, 1080)
    assert.equal(comic.height, 1350)
    const [panel, caption] = comic.pages[2]!.layers
    assert.equal(panel?.type === "panel" && panel.src, rendered.url)
    assert.equal(panel?.type === "panel" && panel.prompt, "")
    assert.ok(panel!.y > caption!.y + caption!.height - 1)
    assert.equal(
      caption?.type === "bubble" && caption.text,
      carousel().parts[2]!.text
    )
    assert.ok(!comic.story?.includes("Revenue"))
  })

  test("ten slides survive the comic path, past the storyboard's six", () => {
    const r = carousel()
    r.parts = Array.from({ length: 10 }, (_, i) => ({ text: `Slide ${i}.` }))
    assert.equal(carouselComic(r).pages.length, 10)
  })
})

const script = (words: number) => `${"word ".repeat(words - 1)}word.`

const video = (): Rendition => {
  const chapters = "0:00 The hook\n1:20 The money\n2:40 What could kill it"
  return {
    format: "youtube",
    title: "The laundromat that prints money",
    parts: [
      { text: "Slow push on a row of washers.", voiceover: script(100) },
      { text: "A town sign.", voiceover: script(100) },
      {
        text: "The chart builds.",
        voiceover: `${script(97)} We estimate $4M.`,
        asset: figure,
      },
      { text: "Coins in a tray.", voiceover: script(100) },
      { text: "A lease on a desk.", voiceover: script(100) },
      { text: "The empty street.", voiceover: script(100) },
    ],
    meta: {
      kind: "video",
      chapters,
      thumbnail: JSON.stringify({
        kind: "illustration",
        scene: "A washer.",
        alt: "A washer.",
      }),
      description: `A small town, a big number.\n\n${chapters}\n\nSources:\nhttps://www.example.com/report`,
    },
  }
}

describe("youtube check", () => {
  test("a good package passes, and words set the estimate", () => {
    const r = video()
    assert.equal(Math.round(estimatedSeconds(r)), 240)
    assert.deepEqual(youtube.check(r), { findings: [], problems: [] })
  })

  test("title and description limits", () => {
    const r = video()
    r.title = "x".repeat(101)
    r.meta.description = `${r.meta.description} ${"x".repeat(5000)}`
    const { problems } = youtube.check(r)
    assert.ok(problems.some((p) => p.includes("cut to 100")))
    assert.ok(problems.some((p) => p.includes("cut to 5000")))
  })

  test("chapters start at 0:00, and open scenes", () => {
    const r = video()
    r.meta.chapters = "0:05 The hook\n1:20 The money\n2:10 Oops"
    const { problems } = youtube.check(r)
    assert.ok(problems.some((p) => p.includes("start at 0:00")))
    assert.ok(
      problems.some((p) =>
        p.includes('"Oops" at 2:10 opens no scene. The nearest starts at 2:00')
      )
    )
    assert.deepEqual(parseChapters("1:02:03 Late")[0]?.seconds, 3723)
  })

  test("sources, voiceover and spoken estimates", () => {
    const r = video()
    r.meta.description = r.meta.description!.replace(/Sources:[\s\S]*/, "")
    r.parts[0]!.voiceover = ""
    r.parts[2]!.voiceover = "Revenue hit $4M."
    const { problems } = youtube.check(r)
    assert.ok(problems.some((p) => p.includes("Sources:")))
    assert.ok(problems.some((p) => p.includes("Scene 1 has no voiceover")))
    assert.ok(problems.some((p) => p.includes("holds an estimate")))
  })

  test("a thumbnail is required on a video only", () => {
    const r = video()
    delete r.meta.thumbnail
    assert.ok(youtube.check(r).problems.some((p) => p.includes("thumbnail")))
    assert.equal(thumbnailSpec(video())?.kind, "illustration")
  })

  test("a Short is capped at three minutes, with no chapters or thumbnail needed", () => {
    const r = video()
    r.meta = {
      kind: "short",
      description: "Sources:\nhttps://www.example.com/report",
    }
    r.parts = [{ text: "Push in.", voiceover: script(100) }]
    assert.deepEqual(youtube.check(r), { findings: [], problems: [] })
    r.parts = [
      { text: "Push in.", voiceover: script(240) },
      { text: "Pull out.", voiceover: script(240) },
    ]
    assert.ok(youtube.check(r).problems.some((p) => p.includes("ends by 180s")))
  })
})

describe("video manifest and post body", () => {
  test("scenes carry estimates, chapters and fit", () => {
    const m = videoManifest(video(), [
      {
        spec: figure,
        url: "https://cdn.example.com/f.png",
        width: 1920,
        height: 1080,
        alt: "Chart",
      },
    ])
    assert.equal(m.width, 1920)
    assert.deepEqual(
      m.scenes.map((s) => s.chapter),
      [
        "The hook",
        undefined,
        "The money",
        undefined,
        "What could kill it",
        undefined,
      ]
    )
    assert.equal(m.scenes[0]!.seconds, 40)
    assert.equal(m.scenes[0]!.image, null)
    assert.equal(m.scenes[2]!.fit, "contain")
    assert.equal(m.scenes[2]!.image, "https://cdn.example.com/f.png")
    parseManifest(m)
  })

  test("a Short is vertical", () => {
    const r = video()
    r.meta.kind = "short"
    const m = videoManifest(r)
    assert.deepEqual([m.width, m.height], [1080, 1920])
    assert.ok(m.scenes.every((s) => !s.chapter))
  })

  test("uploads stay private, disclosed, and Shorts drop the thumbnail", () => {
    const r = video()
    const body = youtubePostBody(r, {
      url: "https://x.test/v.mp4",
      thumbnail: "https://x.test/t.png",
      accountId: "a",
    })
    const data = body.platforms[0]!.platformSpecificData
    assert.equal(data.visibility, "private")
    assert.equal(data.containsSyntheticMedia, true)
    assert.equal(body.mediaItems[0]!.thumbnail, "https://x.test/t.png")
    r.meta.kind = "short"
    assert.equal(
      youtubePostBody(r, {
        url: "https://x.test/v.mp4",
        thumbnail: "https://x.test/t.png",
        accountId: "a",
      }).mediaItems[0]!.thumbnail,
      undefined
    )
  })
})

describe("render script", () => {
  test("an estimate's sentence is never split across captions", () => {
    const line =
      "By our napkin math the shop clears about four hundred thousand dollars every single year after rent."
    assert.deepEqual(cues(line, 30), [line])
    assert.ok(
      cues(
        "Plain sentences break wherever the width says they should break today.",
        30
      ).length > 1
    )
  })

  test("caption text can't smuggle in override tags", () => {
    const ass = subtitles("Hello {\\fs200} wor\\Nld", 4, {
      width: 1920,
      height: 1080,
      card: false,
    })
    assert.ok(ass.includes("Hello \\{\\\u2060fs200\\} wor\\\u2060Nld"))
    assert.ok(ass.includes("0:00:04.00"))
  })

  test("bad manifests stop before any encoding", () => {
    assert.throws(() => parseManifest({ version: 2 }), /version/)
    assert.throws(
      () => parseManifest({ version: 1, width: 640, height: 480, scenes: [] }),
      /size/
    )
  })
})
