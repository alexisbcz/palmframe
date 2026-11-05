// Beats: recurring assignments. The newsroom tick files the ones that are due,
// wakes stories whose worker died, and a story a beat filed goes out on its own
// once it passes every check. One that needs review waits for a person.
import { COSTS } from "@/lib/credits"
import { kick } from "@/lib/deepdive/run.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { readLabs } from "@/lib/tools/catalog"

import type { BeatRow } from "./database"
import {
  STORY_FIELDS,
  draftAndStorePosts,
  publicationOf,
  publishStory,
  schedulePosts,
  sendNewsletter,
  storyUrl,
} from "./publish.server"
import { PLATFORMS } from "./social"
import { nextRun } from "./schedule"

const MAX_RUNNING = 2
const BEATS_PER_TICK = 10
const BUSY_RETRY_MS = 10 * 60_000
// A run that hasn't saved anything for this long has lost its worker.
const STALLED_MS = 4 * 60_000

export const scheduleOf = (
  b: Pick<BeatRow, "cadence" | "weekday" | "minute_of_day" | "timezone">
) => ({
  cadence: b.cadence,
  weekday: b.weekday,
  minuteOfDay: b.minute_of_day,
  timezone: b.timezone,
})

async function note(id: string, patch: Partial<BeatRow>) {
  await supabaseAdmin().from("comic_newsroom_beats").update(patch).eq("id", id)
}

// Files one beat's story. Returns what happened, for the tick's log.
export async function fileBeat(beat: BeatRow, origin: string, now: Date) {
  const admin = supabaseAdmin()

  const { data: owner } = await admin.auth.admin.getUserById(beat.user_id)
  if (!readLabs(owner.user?.user_metadata?.labs).newsroom) {
    await note(beat.id, { enabled: false, last_error: "The Newsroom is off." })
    return "off"
  }

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const { count: thisWeek } = await admin
    .from("comic_deep_dives")
    .select("id", { count: "exact", head: true })
    .eq("beat_id", beat.id)
    .gte("created_at", weekAgo)
  if (((thisWeek ?? 0) + 1) * COSTS.deep_dive > beat.max_credits_per_week) {
    await note(beat.id, { last_error: "Weekly credit cap reached." })
    return "capped"
  }

  const { count: running } = await admin
    .from("comic_deep_dives")
    .select("id", { count: "exact", head: true })
    .eq("user_id", beat.user_id)
    .in("status", ["queued", "running"])
  if ((running ?? 0) >= MAX_RUNNING) {
    // Try again shortly rather than skipping the edition.
    await note(beat.id, {
      next_run_at: new Date(now.getTime() + BUSY_RETRY_MS).toISOString(),
      last_error: "Two stories were already on the desk; retrying.",
    })
    return "busy"
  }

  const job = `beat:${beat.id}:${now.toISOString().slice(0, 16)}`
  const spent = await admin.rpc("spend_credits_for", {
    p_user: beat.user_id,
    p_cost: COSTS.deep_dive,
    p_kind: "deep_dive",
    p_job: job,
  })
  if (spent.error) {
    await note(beat.id, {
      last_error:
        spent.error.code === "P0402" ? "Out of credits." : "Couldn't charge.",
    })
    return "credits"
  }
  const { data: dive, error } = await admin
    .from("comic_deep_dives")
    .insert({
      user_id: beat.user_id,
      lead: beat.lead,
      template: beat.template as never,
      options: beat.options,
      beat_id: beat.id,
      job,
    })
    .select("id")
    .single()
  if (error || !dive) {
    await admin.rpc("refund_credits_for", { p_user: beat.user_id, p_job: job })
    await note(beat.id, { last_error: "Couldn't file the story." })
    return "failed"
  }
  await note(beat.id, { last_run_at: now.toISOString(), last_error: "" })
  await kick(origin, dive.id)
  return "filed"
}

export async function tick(origin: string, now = new Date()) {
  const admin = supabaseAdmin()
  const out: Record<string, string> = {}

  const { data: due } = await admin
    .from("comic_newsroom_beats")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at")
    .limit(BEATS_PER_TICK)
  for (const beat of due ?? []) {
    // Claim it by moving its next run; a second tick sees it gone.
    const next = nextRun(scheduleOf(beat), now).toISOString()
    const { data: claimed } = await admin
      .from("comic_newsroom_beats")
      .update({ next_run_at: next })
      .eq("id", beat.id)
      .eq("next_run_at", beat.next_run_at!)
      .select("id")
    if (!claimed?.length) continue
    out[beat.id] = await fileBeat(beat, origin, now).catch((e) => {
      console.error("Beat failed", beat.id, e)
      return "error"
    })
  }

  // Any story, Studio's too, whose chain of workers broke.
  const stalled = new Date(now.getTime() - STALLED_MS).toISOString()
  const { data: stuck } = await admin
    .from("comic_deep_dives")
    .select("id")
    .in("status", ["queued", "running"])
    .lt("updated_at", stalled)
    .or(`leased_until.is.null,leased_until.lt.${now.toISOString()}`)
    .limit(5)
  for (const s of stuck ?? []) {
    await kick(origin, s.id)
    out[s.id] = "woken"
  }
  return out
}

// What a beat does with a story that passed every check.
export async function afterBeat(storyId: string, origin: string) {
  const admin = supabaseAdmin()
  const { data: story } = await admin
    .from("comic_deep_dives")
    .select(`${STORY_FIELDS}, beat_id`)
    .eq("id", storyId)
    .single()
  if (!story?.beat_id || story.status !== "done") return
  const { data: beat } = await admin
    .from("comic_newsroom_beats")
    .select("*")
    .eq("id", story.beat_id)
    .single()
  if (!beat) return
  const pub = await publicationOf(story.user_id)
  if (!pub || !beat.auto_publish) return
  await publishStory(story)
  if (beat.auto_newsletter && pub.live)
    await sendNewsletter(story, origin).catch((e) =>
      console.error("Beat newsletter failed", storyId, e)
    )
  // Posts link to the story, so they wait for a publication that's online.
  if (beat.auto_social && pub.live) {
    const url = await storyUrl(story, origin)
    if (!url) return
    const job = `beat-posts:${storyId}`
    const spent = await admin.rpc("spend_credits_for", {
      p_user: story.user_id,
      p_cost: COSTS.newsroom_posts,
      p_kind: "newsroom_posts",
      p_job: job,
    })
    if (spent.error) return
    try {
      await draftAndStorePosts(story, url)
      await schedulePosts(story, PLATFORMS, null)
    } catch (e) {
      console.error("Beat posts failed", storyId, e)
      await admin.rpc("refund_credits_for", {
        p_user: story.user_id,
        p_job: job,
      })
    }
  }
}
