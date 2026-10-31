import { describe, expect, test } from "bun:test"

import { detectPanels, type Frame } from "./detect-panels"
import type { Gray } from "./gray"

type Box = [x: number, y: number, w: number, h: number]

class Page implements Gray {
  data: Uint8Array
  constructor(
    readonly width = 600,
    readonly height = 840,
    paper = 255
  ) {
    this.data = new Uint8Array(width * height).fill(paper)
  }
  fill([x, y, w, h]: Box, v: number) {
    for (let r = y; r < y + h; r++)
      this.data.fill(v, r * this.width + x, r * this.width + x + w)
    return this
  }
  // An empty frame: the hardest case for gutters, as most rows are blank.
  frame([x, y, w, h]: Box, line = 3, ink = 0) {
    this.fill([x, y, w, line], ink)
    this.fill([x, y + h - line, w, line], ink)
    this.fill([x, y, line, h], ink)
    this.fill([x + w - line, y, line, h], ink)
    return this
  }
  noise(amount: number, seed = 7) {
    let s = seed
    for (let i = 0; i < this.data.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      const v = this.data[i]! + ((s % (amount * 2 + 1)) - amount)
      this.data[i] = Math.max(0, Math.min(255, v))
    }
    return this
  }
}

function expectFrames(page: Page, frames: Frame[], boxes: Box[]) {
  expect(frames).toHaveLength(boxes.length)
  const px = frames.map((f) => [
    f.x * page.width,
    f.y * page.height,
    f.width * page.width,
    f.height * page.height,
  ])
  for (const box of boxes) {
    const hit = px.find((p) => p.every((v, i) => Math.abs(v - box[i]!) <= 3))
    expect(hit, `no frame at ${box.join(",")}`).toBeDefined()
  }
}

describe("detectPanels", () => {
  test("reads a framed grid, even with blank panels", () => {
    const boxes: Box[] = [
      [40, 40, 250, 370],
      [310, 40, 250, 370],
      [40, 430, 250, 370],
      [310, 430, 250, 370],
    ]
    const page = new Page()
    boxes.forEach((b) => page.frame(b))
    const { frames, notes } = detectPanels(page)
    expectFrames(page, frames, boxes)
    expect(notes).toEqual([])
  })

  test("survives scan noise and a tinted paper", () => {
    const boxes: Box[] = [
      [40, 40, 520, 300],
      [40, 360, 170, 440],
      [230, 360, 330, 440],
    ]
    const page = new Page(600, 840, 232)
    boxes.forEach((b) => page.frame(b, 2, 20))
    page.noise(8)
    expectFrames(page, detectPanels(page).frames, boxes)
  })

  test("reads white gutters between solid art on a dark page", () => {
    const boxes: Box[] = [
      [30, 30, 540, 380],
      [30, 430, 540, 380],
    ]
    const page = new Page(600, 840, 12)
    boxes.forEach((b) => page.fill(b, 180))
    expectFrames(page, detectPanels(page).frames, boxes)
  })

  test("keeps blank sky inside a frame in one piece", () => {
    const box: Box = [40, 40, 520, 760]
    const page = new Page().frame(box)
    // Art in the lower half, nothing above it.
    page.fill([100, 600, 300, 120], 90)
    const { frames, notes } = detectPanels(page)
    expectFrames(page, frames, [box])
    expect(notes).toContain("oneFrame")
  })

  test("sees past a balloon crossing a gutter", () => {
    const boxes: Box[] = [
      [40, 40, 520, 370],
      [40, 430, 520, 370],
    ]
    const page = new Page()
    boxes.forEach((b) => page.frame(b))
    page.fill([220, 380, 110, 80], 0)
    expectFrames(page, detectPanels(page).frames, boxes)
  })

  test("takes apart a pinwheel, which has no straight gutter", () => {
    const boxes: Box[] = [
      [40, 40, 340, 240],
      [400, 40, 160, 500],
      [220, 560, 340, 240],
      [40, 300, 160, 500],
    ]
    const page = new Page()
    boxes.forEach((b) => page.frame(b))
    expectFrames(page, detectPanels(page).frames, boxes)
  })

  test("drops page numbers and titles", () => {
    const boxes: Box[] = [
      [40, 60, 520, 340],
      [40, 420, 520, 340],
    ]
    const page = new Page()
    boxes.forEach((b) => page.frame(b))
    page.fill([285, 790, 30, 14], 0)
    page.fill([200, 15, 200, 22], 0)
    expectFrames(page, detectPanels(page).frames, boxes)
  })

  test("says when art bleeds off the page", () => {
    const page = new Page()
    for (let y = 0; y < page.height; y++) {
      for (let x = 0; x < page.width; x++) {
        page.data[y * page.width + x] = 40 + (x + y) / 8
      }
    }
    const { frames, notes } = detectPanels(page)
    expect(notes).toContain("noMargin")
    expect(notes).toContain("oneFrame")
    expect(frames).toHaveLength(1)
  })

  test("an empty page comes back as one frame to correct", () => {
    const { frames, notes } = detectPanels(new Page())
    expect(frames).toEqual([{ x: 0, y: 0, width: 1, height: 1 }])
    expect(notes).toContain("oneFrame")
  })
})
