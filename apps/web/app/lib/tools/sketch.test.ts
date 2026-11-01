import { expect, test } from "bun:test"

import { strokePath, toSvg } from "./sketch"

const stroke = {
  points: [
    { x: 0, y: 0 },
    { x: 10.123, y: 5 },
  ],
  closed: true,
  kind: "line",
}

test("builds a path and closes it when asked", () => {
  expect(strokePath(stroke)).toBe("M0 0L10.1 5Z")
  expect(strokePath({ ...stroke, closed: false })).toBe("M0 0L10.1 5")
  expect(strokePath({ ...stroke, points: [] })).toBe("")
})

test("wraps strokes in a sized SVG", () => {
  const svg = toSvg([stroke], 800, 600)
  expect(svg).toContain('viewBox="0 0 800 600"')
  expect(svg).toContain('<path d="M0 0L10.1 5Z"/>')
})
