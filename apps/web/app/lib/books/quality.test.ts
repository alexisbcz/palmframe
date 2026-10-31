import { describe, expect, test } from "bun:test"

import {
  checkGlossary,
  countTerm,
  exportCsv,
  exportTbx,
  findCandidates,
  importCsv,
  importTbx,
  parseCsv,
  termsFor,
} from "./glossary"
import { chapterScore, checkSegment, sampleForBackCheck } from "./qa"
import { signature } from "./webhooks.server"

const term = (source: string, target: string, dnt = false, cs = false) => ({
  source,
  target,
  dnt,
  case_sensitive: cs,
})

describe("glossary enforcement", () => {
  test("every occurrence is counted, on word boundaries", () => {
    expect(countTerm("cat", "The cat and the Cat, not category.", "en")).toBe(2)
    expect(countTerm("cat", "The cat and the Cat.", "en", true)).toBe(1)
    expect(countTerm("New York", "New  York, New York", "en")).toBe(2)
    expect(countTerm("été", "L'été, un étéé.", "fr")).toBe(1)
  })

  test("CJK has no word boundaries to wait for", () => {
    expect(countTerm("東京", "私は東京駅に行く", "ja")).toBe(1)
  })

  test("a missing or different rendering is a break", () => {
    const terms = [term("harbour", "port")]
    expect(
      checkGlossary("The harbour.", "Le port.", terms, "en", "fr")
    ).toEqual([])
    expect(
      checkGlossary("The harbour.", "La rade.", terms, "en", "fr")[0]
    ).toMatchObject({ term: "harbour", expected: "port", found: 0 })
  })

  test("do-not-translate terms must survive exactly, every time", () => {
    const terms = [term("Palmframe", "", true)]
    expect(
      checkGlossary(
        "Palmframe and Palmframe",
        "Palmframe et Palmframe",
        terms,
        "en",
        "fr"
      )
    ).toEqual([])
    expect(
      checkGlossary(
        "Palmframe and Palmframe",
        "Palmframe et elle",
        terms,
        "en",
        "fr"
      )
    ).toHaveLength(1)
    expect(
      checkGlossary("Palmframe", "palmframe", terms, "en", "fr")
    ).toHaveLength(1)
  })

  test("inflected forms pass, unrelated words don't", () => {
    const terms = [term("wand", "Zauberstab")]
    expect(
      checkGlossary("The wand.", "Des Zauberstabs.", terms, "en", "de")
    ).toEqual([])
    expect(
      checkGlossary("The wand.", "Der Stock.", terms, "en", "de")
    ).toHaveLength(1)
  })

  test("the longest term wins an overlap", () => {
    const terms = [
      term("New York", "Nueva York"),
      term("New York Times", "NYT"),
    ]
    expect(
      checkGlossary("The New York Times.", "El NYT.", terms, "en", "es")
    ).toEqual([])
  })

  test("tags don't hide a term", () => {
    const terms = [term("harbour", "port")]
    expect(
      checkGlossary(
        "The <g1>harbour</g1>.",
        "Le <g1>port</g1>.",
        terms,
        "en",
        "fr"
      )
    ).toEqual([])
  })

  test("a chunk only gets the terms it uses", () => {
    const terms = [term("harbour", "port"), term("unicorn", "licorne")]
    expect(
      termsFor(terms, ["The harbour."], "en").map((t) => t.source)
    ).toEqual(["harbour"])
  })

  test("candidates are repeated mid-sentence capitals", () => {
    const found = findCandidates([
      "She met Grace Hopper at the mill.",
      "Later she saw Grace Hopper again, and the River was high.",
      "Then they walked on.",
    ])
    expect(found.map((c) => c.source)).toEqual(["Grace Hopper"])
    expect(found[0]!.count).toBe(2)
  })
})

describe("glossary files", () => {
  const terms = [
    {
      source: 'Quote "here"',
      target: "Guillemet, virgule",
      kind: "term" as const,
      dnt: false,
      note: "Line one\nLine two",
      case_sensitive: false,
    },
    {
      source: "Palmframe",
      target: "",
      kind: "name" as const,
      dnt: true,
      note: "",
      case_sensitive: true,
    },
  ]

  test("CSV round trips quotes, commas and line breaks", () => {
    expect(importCsv(exportCsv(terms))).toEqual(terms)
  })

  test("CSV tolerates a BOM, semicolons and no header", () => {
    expect(parseCsv("﻿a;b\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
    expect(importCsv("chat,cat\nchien,dog\n").map((t) => t.target)).toEqual([
      "cat",
      "dog",
    ])
  })

  test("a formula in a term can't run in a spreadsheet", () => {
    const csv = exportCsv([{ ...terms[0]!, source: "=HYPERLINK(1)" }])
    expect(csv).toContain("'=HYPERLINK(1)")
  })

  test("TBX round trips", () => {
    const back = importTbx(exportTbx(terms, "en", "fr"), "en", "fr")
    expect(back[0]).toMatchObject({
      source: terms[0]!.source,
      target: terms[0]!.target,
      kind: "term",
    })
    expect(back[1]).toMatchObject({ source: "Palmframe", dnt: true })
  })

  test("TBX with an external entity is refused", () => {
    expect(() =>
      importTbx(
        `<!DOCTYPE martif [<!ENTITY x SYSTEM "file:///etc/passwd">]><martif/>`,
        "en",
        "fr"
      )
    ).toThrow()
  })
})

describe("quality checks", () => {
  const base = {
    source: "He paid 1,024 pounds for it in 1843 at the mill.",
    target: "Il a payé 1 024 livres pour cela en 1843 au moulin.",
    status: "machine",
    translatable: true,
  }
  const kinds = (s: Partial<typeof base>, terms = [] as never[]) =>
    checkSegment({ ...base, ...s }, terms, "en", "fr").map((i) => i.kind)

  test("a good line is clean, whatever the digit grouping", () => {
    expect(kinds({})).toEqual([])
    expect(
      kinds({ target: "Il a payé 1.024 livres en 1843 au moulin voisin." })
    ).toEqual([])
  })

  test("finds a missing line", () => {
    expect(kinds({ target: "" })).toEqual(["missing"])
    expect(kinds({ target: null as never })).toEqual(["missing"])
  })

  test("finds untranslated text", () => {
    expect(kinds({ target: base.source })).toContain("untranslated")
  })

  test("finds changed numbers", () => {
    const issues = checkSegment(
      { ...base, target: "Il a payé 1 042 livres en 1843 au moulin voisin." },
      [],
      "en",
      "fr"
    )
    expect(issues[0]).toMatchObject({
      kind: "numbers",
      detail: { missing: "1024", added: "1042" },
    })
  })

  test("reads digits in other scripts", () => {
    const issues = checkSegment(
      { ...base, source: "In 1843.", target: "في ١٨٤٣." },
      [],
      "en",
      "ar"
    )
    expect(issues.filter((i) => i.kind === "numbers")).toEqual([])
  })

  test("finds a lost name", () => {
    expect(
      kinds({
        source: "Later she met Grace at the mill by the river.",
        target: "Plus tard, elle a rencontré une amie au moulin.",
      })
    ).toContain("names")
  })

  test("title case in a heading isn't a lost name", () => {
    const heading = {
      ...base,
      kind: "heading" as const,
      source: "The Analytical Engine Of Great Size",
      target: "La machine analytique de grande taille",
    }
    expect(
      checkSegment(heading, [], "en", "fr").map((i) => i.kind)
    ).not.toContain("names")
  })

  test("finds glossary breaks", () => {
    const issues = checkSegment(
      { ...base, source: "The harbour.", target: "La rade." },
      [
        {
          source: "harbour",
          target: "port",
          dnt: false,
          case_sensitive: false,
        },
      ],
      "en",
      "fr"
    )
    expect(issues.map((i) => i.kind)).toContain("glossary")
  })

  test("finds lost formatting", () => {
    expect(
      kinds({ source: "A <g1>word</g1> here.", target: "Un mot ici." })
    ).toContain("formatting")
  })

  test("finds a length anomaly, allowing for the language", () => {
    const long = "word ".repeat(40).trim()
    expect(kinds({ source: long, target: "Court." })).toContain("length")
    const ja = checkSegment(
      {
        ...base,
        source:
          "The river ran on through the valley, quiet and slow, as it always had.",
        target: "川は谷を静かにゆっくりと流れ続けていた。",
      },
      [],
      "en",
      "ja"
    )
    expect(ja.map((i) => i.kind)).not.toContain("length")
  })

  test("skips what has nothing to translate", () => {
    expect(
      checkSegment(
        { ...base, status: "fixed", translatable: false, target: null },
        [],
        "en",
        "fr"
      )
    ).toEqual([])
  })

  test("scores weigh errors over warnings, per line", () => {
    expect(chapterScore(10, [])).toBe(100)
    expect(chapterScore(10, [{ severity: "error" }])).toBe(70)
    expect(chapterScore(10, [{ severity: "warning" }])).toBe(90)
    expect(chapterScore(100, [{ severity: "error" }])).toBe(97)
    expect(chapterScore(0, [])).toBe(100)
    expect(chapterScore(1, Array(9).fill({ severity: "error" }))).toBe(0)
  })

  test("back-check samples evenly and repeatably", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }))
    const sample = sampleForBackCheck(rows)
    expect(sample.length).toBe(12)
    expect(sampleForBackCheck(rows)).toEqual(sample)
    expect(Number(sample.at(-1)!.id)).toBeGreaterThan(900)
    expect(sampleForBackCheck(rows.slice(0, 2)).length).toBe(2)
    expect(sampleForBackCheck([])).toEqual([])
  })
})

test("webhook signatures cover the timestamp and the body", () => {
  const a = signature("secret", 1000, '{"a":1}')
  expect(a).toMatch(/^t=1000,v1=[0-9a-f]{64}$/)
  expect(signature("secret", 1001, '{"a":1}')).not.toBe(a)
  expect(signature("secret", 1000, '{"a":2}')).not.toBe(a)
  expect(signature("other", 1000, '{"a":1}')).not.toBe(a)
})
