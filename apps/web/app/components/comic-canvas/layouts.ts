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
  // An inset sits on top of the frame it overlaps, so keep cell order.
  return [...panels, ...doc.layers.filter((l) => l.type !== "panel")]
}
