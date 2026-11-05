// Putting a filed story out: on the publication, in a newsletter, and as
// social posts. Shared by the owner's buttons and by beats, which do the same
// steps on their own once a story passes every check.
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { Platform } from "./database"
import { sendIssue } from "./mail.server"
import { publicationPath, slugify } from "./publication"
import { PLATFORMS, postProblems } from "./social"
import { draftPosts } from "./social.server"
import { schedule } from "./zernio.server"

export interface StoryForPublishing {
  id: string
  user_id: string
  title: string
  dek: string
  body: string
  cover: { url?: string } | null
  slug: string | null
  published_at: string | null
}

export const STORY_FIELDS =
  "id, user_id, title, dek, body, cover, slug, published_at, status"

export class PublishError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export async function publicationOf(userId: string) {
  const { data } = await supabaseAdmin()
    .from("comic_newsrooms")
    .select("id, slug, live")
    .eq("user_id", userId)
    .maybeSingle()
  return data
}

// A story keeps its address once it has one, so links stay good.
export async function publishStory(story: StoryForPublishing) {
  const admin = supabaseAdmin()
  const pub = await publicationOf(story.user_id)
  if (!pub) throw new PublishError("no-publication")
  let slug = story.slug
  if (!slug) {
    const base = slugify(story.title) || "story"
    const { data: taken } = await admin
      .from("comic_deep_dives")
      .select("slug")
      .eq("user_id", story.user_id)
      .like("slug", `${base}%`)
    const used = new Set((taken ?? []).map((t) => t.slug))
    slug = base
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
  }
  const published_at = story.published_at ?? new Date().toISOString()
  await admin
    .from("comic_deep_dives")
    .update({ slug, published_at })
    .eq("id", story.id)
  Object.assign(story, { slug, published_at })
  return publicationPath(pub.slug, slug)
}

export async function storyUrl(story: StoryForPublishing, origin: string) {
  const pub = await publicationOf(story.user_id)
  return pub && story.slug && story.published_at
    ? `${origin}${publicationPath(pub.slug, story.slug)}`
    : null
}

export async function sendNewsletter(
  story: StoryForPublishing,
  origin: string
) {
  const pub = await publicationOf(story.user_id)
  if (!pub?.live || !story.published_at || !story.slug)
    throw new PublishError("unpublished")
  const { data: issue, error } = await supabaseAdmin()
    .from("comic_newsroom_issues")
    .insert({
      newsroom_id: pub.id,
      story_id: story.id,
      subject: story.title.slice(0, 200),
    })
    .select("id")
    .single()
  if (error || !issue) throw new PublishError("generic")
  return sendIssue(issue.id, origin)
}

// Drafts replace drafts; a post that went out stays as it went out. The
// caller has already charged for this.
export async function draftAndStorePosts(
  story: StoryForPublishing,
  url: string,
  signal?: AbortSignal
) {
  const admin = supabaseAdmin()
  const drafts = await draftPosts(story, url, signal)
  const { data: existing } = await admin
    .from("comic_newsroom_posts")
    .select("platform, status")
    .eq("story_id", story.id)
  const locked = new Set(
    (existing ?? [])
      .filter((e) => e.status === "scheduled" || e.status === "published")
      .map((e) => e.platform)
  )
  const rows = PLATFORMS.filter((p) => !locked.has(p)).map((p) => ({
    user_id: story.user_id,
    story_id: story.id,
    platform: p,
    text: drafts[p],
    status: "draft" as const,
  }))
  if (rows.length)
    await admin
      .from("comic_newsroom_posts")
      .upsert(rows, { onConflict: "story_id,platform" })
}

export async function schedulePosts(
  story: StoryForPublishing,
  platforms: Platform[],
  at: string | null
) {
  const admin = supabaseAdmin()
  const { data: posts } = await admin
    .from("comic_newsroom_posts")
    .select("*")
    .eq("story_id", story.id)
    .in("platform", platforms)
    .in("status", ["draft", "failed"])
  const results: Record<string, string> = {}
  for (const post of posts ?? []) {
    const problems = postProblems(post.platform, post.text)
    if (problems.length) {
      results[post.platform] = problems[0]!
      continue
    }
    try {
      const out = await schedule({
        platform: post.platform,
        accountId: null,
        text: post.text,
        imageUrl: story.cover?.url ?? null,
        scheduledFor: at,
        idempotencyKey: `newsroom:${post.id}`,
      })
      await admin
        .from("comic_newsroom_posts")
        .update({
          status: out.status,
          provider: out.provider,
          provider_post_id: out.postId,
          scheduled_for: at,
          error: "",
        })
        .eq("id", post.id)
      results[post.platform] = out.status
    } catch (e) {
      await admin
        .from("comic_newsroom_posts")
        .update({
          status: "failed",
          error: e instanceof Error ? e.message.slice(0, 300) : "Failed",
        })
        .eq("id", post.id)
      results[post.platform] = "failed"
    }
  }
  return results
}
