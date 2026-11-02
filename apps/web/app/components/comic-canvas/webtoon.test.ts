import { describe, expect, test } from "bun:test"

import {
  PRESETS,
  presetRects,
  presetsFor,
  reformatted,
  singleColumn,
} from "./layouts"
import {
  WEBTOON_GUTTER,
  createBubble,
  createDefaultProject,
  createPanel,
  createWebtoonProject,
  isWebtoon,
  layoutRects,
  toProject,
  type ComicProject,
  type PanelLayer,
} from "./model"

const webtoon = { width: 800, height: 1280 }
const carousel = { width: 1080, height: 1350 }
const panels = (p: ComicProject, i = 0) =>
  p.pages[i]!.layers.filter((l): l is PanelLayer => l.type === "panel")

describe("webtoon format", () => {
  test("a new webtoon is the format and survives a save", () => {
    const project = createWebtoonProject()
    expect(isWebtoon(project)).toBe(true)
    expect(isWebtoon(createDefaultProject())).toBe(false)
    expect(isWebtoon(toProject(JSON.parse(JSON.stringify(project)))!)).toBe(
      true
    )
  })

  test("only single-column layouts are offered", () => {
    for (const preset of presetsFor(webtoon))
      expect(singleColumn(preset.cells)).toBe(true)
    const ids = presetsFor(webtoon).map((p) => p.id)
    expect(ids).toContain("tall-short")
    expect(ids).not.toContain("grid")
    expect(ids).not.toContain("splash-inset")
    expect(presetsFor(carousel)).toBe(PRESETS)
  })

  test("panels run edge to edge with the same gap across a seam", () => {
    const rects = layoutRects(
      [
        { x: 0, y: 0, width: 1, height: 0.5 },
        { x: 0, y: 0.5, width: 1, height: 0.5 },
      ],
      webtoon.width,
      webtoon.height
    )
    expect(rects[0]!.x).toBe(0)
    expect(rects[0]!.width).toBe(800)
    const inside = rects[1]!.y - (rects[0]!.y + rects[0]!.height)
    const seam = rects[0]!.y + (1280 - (rects[1]!.y + rects[1]!.height))
    expect(inside).toBe(WEBTOON_GUTTER)
    expect(seam).toBe(WEBTOON_GUTTER)
  })

  test("other formats keep their margins", () => {
    const rect = presetRects(PRESETS[0]!, carousel)[0]!
    expect(rect).toEqual({ x: 48, y: 48, width: 984, height: 1254 })
  })
})

describe("reformatted", () => {
  const six = (): ComicProject => {
    const project = createDefaultProject()
    const frames = [0, 1, 2, 3, 4, 5].map((i) => ({
      ...createPanel({
        x: 48 + (i % 2) * 500,
        y: 48 + Math.floor(i / 2) * 420,
        width: 480,
        height: 400,
      }),
      src: `art-${i}`,
    }))
    const bubble = createBubble("speech", { x: 800, y: 900 })
    return {
      ...project,
      rtl: true,
      pages: [{ id: "a", layers: [...frames, bubble] }],
    }
  }

  test("stacks a grid into full-width screens and keeps the art", () => {
    const out = reformatted(six(), webtoon)
    expect(isWebtoon(out)).toBe(true)
    expect(out.rtl).toBeUndefined()
    expect(out.pages).toHaveLength(2)
    expect(out.pages[0]!.id).toBe("a")
    const all = out.pages.flatMap((_, i) => panels(out, i))
    expect(all).toHaveLength(6)
    expect(new Set(all.map((p) => p.src)).size).toBe(6)
    for (const p of all) {
      expect(p.x).toBe(0)
      expect(p.width).toBe(800)
      expect(p.y + p.height).toBeLessThanOrEqual(1280)
    }
  })

  test("lettering follows its panel to the right screen", () => {
    const source = six()
    const bubble = source.pages[0]!.layers.at(-1)!
    const out = reformatted(source, webtoon)
    // Over the fourth panel in right-to-left order, so on the second screen.
    const moved = out.pages[1]!.layers.find((l) => l.id === bubble.id)!
    expect(moved).toBeDefined()
    const owner = panels(out, 1).find(
      (p) =>
        moved.y + moved.height / 2 >= p.y &&
        moved.y + moved.height / 2 <= p.y + p.height
    )
    expect(owner).toBeDefined()
    expect(moved.type === "bubble" && moved.fontSize).toBeLessThan(40)
  })

  test("a page with no panels keeps its lettering, in the page", () => {
    const project = createDefaultProject()
    const bubble = createBubble("caption", { x: 1000, y: 1300 })
    const out = reformatted(
      { ...project, pages: [{ id: "a", layers: [bubble] }] },
      webtoon
    )
    const moved = out.pages[0]!.layers[0]!
    expect(moved.x + moved.width / 2).toBeLessThan(800)
    expect(moved.y + moved.height / 2).toBeLessThan(1280)
  })

  test("leaving a webtoon stretches panels back over the page", () => {
    const out = reformatted(createWebtoonProject(), carousel)
    expect(out.pages).toHaveLength(1)
    expect(panels(out)[0]!.width).toBe(1080)
    expect(panels(out).every((p) => p.y + p.height <= 1350)).toBe(true)
  })

  test("between other formats nothing moves, as before", () => {
    const project = createDefaultProject()
    const out = reformatted(project, { width: 1080, height: 1920 })
    expect(out.pages).toBe(project.pages)
  })
})
