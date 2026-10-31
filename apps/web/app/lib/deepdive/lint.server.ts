import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Vale } from "vale-ts"

import type { Finding } from "./model"
import { VALE_INI, VALE_RULES } from "./vale/rules"

const cached = new Map<string, Promise<Vale>>()

// A format's rules sit on top of the shared style; the same file name replaces
// a shared rule.
function vale(extra: Record<string, string>) {
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
  const files = (await vale(rules)).lintString(markdown, { path: "article.md" })
  return files.flatMap((file) =>
    file.sortedAlerts().map((a) => ({
      line: a.line,
      rule: a.check.replace(/^Hustle\./, ""),
      level: a.severity === "error" ? ("error" as const) : ("warning" as const),
      message: a.message,
    }))
  )
}
