import type { Gray } from "./gray"

// Finds a page's panels from its gutters. Written for this app, with no
// third-party detection code. It is a first draft for a person to correct:
// borderless art, bleeds, slanted gutters and insets all come out wrong, so
// nothing may apply a result without the correction step.

// Fractions of the page, from its top left.
export interface Frame {
  x: number
  y: number
  width: number
  height: number
}

// `noMargin`: the page edge isn't one flat colour, so art likely bleeds.
// `oneFrame`: no gutter was found, which also describes a page we can't read.
export type DetectionNote = "noMargin" | "oneFrame"

export interface Detection {
  frames: Frame[]
  notes: DetectionNote[]
}

// How long a side the analysis needs; frame lines survive this scale.
export const DETECT_SIDE = 720

// Levels from the paper that count as ink. Above JPEG noise.
const INK_LEVELS = 28
// A gutter may be crossed by this share of ink: a balloon poking through it.
const GUTTER_INK = 0.25
// A gutter's thickness, as a share of the page side.
const GUTTER_MIN = 0.0035
// A straight run this long (share of the page side) is a frame line, and a
// gutter never crosses one. That keeps blank sky inside a frame in one piece.
const FRAME_LINE = 0.12
// Smaller results are page numbers, titles and specks.
const MIN_SIDE = 0.05
const MIN_AREA = 0.015
// A blob this much outlined is a frame in its own right.
const OUTLINE = 0.7
const MAX_DEPTH = 10
const MAX_FRAMES = 40

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

function commonLevel(levels: number[], total: number) {
  let best = 255
  let bestCount = -1
  for (let v = 0; v < 256; v++) {
    let count = 0
    for (let n = Math.max(0, v - 8); n <= Math.min(255, v + 8); n++)
      count += levels[n]!
    if (count > bestCount) {
      bestCount = count
      best = v
    }
  }
  return { level: best, share: total ? bestCount / total : 0 }
}

// The gutter colour, read from the page's outer ring. When the ring is art,
// a white that covers enough of the page wins instead.
function paperOf(g: Gray) {
  const ring = Math.max(2, Math.round(Math.min(g.width, g.height) * 0.015))
  const ringLevels = new Array<number>(256).fill(0)
  let ringCount = 0
  let white = 0
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const v = g.data[y * g.width + x]!
      if (v >= 235) white++
      if (x < ring || y < ring || x >= g.width - ring || y >= g.height - ring) {
        ringLevels[v] = ringLevels[v]! + 1
        ringCount++
      }
    }
  }
  const { level, share } = commonLevel(ringLevels, ringCount)
  if (share >= 0.5) return { level, flat: true }
  return { level: white / g.data.length >= 0.04 ? 250 : level, flat: false }
}

// Ink pixels on a straight run of at least `length`, along one axis.
function runs(ink: Uint8Array, g: Gray, length: number, vertical: boolean) {
  const { width, height } = g
  const out = new Uint8Array(ink.length)
  const lanes = vertical ? width : height
  const steps = vertical ? height : width
  const at = (lane: number, step: number) =>
    vertical ? step * width + lane : lane * width + step
  // A line one pixel off its neighbour is still that line, as scans lean.
  const hit = (lane: number, step: number) =>
    ink[at(lane, step)] ||
    (lane > 0 && ink[at(lane - 1, step)]) ||
    (lane < lanes - 1 && ink[at(lane + 1, step)])
  for (let lane = 0; lane < lanes; lane++) {
    let start = -1
    for (let step = 0; step <= steps; step++) {
      if (step < steps && hit(lane, step)) {
        if (start < 0) start = step
        continue
      }
      if (start >= 0 && step - start >= length) {
        for (let n = start; n < step; n++) {
          if (ink[at(lane, n)]) out[at(lane, n)] = 1
        }
      }
      start = -1
    }
  }
  return out
}

interface Scan {
  width: number
  height: number
  ink: Uint8Array
  // Frame lines running down the page, and across it.
  down: Uint8Array
  across: Uint8Array
}

function trim(scan: Scan, box: Box): Box | null {
  const { ink, width } = scan
  let { x0, y0, x1, y1 } = box
  const rowEmpty = (y: number) => {
    for (let x = x0; x < x1; x++) if (ink[y * width + x]) return false
    return true
  }
  const colEmpty = (x: number) => {
    for (let y = y0; y < y1; y++) if (ink[y * width + x]) return false
    return true
  }
  while (y0 < y1 && rowEmpty(y0)) y0++
  while (y1 > y0 && rowEmpty(y1 - 1)) y1--
  while (x0 < x1 && colEmpty(x0)) x0++
  while (x1 > x0 && colEmpty(x1 - 1)) x1--
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null
}

// The widest clear band across the box, along one axis.
function widestGutter(scan: Scan, box: Box, rows: boolean) {
  const { ink, width } = scan
  const start = rows ? box.y0 : box.x0
  const end = rows ? box.y1 : box.x1
  const crossFrom = rows ? box.x0 : box.y0
  const crossTo = rows ? box.x1 : box.y1
  const lines = rows ? scan.down : scan.across
  const limit = (crossTo - crossFrom) * GUTTER_INK
  const min = Math.max(
    2,
    Math.round((rows ? scan.height : scan.width) * GUTTER_MIN)
  )
  const clear = (i: number) => {
    let count = 0
    for (let c = crossFrom; c < crossTo; c++) {
      const p = rows ? i * width + c : c * width + i
      if (lines[p]) return false
      count += ink[p]!
      if (count > limit) return false
    }
    return true
  }
  let best: { from: number; to: number } | null = null
  let from = -1
  // A band reaching the box's edge counts too: it holds only stray ink, such
  // as a page number, which goes with it.
  for (let i = start; i <= end; i++) {
    if (i < end && clear(i)) {
      if (from < 0) from = i
      continue
    }
    if (from >= 0 && i - from >= min) {
      if (!best || i - from > best.to - best.from) best = { from, to: i }
    }
    from = -1
  }
  return best
}

const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0)

// How much of a box's outline has ink on it.
function outlineShare(scan: Scan, b: Box) {
  const { ink, width } = scan
  const inked = (x: number, y: number, dx: number, dy: number) =>
    ink[y * width + x] || ink[(y + dy) * width + x + dx] ? 1 : 0
  let hits = 0
  for (let x = b.x0; x < b.x1; x++)
    hits += inked(x, b.y0, 0, 1) + inked(x, b.y1 - 1, 0, -1)
  for (let y = b.y0; y < b.y1; y++)
    hits += inked(b.x0, y, 1, 0) + inked(b.x1 - 1, y, -1, 0)
  return hits / (2 * (b.x1 - b.x0 + b.y1 - b.y0))
}

// Connected ink blobs in a box that are outlined like frames. Pages with no
// straight gutter through them, such as a pinwheel, come apart here.
function outlinedBlobs(scan: Scan, box: Box) {
  const { ink, width, height } = scan
  const seen = new Uint8Array(ink.length)
  const stack: number[] = []
  const blobs: Box[] = []
  const visit = (x: number, y: number) => {
    if (x < box.x0 || y < box.y0 || x >= box.x1 || y >= box.y1) return
    const p = y * width + x
    if (!ink[p] || seen[p]) return
    seen[p] = 1
    stack.push(p)
  }
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const seed = y * width + x
      if (!ink[seed] || seen[seed]) continue
      const blob = { x0: x, y0: y, x1: x + 1, y1: y + 1 }
      visit(x, y)
      while (stack.length) {
        const p = stack.pop()!
        const py = Math.floor(p / width)
        const px = p - py * width
        blob.x0 = Math.min(blob.x0, px)
        blob.y0 = Math.min(blob.y0, py)
        blob.x1 = Math.max(blob.x1, px + 1)
        blob.y1 = Math.max(blob.y1, py + 1)
        visit(px - 1, py)
        visit(px + 1, py)
        visit(px, py - 1)
        visit(px, py + 1)
      }
      blobs.push(blob)
    }
  }
  const framed = blobs.filter(
    (b) =>
      area(b) / (width * height) >= MIN_AREA && outlineShare(scan, b) >= OUTLINE
  )
  // Balloons sit inside what frames them.
  return framed.filter(
    (b) =>
      !framed.some(
        (o) =>
          o !== b &&
          o.x0 <= b.x0 &&
          o.y0 <= b.y0 &&
          o.x1 >= b.x1 &&
          o.y1 >= b.y1
      )
  )
}

function split(scan: Scan, box: Box, depth: number, out: Box[]) {
  const tight = trim(scan, box)
  if (!tight || out.length >= MAX_FRAMES) return
  if (depth >= MAX_DEPTH) {
    out.push(tight)
    return
  }
  const rows = widestGutter(scan, tight, true)
  const cols = widestGutter(scan, tight, false)
  if (rows && (!cols || rows.to - rows.from >= cols.to - cols.from)) {
    split(scan, { ...tight, y1: rows.from }, depth + 1, out)
    split(scan, { ...tight, y0: rows.to }, depth + 1, out)
    return
  }
  if (cols) {
    split(scan, { ...tight, x1: cols.from }, depth + 1, out)
    split(scan, { ...tight, x0: cols.to }, depth + 1, out)
    return
  }
  const blobs = outlinedBlobs(scan, tight)
  if (blobs.length > 1) out.push(...blobs)
  else out.push(tight)
}

export function detectPanels(g: Gray): Detection {
  const paper = paperOf(g)
  const ink = new Uint8Array(g.data.length)
  for (let i = 0; i < ink.length; i++) {
    ink[i] = Math.abs(g.data[i]! - paper.level) > INK_LEVELS ? 1 : 0
  }
  const scan: Scan = {
    width: g.width,
    height: g.height,
    ink,
    down: runs(ink, g, Math.round(g.height * FRAME_LINE), true),
    across: runs(ink, g, Math.round(g.width * FRAME_LINE), false),
  }
  const boxes: Box[] = []
  split(scan, { x0: 0, y0: 0, x1: g.width, y1: g.height }, 0, boxes)
  const frames = boxes
    .map((b) => ({
      x: b.x0 / g.width,
      y: b.y0 / g.height,
      width: (b.x1 - b.x0) / g.width,
      height: (b.y1 - b.y0) / g.height,
    }))
    .filter(
      (f) =>
        f.width >= MIN_SIDE &&
        f.height >= MIN_SIDE &&
        f.width * f.height >= MIN_AREA
    )
  const notes: DetectionNote[] = []
  if (!paper.flat) notes.push("noMargin")
  if (frames.length < 2) notes.push("oneFrame")
  return {
    frames: frames.length ? frames : [{ x: 0, y: 0, width: 1, height: 1 }],
    notes,
  }
}
