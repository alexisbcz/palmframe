import type { OpenRouterConnection } from "@/lib/openrouter.server"
import type { AssetSpec, RenderedAsset } from "@/lib/media/model"

import { altText } from "./alt"
import { figureSvg } from "./figures"
import { mapSvg } from "./map"
import { svgToPng } from "./raster"
import { ASSET_SIZES, type AssetSize } from "./theme"

export { altText } from "./alt"
export { ASSET_SIZES, type AssetSize } from "./theme"
export { validateAsset, type AssetCheck } from "./validate"

export async function renderToSvg(spec: AssetSpec, size: AssetSize) {
  if (spec.kind === "figure") return figureSvg(spec, size)
  if (spec.kind === "map") return mapSvg(spec, size)
  throw new Error("Illustrations come from an image model, not from code")
}

export async function renderToPng(spec: AssetSpec, size: AssetSize) {
  return svgToPng(await renderToSvg(spec, size))
}

export interface RenderOptions {
  // Needed for illustrations only.
  connection?: OpenRouterConnection | null
  abort?: AbortSignal
  // Replaced in tests.
  upload?: (path: string, png: Uint8Array) => Promise<string>
  draw?: (
    userId: string,
    draftKey: string,
    scene: string,
    connection: OpenRouterConnection | null,
    abort: AbortSignal
  ) => Promise<string>
}

async function upload(path: string, png: Uint8Array) {
  const [{ MACHINE_IMAGES_BUCKET }, { supabaseAdmin }] = await Promise.all([
    import("@/lib/database"),
    import("@/lib/supabase-admin.server"),
  ])
  const bucket = supabaseAdmin().storage.from(MACHINE_IMAGES_BUCKET)
  const { error } = await bucket.upload(path, png, {
    contentType: "image/png",
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return bucket.getPublicUrl(path).data.publicUrl
}

// The model paints at one fixed ratio. The picture is cropped to the format
// here, through the rasterizer, because platforms reject the wrong aspect.
async function illustrate(
  spec: Extract<AssetSpec, { kind: "illustration" }>,
  size: AssetSize,
  key: string,
  options: RenderOptions
) {
  const slash = key.indexOf("/")
  const draw =
    options.draw ?? (await import("@/lib/machines/image.server")).drawPost
  const source = await draw(
    key.slice(0, slash),
    `${key.slice(slash + 1)}-source`,
    spec.scene,
    options.connection ?? null,
    options.abort ?? new AbortController().signal
  )
  const res = await fetch(source, { signal: options.abort })
  if (!res.ok) throw new Error(`Illustration ${res.status}`)
  const type = res.headers.get("content-type")?.split(";")[0] ?? "image/png"
  const data = Buffer.from(await res.arrayBuffer()).toString("base64")
  const { width, height } = ASSET_SIZES[size]
  return svgToPng(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><image width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" xlink:href="data:${type};base64,${data}"/></svg>`
  )
}

// `key` is "<userId>/<name>", as in drawPost. Check a spec with validateAsset
// first: this draws whatever it is given.
export async function renderAsset(
  spec: AssetSpec,
  size: AssetSize,
  key: string,
  options: RenderOptions = {}
): Promise<RenderedAsset> {
  if (!/^[\w-]+(\/[\w-]+)+$/.test(key)) throw new Error(`Bad asset key: ${key}`)
  const png =
    spec.kind === "illustration"
      ? await illustrate(spec, size, key, options)
      : await renderToPng(spec, size)
  // One spec renders to several formats; the size keeps them from colliding.
  const url = await (options.upload ?? upload)(`${key}-${size}.png`, png)
  return { spec, url, ...ASSET_SIZES[size], alt: altText(spec) }
}
