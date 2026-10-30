import { INSTAGRAM_LIMITS } from "@/lib/instagram-limits"
import {
  errorResponse,
  publish,
  requireProfile,
  type PublishRequest,
} from "@/lib/instagram.server"

import type { Route } from "./+types/api.instagram.publish"

const { slides: MAX_FEED_SLIDES, imageBytes: MAX_IMAGE_BYTES } =
  INSTAGRAM_LIMITS
const error = (message: string, status: number, code?: string) =>
  Response.json({ error: message, code }, { status })

function parse(raw: unknown): PublishRequest | null {
  const r = raw as Partial<PublishRequest> | null
  if (!r || typeof r.accountId !== "string" || !r.accountId) return null
  if (r.as !== "feed" && r.as !== "story") return null
  if (r.mode !== "now" && r.mode !== "schedule") return null
  if (r.mode === "schedule" && Number.isNaN(Date.parse(r.scheduledFor ?? "")))
    return null
  return {
    accountId: r.accountId,
    caption:
      typeof r.caption === "string"
        ? r.caption.slice(0, INSTAGRAM_LIMITS.caption)
        : "",
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
  if (request.method !== "POST") return error("Method not allowed", 405)
  let profileId: string
  try {
    ;({ profileId } = await requireProfile(request))
  } catch (e) {
    return errorResponse(e)
  }
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
    return Response.json(await publish(profileId, r, files, key))
  } catch (e) {
    return errorResponse(e)
  }
}
