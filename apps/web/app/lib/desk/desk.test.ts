import { beforeAll, expect, test } from "bun:test"

import { activeRules, blocksFor, compileCustom, lintBody } from "./lint"
import {
  countWords,
  dayKey,
  emptyManuscript,
  streak,
  toManuscript,
  totalWords,
} from "./model"
import { loadDictionary, checkForm, formById } from "./poetry"
import { sampleFor } from "./samples"
import { STYLES, compileStyle, stylesFor } from "./styles"

beforeAll(async () => {
  await loadDictionary()
})

test("every house style compiles", () => {
  for (const s of STYLES) expect(compileStyle(s).length).toBeGreaterThan(0)
})

test("each kind has a style in its own right", () => {
  expect(stylesFor("poetry").map((s) => s.id)).toContain("imagist")
  expect(stylesFor("screenplay").map((s) => s.id)).toContain("reader")
  expect(stylesFor("novel").map((s) => s.id)).toContain("hemingway")
})

const novelWith = (style: string, body: string) => {
  const m = emptyManuscript("novel")
  m.styles = [style]
  return lintBody(m, body).map((a) => a.check)
}

test("Hemingway strikes qualifiers and adverbs", () => {
  const checks = novelWith("hemingway", "He ran very quickly to the house.")
  expect(checks).toContain("Hemingway.Qualifiers")
  expect(checks).toContain("Hemingway.Adverbs")
})

test("Leonard's rules read dialogue tags", () => {
  const checks = novelWith(
    "leonard",
    `"Stop," he whispered. Suddenly she said softly.`
  )
  expect(checks).toContain("Elmore Leonard.Said")
  expect(checks).toContain("Elmore Leonard.Suddenly")
  expect(checks).toContain("Elmore Leonard.SaidAdverb")
})

test("Leonard's weather rule only reads the opening", () => {
  const m = emptyManuscript("novel")
  m.styles = ["leonard"]
  expect(
    lintBody(m, "Rain fell.").some((a) => a.check.endsWith("Weather"))
  ).toBe(true)
  expect(
    lintBody(m, "She left.\nRain fell.").some((a) =>
      a.check.endsWith("Weather")
    )
  ).toBe(false)
})

test("Flaubert reads French", () => {
  const m = emptyManuscript("novel")
  m.language = "fr"
  m.styles = ["flaubert"]
  const checks = lintBody(
    m,
    "Il y avait un coup de foudre, et il marchait lentement."
  ).map((a) => a.check)
  expect(checks).toContain("Flaubert.Lourdeurs")
  expect(checks).toContain("Flaubert.Cliches")
  expect(checks).toContain("Flaubert.Adverbes")
})

test("the script reader keeps to its scopes", () => {
  const m = sampleFor("screenplay")
  const checks = lintBody(m, m.parts[0]!.body).map((a) => a.check)
  expect(checks).toContain("Script Reader.WeSee")
  expect(checks).toContain("Script Reader.DirectingOnPaper")
  expect(checks).toContain("Script Reader.WrylyWarning")
  const dialogue = lintBody(m, "MARA\nWe see the camera.\n")
  expect(dialogue.some((a) => a.check.endsWith("WeSee"))).toBe(false)
})

test("a rule name can be muted, a word accepted, a level raised", () => {
  const m = emptyManuscript("novel")
  m.styles = ["hemingway"]
  const body = "He ran very quickly."
  m.mutedRules = ["Hemingway.Adverbs"]
  expect(lintBody(m, body).some((a) => a.match === "quickly")).toBe(false)
  m.accepted = ["very"]
  expect(lintBody(m, body).some((a) => a.match === "very")).toBe(false)
  m.accepted = []
  m.minLevel = "error"
  expect(lintBody(m, body).length).toBe(0)
})

test("custom rules run, and bad ones are reported, not thrown", () => {
  const m = emptyManuscript("novel")
  m.styles = []
  m.customRules = [
    {
      name: "NoBrine",
      source: "extends: existence\nmessage: x\ntokens:\n  - brine",
    },
  ]
  expect(lintBody(m, "Wet brine.").map((a) => a.check)).toEqual([
    "Custom.NoBrine",
  ])
  expect(compileCustom("Bad", "extends: spelling")).toBeInstanceOf(Error)
  m.customRules.push({ name: "Bad", source: "not: valid" })
  expect(activeRules(m).length).toBe(1)
})

test("offsets survive multi-line blocks", () => {
  const m = sampleFor("screenplay")
  const body = m.parts[0]!.body
  for (const a of lintBody(m, body))
    expect(body.slice(a.start, a.end)).toBe(a.match)
  const v = sampleFor("poetry")
  const verse = v.parts[0]!.body
  for (const a of lintBody(v, verse))
    expect(verse.slice(a.start, a.end)).toBe(a.match)
})

test("scene breaks and blanks aren't linted", () => {
  const m = emptyManuscript("novel")
  expect(blocksFor(m, "One.\n***\n\nTwo.").map((b) => b.text)).toEqual([
    "One.",
    "Two.",
  ])
})

test("the sample sonnet holds its form", () => {
  const v = sampleFor("poetry")
  const issues = checkForm(v.parts[0]!.body, formById("shakespearean"))
  expect(issues.filter((i) => i.code === "lines")).toEqual([])
  expect(issues.filter((i) => i.code === "stanza")).toEqual([])
})

test("words and streaks", () => {
  expect(countWords("It’s a well-worn road, 12 miles.")).toBe(6)
  expect(totalWords(sampleFor("novel"))).toBeGreaterThan(100)
  const day = new Date(2026, 10, 10)
  const back = (n: number) => dayKey(new Date(2026, 10, 10 - n))
  expect(streak({ [back(1)]: 500, [back(2)]: 500 }, 500, day)).toBe(2)
  expect(
    streak({ [back(0)]: 500, [back(1)]: 500, [back(3)]: 500 }, 500, day)
  ).toBe(2)
})

test("old or damaged rows still open", () => {
  const m = toManuscript({ kind: "nonsense", parts: [{ body: 5 }], cloth: "x" })
  expect(m.kind).toBe("novel")
  expect(m.parts[0]!.body).toBe("")
  expect(m.cloth).toBe("oxblood")
  expect(toManuscript(null).parts.length).toBe(1)
})
