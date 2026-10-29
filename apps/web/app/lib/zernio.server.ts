// Zernio (https://docs.zernio.com) publishes to Instagram for us. Server only:
// the API key stays here, and the editor turns posting on when it is set.
const BASE = (
  process.env.ZERNIO_API_URL ?? "https://zernio.com/api/v1"
).replace(/\/$/, "")

export const zernioEnabled = () => !!process.env.ZERNIO_API_KEY?.trim()

export class ZernioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
  }
}

async function call<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
): Promise<{ status: number; body: T }> {
  const key = process.env.ZERNIO_API_KEY?.trim()
  if (!key) throw new ZernioError("Zernio is not configured.", 404)
  const { idempotencyKey, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        ...(idempotencyKey && { "idempotency-key": idempotencyKey }),
        ...rest.headers,
      },
    })
  } catch {
    throw new ZernioError("Zernio is not reachable.", 502)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ZernioError(
      body?.error ?? body?.message ?? `Zernio answered ${res.status}.`,
      res.status,
      body?.code
    )
  }
  return { status: res.status, body: body as T }
}

export interface InstagramAccount {
  id: string
  username: string
  displayName: string
  picture: string | null
}

export async function listInstagramAccounts(): Promise<InstagramAccount[]> {
  const { body } = await call<{
    accounts: {
      _id: string
      platform: string
      username?: string
      displayName?: string
      profilePicture?: string | null
      isActive?: boolean
    }[]
  }>("/accounts?platform=instagram&status=connected&limit=100")
  return body.accounts
    .filter((a) => a.platform === "instagram" && a.isActive !== false)
    .map((a) => ({
      id: a._id,
      username: a.username ?? "",
      displayName: a.displayName ?? a.username ?? "",
      picture: a.profilePicture ?? null,
    }))
}

// Presign, then PUT straight to storage (no auth header there).
export async function uploadMedia(file: Blob, filename: string) {
  const contentType = file.type || "image/jpeg"
  const { body } = await call<{ uploadUrl: string; publicUrl: string }>(
    "/media/presign",
    {
      method: "POST",
      body: JSON.stringify({ filename, contentType, size: file.size }),
    }
  )
  const put = await fetch(body.uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file,
  })
  if (!put.ok)
    throw new ZernioError(`Uploading ${filename} failed (${put.status}).`, 502)
  return body.publicUrl
}

export type PublishMode = "now" | "schedule" | "draft"
export type PublishAs = "feed" | "story"

export interface PublishRequest {
  accountId: string
  caption: string
  as: PublishAs
  mode: PublishMode
  scheduledFor?: string
  timezone?: string
  altTexts: string[]
}

interface ZernioPost {
  _id: string
  status: string
  scheduledFor?: string
  platforms?: {
    platform: string
    status: string
    platformPostUrl?: string
    errorMessage?: string
  }[]
}

export interface PublishResult {
  postId: string
  status: string
  url: string | null
  scheduledFor: string | null
  error: string | null
  warnings: string[]
}

function toResult(
  post: ZernioPost,
  extra: { error?: string; warnings?: string[] } = {}
): PublishResult {
  const platforms = post.platforms ?? []
  return {
    postId: post._id,
    status: post.status,
    url: platforms.find((p) => p.platformPostUrl)?.platformPostUrl ?? null,
    scheduledFor: post.scheduledFor ?? null,
    error:
      extra.error ??
      platforms.find((p) => p.status === "failed")?.errorMessage ??
      null,
    warnings: extra.warnings ?? [],
  }
}

// A carousel is one feed post (up to 10 slides). Stories are one per slide,
// so each slide becomes its own Instagram entry with its own media.
export async function publish(
  r: PublishRequest,
  files: Blob[],
  idempotencyKey: string
) {
  const urls: string[] = []
  for (const [i, file] of files.entries()) {
    urls.push(
      await uploadMedia(
        file,
        `palmframe-slide-${String(i + 1).padStart(2, "0")}.jpg`
      )
    )
  }
  const media = urls.map((url, i) => ({
    type: "image",
    url,
    ...(r.altTexts[i]?.trim() && {
      altText: r.altTexts[i]!.trim().slice(0, 1000),
    }),
  }))
  const platforms =
    r.as === "story"
      ? media.map((m) => ({
          platform: "instagram",
          accountId: r.accountId,
          customMedia: [m],
          platformSpecificData: { contentType: "story" },
        }))
      : [{ platform: "instagram", accountId: r.accountId }]

  const { body } = await call<{
    post: ZernioPost
    error?: string
    warnings?: string[]
  }>("/posts", {
    method: "POST",
    idempotencyKey,
    body: JSON.stringify({
      content: r.caption,
      mediaItems: r.as === "story" ? media.slice(0, 1) : media,
      platforms,
      ...(r.mode === "now" && { publishNow: true }),
      ...(r.mode === "draft" && { isDraft: true }),
      ...(r.mode === "schedule" && {
        scheduledFor: r.scheduledFor,
        timezone: r.timezone,
      }),
      metadata: { source: "palmframe" },
    }),
  })
  return toResult(body.post, body)
}

export async function getPost(id: string) {
  const { body } = await call<{ post: ZernioPost }>(
    `/posts/${encodeURIComponent(id)}`
  )
  return toResult(body.post)
}
