import { describe, expect, test } from "bun:test"

import { checkArticle, isSocial } from "@/lib/deepdive/check"
import { lintArticle } from "@/lib/deepdive/lint.server"

import { DESKS, deskProblems, deskSystem } from "./desks.server"
import { SAMPLES } from "./samples"
import { TEMPLATE_IDS, TEMPLATES, templateById } from "./templates"

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ")

describe("templates", () => {
  test("six, each with a desk", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS])
    expect(TEMPLATES).toHaveLength(6)
    for (const t of TEMPLATES) {
      expect(DESKS[t.id]).toBeDefined()
      expect(t.limits.minWords).toBeLessThan(t.limits.maxWords)
      expect(deskSystem(t.id)).toContain(new Date().toISOString().slice(0, 10))
    }
  })

  test("unknown ids have no template", () => {
    expect(templateById("nope")).toBeNull()
    expect(templateById(null)).toBeNull()
  })
})

describe("shape checks", () => {
  test("wire needs a dateline and no subheads", () => {
    expect(deskProblems("wire", "BRUSSELS: The EU said.")).toEqual([])
    expect(deskProblems("wire", "The EU said.")).toHaveLength(1)
    expect(
      deskProblems("wire", "PARIS: Something.\n\n## More\n\nText")
    ).toContain("Wire briefs have no subheads.")
  })

  test("explainer opens with the short version and asks questions", () => {
    const good =
      "**The short version:** It's this.\n\n## What happened?\n\nA.\n\n## Why?\n\nB.\n\n## What next?\n\nC."
    expect(deskProblems("explainer", good)).toEqual([])
    expect(deskProblems("explainer", "Plain start.")).toHaveLength(2)
  })

  test("pulse lists the posts", () => {
    expect(deskProblems("pulse", "- a\n- b\n- c")).toEqual([])
    expect(deskProblems("pulse", "No list")).toHaveLength(1)
  })
})

describe("limits", () => {
  const facts = (urls: string[]) =>
    urls.map((url) => ({ claim: "c", url, quote: "" }))

  test("a template's word range applies", () => {
    const wire = templateById("wire")!.limits
    const article = { title: "T", dek: "D", body: words(600) }
    const problems = checkArticle(article, [], [], [], wire)
    expect(problems.some((p) => p.includes("cut to 550"))).toBe(true)
  })

  test("pulse counts distinct social posts", () => {
    const pulse = templateById("pulse")!.limits
    const article = { title: "T", dek: "D", body: words(500) }
    const two = facts([
      "https://www.reddit.com/r/a/1",
      "https://www.tiktok.com/@a/video/1",
      "https://news.example.com/a",
    ])
    expect(
      checkArticle(article, two, [], [], pulse).some((p) =>
        p.includes("social posts")
      )
    ).toBe(true)
    expect(isSocial("https://x.com/a/status/1")).toBe(true)
    expect(isSocial("https://example.com")).toBe(false)
  })
})

describe("vale", () => {
  // Every desk's rules compile and run on the bundled vale.ts.
  for (const id of TEMPLATE_IDS)
    test(`${id} rules lint`, async () => {
      const findings = await lintArticle(
        "We delve into a stunning, visionary story that went viral — really.\n",
        DESKS[id].rules
      )
      expect(findings.some((f) => f.rule === "ValeSkipped")).toBe(false)
      expect(findings.some((f) => f.rule === "AITells")).toBe(true)
    })

  test("desk rules fire", async () => {
    const wire = await lintArticle(
      "Officials said the plan was shocking.\n",
      DESKS.wire.rules
    )
    expect(wire.some((f) => f.rule === "Loaded")).toBe(true)
    const profile = await lintArticle(
      "She is a visionary founder.\n",
      DESKS.profile.rules
    )
    expect(profile.some((f) => f.rule === "Hagiography")).toBe(true)
  })
})

describe("samples", () => {
  test("one per template, complete", () => {
    if (!SAMPLES.length) return
    expect(new Set(SAMPLES.map((s) => s.template)).size).toBe(SAMPLES.length)
    for (const s of SAMPLES) {
      expect(templateById(s.template)).not.toBeNull()
      expect(s.title && s.body && s.slug).toBeTruthy()
      expect(s.facts.length).toBeGreaterThan(0)
    }
  })
})

describe("fact-check evidence", () => {
  test("cited pages come first", async () => {
    const { evidenceOrder } = await import("@/lib/deepdive/factcheck.server")
    const src = (url: string) => ({ url, title: url, text: "" })
    const order = evidenceOrder(
      [src("https://a"), src("https://b"), src("https://c")],
      [{ claim: "x", url: "https://c", quote: "" }]
    ).map((s) => s.url)
    expect(order).toEqual(["https://c", "https://a", "https://b"])
  })
})
