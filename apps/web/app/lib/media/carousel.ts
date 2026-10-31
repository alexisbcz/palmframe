import type { ComicProject, PanelLayer } from "@/components/comic-canvas/model"
import { comicFromBoard } from "@/lib/studio/comic"

import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  altTexts,
} from "./formats/instagram_carousel"
import type { AssetSpec, Part, RenderedAsset, Rendition } from "./model"

// A checked carousel Rendition goes one of two ways: a slide spec a renderer can
// draw and post as it stands, or a comic project a person keeps working on.

export interface Slide {
  index: number
  role: "cover" | "body" | "closing"
  text: string
  fontSize: number
  alt: string
  image: {
    url: string
    width: number
    height: number
    fit: "cover" | "contain"
  } | null
  // A picture the slide asked for that hasn't been rendered yet.
  pending: AssetSpec | null
}

export interface SlideDeck {
  width: number
  height: number
  slides: Slide[]
  caption: string
  altTexts: string[]
  // False while any slide still waits for its picture.
  ready: boolean
}

const key = (spec: AssetSpec) => JSON.stringify(spec)

const lookup = (assets: RenderedAsset[]) => {
  const byKey = new Map(assets.map((a) => [key(a.spec), a]))
  return (part: Part) => (part.asset ? byKey.get(key(part.asset)) : undefined)
}

// Data must stay whole; illustrations can bleed.
const fitOf = (spec: AssetSpec) =>
  spec.kind === "illustration" ? ("cover" as const) : ("contain" as const)

export function carouselSlides(
  r: Rendition,
  assets: RenderedAsset[] = []
): SlideDeck {
  const rendered = lookup(assets)
  const alts = altTexts(r)
  const slides = r.parts.map((part, index): Slide => {
    const asset = rendered(part)
    const role =
      index === 0 ? "cover" : index === r.parts.length - 1 ? "closing" : "body"
    return {
      index,
      role,
      text: part.text,
      fontSize: role === "cover" ? 88 : part.asset ? 44 : 60,
      alt: alts[index] || asset?.alt || "",
      image: asset
        ? {
            url: asset.url,
            width: asset.width,
            height: asset.height,
            fit: fitOf(asset.spec),
          }
        : null,
      pending: part.asset && !asset ? part.asset : null,
    }
  })
  return {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    slides,
    caption: r.meta.caption ?? "",
    altTexts: slides.map((s) => s.alt),
    ready: slides.every((s) => !s.pending),
  }
}

// What a panel is asked to draw. Figures and maps are never drawn by the image
// model, whose numbers come out as gibberish: no prompt, they arrive as pictures.
const promptOf = (part: Part) => {
  if (part.asset?.kind === "illustration") return part.asset.scene
  if (part.asset) return ""
  return part.text
}

const COVER_FONT = 52
// Clears comicFromBoard's caption box, so a chart sits under the words.
const CHART_TOP = 339

export function carouselComic(
  r: Rendition,
  assets: RenderedAsset[] = []
): ComicProject {
  const rendered = lookup(assets)
  const project = comicFromBoard({
    hook: r.title,
    angle: "",
    whyItWorks: [],
    postText: r.meta.caption ?? "",
    scenes: r.parts.map((part) => ({
      scene: promptOf(part),
      caption: part.text,
    })),
  })
  project.story = r.parts.map(promptOf).filter(Boolean).join("\n")

  project.pages.forEach((page, i) => {
    const part = r.parts[i]!
    const panel = page.layers.find((l): l is PanelLayer => l.type === "panel")!
    const asset = rendered(part)
    if (asset) {
      panel.src = asset.url
      panel.fit = fitOf(asset.spec)
    }
    if (part.asset && part.asset.kind !== "illustration") {
      panel.height -= CHART_TOP - panel.y
      panel.y = CHART_TOP
    }
    const caption = page.layers.find((l) => l.type === "bubble")
    if (i === 0 && caption?.type === "bubble") caption.fontSize = COVER_FONT
  })
  return project
}
