import { cpSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)

// The files pdf.js fetches at run time to decode what a PDF embeds. Served
// from `/pdfjs/`, matching `pdfAssetOptions` in the import client.
export const PDFJS_FOLDERS = ["wasm", "iccs", "standard_fonts", "cmaps"]

// XFA forms are switched off, so the JavaScript engine for them stays behind.
const skipped = (path: string) => /quickjs/.test(path)

export function copyPdfjsAssets(publicDir: string) {
  const from = dirname(require.resolve("pdfjs-dist/package.json"))
  const to = join(publicDir, "pdfjs")
  mkdirSync(to, { recursive: true })
  for (const folder of PDFJS_FOLDERS)
    cpSync(join(from, folder), join(to, folder), {
      recursive: true,
      filter: (source) => !skipped(source),
    })
  return to
}
