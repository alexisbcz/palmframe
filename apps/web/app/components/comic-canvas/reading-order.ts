import { readingOrder } from "./layouts"
import type { Layer, LetteringLayer, PanelLayer, Rect } from "./model"

// The order a page's lettering is read in. Raw y and x would mix up two panels
// side by side, so lines go panel by panel, then down each panel.

export interface PlacedLine {
  layer: LetteringLayer
  // Counted from 1 in reading order. A page without panels has no frame.
  panel: number
  frame?: PanelLayer
}

// How far a point sits outside a rectangle.
export function distance(r: Rect, x: number, y: number) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width))
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height))
  return Math.hypot(dx, dy)
}

// The panel a line belongs to: the innermost one its centre is in, so an inset
// keeps its own lettering, or the nearest for a line in the gutter.
function holder(frames: PanelLayer[], l: LetteringLayer) {
  const x = l.x + l.width / 2
  const y = l.y + l.height / 2
  let best = 0
  let away = Infinity
  let area = Infinity
  frames.forEach((frame, i) => {
    const d = distance(frame, x, y)
    const a = frame.width * frame.height
    if (d < away || (d === away && a < area)) {
      best = i
      away = d
      area = a
    }
  })
  return best
}

// Top to bottom. A line starting above the middle of the row's first line
// shares its row, which reads across: from the right on a right-to-left page.
function downThePanel(lines: LetteringLayer[], rtl: boolean) {
  const rows: LetteringLayer[][] = []
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const row = rows.at(-1)
    if (row && l.y < row[0]!.y + row[0]!.height / 2) row.push(l)
    else rows.push([l])
  }
  return rows.flatMap((row) =>
    row.sort((a, b) => (rtl ? b.x + b.width - (a.x + a.width) : a.x - b.x))
  )
}

export function letteringOrder(layers: Layer[], rtl = false): PlacedLine[] {
  const frames = readingOrder(
    layers.filter((l): l is PanelLayer => l.type === "panel" && !l.hidden),
    rtl
  )
  const held = Array.from(
    { length: Math.max(1, frames.length) },
    (): LetteringLayer[] => []
  )
  for (const l of layers) {
    if (l.type !== "panel" && !l.hidden && l.text.trim())
      held[holder(frames, l)]!.push(l)
  }
  return held.flatMap((lines, i) =>
    downThePanel(lines, rtl).map((layer) => ({
      layer,
      panel: i + 1,
      frame: frames[i],
    }))
  )
}
