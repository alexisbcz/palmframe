import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { stringify } from "yaml"

import proselint from "./packs/proselint.json"
import writeGood from "./packs/write-good.json"
import {
  compileRule,
  evaluate,
  lint,
  parseRule,
  RuleError,
  sentences,
  textStats,
  type CompiledRule,
  type ValeRule,
} from "./vale"

const PACKS = { "write-good": writeGood, proselint } as unknown as Record<
  string,
  Record<string, ValeRule>
>

const FIXTURE = `It was a dark and stormy night, and the rain was falling very heavily on the the old house. Clearly, there is a sense in which the letter had been written by someone who was extremely tired.

There are many reasons why she utilized the colour of the sky. But in order to go, the center and the centre were completely different... He said it was quite literally the most unique thing!!

So the fact is that a number of men were killed. In the the morning, the Doctor was shocked beyond belief, and it is what it is. The results were analyzed by the team, and it seems that many of them left.

But Mr. Jones thought that she might possibly have a very, very good reason to organize, then organise, a party. At the end of the day, I apologize, and I just wanted to say sorry for sorry about the the delay. The (c) 2024 thing is 5 x 7 big.`

const compiled = (): CompiledRule[] =>
  Object.entries(PACKS).flatMap(([pack, rules]) =>
    Object.entries(rules).map(([name, rule]) =>
      compileRule(`${pack}.${name}`, rule)
    )
  )

test("every bundled rule compiles", () => {
  expect(compiled().length).toBe(42)
})

// The real binary is the specification. Skipped where it isn't installed.
const vale = spawnSync("vale", ["--version"])
test.if(vale.status === 0)("alerts match the real Vale binary", () => {
  const dir = mkdtempSync(join(tmpdir(), "vale-"))
  for (const [pack, rules] of Object.entries(PACKS)) {
    mkdirSync(join(dir, pack))
    for (const [name, rule] of Object.entries(rules))
      writeFileSync(join(dir, pack, `${name}.yml`), stringify(rule))
  }
  writeFileSync(
    join(dir, ".vale.ini"),
    `StylesPath = ${dir}\nMinAlertLevel = suggestion\n[*.txt]\nBasedOnStyles = write-good, proselint\n`
  )
  writeFileSync(join(dir, "fixture.txt"), FIXTURE)
  const run = spawnSync(
    "vale",
    ["--config=.vale.ini", "--output=JSON", "fixture.txt"],
    { cwd: dir, encoding: "utf8" }
  )
  const real = Object.values(JSON.parse(run.stdout))[0] as {
    Check: string
    Line: number
    Span: [number, number]
    Match: string
  }[]
  const lines = FIXTURE.split("\n")
  const offset = (line: number) =>
    lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
  const theirs = real.map(
    (a) => `${a.Check}@${offset(a.Line) + a.Span[0] - 1}:${a.Match}`
  )
  const ours = lint(FIXTURE, compiled()).map(
    (a) => `${a.check}@${a.start}:${a.match}`
  )
  const missing = theirs.filter((a) => !ours.includes(a))
  const extra = ours.filter((a) => !theirs.includes(a))
  expect({ missing, extra }).toEqual({ missing: [], extra: [] })
})

const one = (rule: ValeRule) => [compileRule("T.R", rule)]

test("existence honours exceptions, and removal offers an empty fix", () => {
  const rules = one({
    extends: "existence",
    message: "Cut '%s'.",
    level: "warning",
    ignorecase: true,
    tokens: ["\\w+ly"],
    exceptions: ["only", "family"],
    action: { name: "remove" },
  })
  const alerts = lint("Only my family walks quickly.", rules)
  expect(alerts.map((a) => a.match)).toEqual(["quickly"])
  expect(alerts[0]!.fix).toBe("")
  expect(alerts[0]!.message).toBe("Cut 'quickly'.")
})

test("substitution takes the longest phrase and proposes the swap", () => {
  const rules = one({
    extends: "substitution",
    message: "Use '%s' instead of '%s'.",
    ignorecase: true,
    swap: { "in order to": "to", order: "sequence" },
  })
  const [a] = lint("We left in order to eat.", rules)
  expect(a!.match).toBe("in order to")
  expect(a!.fix).toBe("to")
  expect(a!.message).toBe("Use 'to' instead of 'in order to'.")
})

test("occurrence counts within a sentence", () => {
  const rules = one({
    extends: "occurrence",
    message: "%s words.",
    scope: "sentence",
    max: 3,
    token: "\\b\\w+\\b",
  })
  const alerts = lint("One two three. One two three four five.", rules)
  expect(alerts.length).toBe(1)
  expect(alerts[0]!.message).toBe("5 words.")
})

test("consistency keeps what the document said first", () => {
  const rules = one({
    extends: "consistency",
    message: "'%s' here, but '%s' before.",
    ignorecase: true,
    either: { grey: "gray" },
  })
  const alerts = lint("A grey day.\n\nA gray sky. A grey sea.", rules)
  expect(alerts.map((a) => a.match)).toEqual(["gray"])
  expect(alerts[0]!.fix).toBe("grey")
})

test("conditional wants the second pattern somewhere", () => {
  const rules = one({
    extends: "conditional",
    message: "Spell out '%s'.",
    first: "\\b([A-Z]{3,})\\b",
    second: "\\(([A-Z]{3,})\\)",
  })
  expect(lint("The CIA (CIA) and the FBI.", rules).map((a) => a.match)).toEqual(
    ["FBI"]
  )
})

test("metric evaluates a formula without eval", () => {
  const rules = one({
    extends: "metric",
    message: "Grade %s.",
    formula:
      "(0.39 * (words / sentences)) + 11.8 * (syllables / words) - 15.59",
    condition: "> 5",
    level: "warning",
  })
  expect(
    lint("Notwithstanding considerable organisational difficulties.", rules)
      .length
  ).toBe(1)
  expect(evaluate("2 + 3 * pow(2, 3)", {})).toBe(26)
  expect(() => evaluate("process.exit(1)", {})).toThrow(RuleError)
})

test("custom scopes reach only blocks of that kind", async () => {
  const { lintBlocks } = await import("./vale")
  const rules = one({
    extends: "existence",
    message: "x",
    scope: "dialogue",
    tokens: ["camera"],
  })
  const alerts = lintBlocks(
    [
      { text: "The camera pans.", start: 0, kind: "action" },
      { text: "Mind the camera.", start: 17, kind: "dialogue" },
    ],
    rules
  )
  expect(alerts.map((a) => a.start)).toEqual([26])
})

test("rejects what it can't run, by name", () => {
  expect(() =>
    compileRule("A.B", parseRule("extends: sequence\ntokens: []"))
  ).toThrow(/not supported/)
  expect(() => parseRule("just: words")).toThrow(RuleError)
})

test("sentences survive abbreviations and quotes", () => {
  const text = `Mr. Jones left. "Why?" she asked. He wept... and went on.`
  expect(sentences(text).map((s) => text.slice(s.start, s.end).trim())).toEqual(
    ["Mr. Jones left.", `"Why?" she asked.`, "He wept... and went on."]
  )
})

test("text stats count words and syllables", () => {
  const s = textStats("The cat sat. It was not unhappy.")
  expect(s.words).toBe(7)
  expect(s.sentences).toBe(2)
  expect(s.syllables).toBeGreaterThanOrEqual(8)
})
