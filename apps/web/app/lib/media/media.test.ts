import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { lintArticle } from "@/lib/deepdive/lint.server"
import { leadSchema } from "@/lib/deepdive/model"
import { machineConfig } from "@/lib/machines/model"

import { availableFormats, formatDefinition } from "./formats"
import { parseInline, parseMarkdown, safeHref } from "./markdown"
import type { FormatDefinition, Rendition, Story } from "./model"
import {
  MAX_ATTEMPTS,
  adaptPrompt,
  asArticle,
  machineHold,
  parseDraft,
  renditionMarkdown,
  sharedProblems,
  storyOf,
} from "./render"
import { type RenderDeps, renderAttempt } from "./render.server"

const story: Story = storyOf({
  id: "s1",
  lead: "https://example.com/post",
  title: "The $40 widget",
  dek: "A small shop sold 1,200 of them.",
  body: "The shop sold 1,200 widgets at $40.",
  facts: [
    {
      claim: "It sold 1,200 widgets",
      url: "https://example.com/a",
      quote: "we shipped 1,200 widgets last year",
    },
  ],
  sources: [
    {
      url: "https://example.com/a",
      title: "Interview",
      text: 'She said "we shipped 1,200 widgets last year" on a podcast.',
    },
  ],
})

const clean: Rendition = {
  format: "linkedin",
  title: "A $40 widget",
  parts: [{ text: "The shop sold 1,200 widgets." }],
  meta: {},
}

const def: FormatDefinition = {
  id: "linkedin",
  brief: "Short post.",
  check: (r) => ({
    findings: [],
    problems: r.title.length > 40 ? ["Title is too long."] : [],
  }),
}

const deps = (over: Partial<RenderDeps> = {}): RenderDeps => ({
  write: async () => clean,
  check: async () => [],
  lint: async () => [],
  ...over,
})

const signal = new AbortController().signal

describe("the format registry", () => {
  test("tolerates formats that aren't there", () => {
    assert.equal(Array.isArray(availableFormats()), true)
    for (const id of availableFormats())
      assert.equal(formatDefinition(id)?.id, id)
  })
})

describe("the lead", () => {
  test("takes an https link or a topic", () => {
    assert.equal(leadSchema.safeParse("https://x.com/a/status/1").success, true)
    assert.equal(leadSchema.safeParse("why ramen shops fail").success, true)
  })
  test("refuses other links and scraps", () => {
    assert.equal(leadSchema.safeParse("http://x.com/a").success, false)
    assert.equal(leadSchema.safeParse("javascript:alert(1)").success, false)
    assert.equal(leadSchema.safeParse("ab").success, false)
  })
})

describe("sharedProblems", () => {
  test("passes what the story says", () => {
    assert.deepEqual(sharedProblems(clean, story), [])
  })
  test("catches a number the story doesn't have", () => {
    const r = { ...clean, parts: [{ text: "It sold 9,000 widgets." }] }
    assert.ok(sharedProblems(r, story).join().includes("9000"))
  })
  test("catches numbers hidden in a chart", () => {
    const r: Rendition = {
      ...clean,
      parts: [
        {
          text: "Sales.",
          asset: {
            kind: "figure",
            chart: "bar",
            title: "Sales",
            series: [{ label: "2025", value: 7777 }],
            sourceUrl: "https://example.com/a",
          },
        },
      ],
    }
    assert.ok(sharedProblems(r, story).join().includes("7777"))
  })
  test("catches an invented quotation", () => {
    const r = {
      ...clean,
      parts: [{ text: 'She said "we will never ever sell this company".' }],
    }
    assert.ok(sharedProblems(r, story).join().includes("quotation"))
  })
  test("accepts a real quotation", () => {
    const r = {
      ...clean,
      parts: [{ text: 'She said "we shipped 1,200 widgets last year".' }],
    }
    assert.deepEqual(sharedProblems(r, story), [])
  })
  test("catches a figure citing an unknown source", () => {
    const r: Rendition = {
      ...clean,
      parts: [
        {
          text: "Map.",
          asset: {
            kind: "map",
            title: "Shops",
            places: [{ name: "Lyon", lat: 45, lng: 4 }],
            sourceUrl: "https://evil.example/x",
          },
        },
      ],
    }
    assert.ok(sharedProblems(r, story).join().includes("evil.example"))
  })
  test("catches an empty rendition", () => {
    assert.equal(
      sharedProblems({ ...clean, title: " ", parts: [] }, story).length,
      2
    )
  })
})

describe("parseDraft", () => {
  test("turns the wire shape into a Rendition", () => {
    const r = parseDraft(
      "x_thread",
      JSON.stringify({
        title: "T",
        parts: [{ text: "One" }],
        meta: [{ key: "hashtags", value: "#a" }],
      })
    )
    assert.deepEqual(r, {
      format: "x_thread",
      title: "T",
      parts: [{ text: "One" }],
      meta: { hashtags: "#a" },
    })
  })
  test("refuses a malformed draft", () => {
    assert.throws(() =>
      parseDraft(
        "blog",
        JSON.stringify({ title: "T", parts: [{ text: 1 }], meta: [] })
      )
    )
  })
})

describe("what the prompt and the checker see", () => {
  test("a retry carries the last draft and its problems", () => {
    const p = adaptPrompt(story, def, { draft: clean, problems: ["Too long."] })
    assert.ok(p.includes("A $40 widget"))
    assert.ok(p.includes("- Too long."))
  })
  test("the fact-checker reads chart data and voiceover", () => {
    const a = asArticle({
      ...clean,
      parts: [
        {
          text: "Hi",
          voiceover: "Spoken line",
          asset: {
            kind: "figure",
            chart: "stat",
            title: "Sold",
            unit: " units",
            series: [{ label: "2025", value: 1200 }],
            sourceUrl: "https://example.com/a",
          },
        },
      ],
    })
    assert.ok(a.body.includes("Spoken line"))
    assert.ok(a.body.includes("2025: 1200 units"))
  })
  test("Markdown keeps the voiceover", () => {
    const md = renditionMarkdown({
      ...clean,
      parts: [{ text: "Scene", voiceover: "Line" }],
    })
    assert.equal(md, "# A $40 widget\n\nScene\n\n> Line")
  })
})

describe("renderAttempt", () => {
  test("a clean draft reaches the fact-checker and passes", async () => {
    let checked = 0
    const r = await renderAttempt(
      story,
      def,
      undefined,
      false,
      signal,
      deps({
        check: async () => {
          checked++
          return []
        },
      })
    )
    assert.equal(checked, 1)
    assert.deepEqual(r.problems, [])
  })
  test("a rejected draft skips the fact-checker, until the last try", async () => {
    let checked = 0
    const d = deps({
      write: async () => ({ ...clean, title: "x".repeat(50) }),
      check: async () => {
        checked++
        return [{ claim: "A", why: "wrong" }]
      },
    })
    const early = await renderAttempt(story, def, undefined, false, signal, d)
    assert.equal(checked, 0)
    assert.deepEqual(early.problems, ["Title is too long."])
    const last = await renderAttempt(story, def, undefined, true, signal, d)
    assert.equal(checked, 1)
    assert.deepEqual(last.problems, ["Title is too long.", "A: wrong"])
  })
  test("the format's Vale rules reach the linter, and errors block", async () => {
    let rules: unknown
    const r = await renderAttempt(
      story,
      { ...def, valeRules: { "X.yml": "rule" } },
      undefined,
      false,
      signal,
      deps({
        lint: async (_md, given) => {
          rules = given
          return [
            { line: 1, rule: "AITells", level: "error", message: "Cut it." },
            { line: 2, rule: "Passive", level: "warning", message: "Soft." },
          ]
        },
      })
    )
    assert.deepEqual(rules, { "X.yml": "rule" })
    assert.deepEqual(r.problems, ["Line 1, AITells: Cut it."])
    assert.equal(r.findings.length, 2)
  })
  test("retries are capped at two", () => {
    assert.equal(MAX_ATTEMPTS, 3)
  })
})

describe("the real linter", () => {
  test("applies a format's rules on top of the shared style", async () => {
    const rule = `extends: existence\nmessage: "No '%s' here."\nlevel: error\ntokens:\n  - widget\n`
    const shared = await lintArticle("We leverage a widget.\n")
    assert.ok(shared.some((f) => f.rule === "Corporate"))
    assert.ok(!shared.some((f) => f.rule === "Widget"))
    const both = await lintArticle("We leverage a widget.\n", {
      "Widget.yml": rule,
    })
    assert.ok(both.some((f) => f.rule === "Corporate"))
    assert.ok(both.some((f) => f.rule === "Widget"))
  })
})

describe("machine gate", () => {
  const ok = {
    status: "done" as const,
    problems: [],
    gate: null,
    length: 100,
    limit: 3000,
    today: 0,
    dailyCap: 5,
  }
  test("a checked post within limits may go", () => {
    assert.equal(machineHold(ok), null)
  })
  test("anything else waits for a person", () => {
    assert.equal(
      machineHold({ ...ok, status: "review", problems: ["Bad."] }),
      "Bad."
    )
    assert.equal(machineHold({ ...ok, gate: "No sources." }), "No sources.")
    assert.notEqual(machineHold({ ...ok, length: 4000 }), null)
    assert.notEqual(machineHold({ ...ok, today: 5 }), null)
  })
  test("old machines parse with Stories off", () => {
    const c = machineConfig.parse({
      threshold: 3,
      windowMinutes: 10,
      cooldownMinutes: 60,
      dailyCap: 5,
    })
    assert.deepEqual(c.media, { enabled: false, formats: [], storiesPerDay: 1 })
  })
})

describe("the Markdown renderer", () => {
  test("drops links that aren't https", () => {
    assert.equal(safeHref("javascript:alert(1)"), null)
    assert.equal(parseInline("[x](javascript:alert(1))")[0]?.kind, "text")
    assert.deepEqual(parseInline("[x](https://a.co)")[0], {
      kind: "link",
      text: "x",
      href: "https://a.co",
    })
  })
  test("reads headings, lists, quotes and emphasis", () => {
    const b = parseMarkdown("## Hi\n\n- a\n- b\n\n> q\n\nSome **bold** text")
    assert.deepEqual(
      b.map((x) => x.kind),
      ["heading", "list", "quote", "paragraph"]
    )
    if (b[3]?.kind === "paragraph")
      assert.deepEqual(b[3].text[1], { kind: "strong", text: "bold" })
  })
})
