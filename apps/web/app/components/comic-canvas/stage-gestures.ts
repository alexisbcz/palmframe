import { PAGE_MARGIN, type ComicDoc, type Layer } from "./model"

// The arithmetic of dragging on the stage, apart from the pointer plumbing.

export const MIN_SIZE = 24

export type Guides = { x: number[]; y: number[] }

const NO_GUIDES: Guides = { x: [], y: [] }

type ResizeKeys = { altKey: boolean; shiftKey: boolean }

// Screen pixels a press may wander and still be a click. A finger wanders
// further, and this matches how far a long press may.
export const dragSlop = (pointerType: string) =>
  pointerType === "touch" ? 8 : 4

// On Windows AltGr reports as Ctrl+Alt, so the keys that type [ and ] on many
// European layouts would otherwise read as Ctrl shortcuts.
export const commandKey = (
  e: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "getModifierState">
) =>
  (e.metaKey || e.ctrlKey) &&
  !(e.ctrlKey && e.altKey) &&
  !e.getModifierState("AltGraph")

function snapTargets(doc: ComicDoc, layerId: string) {
  const x = [0, doc.width / 2, doc.width, PAGE_MARGIN, doc.width - PAGE_MARGIN]
  const y = [
    0,
    doc.height / 2,
    doc.height,
    PAGE_MARGIN,
    doc.height - PAGE_MARGIN,
  ]
  for (const l of doc.layers) {
    if (l.id === layerId || l.hidden) continue
    x.push(l.x, l.x + l.width / 2, l.x + l.width)
    y.push(l.y, l.y + l.height / 2, l.y + l.height)
  }
  return { x, y }
}

function nearest(edges: number[], targets: number[], threshold: number) {
  let best: { delta: number; at: number } | null = null
  for (const edge of edges) {
    for (const at of targets) {
      const delta = at - edge
      if (
        Math.abs(delta) <= threshold &&
        (!best || Math.abs(delta) < Math.abs(best.delta))
      )
        best = { delta, at }
    }
  }
  return best
}

export function snapMove(
  doc: ComicDoc,
  layer: Layer,
  x: number,
  y: number,
  threshold: number
) {
  const targets = snapTargets(doc, layer.id)
  const edges = (pos: number, size: number) => [pos, pos + size / 2, pos + size]
  const sx = nearest(edges(x, layer.width), targets.x, threshold)
  const sy = nearest(edges(y, layer.height), targets.y, threshold)
  return {
    x: x + (sx?.delta ?? 0),
    y: y + (sy?.delta ?? 0),
    guides: { x: sx ? [sx.at] : [], y: sy ? [sy.at] : [] },
  }
}

export function resize(
  start: Layer,
  hx: number,
  hy: number,
  dx: number,
  dy: number,
  e: ResizeKeys
): Partial<Layer> {
  const a = (start.rotation * Math.PI) / 180
  const lx = dx * Math.cos(-a) - dy * Math.sin(-a)
  const ly = dx * Math.sin(-a) + dy * Math.cos(-a)
  const fromCenter = e.altKey
  const k = fromCenter ? 2 : 1
  let w = start.width + lx * hx * k
  let h = start.height + ly * hy * k
  const corner = hx !== 0 && hy !== 0
  // Text scales with its box from the corners, like a placed graphic.
  const keepRatio = corner && (e.shiftKey || start.type === "text")
  if (keepRatio) {
    const s = Math.max(w / start.width, h / start.height)
    w = start.width * s
    h = start.height * s
  }
  w = Math.max(MIN_SIZE, w)
  h = Math.max(MIN_SIZE, h)
  const dw = w - start.width
  const dh = h - start.height
  const cxl = fromCenter ? 0 : (hx * dw) / 2
  const cyl = fromCenter ? 0 : (hy * dh) / 2
  const cx = start.x + start.width / 2 + cxl * Math.cos(a) - cyl * Math.sin(a)
  const cy = start.y + start.height / 2 + cxl * Math.sin(a) + cyl * Math.cos(a)
  const patch: Partial<Layer> = {
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    width: Math.round(w),
    height: Math.round(h),
  }
  if (start.type === "bubble") {
    Object.assign(patch, {
      tailX: Math.round(start.tailX * (w / start.width)),
      tailY: Math.round(start.tailY * (h / start.height)),
    })
  }
  if (start.type === "text" && keepRatio) {
    const s = w / start.width
    Object.assign(patch, {
      fontSize: Math.max(8, Math.round(start.fontSize * s)),
      strokeWidth: Math.round(start.strokeWidth * s * 10) / 10,
    })
  }
  return patch
}

// The dragged edge lands on what's near it. A resize that keeps a ratio, works
// from the centre or sits on a rotated layer has no free edge, so it stays put.
export function snapResize(
  doc: ComicDoc,
  start: Layer,
  patch: Partial<Layer>,
  hx: number,
  hy: number,
  e: ResizeKeys,
  threshold: number
): { patch: Partial<Layer>; guides: Guides } {
  const corner = hx !== 0 && hy !== 0
  if (
    start.rotation ||
    e.altKey ||
    (corner && (e.shiftKey || start.type === "text"))
  )
    return { patch, guides: NO_GUIDES }

  const targets = snapTargets(doc, start.id)
  const axis = (pos: number, size: number, dir: number, to: number[]) => {
    const snap = dir
      ? nearest([dir > 0 ? pos + size : pos], to, threshold)
      : null
    const next = snap ? size + dir * snap.delta : size
    if (!snap || next < MIN_SIZE) return { pos, size, guides: [] }
    return {
      pos: Math.round(dir < 0 ? pos + snap.delta : pos),
      size: Math.round(next),
      guides: [snap.at],
    }
  }
  const x = axis(patch.x ?? start.x, patch.width ?? start.width, hx, targets.x)
  const y = axis(
    patch.y ?? start.y,
    patch.height ?? start.height,
    hy,
    targets.y
  )
  const next: Partial<Layer> = {
    ...patch,
    x: x.pos,
    y: y.pos,
    width: x.size,
    height: y.size,
  }
  if (start.type === "bubble")
    Object.assign(next, {
      tailX: Math.round(start.tailX * (x.size / start.width)),
      tailY: Math.round(start.tailY * (y.size / start.height)),
    })
  return { patch: next, guides: { x: x.guides, y: y.guides } }
}

// What any drag can change, as it was when the drag began. Only these go back
// on a cancel: a render landing during the drag stays.
export function gesturePatch(start: Layer): Partial<Layer> {
  const { x, y, width, height, rotation } = start
  const patch: Partial<Layer> = { x, y, width, height, rotation }
  if (start.type === "bubble")
    Object.assign(patch, { tailX: start.tailX, tailY: start.tailY })
  if (start.type === "text")
    Object.assign(patch, {
      fontSize: start.fontSize,
      strokeWidth: start.strokeWidth,
    })
  return patch
}
