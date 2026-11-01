import { readingOrder } from "@/components/comic-canvas/layouts"
import type {
  ComicProject,
  Layer,
  PanelLayer,
} from "@/components/comic-canvas/model"
import {
  DETECT_SIDE,
  detectPanels,
  type Frame,
} from "@/components/comic-canvas/pixel/detect-panels"
import { grayFromRgba } from "@/components/comic-canvas/pixel/gray"

// Fractions of a page. Detection is a first draft, so these stay editable
// until the person accepts them.
export type PageFrames = Frame[]

export const WORK_SIDE = 2000
const PANEL_SIDE = 1568
export const MIN_FRAME = 0.04

export const framesInOrder = (frames: Frame[], rtl: boolean) =>
  readingOrder(
    frames.map((f) => ({
      ...f,
      y: f.y * 1000,
      x: f.x * 1000,
      width: f.width * 1000,
    })),
    rtl
  ).map((f) => ({ ...f, x: f.x / 1000, y: f.y / 1000, width: f.width / 1000 }))

export function detectFrames(canvas: HTMLCanvasElement): Frame[] {
  const scale = Math.min(1, DETECT_SIDE / Math.max(canvas.width, canvas.height))
  const small = document.createElement("canvas")
  small.width = Math.max(1, Math.round(canvas.width * scale))
  small.height = Math.max(1, Math.round(canvas.height * scale))
  const ctx = small.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(canvas, 0, 0, small.width, small.height)
  const { data } = ctx.getImageData(0, 0, small.width, small.height)
  const { frames } = detectPanels(grayFromRgba(data, small.width, small.height))
  return frames.length ? frames : [{ x: 0, y: 0, width: 1, height: 1 }]
}

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No image."))),
      "image/jpeg",
      0.88
    )
  )

export function cropPanel(page: HTMLCanvasElement, f: Frame) {
  const sx = f.x * page.width
  const sy = f.y * page.height
  const sw = f.width * page.width
  const sh = f.height * page.height
  const scale = Math.min(1, PANEL_SIDE / Math.max(sw, sh))
  const out = document.createElement("canvas")
  out.width = Math.max(1, Math.round(sw * scale))
  out.height = Math.max(1, Math.round(sh * scale))
  out
    .getContext("2d")!
    .drawImage(page, sx, sy, sw, sh, 0, 0, out.width, out.height)
  return toJpeg(out)
}

export interface ProjectPanel {
  page: number
  src: string
  hint: string
}

const inside = (l: Layer, p: PanelLayer) => {
  const cx = l.x + l.width / 2
  const cy = l.y + l.height / 2
  return cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height
}

// A Palmframe comic already separates art from lettering, so its panels come
// clean and its words come as text. Lettering goes to the panel it sits on,
// or to the page's first panel.
export function panelsOfProject(project: ComicProject): ProjectPanel[] {
  return project.pages.flatMap((page, index) => {
    const panels = readingOrder(
      page.layers.filter(
        (l): l is PanelLayer & { src: string } => l.type === "panel" && !!l.src
      )
    )
    const words = page.layers.flatMap((l) =>
      l.type !== "panel" && l.text.trim() ? [l] : []
    )
    return panels.map((panel, i) => ({
      page: index,
      src: panel.src,
      hint: words
        .filter(
          (w) =>
            inside(w, panel) || (i === 0 && !panels.some((p) => inside(w, p)))
        )
        .map((w) => w.text.trim())
        .join(" / "),
    }))
  })
}
