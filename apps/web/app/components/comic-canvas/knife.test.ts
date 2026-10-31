import { describe, expect, test } from "bun:test"

import { imageGeometry, localToImage } from "./edit-tools"
import {
  dragFrame,
  knife,
  knifeLayer,
  knifeRefusal,
  pageSource,
  placeFrames,
  solveCrop,
  splitFrame,
} from "./knife"
import { cellsFromFrames, placePreset, presetRects } from "./layouts"
import {
  createBubble,
  createDefaultProject,
  createPanel,
  layoutRects,
  toProject,
  type ComicDoc,
  type PanelLayer,
  type Rect,
} from "./model"

const image = { width: 1600, height: 900 }

const panel = (over: Partial<PanelLayer> = {}): PanelLayer => ({
  ...createPanel({ x: 100, y: 200, width: 800, height: 600 }, "a.png"),
  ...over,
})

// The image pixel a page point shows, through the same maths as drawPanel.
function pixelAt(p: PanelLayer, x: number, y: number) {
  return localToImage(
    p,
    image.width,
    image.height,
    x - (p.x + p.width / 2),
    y - (p.y + p.height / 2)
  )
}

const doc = (layers: ComicDoc["layers"]): ComicDoc => ({
  version: 1,
  width: 1080,
  height: 1350,
  background: "#fff",
  layers,
})

describe("solveCrop", () => {
  test("round-trips through the drawing maths", () => {
    const frame = { width: 300, height: 500 }
    const view = { cx: 700, cy: 300, scale: 1.1 }
    const crop = solveCrop(frame, image, view)
    const p = panel({ ...frame, ...crop })
    const hit = pixelAt(p, p.x + 150, p.y + 250)
    expect(hit.x).toBeCloseTo(700, 6)
    expect(hit.y).toBeCloseTo(300, 6)
    expect(1 / hit.scale).toBeCloseTo(1.1, 6)
  })
})

describe("knife", () => {
  const cases: [string, Partial<PanelLayer>][] = [
    ["cover", {}],
    ["zoomed and panned", { imageZoom: 180, panX: 40, panY: -55 }],
    ["flipped", { flipX: true, flipY: true, imageZoom: 140, panX: 30 }],
    ["contained", { fit: "contain" }],
    ["zoomed out", { imageZoom: 60, panX: 20 }],
  ]
  for (const [name, over] of cases) {
    for (const axis of ["x", "y"] as const) {
      test(`keeps ${name} art in place across a ${axis} cut`, () => {
        const before = panel(over)
        const [a, b] = knife(before, { axis, at: 0.4 }, image, "Panel 2")
        for (const part of [a, b]) {
          expect(part.fit).toBe("cover")
          for (const [fx, fy] of [
            [0.1, 0.2],
            [0.5, 0.5],
            [0.9, 0.7],
          ] as const) {
            const x = part.x + part.width * fx
            const y = part.y + part.height * fy
            const was = pixelAt(before, x, y)
            const now = pixelAt(part, x, y)
            expect(now.x).toBeCloseTo(was.x, 6)
            expect(now.y).toBeCloseTo(was.y, 6)
          }
        }
      })
    }
  }

  test("leaves a gutter and stays inside the panel", () => {
    const [a, b] = knife(panel(), { axis: "x", at: 0.5 }, image, "Panel 2")
    expect(b.x - (a.x + a.width)).toBe(24)
    expect(a.x).toBe(100)
    expect(b.x + b.width).toBe(900)
    expect(a.id).not.toBe(b.id)
    expect(b.name).toBe("Panel 2")
  })

  test("one panel keeps the script, guide and versions", () => {
    const start = panel({
      script: "Hello",
      versions: [{ src: "old.png", kind: "original" }],
    })
    const [a, b] = knife(start, { axis: "y", at: 0.5 }, image, "Panel 2")
    expect(a.script).toBe("Hello")
    expect(a.versions).toHaveLength(1)
    expect(b.script).toBeUndefined()
    expect(b.versions).toBeUndefined()
  })

  test("cuts an empty panel without an image", () => {
    const start = panel({ src: null })
    const [a, b] = knife(start, { axis: "x", at: 0.5 }, null, "Panel 2")
    expect(a.imageZoom).toBe(100)
    expect(b.panX).toBe(0)
  })

  test("refuses what can't stay aligned", () => {
    const cut = { axis: "x", at: 0.5 } as const
    expect(knifeRefusal(panel({ locked: true }), cut, image)).toBe("locked")
    expect(knifeRefusal(panel({ rotation: 12 }), cut, image)).toBe("rotated")
    expect(knifeRefusal(panel({ fit: "fill" }), cut, image)).toBe("stretched")
    expect(
      knifeRefusal(panel({ width: 120 }), { axis: "x", at: 0.5 }, image)
    ).toBe("tooSmall")
    expect(
      knifeRefusal(panel({ fit: "fill", src: null }), cut, null)
    ).toBeNull()
    expect(knifeRefusal(panel({ rotation: 360 }), cut, image)).toBeNull()
  })

  test("replaces the panel where it sits in the stack", () => {
    const bubble = createBubble("speech", { x: 200, y: 200 })
    const start = panel()
    const under = panel({ id: "under" })
    const layers = knifeLayer(
      { layers: [under, start, bubble] },
      start.id,
      { axis: "y", at: 0.5 },
      image
    )!
    expect(layers.map((l) => l.type)).toEqual([
      "panel",
      "panel",
      "panel",
      "bubble",
    ])
    expect(layers[0]!.id).toBe("under")
    expect(layers[1]!.id).toBe(start.id)
    expect(layers[2]!.name).toBe("Panel 3")
    expect(
      knifeLayer(
        { layers: [panel({ id: "x", locked: true })] },
        "x",
        { axis: "y", at: 0.5 },
        image
      )
    ).toBeNull()
  })
})

describe("cellsFromFrames", () => {
  const frames: Rect[] = [
    { x: 0.07, y: 0.05, width: 0.41, height: 0.44 },
    { x: 0.52, y: 0.05, width: 0.41, height: 0.44 },
    { x: 0.07, y: 0.51, width: 0.86, height: 0.44 },
  ]

  test("outer edges reach the page and gutters close", () => {
    const cells = cellsFromFrames(frames)
    expect(cells[0]).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 })
    expect(cells[1]).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 })
    expect(cells[2]).toEqual({ x: 0, y: 0.5, width: 1, height: 0.5 })
  })

  test("frames become the same panels layoutRects gives a clean grid", () => {
    expect(layoutRects(cellsFromFrames(frames), 1080, 1350)).toEqual(
      layoutRects(
        [
          { x: 0, y: 0, width: 0.5, height: 0.5 },
          { x: 0.5, y: 0, width: 0.5, height: 0.5 },
          { x: 0, y: 0.5, width: 1, height: 0.5 },
        ],
        1080,
        1350
      )
    )
  })

  test("keeps an inset on its splash", () => {
    const cells = cellsFromFrames([
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.56, y: 0.64, width: 0.4, height: 0.32 },
    ])
    expect(cells[1]).toEqual({ x: 0.56, y: 0.64, width: 0.4, height: 0.32 })
  })

  test("never closes a thin cell up", () => {
    const cells = cellsFromFrames([
      { x: 0, y: 0, width: 0.5, height: 1 },
      { x: 0.5, y: 0, width: 0.01, height: 1 },
      { x: 0.51, y: 0, width: 0.49, height: 1 },
    ])
    for (const cell of cells) expect(cell.width).toBeGreaterThan(0)
  })

  test("stores cells left to right, so RTL lands where it was seen", () => {
    const page = { width: 1080, height: 1350 }
    const stored = cellsFromFrames(frames, true)
    const seen = presetRects({ id: "s", cells: stored }, page, true)
    const plain = presetRects({ id: "s", cells: cellsFromFrames(frames) }, page)
    seen.forEach((r, i) => {
      expect(Math.abs(r.x - plain[i]!.x)).toBeLessThanOrEqual(1)
      expect(r.width).toBe(plain[i]!.width)
    })
  })
})

describe("pageSource", () => {
  const small = panel({ id: "small", src: "s.png", width: 100, height: 100 })
  const large = panel({ id: "large", src: "l.png" })
  const empty = panel({ id: "empty", src: null, width: 2000, height: 2000 })

  test("prefers the selected panel's image, then the largest", () => {
    expect(pageSource([small, large, empty], "small")).toBe("s.png")
    expect(pageSource([small, large, empty], "empty")).toBe("l.png")
    expect(pageSource([small, large], null)).toBe("l.png")
  })

  test("is empty on a page with no art", () => {
    expect(pageSource([empty])).toBeUndefined()
  })
})

describe("placeFrames", () => {
  const frames: Rect[] = [
    { x: 0.1, y: 0.1, width: 0.38, height: 0.8 },
    { x: 0.52, y: 0.1, width: 0.38, height: 0.8 },
  ]

  test("each panel shows its own frame", () => {
    const bubble = createBubble("speech", { x: 200, y: 200 })
    const layers = placeFrames(doc([bubble]), frames, "a.png", image)
    const panels = layers.filter((l) => l.type === "panel") as PanelLayer[]
    expect(layers.at(-1)).toBe(bubble)
    expect(panels).toHaveLength(2)
    panels.forEach((p, i) => {
      const f = frames[i]!
      const mid = pixelAt(p, p.x + p.width / 2, p.y + p.height / 2)
      expect(mid.x).toBeCloseTo((f.x + f.width / 2) * image.width, 6)
      expect(mid.y).toBeCloseTo((f.y + f.height / 2) * image.height, 6)
      const g = imageGeometry(p, image.width, image.height)
      // Nothing outside the image shows.
      expect(g.w).toBeGreaterThanOrEqual(p.width - 1e-6)
      expect(g.h).toBeGreaterThanOrEqual(p.height - 1e-6)
    })
    expect(panels[0]!.name).toBe("Panel 1")
  })

  test("numbers from the right and keeps frames on their side in RTL", () => {
    const layers = placeFrames(doc([]), frames, "a.png", image, true)
    const panels = layers as PanelLayer[]
    expect(panels[0]!.x).toBeLessThan(panels[1]!.x)
    expect(panels[0]!.name).toBe("Panel 2")
    const mid = pixelAt(
      panels[0]!,
      panels[0]!.x + panels[0]!.width / 2,
      panels[0]!.y + panels[0]!.height / 2
    )
    expect(mid.x).toBeCloseTo(0.29 * image.width, 6)
  })

  test("a replaced image stays in the panel's versions", () => {
    const old = panel({ src: "old.png" })
    const layers = placeFrames(doc([old]), frames, "a.png", image)
    const first = layers[0] as PanelLayer
    expect(first.id).toBe(old.id)
    expect(first.versions?.[0]?.src).toBe("old.png")
    expect((layers[1] as PanelLayer).versions).toBeUndefined()
  })
})

describe("placePreset", () => {
  test("keeps a locked panel the preset has no cell for", () => {
    const first = panel()
    const locked = panel({ id: "locked", y: 900, locked: true })
    const layers = placePreset(doc([first, locked]), {
      id: "one",
      cells: [{ x: 0, y: 0, width: 1, height: 1 }],
    })
    expect(layers.map((l) => l.id)).toContain("locked")
  })
})

describe("frame editing", () => {
  const frame = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }

  test("moving stays on the image", () => {
    expect(dragFrame(frame, "move", 0.9, -0.9)).toEqual({
      ...frame,
      x: expect.closeTo(0.6),
      y: 0,
    })
  })

  test("resizing moves only the dragged edges and keeps a minimum", () => {
    const out = dragFrame(frame, "se", 0.1, 0.1)
    expect(out.x).toBe(0.2)
    expect(out.width).toBeCloseTo(0.5)
    expect(dragFrame(frame, "w", 2, 0).width).toBeCloseTo(0.03)
    expect(dragFrame(frame, "n", 0, -2).y).toBe(0)
  })

  test("a split frame's halves touch", () => {
    const [a, b] = splitFrame(frame, "y")
    expect(a.y + a.height).toBeCloseTo(b.y)
    expect(a.height + b.height).toBeCloseTo(frame.height)
  })
})

describe("saved layouts", () => {
  const cell = { x: 0, y: 0, width: 1, height: 1 }
  test("survive a reload and lose what's broken", () => {
    const project = toProject({
      ...createDefaultProject(),
      layouts: [
        { id: "a", name: "Mine", cells: [cell] },
        { id: "b", name: "Broken", cells: [{ ...cell, x: "0" }] },
        { id: "c", name: "Empty", cells: [] },
        { id: "d", name: "Huge", cells: [{ ...cell, width: 3 }] },
      ],
    })!
    expect(project.layouts).toEqual([{ id: "a", name: "Mine", cells: [cell] }])
  })
  test("are absent until there are some", () => {
    expect("layouts" in toProject(createDefaultProject())!).toBe(false)
  })
})
