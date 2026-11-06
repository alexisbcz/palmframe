// Sending an approved post to Zernio (https://docs.zernio.com), which posts to
// the accounts connected there. Mocked unless AUTOPILOT_ZERNIO_LIVE=1: the
// request is built exactly as Zernio takes it, logged, and answered with a
// fake id, so a fleet can run end to end without posting anything.
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { AgentPostRow } from "./database"
import type { Platform } from "./model"

const ZERNIO_PLATFORM: Record<Platform, string> = {
  x: "twitter",
  linkedin: "linkedin",
  bluesky: "bluesky",
  threads: "threads",
}

export const zernioLive = () =>
  process.env.AUTOPILOT_ZERNIO_LIVE === "1" &&
  !!process.env.ZERNIO_API_KEY?.trim()

let accounts: Promise<Record<string, string>> | null = null

// Zernio account ids by our platform name, read once per process.
function accountIds() {
  accounts ??= (async () => {
    const res = await fetch(
      `${process.env.ZERNIO_API_URL ?? "https://zernio.com/api/v1"}/accounts`,
      {
        headers: {
          authorization: `Bearer ${process.env.ZERNIO_API_KEY!.trim()}`,
        },
      }
    )
    if (!res.ok) return {}
    const out = (await res.json()) as {
      accounts?: { _id: string; platform: string }[]
    }
    const ids: Record<string, string> = {}
    for (const a of out.accounts ?? []) {
      const ours = (Object.keys(ZERNIO_PLATFORM) as Platform[]).find(
        (p) => ZERNIO_PLATFORM[p] === a.platform
      )
      if (ours && !ids[ours]) ids[ours] = a._id
    }
    return ids
  })().catch(() => ({}))
  return accounts
}

export async function sendToZernio(
  post: Pick<AgentPostRow, "id" | "platform" | "text" | "scheduled_for">
) {
  const body = {
    content: post.text,
    platforms: [{ platform: ZERNIO_PLATFORM[post.platform] }] as {
      platform: string
      accountId?: string
    }[],
    ...(post.scheduled_for &&
    new Date(post.scheduled_for).getTime() > Date.now() + 60_000
      ? { scheduledFor: post.scheduled_for, timezone: "UTC" }
      : { publishNow: true }),
    metadata: { source: "palmframe-autopilot", post: post.id },
  }
  if (!zernioLive()) {
    console.info("Zernio (mock)", JSON.stringify(body).slice(0, 400))
    return {
      provider: "zernio-mock",
      id: `mock_${crypto.randomUUID().slice(0, 12)}`,
    }
  }
  const account = (await accountIds())[post.platform]
  if (!account)
    throw new Error(`No ${post.platform} account is connected on Zernio.`)
  body.platforms[0]!.accountId = account
  const res = await fetch(
    `${process.env.ZERNIO_API_URL ?? "https://zernio.com/api/v1"}/posts`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.ZERNIO_API_KEY!.trim()}`,
        "content-type": "application/json",
        "idempotency-key": `autopilot:${post.id}`,
      },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error(`Zernio answered ${res.status}.`)
  const out = (await res.json()) as { post?: { _id: string } }
  return { provider: "zernio", id: out.post?._id ?? "" }
}

// Approve: hand the post to Zernio and record what happened.
export async function publishPost(post: AgentPostRow) {
  const admin = supabaseAdmin()
  try {
    const sent = await sendToZernio(post)
    const later =
      !!post.scheduled_for &&
      new Date(post.scheduled_for).getTime() > Date.now() + 60_000
    await admin
      .from("comic_autopilot_posts")
      .update({
        status: later ? "scheduled" : "published",
        provider: sent.provider,
        provider_post_id: sent.id,
        error: "",
      })
      .eq("id", post.id)
    return later ? "scheduled" : "published"
  } catch (e) {
    await admin
      .from("comic_autopilot_posts")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : "Couldn't post.",
      })
      .eq("id", post.id)
    return "failed"
  }
}
