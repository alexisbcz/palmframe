import { describe, expect, test } from "bun:test"

import {
  buildKleinPrompt,
  buildPrompt,
  engineCost,
  engineOf,
  panelRefs,
} from "@/components/comic-canvas/use-generator"
import {
  DEFAULT_LOOK,
  MAX_REFS,
  createPanel,
  type Character,
  type Look,
} from "@/components/comic-canvas/model"
import { COSTS } from "@/lib/credits"
import { parse, withoutReferences } from "@/lib/generate.server"

import { cleanAnalysis, pickPages, styleSlots } from "./style"

const id = "11111111-1111-4111-8111-111111111111"
const look: Look = {
  ...DEFAULT_LOOK,
  style: "raw",
  styleRef: { id, pages: 6 },
  recipe: {
    name: "Inky",
    tags: "thick outlines",
    prose: "Heavy brush ink.",
    negative: "gradient",
  },
}
const character = (n: number): Character => ({
  id: `c${n}`,
  name: `C${n}`,
  kind: "girl",
  tags: [],
  sheet: `https://x/${n}.png`,
  status: "approved",
})
const panel = (extra = {}) => ({
  ...createPanel({ x: 0, y: 0, width: 4, height: 5 }),
  prompt: "a rainy street",
  ...extra,
})

describe("cleanAnalysis", () => {
  test("keeps a reply in shape", () => {
    expect(
      cleanAnalysis({
        prose: "  Bold ink.  ",
        tags: ["Halftone", 3, "a, b", ""],
        negative: "nope",
      })
    ).toEqual({ prose: "Bold ink.", tags: ["halftone", "a  b"], negative: [] })
  })

  test("bounds what reaches prompts", () => {
    const r = cleanAnalysis({
      prose: "x".repeat(5_000),
      tags: Array(99).fill("y".repeat(99)),
      negative: [],
    })!
    expect(r.prose.length).toBe(1_200)
    expect(r.tags.length).toBe(24)
    expect(r.tags[0]!.length).toBe(40)
  })

  test("refuses a reply with no prose", () => {
    expect(cleanAnalysis({ tags: [] })).toBeNull()
    expect(cleanAnalysis(null)).toBeNull()
  })
})

describe("styleSlots", () => {
  test("takes two with room, one when crowded, never more than it has", () => {
    expect(styleSlots(0, false, 8)).toBe(2)
    expect(styleSlots(2, false, 8)).toBe(2)
    expect(styleSlots(3, false, 8)).toBe(1)
    expect(styleSlots(9, true, 8)).toBe(1)
    expect(styleSlots(0, false, 1)).toBe(1)
  })
})

describe("pickPages", () => {
  test("the seed walks the set and wraps", () => {
    expect(pickPages(["a", "b", "c"], 2, 0)).toEqual(["a", "b"])
    expect(pickPages(["a", "b", "c"], 2, 2)).toEqual(["c", "a"])
    expect(pickPages(["a"], 2, 7)).toEqual(["a"])
  })

  test("the same seed picks the same pages", () => {
    const pages = ["a", "b", "c", "d"]
    expect(pickPages(pages, 2, 2 ** 32 - 1)).toEqual(
      pickPages(pages, 2, 2 ** 32 - 1)
    )
  })
})

describe("panels in a learned style", () => {
  test("draw with reference images even with no cast", () => {
    expect(engineOf(panel(), { look })).toBe("klein")
    expect(engineCost(panel(), "klein", { look })).toBe(COSTS.panel_ref)
  })

  test("never overflow the slots, and the guide keeps its own", () => {
    const cast = [1, 2, 3, 4].map(character)
    const guide = { src: "data:image/png;base64,x", strength: "strict" }
    const p = panel({ cast: cast.map((c) => c.id), guide })
    const { refs, dropped, styleSlots: slots } = panelRefs(p, { cast, look })
    expect(refs.length + slots).toBe(MAX_REFS)
    expect(slots).toBe(1)
    expect(refs.at(-1)!.src).toBe(guide.src)
    expect(dropped).toHaveLength(2)
  })

  test("tell the model to take the style and nothing else", () => {
    const prompt = buildKleinPrompt(panel(), { look })
    expect(prompt).toContain("Reference images 1 and 2 are pages from another")
    expect(prompt).not.toContain("is pages")
    expect(prompt).toContain("Take the style only")
    expect(prompt).toContain("never copy the characters")
    expect(prompt).toContain("logos")
    expect(prompt).toContain("Heavy brush ink.")
  })

  test("number the style after the cast", () => {
    const cast = [character(1)]
    const prompt = buildKleinPrompt(panel({ cast: ["c1"] }), { cast, look })
    expect(prompt).toContain("C1 is the person in reference image 1")
    expect(prompt).toContain("Reference images 2 and 3 are pages")
    expect(prompt).not.toContain("Keep the art style of the character")
  })

  test("a single page reads as the reference image", () => {
    const one = { ...look, styleRef: { id, pages: 1 } }
    expect(buildKleinPrompt(panel(), { look: one })).toContain(
      "The reference image is a page from another comic"
    )
  })

  test("a panel on its own style leaves the learned one", () => {
    const p = panel({ style: "noir" })
    expect(panelRefs(p, { look }).styleSlots).toBe(0)
    expect(engineOf(p, { look })).toBe("anima")
  })

  test("Anima reads the analysis as tags and keeps its quality tags", () => {
    const { prompt, negative } = buildPrompt(panel(), { look })
    expect(prompt).toContain("thick outlines")
    expect(prompt).toContain("masterpiece")
    expect(negative).toContain("gradient")
  })
})

describe("the generate request", () => {
  const base = {
    prompt: "p",
    negative: "",
    width: 1024,
    height: 1024,
    seed: 5,
    steps: 4,
    engine: "klein",
  }
  const fallback = {
    prompt: "tags",
    negative: "n",
    width: 640,
    height: 960,
    steps: 8,
  }

  test("takes a style and never lets it exceed the slots", () => {
    const r = parse({
      ...base,
      refs: ["a", "b", "c"],
      style: { id, slots: 9 },
    })!
    expect(r.style).toEqual({ id, slots: 1 })
    const full = parse({
      ...base,
      refs: ["a", "b", "c", "d"],
      style: { id, slots: 2 },
    })!
    expect(full.style).toBeUndefined()
  })

  test("ignores a malformed id and a style on Anima", () => {
    expect(
      parse({ ...base, style: { id: "../x", slots: 1 } })!.style
    ).toBeUndefined()
    expect(
      parse({ ...base, engine: "anima", style: { id, slots: 1 } })!.style
    ).toBeUndefined()
  })

  test("falls back to the same panel for Anima, with no references", () => {
    const r = parse({ ...base, style: { id, slots: 2 }, fallback })!
    const text = withoutReferences({ ...r, refs: ["https://signed"] })!
    expect(text).toMatchObject({
      engine: "anima",
      prompt: "tags",
      refs: [],
      width: 640,
      height: 960,
      seed: 5,
    })
    expect(text.style).toBeUndefined()
  })

  test("has nowhere to go on Vercel with no ComfyUI", () => {
    const vercel = process.env.VERCEL
    const comfy = process.env.COMFY_URL
    process.env.VERCEL = "1"
    delete process.env.COMFY_URL
    const r = parse({ ...base, style: { id, slots: 2 }, fallback })!
    expect(withoutReferences(r)).toBeNull()
    if (vercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = vercel
    if (comfy !== undefined) process.env.COMFY_URL = comfy
  })
})
