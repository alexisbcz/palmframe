import { describe, expect, test } from "bun:test"

import { lintArticle } from "@/lib/deepdive/lint.server"

import { DESKS, deskProblems, deskRules, deskSystem } from "./desks.server"
import { newsroomDesk } from "./run.server"
import { nextRun, timeLabel } from "./schedule"
import { readOptions, styleAddendum } from "./styles"
import { TEMPLATE_IDS } from "./templates"

const at = (iso: string) => new Date(iso)

describe("beat schedules", () => {
  test("daily, in the beat's zone", () => {
    const s = {
      cadence: "daily" as const,
      weekday: 1,
      minuteOfDay: 7 * 60,
      timezone: "Europe/Paris",
    }
    // 5 Nov 2026 is a Thursday; Paris is UTC+1 in November.
    expect(nextRun(s, at("2026-11-05T05:00:00Z")).toISOString()).toBe(
      "2026-11-05T06:00:00.000Z"
    )
    expect(nextRun(s, at("2026-11-05T06:00:00Z")).toISOString()).toBe(
      "2026-11-06T06:00:00.000Z"
    )
  })

  test("weekdays skip the weekend", () => {
    const s = {
      cadence: "weekdays" as const,
      weekday: 1,
      minuteOfDay: 9 * 60,
      timezone: "UTC",
    }
    // Friday 6 Nov after 09:00 -> Monday 9 Nov.
    expect(nextRun(s, at("2026-11-06T10:00:00Z")).toISOString()).toBe(
      "2026-11-09T09:00:00.000Z"
    )
  })

  test("weekly on its day", () => {
    const s = {
      cadence: "weekly" as const,
      weekday: 1,
      minuteOfDay: 8 * 60 + 30,
      timezone: "America/New_York",
    }
    // Monday 9 Nov 08:30 in New York is 13:30 UTC (EST).
    expect(nextRun(s, at("2026-11-05T00:00:00Z")).toISOString()).toBe(
      "2026-11-09T13:30:00.000Z"
    )
  })

  test("across a daylight-saving change", () => {
    const s = {
      cadence: "daily" as const,
      weekday: 0,
      minuteOfDay: 7 * 60,
      timezone: "Europe/Paris",
    }
    // Clocks went back on 25 Oct 2026: 07:00 Paris is 05:00 UTC before, 06:00 after.
    expect(nextRun(s, at("2026-10-24T12:00:00Z")).toISOString()).toBe(
      "2026-10-25T06:00:00.000Z"
    )
    expect(nextRun(s, at("2026-10-23T12:00:00Z")).toISOString()).toBe(
      "2026-10-24T05:00:00.000Z"
    )
  })

  test("a bad zone falls back to UTC", () => {
    const s = {
      cadence: "daily" as const,
      weekday: 0,
      minuteOfDay: 60,
      timezone: "Mars/Olympus",
    }
    expect(nextRun(s, at("2026-11-05T00:30:00Z")).toISOString()).toBe(
      "2026-11-05T01:00:00.000Z"
    )
  })

  test("labels", () => {
    expect(timeLabel(425)).toBe("07:05")
  })
})

describe("voices and languages", () => {
  test("options default safely", () => {
    expect(readOptions(null)).toEqual({ voice: "house", language: "en" })
    expect(readOptions({ voice: "nope" })).toEqual({
      voice: "house",
      language: "en",
    })
    expect(readOptions({ voice: "witty", language: "fr" })).toEqual({
      voice: "witty",
      language: "fr",
    })
  })

  test("they reach the brief", () => {
    expect(styleAddendum({ voice: "house", language: "en" })).toBe("")
    const brief = deskSystem("wire", { voice: "plain", language: "de" })
    expect(brief).toContain("Plain language")
    expect(brief).toContain("Deutsch")
  })

  test("non-English stories skip English word lists", () => {
    const fr = deskRules("profile", "fr")
    expect(fr["AITells.yml"]).toContain("qqzzxxnevermatches")
    expect(fr["Hagiography.yml"]).toContain("qqzzxxnevermatches")
    expect(deskRules("profile", "en")["Hagiography.yml"]).not.toContain("qqzz")
  })

  test("Japanese is measured in characters", () => {
    const desk = newsroomDesk("wire", { language: "ja" })!
    expect(
      desk.rules
        .shape("東京：" + "あ".repeat(100))
        .some((p) => p.includes("characters"))
    ).toBe(true)
  })
})

describe("new templates", () => {
  test("roundup needs items", () => {
    expect(
      deskProblems("roundup", "Intro\n\n### A\n\nx\n\n### B\n\nx")
    ).toHaveLength(1)
    expect(deskProblems("roundup", "### A\n### B\n### C\n### D")).toEqual([])
  })

  test("lists are numbered", () => {
    expect(
      deskProblems("listicle", "## 1. A\n## 2. B\n## 3. C\n## 4. D")
    ).toEqual([])
    expect(deskProblems("listicle", "## A\n## B")).toHaveLength(1)
  })

  test("non-English explainers and datelines", () => {
    expect(
      deskProblems(
        "explainer",
        "**En bref :** x\n\n## Quoi ?\n\n## Pourquoi ?\n\n## Et après ?",
        "fr"
      )
    ).toEqual([])
    expect(deskProblems("wire", "MÜNCHEN: Die Stadt...", "de")).toEqual([])
  })

  for (const id of TEMPLATE_IDS)
    for (const language of ["en", "fr"])
      test(`${id} rules lint in ${language}`, async () => {
        const findings = await lintArticle(
          "Some text that is here to be linted.\n",
          deskRules(id, language)
        )
        expect(findings.some((f) => f.rule === "ValeSkipped")).toBe(false)
        expect(DESKS[id]).toBeDefined()
      })
})
