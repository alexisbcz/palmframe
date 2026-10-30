import type { Locale } from "@/i18n/core"

import {
  pageDoc,
  type BubbleLayer,
  type BubbleTranslation,
  type ComicDoc,
  type ComicProject,
} from "./model"
import {
  BUBBLE_LINE_HEIGHT,
  bubbleTextBox,
  fitText,
  fontsReady,
  toLocal,
  toPage,
} from "./render"

export type LineStatus = "missing" | "stale" | "done"

export interface LetteringLine {
  id: string
  page: number
  shape: BubbleLayer["shape"]
  text: string
  translation?: BubbleTranslation
  status: LineStatus
}

const statusOf = (l: BubbleLayer, t?: BubbleTranslation): LineStatus =>
  !t ? "missing" : t.source === l.text ? "done" : "stale"

// Every bubble with something to translate, in reading order.
export function letteringLines(
  project: ComicProject,
  language: Locale
): LetteringLine[] {
  const side = project.rtl ? -1 : 1
  return project.pages.flatMap((page, index) =>
    page.layers
      .filter(
        (l): l is BubbleLayer =>
          l.type === "bubble" && !l.hidden && !!l.text.trim()
      )
      .sort((a, b) => a.y - b.y || (a.x - b.x) * side)
      .map((l) => {
        const translation = l.translations?.[language]
        return {
          id: l.id,
          page: index,
          shape: l.shape,
          text: l.text,
          translation,
          status: statusOf(l, translation),
        }
      })
  )
}

// What a translation run sends: what's missing or out of date, or everything
// when nothing is, so a line can be redone. Hand edits are never included.
export function linesToTranslate(lines: LetteringLine[]) {
  const open = lines.filter((l) => !l.translation?.edited)
  const behind = open.filter((l) => l.status !== "done")
  return behind.length ? behind : open
}

function mapBubbles(
  project: ComicProject,
  fn: (l: BubbleLayer) => BubbleLayer
): ComicProject {
  return {
    ...project,
    pages: project.pages.map((page) => ({
      ...page,
      layers: page.layers.map((l) => (l.type === "bubble" ? fn(l) : l)),
    })),
  }
}

// A finished translation run. A line edited by hand or rewritten while the
// request was out keeps what it has.
export function withTranslations(
  project: ComicProject,
  language: Locale,
  sent: { id: string; text: string }[],
  results: { id: string; text: string }[]
) {
  const sources = new Map(sent.map((l) => [l.id, l.text]))
  const texts = new Map(results.map((l) => [l.id, l.text]))
  return mapBubbles(project, (l) => {
    const text = texts.get(l.id)
    if (
      !text ||
      sources.get(l.id) !== l.text ||
      l.translations?.[language]?.edited
    )
      return l
    return {
      ...l,
      translations: { ...l.translations, [language]: { text, source: l.text } },
    }
  })
}

// A line typed by hand. Emptied, the bubble goes back to having no translation.
export function withEditedLine(
  project: ComicProject,
  language: Locale,
  id: string,
  text: string
) {
  return mapBubbles(project, (l) => {
    if (l.id !== id) return l
    const { [language]: _, ...others } = l.translations ?? {}
    return {
      ...l,
      translations: text.trim()
        ? { ...others, [language]: { text, source: l.text, edited: true } }
        : others,
    }
  })
}

// How far a text pushes a bubble: the factor its box needs for the text to
// sit at `size`.
function neededScale(
  ctx: CanvasRenderingContext2D,
  l: BubbleLayer,
  text: string,
  size: number
) {
  const fits = (s: number) => {
    const box = bubbleTextBox({
      shape: l.shape,
      width: l.width * s,
      height: l.height * s,
    })
    return (
      fitText(
        ctx,
        text,
        l.font,
        size,
        box.width,
        box.height,
        BUBBLE_LINE_HEIGHT
      ).size >= size
    )
  }
  let low = 0.25
  let high = 4
  for (let i = 0; i < 10; i++) {
    const mid = (low + high) / 2
    if (fits(mid)) high = mid
    else low = mid
  }
  return high
}

const MIN_SCALE = 0.75
const MAX_SCALE = 1.8

// A bubble around new text, at the type size it has now. It keeps its shape:
// balloons grow from their centre, boxes from their top left corner, nothing
// leaves the page, and the tail keeps pointing at the same speaker. Past the
// limits the lettering shrinks, as it does in any tight bubble.
export function refitBubble(
  ctx: CanvasRenderingContext2D,
  l: BubbleLayer,
  text: string,
  page: { width: number; height: number }
): BubbleLayer {
  const shown = (t: string) => (l.uppercase ? t.toUpperCase() : t)
  const box = bubbleTextBox(l)
  const { size } = fitText(
    ctx,
    shown(l.text),
    l.font,
    l.fontSize,
    box.width,
    box.height,
    BUBBLE_LINE_HEIGHT
  )
  // Longer text grows the bubble only as far as it needs. Shorter text shrinks
  // it in proportion, so a bubble drawn roomy stays as roomy.
  const needed = neededScale(ctx, l, shown(text), size)
  const wanted =
    needed > 1
      ? needed
      : Math.min(1, needed / neededScale(ctx, l, shown(l.text), size))
  const scale = Math.min(
    Math.max(MIN_SCALE, Math.min(MAX_SCALE, wanted)),
    page.width / l.width,
    page.height / l.height
  )
  // Close enough: don't nudge a bubble the letterer placed.
  if (Math.abs(scale - 1) < 0.04) return { ...l, text }

  const width = l.width * scale
  const height = l.height * scale
  const boxed = l.shape === "caption" || l.shape === "message"
  const x = boxed ? l.x : l.x + (l.width - width) / 2
  const y = boxed ? l.y : l.y + (l.height - height) / 2
  const fitted = {
    ...l,
    text,
    width,
    height,
    x: Math.max(0, Math.min(page.width - width, x)),
    y: Math.max(0, Math.min(page.height - height, y)),
  }
  const tip = toPage(l, l.tailX, l.tailY)
  const tail = toLocal(fitted, tip.x, tip.y)
  return { ...fitted, tailX: tail.x, tailY: tail.y }
}

// A slide with a language's lettering in place. Bubbles are measured here
// rather than stored, so moving one later moves it in every language.
export async function translatedDoc(
  doc: ComicDoc,
  language: Locale | null
): Promise<ComicDoc> {
  if (!language) return doc
  await fontsReady()
  const ctx = document.createElement("canvas").getContext("2d")!
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const text = l.type === "bubble" && l.translations?.[language]?.text
      return l.type === "bubble" && text ? refitBubble(ctx, l, text, doc) : l
    }),
  }
}

export const translatedPage = (
  project: ComicProject,
  index: number,
  language: Locale | null
) => translatedDoc(pageDoc(project, index), language)
