import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Finding } from "./model"
import { VALE_INI, VALE_RULES } from "./vale/rules"

interface Linter {
  lintString(
    text: string,
    options: { path: string }
  ): {
    sortedAlerts(): {
      line: number
      check: string
      severity: string
      message: string
    }[]
  }[]
}

const cached = new Map<string, Promise<Linter>>()

// vale-ts isn't on npm yet: packages/vale-ts is a bundle of it, and
// VALE_TS_ENTRY can point at another build. Where it can't be loaded, the style
// rules are skipped and the run says so.
async function loadVale() {
  const entry = process.env.VALE_TS_ENTRY?.trim()
  try {
    const module = entry
      ? await import(/* @vite-ignore */ entry)
      : await import("vale-ts")
    return module.Vale as { fromString(ini: string): Promise<Linter> }
  } catch (e) {
    console.error("Vale didn't load", e)
    return null
  }
}

// A format's rules sit on top of the shared style; the same file name replaces
// a shared rule.
function vale(
  Vale: { fromString(ini: string): Promise<Linter> },
  extra: Record<string, string>
) {
  const key = JSON.stringify(extra)
  let linter = cached.get(key)
  if (!linter) {
    const styles = mkdtempSync(join(tmpdir(), "deepdive-vale-"))
    mkdirSync(join(styles, "Hustle"))
    for (const [file, rule] of Object.entries({ ...VALE_RULES, ...extra }))
      writeFileSync(join(styles, "Hustle", file), rule)
    linter = Vale.fromString(VALE_INI(styles))
    cached.set(key, linter)
  }
  return linter
}

export async function lintArticle(
  markdown: string,
  rules: Record<string, string> = {}
): Promise<Finding[]> {
  const Vale = await loadVale()
  if (!Vale)
    return [
      {
        line: 1,
        rule: "ValeSkipped",
        level: "warning",
        message:
          "Vale isn't installed on this server, so style rules were skipped.",
      },
    ]
  let files: ReturnType<Linter["lintString"]>
  try {
    files = (await vale(Vale, rules)).lintString(markdown, {
      path: "article.md",
    })
  } catch (e) {
    console.error("Vale failed", e)
    return [
      {
        line: 1,
        rule: "ValeSkipped",
        level: "warning",
        message: "Vale failed on this draft, so style rules were skipped.",
      },
    ]
  }
  return files.flatMap((file) =>
    file.sortedAlerts().map((a) => ({
      line: a.line,
      rule: a.check.replace(/^Hustle\./, ""),
      level: a.severity === "error" ? ("error" as const) : ("warning" as const),
      message: a.message,
    }))
  )
}
