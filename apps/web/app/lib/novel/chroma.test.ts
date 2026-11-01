import { expect, test } from "bun:test"

import { keyPixels, opaqueBounds } from "./chroma"

function image(w: number, h: number, draw: (x: number, y: number) => number[]) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) d.set([...draw(x, y), 255], (y * w + x) * 4)
  return d
}

const GREEN = [0, 255, 0]
const RED = [200, 30, 30]

test("the background goes, the subject stays", () => {
  const d = image(20, 20, (x, y) =>
    x >= 5 && x < 15 && y >= 5 && y < 15 ? RED : GREEN
  )
  keyPixels(d, 20, 20)
  expect(d[3]).toBe(0)
  expect(d[(10 * 20 + 10) * 4 + 3]).toBe(255)
  expect(opaqueBounds(d, 20, 20)).toEqual({
    left: 5,
    top: 5,
    right: 14,
    bottom: 14,
  })
})

test("key colour enclosed by the subject survives", () => {
  const d = image(20, 20, (x, y) => {
    if (x === 10 && y === 10) return GREEN
    return x >= 5 && x < 15 && y >= 5 && y < 15 ? RED : GREEN
  })
  keyPixels(d, 20, 20)
  expect(d[(10 * 20 + 10) * 4 + 3]).toBe(255)
})

test("an empty picture has no bounds", () => {
  const d = image(10, 10, () => GREEN)
  keyPixels(d, 10, 10)
  expect(opaqueBounds(d, 10, 10)).toBeNull()
})
