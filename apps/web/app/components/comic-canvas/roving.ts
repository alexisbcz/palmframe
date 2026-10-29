import type * as React from "react"

// Arrow-key navigation for any list, strip or grid. Mark the container with
// `data-roving-group` and wire `onKeyDown={roving()}`, mark each stop with
// `data-roving`. Focus moves to the nearest stop in the pressed direction, by
// on-screen position, so rows, columns and wrapping grids all just work.
// `select` also clicks the stop it lands on (tabs, swatches, slides).

type Axis = "x" | "y" | "both"

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function isField(el: HTMLElement) {
  return (
    el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  )
}

function stops(group: HTMLElement) {
  return [...group.querySelectorAll<HTMLElement>("[data-roving]")].filter(
    (el) =>
      el.closest("[data-roving-group]") === group &&
      !el.matches(":disabled, [aria-disabled=true]") &&
      el.getClientRects().length > 0
  )
}

function nearest(from: HTMLElement, items: HTMLElement[], [dx, dy]: number[]) {
  const a = from.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best: HTMLElement | null = null
  let score = Infinity
  for (const el of items) {
    if (el === from) continue
    const b = el.getBoundingClientRect()
    const ox = b.left + b.width / 2 - ax
    const oy = b.top + b.height / 2 - ay
    const along = ox * dx + oy * dy
    if (along <= 1) continue
    // Straight ahead beats diagonal: off-axis distance costs double.
    const across = Math.abs(dx ? oy : ox)
    const s = along + across * 2
    if (s < score) {
      score = s
      best = el
    }
  }
  return best
}

export function roving({
  axis = "both",
  select = false,
  loop = true,
}: { axis?: Axis; select?: boolean; loop?: boolean } = {}) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return
    const target = e.target as HTMLElement
    if (isField(target)) return
    const group = e.currentTarget
    const items = stops(group)
    const current = items.find((el) => el === target || el.contains(target))
    if (!current) return

    let next: HTMLElement | null | undefined = null
    if (e.key === "Home") next = items[0]
    else if (e.key === "End") next = items.at(-1)
    else {
      const dir = DIRECTIONS[e.key]
      if (!dir) return
      if (axis === "x" && dir[1]) return
      if (axis === "y" && dir[0]) return
      next = nearest(current, items, dir)
      // At the end of a single row or column, wrap around.
      if (!next && loop && axis !== "both")
        next = dir[0] + dir[1] > 0 ? items[0] : items.at(-1)
    }
    e.preventDefault()
    if (!next || next === current) return
    next.focus()
    next.scrollIntoView({ block: "nearest", inline: "nearest" })
    if (select) next.click()
  }
}
