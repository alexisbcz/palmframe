// Scheduling a story's posts on Zernio (https://docs.zernio.com), the service
// behind Palmframe's Instagram publishing. Mocked for now: requests are built
// exactly as Zernio takes them, logged, and answered with a fake id. Set
// NEWSROOM_ZERNIO_LIVE=1, with accounts connected, to send them for real.
import type { Platform } from "./database"

// Zernio's names for the networks.
const ZERNIO_PLATFORM: Record<Platform, string> = {
  linkedin: "linkedin",
  x: "twitter",
  bluesky: "bluesky",
  facebook: "facebook",
}

export interface ScheduleRequest {
  platform: Platform
  accountId: string | null
  text: string
  imageUrl: string | null
  // Empty for "now".
  scheduledFor: string | null
  idempotencyKey: string
}

export function zernioBody(r: ScheduleRequest) {
  return {
    content: r.text,
    ...(r.imageUrl && { mediaItems: [{ type: "image", url: r.imageUrl }] }),
    platforms: [
      {
        platform: ZERNIO_PLATFORM[r.platform],
        ...(r.accountId && { accountId: r.accountId }),
      },
    ],
    ...(r.scheduledFor
      ? { scheduledFor: r.scheduledFor, timezone: "UTC" }
      : { publishNow: true }),
    metadata: { source: "palmframe-newsroom" },
  }
}

export const zernioLive = () =>
  process.env.NEWSROOM_ZERNIO_LIVE === "1" &&
  !!process.env.ZERNIO_API_KEY?.trim()

export async function schedule(r: ScheduleRequest) {
  const body = zernioBody(r)
  if (!zernioLive()) {
    console.info("Zernio (mock)", JSON.stringify(body).slice(0, 500))
    return {
      provider: "zernio-mock",
      postId: `mock_${crypto.randomUUID().slice(0, 12)}`,
      status: r.scheduledFor ? ("scheduled" as const) : ("published" as const),
    }
  }
  const res = await fetch(
    `${process.env.ZERNIO_API_URL ?? "https://zernio.com/api/v1"}/posts`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.ZERNIO_API_KEY!.trim()}`,
        "content-type": "application/json",
        "idempotency-key": r.idempotencyKey,
      },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error(`Zernio ${res.status}`)
  const out = (await res.json()) as { post?: { _id: string; status: string } }
  return {
    provider: "zernio",
    postId: out.post?._id ?? "",
    status: r.scheduledFor ? ("scheduled" as const) : ("published" as const),
  }
}
