import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

// The Export panel takes its facts from two sides: `series` feeds translation,
// and `details` and `running` feed the CBZ metadata and the export guard. The
// branches that added them met at the same lines, so a merge taking one side
// drops the other. The difference only shows once a language is picked or a
// CBZ is written, so the wiring is pinned here.
const source = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")

const propsOf = (code: string, tag: string) => {
  const open = code.match(new RegExp(`<${tag}\\b([\\s\\S]*?)/>`))?.[1]
  if (open === undefined) throw new Error(`no <${tag}> found`)
  return [...open.matchAll(/(?:^|\s)(\w+)=\{/g)].map((m) => m[1])
}

describe("export panel wiring", () => {
  const panel = source("export-panel.tsx")

  test("the editor hands the button series and details", () => {
    const props = propsOf(source("editor.tsx"), "ExportButton")
    expect(props).toContain("series")
    expect(props).toContain("details")
  })

  test("the button hands the panel series, details and running", () => {
    const props = propsOf(panel, "ExportPanel")
    expect(props).toEqual(
      expect.arrayContaining(["series", "details", "running"])
    )
  })

  test("the panel hands translation the series", () => {
    expect(propsOf(panel, "LetteringSection")).toContain("series")
  })

  test("the panel still uses details and the guard", () => {
    expect(panel).toContain("buildComicInfo(details,")
    expect(panel).toMatch(/if \(running\.current \|\| !pages\.length\) return/)
  })
})
