import { z } from "zod"

import { COSTS } from "@/lib/credits"
import { PLATFORMS, postProblems } from "@/lib/newsroom/social"
import { draftPosts } from "@/lib/newsroom/social.server"
import { sendIssue } from "@/lib/newsroom/mail.server"
import {
  publicationPath,
  publicationSchema,
  slugify,
} from "@/lib/newsroom/publication"
import { schedule } from "@/lib/newsroom/zernio.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.newsroom.publish"

export const config = { maxDuration: 120 }

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

const platform = z.enum(["linkedin", "x", "bluesky", "facebook"])

const body = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("publication"),
    publication: publicationSchema,
  }),
  z.object({ intent: z.literal("publish"), id: z.uuid(), on: z.boolean() }),
  z.object({ intent: z.literal("newsletter"), id: z.uuid() }),
  z.object({ intent: z.literal("draft-posts"), id: z.uuid() }),
  z.object({
    intent: z.literal("save-post"),
    id: z.uuid(),
    platform,
    text: z.string().max(5000),
  }),
  z.object({
    intent: z.literal("schedule-posts"),
    id: z.uuid(),
    platforms: z.array(platform).min(1).max(4),
    // Empty means now.
    at: z.iso.datetime().nullable(),
  }),
])

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("generic", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return fail("generic", 401)
  if (!viewer.labs.newsroom) return fail("generic", 404)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("invalid", 400)
  const r = parsed.data
  const admin = supabaseAdmin()
  const origin = new URL(request.url).origin

  if (r.intent === "publication") {
    const { error } = await admin
      .from("comic_newsrooms")
      .upsert(
        { user_id: viewer.id, ...r.publication },
        { onConflict: "user_id" }
      )
    if (error?.code === "23505") return fail("taken", 409)
    if (error) return fail("generic", 500)
    return Response.json({ ok: true })
  }

  // Everything else acts on one of the person's filed stories.
  const { data: story } = await admin
    .from("comic_deep_dives")
    .select("id, title, dek, body, cover, slug, published_at, status")
    .eq("id", r.id)
    .eq("user_id", viewer.id)
    .not("template", "is", null)
    .maybeSingle()
  if (!story || !story.body) return fail("missing", 404)
  const { data: pub } = await admin
    .from("comic_newsrooms")
    .select("id, slug, live")
    .eq("user_id", viewer.id)
    .maybeSingle()

  if (r.intent === "publish") {
    if (!r.on) {
      await admin
        .from("comic_deep_dives")
        .update({ published_at: null })
        .eq("id", story.id)
      return Response.json({ ok: true })
    }
    if (!pub) return fail("no-publication", 409)
    // A story keeps its address once it has one, so links stay good.
    let slug = story.slug
    if (!slug) {
      const base = slugify(story.title) || "story"
      const { data: taken } = await admin
        .from("comic_deep_dives")
        .select("slug")
        .eq("user_id", viewer.id)
        .like("slug", `${base}%`)
      const used = new Set((taken ?? []).map((t) => t.slug))
      slug = base
      for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
    }
    await admin
      .from("comic_deep_dives")
      .update({ slug, published_at: new Date().toISOString() })
      .eq("id", story.id)
    return Response.json({ ok: true, path: publicationPath(pub.slug, slug) })
  }

  const url =
    pub && story.slug
      ? `${origin}${publicationPath(pub.slug, story.slug)}`
      : null

  if (r.intent === "newsletter") {
    if (!pub?.live || !story.published_at || !url)
      return fail("unpublished", 409)
    const { data: issue, error } = await admin
      .from("comic_newsroom_issues")
      .insert({
        newsroom_id: pub.id,
        story_id: story.id,
        subject: story.title.slice(0, 200),
      })
      .select("id")
      .single()
    if (error || !issue) return fail("generic", 500)
    const status = await sendIssue(issue.id, origin)
    return Response.json({ ok: true, status })
  }

  if (r.intent === "draft-posts") {
    if (!url) return fail("unpublished", 409)
    const job = crypto.randomUUID()
    const spent = await supabase.rpc("spend_credits", {
      p_cost: COSTS.newsroom_posts,
      p_kind: "newsroom_posts",
      p_job: job,
    })
    if (spent.error?.code === "P0402") return fail("credits", 402)
    if (spent.error) return fail("generic", 500)
    try {
      const drafts = await draftPosts(story, url, request.signal)
      // Drafts replace drafts; a scheduled post stays as it went out.
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
        user_id: viewer.id,
        story_id: story.id,
        platform: p,
        text: drafts[p],
        status: "draft" as const,
      }))
      if (rows.length)
        await admin
          .from("comic_newsroom_posts")
          .upsert(rows, { onConflict: "story_id,platform" })
      return Response.json({ ok: true, balance: spent.data })
    } catch (e) {
      console.error("Post drafts failed", story.id, e)
      await supabase.rpc("refund_credits", { p_job: job })
      return fail("generic", 500)
    }
  }

  if (r.intent === "save-post") {
    const { data: current } = await admin
      .from("comic_newsroom_posts")
      .select("status")
      .eq("story_id", story.id)
      .eq("platform", r.platform)
      .maybeSingle()
    if (
      current &&
      (current.status === "scheduled" || current.status === "published")
    )
      return fail("locked", 409)
    const { error } = await admin.from("comic_newsroom_posts").upsert(
      {
        user_id: viewer.id,
        story_id: story.id,
        platform: r.platform,
        text: r.text,
        status: "draft",
      },
      { onConflict: "story_id,platform" }
    )
    if (error) return fail("generic", 500)
    return Response.json({ ok: true })
  }

  // schedule-posts
  if (r.at && new Date(r.at).getTime() < Date.now() - 60_000)
    return fail("past", 400)
  const { data: posts } = await admin
    .from("comic_newsroom_posts")
    .select("*")
    .eq("story_id", story.id)
    .in("platform", r.platforms)
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
        scheduledFor: r.at,
        idempotencyKey: `newsroom:${post.id}`,
      })
      await admin
        .from("comic_newsroom_posts")
        .update({
          status: out.status,
          provider: out.provider,
          provider_post_id: out.postId,
          scheduled_for: r.at,
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
  return Response.json({ ok: true, results })
}
