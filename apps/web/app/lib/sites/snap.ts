import { STAGE, type Box } from "./model"

export interface Guide {
  axis: "x" | "y"
  at: number
}

const lines = (b: Box, axis: "x" | "y") =>
  axis === "x"
    ? [b.x, b.x + b.w / 2, b.x + b.w]
    : [b.y, b.y + b.h / 2, b.y + b.h]

// The nearest thing a moving box can line up with, on each axis.
export function snapMove(
  moving: Box,
  others: Box[],
  stageWidth = STAGE,
  threshold = 6
) {
  const guides: Guide[] = []
  const solve = (axis: "x" | "y", extra: number[]) => {
    const targets = [...others.flatMap((o) => lines(o, axis)), ...extra]
    let best = threshold + 1
    let shift = 0
    let at = 0
    for (const edge of lines(moving, axis))
      for (const target of targets) {
        const d = target - edge
        if (Math.abs(d) < Math.abs(best)) {
          best = d
          shift = d
          at = target
        }
      }
    if (Math.abs(best) <= threshold) {
      guides.push({ axis, at })
      return shift
    }
    return 0
  }
  const dx = solve("x", [stageWidth / 2, 0, stageWidth])
  const dy = solve("y", [])
  return { dx, dy, guides }
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export function resizeBox(
  start: Box,
  handle: Handle,
  dx: number,
  dy: number,
  keepRatio: boolean,
  min = 12
): Box {
  let { x, y, w, h } = start
  if (handle.includes("e")) w = Math.max(min, start.w + dx)
  if (handle.includes("s")) h = Math.max(min, start.h + dy)
  if (handle.includes("w")) {
    w = Math.max(min, start.w - dx)
    x = start.x + start.w - w
  }
  if (handle.includes("n")) {
    h = Math.max(min, start.h - dy)
    y = start.y + start.h - h
  }
  if (keepRatio && handle.length === 2) {
    const ratio = start.w / start.h
    if (w / h > ratio) {
      const nextW = h * ratio
      if (handle.includes("w")) x += w - nextW
      w = nextW
    } else {
      const nextH = w / ratio
      if (handle.includes("n")) y += h - nextH
      h = nextH
    }
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  }
}
