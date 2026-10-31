import {
  LAYOUTS,
  createPanel,
  layoutRects,
  type ComicDoc,
  type Layer,
  type PanelLayer,
  type Rect,
} from "./model"

// One-click page layouts. Cells are in a unit page, listed in left-to-right
// reading order; right-to-left mirrors them, as a manga page reads.
export interface PagePreset {
  id: string
  cells: Rect[]
  // Formats it reads best in. Every preset works in every format.
  best?: ("carousel" | "reel" | "square")[]
}

const tier = (y: number, height: number, widths: number[]): Rect[] => {
  let x = 0
  return widths.map((width) => {
    const cell = { x, y, width, height }
    x += width
    return cell
  })
}

export const PRESETS: PagePreset[] = [
  // The original seven, so existing pages keep their names.
  ...LAYOUTS.map(({ id, cells }) => ({ id, cells })),
  { id: "side-by-side", cells: tier(0, 1, [0.5, 0.5]) },
  {
    id: "four-tiers",
    cells: [0, 1, 2, 3].map((i) => ({
      x: 0,
      y: i / 4,
      width: 1,
      height: 1 / 4,
    })),
    best: ["reel"],
  },
  {
    id: "six-grid",
    cells: [0, 1, 2].flatMap((row) => tier(row / 3, 1 / 3, [0.5, 0.5])),
    best: ["reel", "carousel"],
  },
  // Manga tiers: an establishing strip, a beat split unevenly, a payoff strip.
  {
    id: "manga-tiers",
    cells: [
      ...tier(0, 0.28, [1]),
      ...tier(0.28, 0.4, [0.42, 0.58]),
      ...tier(0.68, 0.32, [1]),
    ],
    best: ["carousel", "reel"],
  },
  {
    id: "manga-action",
    cells: [
      ...tier(0, 0.3, [0.64, 0.36]),
      ...tier(0.3, 0.38, [1]),
      ...tier(0.68, 0.32, [0.3, 0.35, 0.35]),
    ],
    best: ["carousel", "reel"],
  },
  {
    id: "tall-stack",
    cells: [
      { x: 0, y: 0, width: 0.56, height: 1 },
      { x: 0.56, y: 0, width: 0.44, height: 1 / 3 },
      { x: 0.56, y: 1 / 3, width: 0.44, height: 1 / 3 },
      { x: 0.56, y: 2 / 3, width: 0.44, height: 1 / 3 },
    ],
    best: ["carousel", "square"],
  },
  {
    id: "big-three",
    cells: [...tier(0, 0.62, [1]), ...tier(0.62, 0.38, [1 / 3, 1 / 3, 1 / 3])],
  },
  // A splash with a small close-up laid over its lower corner.
  {
    id: "splash-inset",
    cells: [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.56, y: 0.64, width: 0.4, height: 0.32 },
    ],
    best: ["carousel", "reel"],
  },
]

const mirror = (cells: Rect[]) =>
  cells.map((c) => ({ ...c, x: 1 - c.x - c.width }))

// Panels sorted the way the page reads: tiers top to bottom, then across.
// Frames whose tops are within a few pixels share a tier.
export function readingOrder<T extends Pick<Layer, "x" | "y" | "width">>(
  layers: T[],
  rtl = false
) {
  return [...layers].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 8) return a.y - b.y
    return rtl ? b.x + b.width - (a.x + a.width) : a.x - b.x
  })
}

export function presetRects(
  preset: PagePreset,
  doc: Pick<ComicDoc, "width" | "height">,
  rtl = false
) {
  return layoutRects(
    rtl ? mirror(preset.cells) : preset.cells,
    doc.width,
    doc.height
  )
}

// The page with its panels replaced by the preset's. Panels carry over in
// reading order with their art, prompt and id (so running renders still land);
// bubbles and text stay where they are.
export function placePreset(
  doc: ComicDoc,
  preset: PagePreset,
  rtl = false
): Layer[] {
  const old = readingOrder(
    doc.layers.filter((l): l is PanelLayer => l.type === "panel"),
    rtl
  )
  const rects = presetRects(preset, doc, rtl)
  const order = readingOrder(
    rects.map((r, i) => ({ ...r, i })),
    rtl
  ).map((r) => r.i)
  const panels = rects.map((rect, i) => {
    const n = order.indexOf(i)
    const prev = old[n]
    const name = `Panel ${n + 1}`
    return prev
      ? { ...prev, ...rect, rotation: 0, name }
      : { ...createPanel(rect), name }
  })
  // A locked panel the preset has no cell for stays where it is.
  const kept = old.slice(rects.length).filter((l) => l.locked)
  // An inset sits on top of the frame it overlaps, so keep cell order.
  return [...panels, ...kept, ...doc.layers.filter((l) => l.type !== "panel")]
}

// Closer than this, two cells' edges are one edge. Fractions of the page.
const GUTTER_REACH = 0.06
const EDGE_SNAP = 0.012
const PAGE_SNAP = 0.02

// Pulls edges within `reach` of each other to their mean.
function snapValues(values: number[], reach: number) {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const out = [...values]
  for (let a = 0; a < sorted.length;) {
    let b = a + 1
    while (b < sorted.length && sorted[b]!.v - sorted[b - 1]!.v <= reach) b++
    const group = sorted.slice(a, b)
    const mean = group.reduce((sum, g) => sum + g.v, 0) / group.length
    for (const g of group) out[g.i] = mean
    a = b
  }
  return out
}

// Cells for one axis: [start, end] pairs of every frame, gutters closed.
function closeAxis(
  frames: { from: number; to: number; acrossFrom: number; acrossTo: number }[]
) {
  const pairs = frames.map((f) => [f.from, f.to] as [number, number])
  frames.forEach((a, i) => {
    frames.forEach((b, j) => {
      const gap = b.from - a.to
      const faces = a.acrossFrom < b.acrossTo && b.acrossFrom < a.acrossTo
      if (i === j || !faces || gap < -PAGE_SNAP || gap > GUTTER_REACH) return
      const middle = (a.to + b.from) / 2
      pairs[i]![1] = middle
      pairs[j]![0] = middle
    })
  })
  const flat = snapValues(pairs.flat(), EDGE_SNAP).map((v) => {
    const unit = Math.min(1, Math.max(0, v))
    if (unit <= PAGE_SNAP) return 0
    return unit >= 1 - PAGE_SNAP ? 1 : unit
  })
  return pairs.map((_, i) => [flat[i * 2]!, flat[i * 2 + 1]!] as const)
}

const fourPlaces = (v: number) => Math.round(v * 10000) / 10000

// Preset cells from frames found on a page. `layoutRects` adds the margin
// and gutters itself, so the frames' own are taken out: their outline
// becomes the unit page and facing edges meet. Cells are stored left to
// right, which `presetRects` mirrors back when the project reads the other way.
export function cellsFromFrames(frames: Rect[], rtl = false): Rect[] {
  if (!frames.length) return []
  const left = Math.min(...frames.map((f) => f.x))
  const top = Math.min(...frames.map((f) => f.y))
  const across = Math.max(...frames.map((f) => f.x + f.width)) - left
  const down = Math.max(...frames.map((f) => f.y + f.height)) - top
  const unit = frames.map((f) => ({
    x0: (f.x - left) / across,
    y0: (f.y - top) / down,
    x1: (f.x + f.width - left) / across,
    y1: (f.y + f.height - top) / down,
  }))
  const xs = closeAxis(
    unit.map((u) => ({
      from: u.x0,
      to: u.x1,
      acrossFrom: u.y0,
      acrossTo: u.y1,
    }))
  )
  const ys = closeAxis(
    unit.map((u) => ({
      from: u.y0,
      to: u.y1,
      acrossFrom: u.x0,
      acrossTo: u.x1,
    }))
  )
  const cells = unit.map((u, i) => {
    // Snapping must never close a thin cell up: it would draw inside out.
    const [ax0, ax1] = xs[i]!
    const [ay0, ay1] = ys[i]!
    const [x0, x1] = ax1 > ax0 ? [ax0, ax1] : [u.x0, u.x1]
    const [y0, y1] = ay1 > ay0 ? [ay0, ay1] : [u.y0, u.y1]
    return {
      x: fourPlaces(x0),
      y: fourPlaces(y0),
      width: fourPlaces(x1 - x0),
      height: fourPlaces(y1 - y0),
    }
  })
  return rtl ? mirror(cells).map((c) => ({ ...c, x: fourPlaces(c.x) })) : cells
}
