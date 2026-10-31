import { describe, expect, test } from "bun:test"

import { readerProject } from "@/lib/share.server"
import { parseTranslate, translateInput } from "@/routes/api.translate"

import {
  letteringLines,
  linesToTranslate,
  refitText,
  requestLines,
  speakerOf,
  withEditedLine,
  withTranslations,
  type LetteringLine,
} from "./lettering"
import {
  createBubble,
  createPanel,
  createText,
  type BubbleLayer,
  type ComicProject,
  type Layer,
  type PanelLayer,
} from "./model"
import { letteringOrder } from "./reading-order"

const panel = (x: number, y: number, width = 500, height = 600) =>
  ({
    ...createPanel({ x, y, width, height }),
    id: `p${x}-${y}`,
  }) as PanelLayer

const bubble = (id: string, x: number, y: number, text = id) => {
  const b = createBubble("speech", { x: 0, y: 0 })
  return { ...b, id, x, y, width: 200, height: 120, text } as BubbleLayer
}

const project = (layers: Layer[], extra?: Partial<ComicProject>) =>
  ({
    version: 2,
    width: 1080,
    height: 1350,
    background: "#ffffff",
    pages: [{ id: "a", layers }],
    ...extra,
  }) as ComicProject

const ids = (layers: Layer[], rtl = false) =>
  letteringOrder(layers, rtl).map((l) => l.layer.id)

describe("letteringOrder", () => {
  const left = panel(0, 0)
  const right = panel(540, 0)

  test("reads a panel out before the next, whatever the heights", () => {
    const layers = [left, right, bubble("r", 600, 20), bubble("l", 20, 300)]
    expect(ids(layers)).toEqual(["l", "r"])
    expect(ids(layers, true)).toEqual(["r", "l"])
  })

  test("reads a row from the side the page starts on", () => {
    const layers = [left, bubble("a", 40, 40), bubble("b", 260, 60)]
    expect(ids(layers)).toEqual(["a", "b"])
    expect(ids(layers, true)).toEqual(["b", "a"])
  })

  test("keeps a line under another below it on either side", () => {
    const layers = [left, bubble("a", 260, 40), bubble("b", 40, 200)]
    expect(ids(layers)).toEqual(["a", "b"])
    expect(ids(layers, true)).toEqual(["a", "b"])
  })

  test("gives a line in the gutter to the nearest panel", () => {
    const layers = [left, right, bubble("g", 410, 300)]
    expect(letteringOrder(layers)[0]!.panel).toBe(1)
  })

  test("gives an inset its own lettering", () => {
    const inset = panel(300, 300, 200, 200)
    const placed = letteringOrder([left, inset, bubble("i", 310, 340)])
    expect(placed[0]!.frame).toBe(inset)
  })

  test("skips hidden and empty lines, and works with no panels", () => {
    const hidden = { ...bubble("h", 0, 0), hidden: true }
    const placed = letteringOrder([
      hidden,
      bubble("e", 0, 0, " "),
      bubble("a", 0, 0),
    ])
    expect(placed.map((l) => l.layer.id)).toEqual(["a"])
    expect(placed[0]!.frame).toBeUndefined()
  })
})

describe("speakerOf", () => {
  const aki = { id: "c1", name: "Aki " } as ComicProject["cast"] extends
    (infer C)[] | undefined
    ? C
    : never
  const ren = { ...aki, id: "c2", name: "Ren" }
  const frame = panel(0, 0)

  test("trusts the script's name, and not a default one", () => {
    expect(speakerOf({ ...bubble("a", 0, 0), name: "Waiter" }, frame)).toBe(
      "Waiter"
    )
    const unnamed = { ...bubble("a", 0, 0), name: "Speech" }
    expect(speakerOf(unnamed, frame)).toBeUndefined()
  })

  test("follows the tail to a checked face", () => {
    const check = {
      imageWidth: 500,
      imageHeight: 600,
      cast: ["c1", "c2"],
      headcount: 2,
      unexpected: 0,
      lettering: false,
      faces: [
        { x: 0, y: 0.5, width: 0.1, height: 0.1, who: "c1" },
        { x: 0.8, y: 0.5, width: 0.1, height: 0.1, who: "c2" },
      ],
    }
    const checked = { ...frame, src: "x", check } as PanelLayer
    const b = {
      ...bubble("a", 300, 100),
      name: "Speech",
      tailX: 40,
      tailY: 180,
    }
    expect(speakerOf(b, checked, [aki, ren])).toBe("Ren")
  })

  test("falls back on the only character in the shot", () => {
    const solo = { ...frame, cast: ["c1"] }
    const b = { ...bubble("a", 0, 0), name: "Speech" }
    expect(speakerOf(b, solo, [aki, ren])).toBe("Aki")
    expect(speakerOf(b, { ...solo, cast: ["c1", "c2"] }, [aki, ren])).toBe(
      undefined
    )
  })

  test("leaves narration and effects alone", () => {
    const caption = { ...createBubble("caption", { x: 0, y: 0 }), name: "Aki" }
    expect(speakerOf(caption, frame)).toBeUndefined()
    expect(speakerOf(createText({ x: 0, y: 0 }), frame)).toBeUndefined()
  })
})

describe("translated text layers", () => {
  const sfx = { ...createText({ x: 300, y: 300 }), id: "s", text: "KRAK!" }
  const p = project([bubble("a", 0, 0), sfx])

  test("are lines of their own, and take translations and edits", () => {
    const lines = letteringLines(p, "fr")
    expect(lines.map((l) => l.shape)).toEqual(["speech", "sfx"])
    const done = withTranslations(p, "fr", lines, [{ id: "s", text: "CRAC !" }])
    const layer = done.pages[0]!.layers[1]!
    expect(layer.type === "text" && layer.translations?.fr).toEqual({
      text: "CRAC !",
      source: "KRAK!",
    })
    const edited = withEditedLine(done, "fr", "s", "BAM")
    expect(letteringLines(edited, "fr")[1]!.translation?.edited).toBe(true)
  })

  test("go stale when the original changes", () => {
    const lines = letteringLines(p, "fr")
    const done = withTranslations(p, "fr", lines, [{ id: "s", text: "CRAC !" }])
    const moved = project(
      done.pages[0]!.layers.map((l) =>
        l.id === "s" && l.type === "text" ? { ...l, text: "BOOM" } : l
      )
    )
    expect(letteringLines(moved, "fr")[1]!.status).toBe("stale")
  })
})

// Every glyph half an em wide, enough to exercise the fitting.
const fakeCtx = () => {
  const ctx = {
    font: "",
    measureText(s: string) {
      const size = Number.parseFloat(/(\d+(\.\d+)?)px/.exec(ctx.font)![1]!)
      return { width: (s.length * size) / 2 }
    },
  }
  return ctx as unknown as CanvasRenderingContext2D
}

describe("refitText", () => {
  const sfx = {
    ...createText({ x: 300, y: 300 }),
    text: "KRAK!",
    fontSize: 100,
    strokeWidth: 10,
    width: 300,
    height: 120,
  }

  test("keeps text that fits as it is", () => {
    const fitted = refitText(fakeCtx(), sfx, "BOUM!")
    expect(fitted).toMatchObject({
      text: "BOUM!",
      fontSize: 100,
      strokeWidth: 10,
    })
  })

  test("shrinks long text and its outline, and keeps the box", () => {
    const fitted = refitText(fakeCtx(), sfx, "KRACHBUMMBANGBOOM")
    expect(fitted.fontSize).toBeLessThan(40)
    expect((17 * fitted.fontSize) / 2).toBeLessThanOrEqual(300)
    expect(fitted.strokeWidth).toBeCloseTo(fitted.fontSize / 10)
    expect(fitted).toMatchObject({
      x: sfx.x,
      y: sfx.y,
      width: 300,
      height: 120,
    })
  })

  test("can use the room an overflowing original took", () => {
    const tall = { ...sfx, text: "AAAAA BBBBB CCCCC", width: 260 }
    expect(refitText(fakeCtx(), tall, "DDDDD EEEEE FFFFF").fontSize).toBe(100)
  })
})

describe("requestLines", () => {
  const line = (n: number, extra?: Partial<LetteringLine>): LetteringLine => ({
    id: `l${n}`,
    page: 0,
    panel: 1,
    shape: "speech",
    text: `line ${n}`,
    status: "done",
    ...extra,
  })

  test("wraps the open lines in read-only neighbours", () => {
    const lines = Array.from({ length: 30 }, (_, i) => line(i))
    lines[15] = line(15, { status: "stale", speaker: "Aki" })
    lines[14] = line(14, {
      translation: { text: "déjà", source: "line 14" },
    })
    const sent = requestLines(lines, linesToTranslate(lines))
    expect(sent.length).toBe(17)
    expect(sent.filter((l) => !l.readOnly).map((l) => l.id)).toEqual(["l15"])
    expect(sent.find((l) => l.id === "l15")).toMatchObject({
      speaker: "Aki",
      page: 1,
      panel: 1,
    })
    expect(sent.find((l) => l.id === "l14")).toMatchObject({
      readOnly: true,
      translation: "déjà",
    })
  })

  test("sends hand edits as context, never to translate", () => {
    const lines = [
      line(0, {
        status: "missing",
        translation: { text: "à la main", source: "x", edited: true },
      }),
      line(1, { status: "missing" }),
    ]
    const sent = requestLines(lines, linesToTranslate(lines))
    expect(sent[0]).toMatchObject({ readOnly: true, translation: "à la main" })
    expect(sent[1]!.readOnly).toBeUndefined()
  })
})

describe("the translate request", () => {
  const line = { id: "a", shape: "speech", text: "Hi" }

  test("needs at least one line to translate", () => {
    expect(
      parseTranslate({ language: "fr", lines: [{ ...line, readOnly: true }] })
    ).toBeNull()
    expect(parseTranslate({ language: "xx", lines: [line] })).toBeNull()
  })

  test("takes old clients and bad fields without failing", () => {
    const r = parseTranslate({
      language: "fr",
      lines: [{ ...line, page: "1", panel: -2, speaker: 3 }],
    })!
    expect(r.facts).toEqual([])
    expect(r.lines[0]).toMatchObject({ id: "a", text: "Hi" })
    expect(r.lines[0]!.page).toBeUndefined()
    expect(r.lines[0]!.panel).toBeUndefined()
    expect(r.lines[0]!.speaker).toBeUndefined()
  })

  test("drops context past its cap instead of refusing", () => {
    const context = Array.from({ length: 500 }, (_, i) => ({
      ...line,
      id: `c${i}`,
      readOnly: true,
    }))
    const r = parseTranslate({ language: "fr", lines: [...context, line] })!
    expect(r.lines.filter((l) => !l.readOnly).length).toBe(1)
    expect(r.lines.filter((l) => l.readOnly).length).toBe(200)
  })

  test("hides read-only ids from the translator and passes facts", () => {
    const r = parseTranslate({
      language: "ja",
      lines: [
        { ...line, id: "ctx", readOnly: true, translation: "やあ" },
        { ...line, speaker: "Aki", page: 1, panel: 2 },
      ],
      facts: ["Aki is left-handed"],
    })!
    const input = JSON.parse(translateInput(r))
    expect(input.series_facts).toEqual(["Aki is left-handed"])
    expect(input.lines[0]).toMatchObject({
      read_only: true,
      translation: "やあ",
    })
    expect(input.lines[0].id).toBeUndefined()
    expect(input.lines[1]).toMatchObject({
      id: "a",
      speaker: "Aki",
      page: 1,
      panel: 2,
    })
    expect(input.lines[1].read_only).toBeUndefined()
  })
})

describe("readerProject", () => {
  test("keeps the reading direction and no translations", () => {
    const sfx = {
      ...createText({ x: 0, y: 0 }),
      translations: { fr: { text: "x", source: "y" } },
    }
    const shared = readerProject(project([sfx], { rtl: true }))
    expect(shared.rtl).toBe(true)
    expect(JSON.stringify(shared)).not.toContain("translations")
    expect(readerProject(project([sfx])).rtl).toBeUndefined()
  })
})
