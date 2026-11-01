import { expect, test } from "bun:test"

import {
  castOf,
  completion,
  LINES_PER_PAGE,
  paginate,
  parseScript,
  scenesOf,
  wrap,
} from "./fountain"

const SAMPLE = `INT. KITCHEN - NIGHT

Rain against glass. MARA sits with a cold cup.

MARA
(not looking up)
You came back.

TOM (O.S.)
I forgot my keys.

CUT TO:

.THE ROOF

Nothing. Then wind.

> THE END <`

test("classifies every Fountain element", () => {
  const types = parseScript(SAMPLE)
    .filter((l) => l.type !== "blank")
    .map((l) => l.type)
  expect(types).toEqual([
    "scene",
    "action",
    "character",
    "parenthetical",
    "dialogue",
    "character",
    "dialogue",
    "transition",
    "scene",
    "action",
    "centered",
  ])
})

test("forced elements and a lone shout", () => {
  const [a, , b, , c] = parseScript("@mara\nHello\n\n!FADE TO BLACK\n\nHELP")
  expect(a!.type).toBe("character")
  expect(a!.text).toBe("MARA")
  expect(b!.type).toBe("blank")
  expect(c!.type).toBe("blank")
  const lone = parseScript("HELP")
  expect(lone[0]!.type).toBe("action")
})

test("scene numbers and dual dialogue", () => {
  const s = parseScript("INT. A #12A#\n\nTOM ^\nHi")
  expect(s[0]!.number).toBe("12A")
  expect(s[0]!.text).toBe("INT. A")
  expect(s[2]!.dual).toBe(true)
})

test("reports scenes, cast and places", () => {
  const script = parseScript(SAMPLE)
  const scenes = scenesOf(script)
  expect(scenes.length).toBe(2)
  expect(scenes[0]).toMatchObject({
    place: "KITCHEN",
    time: "NIGHT",
    interior: "INT",
    characters: ["MARA", "TOM"],
  })
  expect(castOf(script).map((c) => c.name)).toEqual(["TOM", "MARA"])
})

test("wraps at the column and pages at 55 lines", () => {
  expect(wrap("aaaa bbbb cccc", 9)).toEqual(["aaaa bbbb", "cccc"])
  const long = Array.from(
    { length: 200 },
    (_, i) => `Action line ${i}.\n`
  ).join("\n")
  const pages = paginate(parseScript(long))
  expect(pages.length).toBeGreaterThan(3)
  for (const p of pages)
    expect(p.lines.length).toBeLessThanOrEqual(LINES_PER_PAGE)
})

test("a split speech carries (MORE) and (CONT'D)", () => {
  const filler = Array.from({ length: 24 }, (_, i) => `Beat ${i}.\n`).join("\n")
  const speech = Array.from(
    { length: 30 },
    () => "She keeps talking, sentence on sentence, and nobody stops her."
  ).join(" ")
  const pages = paginate(parseScript(`${filler}\nMARA\n${speech}\n`))
  const lines = pages.flatMap((p) => p.lines)
  expect(lines.some((l) => l.type === "more")).toBe(true)
  expect(lines.some((l) => l.text === "MARA (CONT'D)")).toBe(true)
  expect(pages[0]!.lines.at(-1)!.type).toBe("more")
})

test("a scene heading never ends a page", () => {
  const filler = Array.from({ length: 27 }, (_, i) => `Beat ${i}.\n`).join("\n")
  const pages = paginate(
    parseScript(`${filler}\nINT. A - DAY\n\nThen something happens.\n`)
  )
  expect(pages[0]!.lines.at(-1)!.type).not.toBe("scene")
})

test("completes names, places and times", () => {
  expect(completion("MA", "character", ["MARA"], [])).toBe("RA")
  expect(completion("INT. KIT", "scene", [], ["KITCHEN"])).toBe("CHEN")
  expect(completion("INT. KITCHEN - NI", "scene", [], ["KITCHEN"])).toBe("GHT")
})
