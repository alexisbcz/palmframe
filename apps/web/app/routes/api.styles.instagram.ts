import {
  isInstagramImageUrl,
  parseInstagramSource,
} from "@/lib/comic-import/instagram"
import { MAX_STYLE_PAGE_BYTES } from "@/lib/comic-import/limits"
import type { StyleErrorCode } from "@/lib/comic-import/style"
import {
  SourceError,
  instagramAccountImages,
  instagramPostImages,
  scrapeCreatorsAvailable,
} from "@/lib/studio/scrapecreators.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.styles.instagram"

// Instagram as a source for a style, for signed-in people only.
// `?source=` lists the images of an account or of some posts; `?image=` hands
// one of them back, since Instagram's CDN won't let a canvas on another site
// read its pixels. Nothing is stored here: the browser downscales the picked
// images and uploads them like pages of a comic.
const error = (message: string, status: number, code: StyleErrorCode) =>
  Response.json({ error: message, code }, { status })

const IMAGE_TIMEOUT_MS = 20_000
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function loader({ request }: Route.LoaderArgs) {
  const { viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to use styles.", 401, "sign_in")
  const params = new URL(request.url).searchParams
  const image = params.get("image")
  if (image !== null) return proxy(image, request.signal)

  const source = parseInstagramSource(params.get("source") ?? "")
  if (!source)
    return error("That isn't an Instagram account or post.", 400, "invalid")
  if (!scrapeCreatorsAvailable())
    return error(
      "Instagram import is not set up: set SCRAPECREATORS_API_KEY on the server.",
      501,
      "instagram_not_set_up"
    )
  try {
    const listing =
      source.kind === "account"
        ? await instagramAccountImages(
            source.handle,
            params.get("after")?.slice(0, 200) || null,
            request.signal
          )
        : await instagramPostImages(source.urls, request.signal)
    if (!listing.images.length)
      return error("No images there.", 404, "instagram_empty")
    return Response.json(listing, {
      headers: { "cache-control": "private, max-age=600" },
    })
  } catch (e) {
    if (e instanceof SourceError)
      return e.code === "missing"
        ? error(e.message, 404, "instagram_missing")
        : e.code === "busy"
          ? error(e.message, 503, "instagram_busy")
          : error(e.message, 501, "instagram_not_set_up")
    return error(
      e instanceof Error ? e.message : String(e),
      request.signal.aborted ? 499 : 502,
      "instagram_busy"
    )
  }
}

async function proxy(url: string, signal: AbortSignal) {
  if (!isInstagramImageUrl(url))
    return error("Not an Instagram image.", 400, "invalid")
  let res: Response
  try {
    res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(IMAGE_TIMEOUT_MS), signal]),
    })
  } catch {
    return error("Instagram didn't answer.", 502, "instagram_busy")
  }
  // A signed CDN address expires after a while; listing again renews it.
  if (!res.ok) return error("That image expired.", 410, "instagram_missing")
  const type = res.headers.get("content-type")?.split(";")[0]?.trim() ?? ""
  if (!IMAGE_TYPES.includes(type))
    return error("Not an image.", 415, "page_not_jpeg")
  const length = Number(res.headers.get("content-length") ?? 0)
  if (length > MAX_STYLE_PAGE_BYTES)
    return error("That image is too large.", 413, "page_too_large")
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength > MAX_STYLE_PAGE_BYTES)
    return error("That image is too large.", 413, "page_too_large")
  return new Response(bytes, {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  })
}
