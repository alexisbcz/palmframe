// Bundles vale.ts (github.com/alexisbcz/vale.ts, not on npm yet) into one file,
// lib/index.js, that a serverless function can load with nothing beside it.
//
//   VALE_TS_SRC=~/Work/vale.ts bun packages/vale-ts/build.ts
//
// Three changes to the bundle, each checked so a vale.ts update can't skip it:
// - Its Tengo interpreter is required lazily, which a bundle can't follow, so
//   the entry imports it up front.
// - The Punkt sentence model is read from disk by path; it's inlined instead.
//   The part-of-speech model and the dictionaries stay out: only `tag`
//   sequences and spelling rules read them, and our styles use neither.
// - Tree-sitter grammars are only for linting code comments, and we lint
//   Markdown, so they're never loaded: linting a code file throws instead.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const src = process.env.VALE_TS_SRC
if (!src) throw new Error("Set VALE_TS_SRC to a vale.ts checkout.")
const here = import.meta.dir
const pkg = (p: string) => JSON.stringify(join(src, "packages", p))

const entry = join(here, ".entry.ts")
writeFileSync(
  entry,
  `export * from ${pkg("vale/src/index.ts")}
import * as tengo from ${pkg("tengo/src/index.ts")}
import punkt from ${pkg("models/data/punkt-english.json")} with { type: "text" }
;(globalThis as any).__valeTsTengo = tengo
;(globalThis as any).__valeTsPunkt = punkt
`
)
const result = await Bun.build({
  entrypoints: [entry],
  outdir: join(here, "lib"),
  naming: "index.js",
  target: "node",
  format: "esm",
  external: ["web-tree-sitter", "tree-sitter-wasms"],
})
rmSync(entry)
if (!result.success) throw new AggregateError(result.logs, "Build failed")

const patches: [RegExp, string][] = [
  [
    /const req = createRequire\d*\(import\.meta\.url\);\s*loaded = req\("@vale-ts\/tengo"\);/,
    "loaded = globalThis.__valeTsTengo;",
  ],
  [/readFileSync\d*\(PUNKT_MODEL_PATH, "utf8"\)/, "globalThis.__valeTsPunkt"],
  [/await initCode\(\);/, "/* code grammars skipped, see build.ts */"],
]
const file = join(here, "lib/index.js")
let out = readFileSync(file, "utf8")
for (const [from, to] of patches) {
  if (!from.test(out))
    throw new Error(`vale.ts changed: ${from} no longer matches.`)
  out = out.replace(from, to)
}
const commit = Bun.spawnSync(["git", "-C", src, "rev-parse", "--short", "HEAD"])
writeFileSync(
  file,
  `// Built from vale.ts ${commit.stdout.toString().trim()} by build.ts. Don't edit.\n${out}`
)
cpSync(join(src, "LICENSE"), join(here, "LICENSE"))
cpSync(
  join(src, "packages/models/data/LICENSE.sentences"),
  join(here, "LICENSE.punkt")
)
