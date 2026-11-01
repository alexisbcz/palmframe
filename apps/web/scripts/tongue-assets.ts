import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(import.meta.url)

// A bundler doesn't serve files out of node_modules, and Tongue fetches its two
// model files from a folder. Served from `/models/tongue/`.
export function copyTongueAssets(publicDir: string) {
  const to = join(publicDir, "models", "tongue")
  mkdirSync(to, { recursive: true })
  for (const file of ["tongue_int8.bin", "tongue_meta.json"])
    copyFileSync(
      require.resolve(`@desert-ant-labs/tongue/model/${file}`),
      join(to, file)
    )
}
