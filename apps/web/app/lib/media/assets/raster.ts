import { brotliDecompressSync } from "node:zlib"

import { initWasm, Resvg } from "@resvg/resvg-wasm"

import { fontGroupsFor } from "./text"

const unpack = (packed: string) =>
  brotliDecompressSync(Buffer.from(packed, "base64"))

function faces(blob: Buffer) {
  const out: Uint8Array[] = []
  for (let at = 0; at < blob.length;) {
    const size = blob.readUInt32BE(at)
    out.push(new Uint8Array(blob.subarray(at + 4, at + 4 + size)))
    at += 4 + size
  }
  return out
}

// resvg parses every font it is given on every render, and the CJK faces are
// the bulk of them, so they stay out of memory unless a chart needs them.
const loaders = {
  core: () => import("./data/fonts-core.gen"),
  world: () => import("./data/fonts-world.gen"),
  cjk: () => import("./data/fonts-cjk.gen"),
}
const loaded = new Map<string, Promise<Uint8Array[]>>()
const fontGroup = (group: keyof typeof loaders) => {
  let fonts = loaded.get(group)
  if (!fonts) {
    fonts = loaders[group]().then((m) => faces(unpack(m.default)))
    loaded.set(group, fonts)
  }
  return fonts
}

let ready: Promise<void> | undefined
const wasm = () =>
  (ready ??= import("./data/resvg.gen").then((m) =>
    initWasm(unpack(m.default))
  ))

export async function svgToPng(svg: string) {
  await wasm()
  const groups = ["core" as const, ...fontGroupsFor(svg)]
  const fontBuffers = (await Promise.all(groups.map(fontGroup))).flat()
  const resvg = new Resvg(svg, {
    font: {
      fontBuffers,
      defaultFontFamily: "Palmframe Text",
      loadSystemFonts: false,
    },
  })
  const image = resvg.render()
  const png = image.asPng()
  image.free()
  resvg.free()
  return png
}
