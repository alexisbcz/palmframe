import type { Locale } from "@/i18n/core"

import type { TranslateLine } from "@/routes/api.translate"

import { pageFaces } from "./check"
import {
  pageDoc,
  type BubbleLayer,
  type Character,
  type ComicDoc,
  type ComicProject,
  type Layer,
  type LetteringLayer,
  type LetteringTranslation,
  type PanelLayer,
  type TextLayer,
} from "./model"
import { distance, letteringOrder } from "./reading-order"
import {
  BUBBLE_LINE_HEIGHT,
  TEXT_LINE_HEIGHT,
  bubbleTextBox,
  fitText,
  fontsReady,
  textLines,
  toLocal,
  toPage,
} from "./render"

export type LineStatus = "missing" | "stale" | "done"

export interface LetteringLine {
  id: string
  page: number
  // Counted from 1 in the page's reading order, when the page has panels.
  panel?: number
  shape: BubbleLayer["shape"] | "sfx"
  speaker?: string
  text: string
  translation?: LetteringTranslation
  status: LineStatus
}

const statusOf = (l: LetteringLayer, t?: LetteringTranslation): LineStatus =>
  !t ? "missing" : t.source === l.text ? "done" : "stale"

// A bubble keeps its default layer name until someone names it.
const UNNAMED = /^(speech|thought|shout|message|caption)(\s+\d+)?$/i

// A best guess at who says a line, for the translator's sake: the name the
// script gave the bubble, the character its tail points at, or the only
// character in the shot.
export function speakerOf(
  l: LetteringLayer,
  panel: PanelLayer,
  cast: Character[] = []
) {
  if (l.type !== "bubble" || l.shape === "caption") return undefined
  const name = l.name.trim()
  if (name && !UNNAMED.test(name)) return name
  const nameOf = (id: string | null | undefined) =>
    cast.find((c) => c.id === id)?.name.trim() || undefined

  if (l.tail) {
    const tip = toPage(l, l.tailX, l.tailY)
    const closest = pageFaces(panel)
      .filter((f) => nameOf(f.who))
      .map((f) => ({ who: f.who, away: distance(f, tip.x, tip.y) }))
      .sort((a, b) => a.away - b.away)[0]
    if (closest) return nameOf(closest.who)
  }
  return panel.cast?.length === 1 ? nameOf(panel.cast[0]) : undefined
}

// Every line with something to translate, panel by panel in reading order.
export function letteringLines(
  project: ComicProject,
  language: Locale
): LetteringLine[] {
  return project.pages.flatMap((page, index) =>
    letteringOrder(page.layers, project.rtl).map(
      ({ layer: l, panel, frame }) => {
        const translation = l.translations?.[language]
        const speaker = frame && speakerOf(l, frame, project.cast)
        return {
          id: l.id,
          page: index,
          ...(frame && { panel }),
          shape: l.type === "bubble" ? l.shape : "sfx",
          ...(speaker && { speaker }),
          text: l.text,
          translation,
          status: statusOf(l, translation),
        }
      }
    )
  )
}

// What a translation run sends: what's missing or out of date, or everything
// when nothing is, so a line can be redone. Hand edits are never included.
export function linesToTranslate(lines: LetteringLine[]) {
  const open = lines.filter((l) => !l.translation?.edited)
  const behind = open.filter((l) => l.status !== "done")
  return behind.length ? behind : open
}

// How many lines either side of a line being translated travel with it.
const CONTEXT_REACH = 8

// What a run sends: the lines to translate, among their neighbours in reading
// order. Those are read-only, so redoing one line still reads as dialogue and
// matches what the lines around it already say.
export function requestLines(
  lines: LetteringLine[],
  pending: LetteringLine[]
): TranslateLine[] {
  const open = new Set(pending.map((l) => l.id))
  return lines.flatMap((l, i) => {
    const near = lines
      .slice(Math.max(0, i - CONTEXT_REACH), i + CONTEXT_REACH + 1)
      .some((n) => open.has(n.id))
    if (!near) return []
    const { id, page, panel, shape, speaker, text } = l
    return [
      {
        id,
        page: page + 1,
        panel,
        shape,
        speaker,
        text,
        ...(!open.has(id) && {
          readOnly: true,
          translation: l.translation?.text,
        }),
      },
    ]
  })
}

function mapLettering(
  project: ComicProject,
  fn: (l: LetteringLayer) => LetteringLayer
): ComicProject {
  return {
    ...project,
    pages: project.pages.map((page) => ({
      ...page,
      layers: page.layers.map((l) => (l.type === "panel" ? l : fn(l))),
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
  return mapLettering(project, (l) => {
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

// A line typed by hand. Emptied, it goes back to having no translation.
export function withEditedLine(
  project: ComicProject,
  language: Locale,
  id: string,
  text: string
) {
  return mapLettering(project, (l) => {
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

// Loose lettering over new text. The box stays where it is, so an effect keeps
// its place in the art, and the type shrinks until the text fits. It can use
// the room the original took, for lettering that was already spilling out.
export function refitText(
  ctx: CanvasRenderingContext2D,
  l: TextLayer,
  text: string
): TextLayer {
  const original = textLines(ctx, l, l.text)
  const { size } = fitText(
    ctx,
    l.uppercase ? text.toUpperCase() : text,
    l.font,
    l.fontSize,
    l.width,
    Math.max(l.height, original.length * l.fontSize * TEXT_LINE_HEIGHT),
    TEXT_LINE_HEIGHT
  )
  return {
    ...l,
    text,
    fontSize: size,
    strokeWidth: (l.strokeWidth * size) / l.fontSize,
  }
}

// A slide with a language's lettering in place. Lettering is measured here
// rather than stored, so moving a bubble later moves it in every language.
export async function translatedDoc(
  doc: ComicDoc,
  language: Locale | null
): Promise<ComicDoc> {
  if (!language) return doc
  const translated = (l: Layer) =>
    l.type === "panel" ? undefined : l.translations?.[language]?.text
  await fontsReady(doc.layers.map(translated).join(""))
  const ctx = document.createElement("canvas").getContext("2d")!
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const text = translated(l)
      if (!text || l.type === "panel") return l
      return l.type === "bubble"
        ? refitBubble(ctx, l, text, doc)
        : refitText(ctx, l, text)
    }),
  }
}

export const translatedPage = (
  project: ComicProject,
  index: number,
  language: Locale | null
) => translatedDoc(pageDoc(project, index), language)
