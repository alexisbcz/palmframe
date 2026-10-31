import { imageGeometry, localToImage } from "./edit-tools"
import { cellsFromFrames, presetRects, readingOrder } from "./layouts"
import {
  PANEL_GUTTER,
  createPanel,
  uid,
  withCurrentImage,
  type ComicDoc,
  type Layer,
  type PanelLayer,
  type Rect,
} from "./model"

type Size = { width: number; height: number }

// Which image pixel sits at a frame's centre, and how large it's drawn.
export interface CropView {
  cx: number
  cy: number
  // Page units per image pixel.
  scale: number
}

// The zoom and pan that show `view` in a frame, whatever its shape. The one
// place that inverts the drawing maths. Pan is relative to the image's
// overflow, so any change of frame changes it too.
export function solveCrop(frame: Size, image: Size, view: CropView) {
  const cover = Math.max(frame.width / image.width, frame.height / image.height)
  const pan = (offset: number, overflow: number) =>
    overflow < 1e-6 ? 0 : (offset / (overflow / 2)) * 100
  return {
    fit: "cover" as const,
    imageZoom: (view.scale / cover) * 100,
    panX: pan(
      (image.width / 2 - view.cx) * view.scale,
      Math.abs(image.width * view.scale - frame.width)
    ),
    panY: pan(
      (image.height / 2 - view.cy) * view.scale,
      Math.abs(image.height * view.scale - frame.height)
    ),
  }
}

// A region of the image filling a frame, centred when their shapes differ.
export function coverView(frame: Size, region: Rect): CropView {
  return {
    cx: region.x + region.width / 2,
    cy: region.y + region.height / 2,
    scale: Math.max(frame.width / region.width, frame.height / region.height),
  }
}

export type KnifeAxis = "x" | "y"

export interface Cut {
  axis: KnifeAxis
  // Where along the panel's side, from 0 to 1.
  at: number
}

// Below this a part can't hold a drawing or be grabbed.
export const MIN_PART = 64

export type KnifeRefusal = "locked" | "rotated" | "stretched" | "tooSmall"

// The parts of a panel, with a gutter between them.
function partsOf(panel: Rect, { axis, at }: Cut, gap: number): [Rect, Rect] {
  const { x, y, width, height } = panel
  if (axis === "x") {
    const line = width * at
    return [
      { x, y, height, width: Math.round(line - gap / 2) },
      {
        x: Math.round(x + line + gap / 2),
        y,
        height,
        width: Math.round(width - line - gap / 2),
      },
    ]
  }
  const line = height * at
  return [
    { x, y, width, height: Math.round(line - gap / 2) },
    {
      x,
      y: Math.round(y + line + gap / 2),
      width,
      height: Math.round(height - line - gap / 2),
    },
  ]
}

// Why a panel can't be cut, if it can't. A rotated panel's parts wouldn't
// stay axis-aligned; a stretched image has two scales and cover has one.
export function knifeRefusal(
  panel: PanelLayer,
  cut: Cut,
  image: Size | null,
  gap = PANEL_GUTTER
): KnifeRefusal | null {
  if (panel.locked) return "locked"
  if (panel.rotation % 360 !== 0) return "rotated"
  const parts = partsOf(panel, cut, gap)
  if (parts.some((p) => p.width < MIN_PART || p.height < MIN_PART))
    return "tooSmall"
  if (panel.src && panel.fit === "fill" && image) {
    const g = imageGeometry(panel, image.width, image.height)
    const sx = g.w / image.width
    if (Math.abs(sx - g.h / image.height) > 1e-3 * sx) return "stretched"
  }
  return null
}

// Two panels from one, with the art staying where it was on the page: each
// part shows its own window on the same image and the gutter hides what falls
// between them. `image` is the panel's image size, when it has one.
export function knife(
  panel: PanelLayer,
  cut: Cut,
  image: Size | null,
  name: string,
  gap = PANEL_GUTTER
): [PanelLayer, PanelLayer] {
  const [first, second] = partsOf(panel, cut, gap)
  const crop = (part: Rect) => {
    if (!panel.src || !image) return {}
    const { x, y, scale } = localToImage(
      panel,
      image.width,
      image.height,
      part.x + part.width / 2 - (panel.x + panel.width / 2),
      part.y + part.height / 2 - (panel.y + panel.height / 2)
    )
    return solveCrop(part, image, { cx: x, cy: y, scale: 1 / scale })
  }
  // What belongs to one panel stays on the first: its lines, its undo trail.
  const { guide, coverage, script, versions, ...shared } = panel
  return [
    { ...panel, ...first, ...crop(first) },
    { ...shared, ...second, ...crop(second), id: uid(), name },
  ]
}

// The page's layers with one panel knifed in place, or null if it can't be.
export function knifeLayer(
  doc: Pick<ComicDoc, "layers">,
  id: string,
  cut: Cut,
  image: Size | null
): Layer[] | null {
  const panel = doc.layers.find(
    (l): l is PanelLayer => l.id === id && l.type === "panel"
  )
  if (!panel || knifeRefusal(panel, cut, image)) return null
  const count = doc.layers.filter((l) => l.type === "panel").length
  const parts = knife(panel, cut, image, `Panel ${count + 1}`)
  return doc.layers.flatMap((l) => (l.id === id ? parts : [l]))
}

// One image across new panels: `rects[i]` shows `frames[i]`, given in
// fractions of the image. `order[n]` is the rect that reads nth. A panel a
// new one replaces passes on its id, so a running render still lands, and
// its image goes to the new panel's versions.
function panelsFromFrames(
  rects: Rect[],
  frames: Rect[],
  src: string,
  image: Size,
  previous: PanelLayer[],
  order: number[]
): PanelLayer[] {
  return rects.map((rect, i) => {
    const frame = frames[i]!
    const region = {
      x: frame.x * image.width,
      y: frame.y * image.height,
      width: frame.width * image.width,
      height: frame.height * image.height,
    }
    const n = order.indexOf(i)
    const prev = previous[n]
    const panel: PanelLayer = {
      ...createPanel(rect, src),
      ...solveCrop(rect, image, coverView(rect, region)),
      name: `Panel ${n + 1}`,
    }
    if (!prev) return panel
    return {
      ...panel,
      id: prev.id,
      ...(prev.src && prev.src !== src && { versions: withCurrentImage(prev) }),
    }
  })
}

// The image a page most likely is: the selected panel's, or the largest one.
export function pageSource(layers: Layer[], selectedId?: string | null) {
  const art = layers.filter(
    (l): l is PanelLayer & { src: string } => l.type === "panel" && !!l.src
  )
  const selected = art.find((l) => l.id === selectedId)
  if (selected) return selected.src
  const area = (l: Rect) => l.width * l.height
  return art.reduce<PanelLayer | null>(
    (best, l) => (!best || area(l) > area(best) ? l : best),
    null
  )?.src
}

// The page cut from one image, keeping what isn't a panel. A panel the page
// no longer has room for goes, so callers refuse locked ones first.
export function placeFrames(
  doc: ComicDoc,
  frames: Rect[],
  src: string,
  image: Size,
  rtl = false
): Layer[] {
  const old = readingOrder(
    doc.layers.filter((l): l is PanelLayer => l.type === "panel"),
    rtl
  )
  const preset = { id: "frames", cells: cellsFromFrames(frames, rtl) }
  const rects = presetRects(preset, doc, rtl)
  const order = readingOrder(
    rects.map((r, i) => ({ ...r, i })),
    rtl
  ).map((r) => r.i)
  return [
    ...panelsFromFrames(rects, frames, src, image, old, order),
    ...doc.layers.filter((l) => l.type !== "panel"),
  ]
}

// Editing a frame on the correction overlay, in fractions of the image.
export type FrameHandle =
  "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export const MIN_FRAME = 0.03

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

export function dragFrame(
  start: Rect,
  handle: FrameHandle,
  dx: number,
  dy: number
): Rect {
  if (handle === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.width),
      y: clamp(start.y + dy, 0, 1 - start.height),
    }
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_FRAME)
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_FRAME, 1)
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_FRAME)
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_FRAME, 1)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// A frame in two halves that touch: a preset's gutters come from the page.
export function splitFrame(frame: Rect, axis: KnifeAxis): [Rect, Rect] {
  const { x, y, width, height } = frame
  return axis === "x"
    ? [
        { x, y, height, width: width / 2 },
        { x: x + width / 2, y, height, width: width / 2 },
      ]
    : [
        { x, y, width, height: height / 2 },
        { x, y: y + height / 2, width, height: height / 2 },
      ]
}
