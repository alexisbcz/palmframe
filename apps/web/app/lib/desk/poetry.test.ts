import { beforeAll, expect, test } from "bun:test"

import {
  checkForm,
  dominantMeter,
  formById,
  frenchSyllables,
  loadDictionary,
  rhymes,
  rhymeScheme,
  rhymesFor,
  scan,
  syllableCount,
} from "./poetry"

beforeAll(async () => {
  await loadDictionary()
})

test("counts syllables from the dictionary", () => {
  expect(syllableCount("An old silent pond")).toBe(5)
  expect(syllableCount("A frog jumps into the pond")).toBe(7)
  expect(syllableCount("Shall I compare thee to a summer's day?")).toBe(10)
})

test("hears iambic pentameter", () => {
  const s = scan("The curfew tolls the knell of parting day")
  expect(s.meter).toBe("iamb")
  expect(s.feet).toBe(5)
  expect(
    dominantMeter([
      "The curfew tolls the knell of parting day",
      "The lowing herd wind slowly over the lea",
      "The ploughman homeward plods his weary way",
    ])?.meter
  ).toBe("iamb")
})

test("tells rhyme from slant rhyme from neither", () => {
  expect(rhymes("day", "away")).toBe("perfect")
  expect(rhymes("though", "throw")).toBe("perfect")
  expect(rhymes("love", "move")).toBe("slant")
  expect(rhymes("day", "night")).toBeNull()
})

test("letters a scheme, stanza breaks included", () => {
  const scheme = rhymeScheme([
    "The sun went down upon the bay",
    "And night came creeping in",
    "",
    "The boats had all gone far away",
    "The tide was running thin",
  ])
  expect(scheme.map((l) => l?.letter ?? "-").join("")).toBe("AB-AB")
})

test("a shared final consonant doesn't merge two rhymes", () => {
  const scheme = rhymeScheme([
    "The boats lie down at evening in the mud",
    "and wait, the way the old wait, for the tide.",
    "The gulls have read the morning's news of blood",
    "and picked it clean and set the bones aside.",
  ])
  expect(scheme.map((l) => l!.letter).join("")).toBe("ABAB")
})

test("finds rhymes", () => {
  const words = rhymesFor("river").map((h) => h.word)
  expect(words).toContain("shiver")
  expect(words).toContain("liver")
  expect(words).not.toContain("river")
})

test("holds a haiku to 5-7-5", () => {
  const form = formById("haiku")
  expect(
    checkForm(
      "An old silent pond\nA frog jumps into the pond\nSplash! Silence again",
      form
    )
  ).toEqual([])
  const issues = checkForm("An old silent pond\nA frog\nSplash", form)
  expect(issues).toContainEqual({
    code: "syllables",
    line: 1,
    expected: 7,
    got: 2,
  })
})

test("a sonnet needs fourteen lines and its rhymes", () => {
  const issues = checkForm(
    "The sun\nThe moon\nThe bun\nThe rock",
    formById("shakespearean")
  )
  expect(issues.some((i) => i.code === "lines")).toBe(true)
  expect(issues.some((i) => i.code === "rhyme")).toBe(true)
})

test("a villanelle repeats its refrains", () => {
  const lines = Array.from({ length: 19 }, (_, i) => `line number ${i}`)
  const issues = checkForm(lines.join("\n"), formById("villanelle"))
  expect(issues.filter((i) => i.code === "refrain").length).toBe(6)
})

test("French verse counts the mute e", () => {
  expect(
    frenchSyllables("Demain, dès l'aube, à l'heure où blanchit la campagne")
  ).toBe(12)
  expect(
    frenchSyllables("Je partirai. Vois-tu, je sais que tu m'attends.")
  ).toBe(12)
  expect(frenchSyllables("J'irai par la forêt, j'irai par la montagne.")).toBe(
    12
  )
})
