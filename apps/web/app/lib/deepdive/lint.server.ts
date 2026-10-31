import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Vale } from "vale-ts"

import type { Finding } from "./model"
import { VALE_INI, VALE_RULES } from "./vale/rules"

let cached: Promise<Vale> | null = null

function vale() {
  cached ??= (() => {
    const styles = mkdtempSync(join(tmpdir(), "deepdive-vale-"))
    mkdirSync(join(styles, "Hustle"))
    for (const [file, rule] of Object.entries(VALE_RULES))
      writeFileSync(join(styles, "Hustle", file), rule)
    return Vale.fromString(VALE_INI(styles))
  })()
  return cached
}

export async function lintArticle(markdown: string): Promise<Finding[]> {
  const files = (await vale()).lintString(markdown, { path: "article.md" })
  return files.flatMap((file) =>
    file.sortedAlerts().map((a) => ({
      line: a.line,
      rule: a.check.replace(/^Hustle\./, ""),
      level: a.severity === "error" ? ("error" as const) : ("warning" as const),
      message: a.message,
    }))
  )
}
