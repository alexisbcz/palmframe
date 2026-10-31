import { describe, expect, test } from "bun:test"

import {
  MAX_VERSIONS,
  createPanel,
  createDefaultProject,
  createText,
  createBubble,
  withCurrentImage,
  type ComicDoc,
  type ComicProject,
  type PanelLayer,
} from "./model"
import { panelsToReroll, quoteRun } from "./run"
import {
  commandKey,
  dragSlop,
  gesturePatch,
  resize,
  snapResize,
} from "./stage-gestures"
import { patched, reducer } from "./use-editor"
import { panelsToDraw } from "./use-generator"

const panel = (over: Partial<PanelLayer> = {}): PanelLayer => ({
  ...createPanel({ x: 0, y: 0, width: 100, height: 100 }),
  ...over,
})

function project(...layers: PanelLayer[]): ComicProject {
  return { ...createDefaultProject(), pages: [{ id: "p", layers }] }
}

const keys = (over: Partial<KeyboardEvent> & { altGraph?: boolean }) => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  getModifierState: (k: string) => k === "AltGraph" && !!over.altGraph,
  ...over,
})

describe("generate all", () => {
  const empty = panel({ prompt: "a street" })
  const drawn = panel({ prompt: "a street", src: "a.png" })
  const locked = panel({ prompt: "a street", locked: true })
  const hidden = panel({ prompt: "a street", hidden: true })
  const unprompted = panel()

  test("draws only empty, unlocked, visible panels with a prompt", () => {
    const p = project(empty, drawn, locked, hidden, unprompted)
    expect(panelsToDraw(p).map((l) => l.id)).toEqual([empty.id])
  })

  test("a run's quote agrees", () => {
    const p = project(empty, drawn, locked, hidden)
    expect(quoteRun(p, { story: "", rerolls: 0 }).counts.panels).toBe(1)
  })

  test("a run doesn't redraw a locked panel", () => {
    const flagged: Partial<PanelLayer> = {
      src: "a.png",
      rerolls: 0,
      prompt: "a street",
      check: {
        imageWidth: 100,
        imageHeight: 100,
        cast: [],
        headcount: 0,
        unexpected: 0,
        lettering: true,
        faces: [],
      },
    }
    const free = panel(flagged)
    const p = project(free, panel({ ...flagged, locked: true }))
    expect(panelsToReroll(p, 3).map((l) => l.id)).toEqual([free.id])
  })
})

describe("replaced images", () => {
  test("the old image joins the versions", () => {
    const next = patched(panel({ src: "a.png", model: "m" }), { src: "b.png" })
    expect(next.type === "panel" && next.versions).toEqual([
      {
        src: "a.png",
        kind: "original",
        model: "m",
        engine: undefined,
        seed: undefined,
      },
    ])
  })

  test("removing an image keeps it too", () => {
    const next = patched(panel({ src: "a.png" }), { src: null })
    expect(next.type === "panel" && next.versions?.[0]?.src).toBe("a.png")
  })

  test("an empty panel has nothing to keep", () => {
    const next = patched(panel(), { src: "b.png" })
    expect(next.type === "panel" && next.versions).toBeUndefined()
  })

  test("versions a caller worked out win", () => {
    const next = patched(panel({ src: "a.png" }), {
      src: "b.png",
      versions: [],
    } as Partial<PanelLayer>)
    expect(next.type === "panel" && next.versions).toEqual([])
  })

  test("no duplicates, and the list stays capped", () => {
    const versions = Array.from({ length: MAX_VERSIONS }, (_, i) => ({
      src: `${i}.png`,
      kind: "original" as const,
    }))
    expect(withCurrentImage(panel({ src: "3.png", versions }))).toEqual(
      versions
    )
    const longer = withCurrentImage(panel({ src: "new.png", versions }))
    expect(longer).toHaveLength(MAX_VERSIONS)
    expect(longer[0]!.src).toBe("new.png")
  })
})

describe("history rollback", () => {
  const start = project(panel())
  const base = { project: start, past: [], future: [], lastKey: null }
  const dragged = { ...start }

  test("takes a cancelled gesture out of the history", () => {
    const moved = reducer(base, { type: "commit", project: dragged, key: "k" })
    const back = reducer(moved, { type: "rollback", key: "k", before: start })
    expect(back.project).toBe(start)
    expect(back.past).toHaveLength(0)
  })

  test("leaves history alone if something landed during the drag", () => {
    const moved = reducer(base, { type: "commit", project: dragged, key: "k" })
    const landed = reducer(moved, { type: "commit", project: { ...start } })
    const back = reducer(landed, { type: "rollback", key: "k", before: start })
    expect(back).toBe(landed)
  })
})

describe("gestures", () => {
  const doc: ComicDoc = {
    version: 1,
    width: 1000,
    height: 1000,
    background: "#fff",
    layers: [],
  }
  const box = panel({ x: 100, y: 100, width: 200, height: 200 })
  const none = { altKey: false, shiftKey: false }

  test("a finger gets a wider dead zone than a mouse", () => {
    expect(dragSlop("touch")).toBeGreaterThan(dragSlop("mouse"))
  })

  test("the dragged edge snaps to the page centre", () => {
    const patch = resize(box, 1, 0, 197, 0, none)
    const out = snapResize(doc, box, patch, 1, 0, none, 6)
    expect(out.patch.width).toBe(400)
    expect(out.patch.x).toBe(100)
    expect(out.guides.x).toEqual([500])
  })

  test("the left edge snaps too, keeping the right edge where it was", () => {
    const patch = resize(box, -1, 0, -97, 0, none)
    const out = snapResize(doc, box, patch, -1, 0, none, 6)
    expect(out.patch.x).toBe(0)
    expect(out.patch.width).toBe(300)
  })

  test("a far edge doesn't snap", () => {
    const patch = resize(box, 1, 0, 50, 0, none)
    const out = snapResize(doc, box, patch, 1, 0, none, 6)
    expect(out.patch).toEqual(patch)
    expect(out.guides.x).toEqual([])
  })

  test("ratio, centre and rotated resizes aren't snapped", () => {
    const patch = resize(box, 1, 1, 197, 197, none)
    const shift = { altKey: false, shiftKey: true }
    const alt = { altKey: true, shiftKey: false }
    const turned = { ...box, rotation: 15 }
    expect(snapResize(doc, box, patch, 1, 1, shift, 6).patch).toBe(patch)
    expect(snapResize(doc, box, patch, 1, 1, alt, 6).patch).toBe(patch)
    expect(snapResize(doc, turned, patch, 1, 1, none, 6).patch).toBe(patch)
  })

  test("a snapped bubble's tail scales with the snapped size", () => {
    const bubble = {
      ...createBubble("speech", { x: 200, y: 200 }),
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      tailX: 100,
      tailY: 100,
      rotation: 0,
    }
    const patch = resize(bubble, 1, 0, 197, 0, none)
    const out = snapResize(doc, bubble, patch, 1, 0, none, 6)
    expect(out.patch).toMatchObject({ width: 400, tailX: 200 })
  })

  test("a cancel restores only what a drag touches", () => {
    const text = createText({ x: 10, y: 10 })
    const patch = gesturePatch(text)
    expect(patch).toMatchObject({ fontSize: text.fontSize })
    expect(patch).not.toHaveProperty("text")
    expect(gesturePatch(panel())).not.toHaveProperty("src")
  })
})

describe("keys", () => {
  test("Cmd and Ctrl are command keys", () => {
    expect(commandKey(keys({ metaKey: true }))).toBe(true)
    expect(commandKey(keys({ ctrlKey: true }))).toBe(true)
  })

  test("AltGr isn't, however the platform reports it", () => {
    expect(commandKey(keys({ ctrlKey: true, altKey: true }))).toBe(false)
    expect(commandKey(keys({ ctrlKey: true, altGraph: true }))).toBe(false)
  })
})
