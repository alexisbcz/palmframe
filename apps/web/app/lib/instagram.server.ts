import type { Viewer } from "./database"
import { getViewer } from "./supabase.server"

// Posting to Instagram runs on Zernio (https://docs.zernio.com), an
// implementation detail users never see: no message below names it. Server
// only: the API key stays here, and the editor turns posting on when it is set.
// Every user gets their own Zernio profile, so their accounts stay theirs.
const BASE = (
  process.env.ZERNIO_API_URL ?? "https://zernio.com/api/v1"
).replace(/\/$/, "")

export const instagramEnabled = () => !!process.env.ZERNIO_API_KEY?.trim()

export class InstagramError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(scrub(message))
  }
}

// Upstream messages can name the provider; users only ever see "Instagram".
function scrub(message: string) {
  return message
    .replace(/\bzernio(\.com)?('s)?\s+/gi, "")
    .replace(/\bzernio(\.com)?\b/gi, "the publishing service")
}

async function call<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
): Promise<{ status: number; body: T }> {
  const key = process.env.ZERNIO_API_KEY?.trim()
  if (!key) throw new InstagramError("Instagram posting is off.", 404)
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
    throw new InstagramError("Instagram posting is unreachable.", 502)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // Billing and plan limits are ours to fix, not the user's.
    if (res.status === 402 || res.status === 403)
      throw new InstagramError(
        "Instagram posting is unavailable right now. Try again later.",
        503,
        body?.code
      )
    throw new InstagramError(
      body?.error ??
        body?.message ??
        `Instagram posting failed (${res.status}).`,
      res.status,
      body?.code
    )
  }
  return { status: res.status, body: body as T }
}

// Profiles are keyed by the user id (`externalId`), so nothing is stored on
// our side; the cache only saves the lookup.
const profiles = new Map<string, string>()

export async function profileFor(viewer: Viewer) {
  const cached = profiles.get(viewer.id)
  if (cached) return cached
  const { body } = await call<{ profiles: { _id: string }[] }>(
    `/profiles?externalId=${encodeURIComponent(viewer.id)}`
  )
  let id = body.profiles[0]?._id
  if (!id) {
    try {
      const { body: created } = await call<{ profile: { _id: string } }>(
        "/profiles",
        {
          method: "POST",
          body: JSON.stringify({ name: viewer.email, externalId: viewer.id }),
        }
      )
      id = created.profile._id
    } catch (e) {
      // Two tabs racing to create it: the other one won.
      const existing =
        e instanceof InstagramError &&
        e.code === "profile_external_id_conflict" &&
        (await call<{ profiles: { _id: string }[] }>(
          `/profiles?externalId=${encodeURIComponent(viewer.id)}`
        ).then((r) => r.body.profiles[0]?._id))
      if (!existing) throw e
      id = existing
    }
  }
  profiles.set(viewer.id, id)
  return id
}

export interface InstagramAccount {
  id: string
  username: string
  displayName: string
  picture: string | null
}

export async function listInstagramAccounts(
  profileId: string
): Promise<InstagramAccount[]> {
  const { body } = await call<{
    accounts: {
      _id: string
      platform: string
      profileId?: string | { _id: string }
      username?: string
      displayName?: string
      profilePicture?: string | null
      isActive?: boolean
    }[]
  }>(
    `/accounts?profileId=${encodeURIComponent(profileId)}&platform=instagram&status=connected&limit=100`
  )
  return body.accounts
    .filter(
      (a) =>
        a.platform === "instagram" &&
        a.isActive !== false &&
        // Belt and braces: never show another profile's account.
        (typeof a.profileId === "object" ? a.profileId?._id : a.profileId) ===
          profileId
    )
    .map((a) => ({
      id: a._id,
      username: a.username ?? "",
      displayName: a.displayName ?? a.username ?? "",
      picture: a.profilePicture ?? null,
    }))
}

// Where the browser goes to log in to Instagram. INSTAGRAM_OAUTH_APP_ID runs
// it on our own Meta app, so the consent screen names Palmframe.
export async function connectUrl(profileId: string, redirectUrl: string) {
  const params = new URLSearchParams({
    profileId,
    redirect_url: redirectUrl,
    welcome: "false",
  })
  const app = process.env.INSTAGRAM_OAUTH_APP_ID?.trim()
  if (app) params.set("oauthAppId", app)
  const { body } = await call<{ authUrl: string }>(
    `/connect/instagram?${params}`
  )
  return body.authUrl
}

export async function disconnectAccount(profileId: string, accountId: string) {
  const owned = await listInstagramAccounts(profileId)
  if (!owned.some((a) => a.id === accountId))
    throw new InstagramError("Account not found.", 404)
  await call(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" })
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
    throw new InstagramError(
      `Uploading ${filename} failed (${put.status}).`,
      502
    )
  return body.publicUrl
}

export type PublishMode = "now" | "schedule"
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
    accountId?: string | { _id: string }
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
  const error =
    extra.error ??
    platforms.find((p) => p.status === "failed")?.errorMessage ??
    null
  return {
    postId: post._id,
    status: post.status,
    url: platforms.find((p) => p.platformPostUrl)?.platformPostUrl ?? null,
    scheduledFor: post.scheduledFor ?? null,
    error: error && scrub(error),
    warnings: (extra.warnings ?? []).map(scrub),
  }
}

// The posts API takes any account of the team, whatever its profile, so the
// account is checked against the user's own profile first.
async function assertOwned(profileId: string, accountId: string) {
  const owned = await listInstagramAccounts(profileId)
  if (!owned.some((a) => a.id === accountId))
    throw new InstagramError("That Instagram account isn't connected.", 404)
}

// Everything posted from here is AI-drawn, so every post carries Instagram's
// AI info label. It can only be set at publish time.
const AI_LABEL = { isAiGenerated: true }

// A carousel is one feed post (up to 10 slides). Stories are one per slide,
// so each slide becomes its own Instagram entry with its own media.
export async function publish(
  profileId: string,
  r: PublishRequest,
  files: Blob[],
  idempotencyKey: string
) {
  await assertOwned(profileId, r.accountId)
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
          platformSpecificData: { contentType: "story", ...AI_LABEL },
        }))
      : [
          {
            platform: "instagram",
            accountId: r.accountId,
            platformSpecificData: AI_LABEL,
          },
        ]

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
      ...(r.mode === "schedule" && {
        scheduledFor: r.scheduledFor,
        timezone: r.timezone,
      }),
      metadata: { source: "palmframe" },
    }),
  })
  return toResult(body.post, body)
}

export async function getPost(profileId: string, id: string) {
  const { body } = await call<{ post: ZernioPost }>(
    `/posts/${encodeURIComponent(id)}`
  )
  const owned = new Set(
    (await listInstagramAccounts(profileId)).map((a) => a.id)
  )
  const accounts = (body.post.platforms ?? []).map((p) =>
    typeof p.accountId === "object" ? p.accountId?._id : p.accountId
  )
  if (!accounts.length || !accounts.every((a) => a && owned.has(a)))
    throw new InstagramError("Post not found.", 404)
  return toResult(body.post)
}

// For the API routes: the signed-in user's profile, or the response to send.
export async function requireProfile(request: Request) {
  if (!instagramEnabled()) throw new Response("Not found", { status: 404 })
  const { viewer, headers } = await getViewer(request)
  if (!viewer)
    throw Response.json(
      { error: "Sign in to post to Instagram." },
      { status: 401, headers }
    )
  return { viewer, headers, profileId: await profileFor(viewer) }
}

export function errorResponse(e: unknown) {
  if (e instanceof Response) return e
  if (e instanceof InstagramError)
    return Response.json(
      { error: e.message, code: e.code },
      { status: e.status }
    )
  console.error(e)
  return Response.json({ error: "Something went wrong." }, { status: 500 })
}
