import { z } from "zod"

import { COSTS } from "@/lib/credits"
import { publicationSchema } from "@/lib/newsroom/publication"
import {
  PublishError,
  STORY_FIELDS,
  draftAndStorePosts,
  publishStory,
  schedulePosts,
  sendNewsletter,
  storyUrl,
} from "@/lib/newsroom/publish.server"
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
    .select(STORY_FIELDS)
    .eq("id", r.id)
    .eq("user_id", viewer.id)
    .not("template", "is", null)
    .maybeSingle()
  if (!story || !story.body) return fail("missing", 404)

  try {
    if (r.intent === "publish") {
      if (!r.on) {
        await admin
          .from("comic_deep_dives")
          .update({ published_at: null })
          .eq("id", story.id)
        return Response.json({ ok: true })
      }
      return Response.json({ ok: true, path: await publishStory(story) })
    }

    if (r.intent === "newsletter")
      return Response.json({
        ok: true,
        status: await sendNewsletter(story, origin),
      })

    if (r.intent === "draft-posts") {
      const url = await storyUrl(story, origin)
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
        await draftAndStorePosts(story, url, request.signal)
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
    return Response.json({
      ok: true,
      results: await schedulePosts(story, r.platforms, r.at),
    })
  } catch (e) {
    if (e instanceof PublishError) return fail(e.code, 409)
    throw e
  }
}
