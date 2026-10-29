import {
  ZernioError,
  publish,
  zernioEnabled,
  type PublishRequest,
} from "@/lib/zernio.server"

import type { Route } from "./+types/api.zernio.publish"

const MAX_FEED_SLIDES = 10
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const error = (message: string, status: number, code?: string) =>
  Response.json({ error: message, code }, { status })

function parse(raw: unknown): PublishRequest | null {
  const r = raw as Partial<PublishRequest> | null
  if (!r || typeof r.accountId !== "string" || !r.accountId) return null
  if (r.as !== "feed" && r.as !== "story") return null
  if (r.mode !== "now" && r.mode !== "schedule" && r.mode !== "draft")
    return null
  if (r.mode === "schedule" && Number.isNaN(Date.parse(r.scheduledFor ?? "")))
    return null
  return {
    accountId: r.accountId,
    caption: typeof r.caption === "string" ? r.caption.slice(0, 2200) : "",
    as: r.as,
    mode: r.mode,
    scheduledFor: r.scheduledFor,
    timezone: typeof r.timezone === "string" ? r.timezone : undefined,
    altTexts: Array.isArray(r.altTexts)
      ? r.altTexts.map((a) => (typeof a === "string" ? a : ""))
      : [],
  }
}

// multipart: `request` (JSON) plus one `slide` file per slide, in order.
export async function action({ request }: Route.ActionArgs) {
  if (!zernioEnabled()) return new Response("Not found", { status: 404 })
  if (request.method !== "POST") return error("Method not allowed", 405)
  const form = await request.formData().catch(() => null)
  const r = parse(JSON.parse(String(form?.get("request") ?? "null")))
  const files = (form?.getAll("slide") ?? []).filter(
    (f): f is File => f instanceof File
  )
  if (!r || !files.length) return error("Invalid publish request.", 400)
  if (r.as === "feed" && files.length > MAX_FEED_SLIDES)
    return error(
      `Instagram carousels take up to ${MAX_FEED_SLIDES} slides.`,
      400
    )
  if (files.some((f) => f.size > MAX_IMAGE_BYTES))
    return error("Instagram takes images up to 8 MB.", 400)

  const key = request.headers.get("idempotency-key") ?? crypto.randomUUID()
  try {
    return Response.json(await publish(r, files, key))
  } catch (e) {
    if (e instanceof ZernioError) return error(e.message, e.status, e.code)
    return error((e as Error).message, 500)
  }
}
