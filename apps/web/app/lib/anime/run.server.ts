import { kickWork } from "@/lib/deepdive/run.server"
import { OpenRouterError, payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { EpisodeRow, ShotRow } from "./database"
import {
  DIRECTOR_BATCH,
  directedShot,
  directionSchema,
  directorSystem,
  directorUser,
  mergeCast,
} from "./director"
import {
  ANIME_BUCKET,
  AUTO_SETUP,
  DEFAULT_SETTINGS,
  NARRATOR,
  VOICES,
  fitToModel,
  isSetup,
  keyframePrompt,
  outputSize,
  videoPrompt,
  type CameraSetup,
} from "./model"
import {
  fakeEnabled,
  fakeProvider,
  openRouterProvider,
  videoModels,
  type Provider,
} from "./provider.server"

const db = () => supabaseAdmin()
const SLICE_MS = 240_000
const LEASE_MS = 300_000
const PASS_WAIT_MS = 6_000
const PARALLEL_KEYFRAMES = 3
const PARALLEL_VOICES = 4
const MAX_RENDERING = 4
const STUCK_RENDER_MS = 45 * 60_000
const MAX_CLIP_BYTES = 300 * 1024 * 1024
const ANCHORS = 2

const leaseUntil = () => new Date(Date.now() + LEASE_MS).toISOString()
const now = () => new Date().toISOString()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const kick = (origin: string, id: string) =>
  kickWork(origin, "/api/anime/work", id)

export const setupOf = (shot: Pick<ShotRow, "camera">): CameraSetup =>
  isSetup(shot.camera) ? shot.camera : { ...AUTO_SETUP, ...shot.camera }

export const settingsOf = (e: Pick<EpisodeRow, "settings">) => ({
  ...DEFAULT_SETTINGS,
  ...e.settings,
})

// Codes the UI words. A stored failure never holds a provider's raw message.
export function failureCode(e: unknown) {
  if (e instanceof OpenRouterError) {
    if (e.status === 401) return "bad_key"
    if (e.status === 402) return "out_of_credits"
    if (e.status === 403 || e.status === 422) return "refused"
    if (e.status === 429) return "rate_limited"
  }
  return "failed"
}

const stopsEverything = (code: string) =>
  code === "bad_key" || code === "out_of_credits"

async function dataUrl(path: string) {
  const { data, error } = await db().storage.from(ANIME_BUCKET).download(path)
  if (error) throw new Error(error.message)
  const bytes = Buffer.from(await data.arrayBuffer())
  return `data:${data.type || "image/jpeg"};base64,${bytes.toString("base64")}`
}

async function store(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await db()
    .storage.from(ANIME_BUCKET)
    .upload(path, bytes, { contentType, upsert: true })
  if (error) throw new Error(error.message)
}

// OpenRouter fetches a first frame itself and asks for a plain HTTPS link. Long
// enough to outlast a queue at the provider; the fake reads the bytes directly.
async function firstFrame(path: string) {
  if (fakeEnabled()) return dataUrl(path)
  const { data, error } = await db()
    .storage.from(ANIME_BUCKET)
    .createSignedUrl(path, 6 * 3_600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

const dropFile = (path: string | null) =>
  path ? db().storage.from(ANIME_BUCKET).remove([path]) : null

const loadShots = async (id: string) => {
  const { data, error } = await db()
    .from("comic_anime_shots")
    .select("*")
    .eq("episode_id", id)
    .order("position")
  if (error) throw new Error(error.message)
  return data
}

async function claimStage(
  id: string,
  column: "keyframe_status" | "voice_status" | "video_status",
  from: "queued",
  to: "working" | "submitting"
) {
  const { data } = await db()
    .from("comic_anime_shots")
    .update({
      [column]: to,
      leased_until: leaseUntil(),
    } as Partial<ShotRow>)
    .eq("id", id)
    .eq(column, from)
    .select("id")
  return (data?.length ?? 0) === 1
}

const update = (id: string, patch: Partial<ShotRow>) =>
  db().from("comic_anime_shots").update(patch).eq("id", id)

async function directStep(p: Provider, e: EpisodeRow, shots: ShotRow[]) {
  const batch = shots.slice(e.directed, e.directed + DIRECTOR_BATCH)
  if (!batch.length) {
    await db()
      .from("comic_anime_episodes")
      .update({ status: "ready" })
      .eq("id", e.id)
    return
  }
  const settings = settingsOf(e)
  const story = shots
    .slice(Math.max(0, e.directed - 4), e.directed)
    .map((s) => s.action)
    .filter(Boolean)
  const images = await Promise.all(batch.map((s) => dataUrl(s.panel_path)))
  const reply = await p.direct({
    system: directorSystem,
    user: directorUser(batch, e.cast_list, settings.dub, story),
    schema: directionSchema,
    images,
  })
  const cast = mergeCast(e.cast_list, reply.cast ?? [])
  await Promise.all(
    batch.map((shot, i) => {
      const d = directedShot(reply.shots?.find((s) => s.index === i))
      return update(shot.id, {
        skip: d.skip,
        action: d.action,
        duration: d.duration,
        dialogue: d.dialogue,
        camera: d.camera,
      })
    })
  )
  const directed = e.directed + batch.length
  await db()
    .from("comic_anime_episodes")
    .update({
      cast_list: cast,
      directed,
      ...(directed >= shots.length && { status: "ready" as const }),
    })
    .eq("id", e.id)
}

async function runKeyframe(
  p: Provider,
  e: EpisodeRow,
  s: ShotRow,
  anchors: string[]
) {
  if (!(await claimStage(s.id, "keyframe_status", "queued", "working"))) return
  const settings = settingsOf(e)
  try {
    const refs = await Promise.all([
      dataUrl(s.panel_path),
      ...anchors.map(dataUrl),
    ])
    const { bytes, type } = await p.keyframe({
      prompt: keyframePrompt(
        { action: s.action, camera: setupOf(s) },
        settings,
        e.cast_list,
        anchors.length
      ),
      ...outputSize(settings.aspect, "1080p"),
      refs,
    })
    const ext = type.includes("png")
      ? "png"
      : type.includes("webp")
        ? "webp"
        : "jpg"
    const path = `${e.user_id}/${e.id}/keyframes/${s.id}-${Date.now()}.${ext}`
    await store(path, bytes, type)
    await update(s.id, {
      keyframe_status: "ready",
      keyframe_path: path,
      keyframe_error: null,
      leased_until: null,
    })
    await dropFile(s.keyframe_path)
  } catch (error) {
    console.error("Anime keyframe failed", s.id, error)
    const code = failureCode(error)
    await update(s.id, {
      keyframe_status: "failed",
      keyframe_error: code,
      leased_until: null,
    })
    if (stopsEverything(code)) throw error
  }
}

async function runVoice(p: Provider, e: EpisodeRow, s: ShotRow) {
  if (!(await claimStage(s.id, "voice_status", "queued", "working"))) return
  const settings = settingsOf(e)
  try {
    const voiceOf = (speaker: string) =>
      e.cast_list.find((c) => c.name.toLowerCase() === speaker.toLowerCase())
        ?.voice ?? (speaker === NARRATOR ? "Charon" : VOICES[0])
    // One line at a time, in order. MP3 frames play back when joined.
    const parts: Uint8Array[] = []
    for (const line of s.dialogue)
      parts.push(
        await p.speech({
          model: settings.speechModel,
          text: line.text,
          voice: voiceOf(line.speaker),
          delivery: line.delivery,
        })
      )
    const path = `${e.user_id}/${e.id}/voices/${s.id}-${Date.now()}.mp3`
    await store(path, Buffer.concat(parts), "audio/mpeg")
    await update(s.id, {
      voice_status: "ready",
      voice_path: path,
      voice_error: null,
      leased_until: null,
    })
    await dropFile(s.voice_path)
  } catch (error) {
    console.error("Anime voice failed", s.id, error)
    const code = failureCode(error)
    await update(s.id, {
      voice_status: "failed",
      voice_error: code,
      leased_until: null,
    })
    if (stopsEverything(code)) throw error
  }
}

async function submitVideo(p: Provider, e: EpisodeRow, s: ShotRow) {
  if (!s.keyframe_path) return
  if (!(await claimStage(s.id, "video_status", "queued", "submitting"))) return
  const settings = settingsOf(e)
  try {
    const model = (await videoModels()).find(
      (m) => m.id === settings.videoModel
    )
    if (!model) throw new Error(`Unknown model ${settings.videoModel}`)
    const fit = fitToModel(model, settings, s.duration)
    const job = await p.submit({
      model: model.id,
      prompt: videoPrompt(
        { action: s.action, camera: setupOf(s), dialogue: s.dialogue },
        settings
      ),
      firstFrame: await firstFrame(s.keyframe_path),
      duration: fit.duration,
      resolution: fit.resolution,
      aspect: settings.aspect,
      audio: fit.audio,
      seed: Math.floor(Math.random() * 2 ** 31),
    })
    await update(s.id, {
      video_status: "rendering",
      video_job: job,
      video_error: null,
      // The model's nearest length is what comes back, and the cut goes by it.
      duration: fit.duration,
      leased_until: leaseUntil(),
    })
  } catch (error) {
    console.error("Anime submit failed", s.id, error)
    const code = failureCode(error)
    await update(s.id, {
      video_status: "failed",
      video_error: code,
      leased_until: null,
    })
    if (stopsEverything(code)) throw error
  }
}

async function pollVideo(p: Provider, e: EpisodeRow, s: ShotRow) {
  if (!s.video_job) return
  const poll = await p.poll(s.video_job).catch((error) => {
    console.error("Anime poll failed", s.id, error)
    return null
  })
  if (!poll || poll.status === "working") {
    if (Date.now() - new Date(s.updated_at).getTime() > STUCK_RENDER_MS)
      await update(s.id, { video_status: "failed", video_error: "timed_out" })
    return
  }
  if (poll.status === "failed") {
    console.error("Anime render failed", s.id, poll.error)
    await update(s.id, { video_status: "failed", video_error: "refused" })
    return
  }
  try {
    const bytes = await p.download(s.video_job)
    if (bytes.length > MAX_CLIP_BYTES) throw new Error("Clip too large")
    const path = `${e.user_id}/${e.id}/clips/${s.id}-${s.video_job}.mp4`
    await store(path, bytes, "video/mp4")
    const stale = s.video_path
    await update(s.id, {
      video_status: "ready",
      video_path: path,
      video_cost: poll.cost,
      video_error: null,
      leased_until: null,
    })
    if (stale !== path) await dropFile(stale)
  } catch (error) {
    // The clip is paid for, so a failed copy stays in `rendering` and tries
    // again on the next pass until the stuck clock gives up.
    console.error("Anime download failed", s.id, error)
  }
}

// Anything left behind by a function that died.
async function reap(shots: ShotRow[]) {
  const late = (s: ShotRow) =>
    !!s.leased_until && new Date(s.leased_until).getTime() < Date.now()
  await Promise.all(
    shots.filter(late).flatMap((s) => {
      const work = []
      if (s.video_status === "submitting")
        // Unknown whether the provider took it. Failing costs one click;
        // sending it again could cost a second clip.
        work.push(
          update(s.id, {
            video_status: "failed",
            video_error: "interrupted",
            leased_until: null,
          })
        )
      if (s.keyframe_status === "working")
        work.push(
          update(s.id, { keyframe_status: "queued", leased_until: null })
        )
      if (s.voice_status === "working")
        work.push(update(s.id, { voice_status: "queued", leased_until: null }))
      return work
    })
  )
}

export const isActive = (s: ShotRow) =>
  s.keyframe_status === "queued" ||
  s.keyframe_status === "working" ||
  s.voice_status === "queued" ||
  s.voice_status === "working" ||
  s.video_status === "queued" ||
  s.video_status === "submitting" ||
  s.video_status === "rendering"

// One round over an episode's shots. True while there's work left.
export async function pass(p: Provider, e: EpisodeRow) {
  let shots = await loadShots(e.id)
  if (e.status === "directing") {
    await directStep(p, e, shots)
    return true
  }
  await reap(shots)

  const queuedFrames = shots.filter((s) => s.keyframe_status === "queued")
  const anchors = shots
    .filter((s) => s.keyframe_status === "ready" && s.keyframe_path)
    .slice(0, ANCHORS)
    .map((s) => s.keyframe_path!)
  // The first frame sets the look, so it draws alone and the rest match it.
  await Promise.all(
    queuedFrames
      .slice(0, anchors.length ? PARALLEL_KEYFRAMES : 1)
      .map((s) => runKeyframe(p, e, s, anchors))
  )
  await Promise.all(
    shots
      .filter((s) => s.voice_status === "queued")
      .slice(0, PARALLEL_VOICES)
      .map((s) => runVoice(p, e, s))
  )

  shots = await loadShots(e.id)
  // A clip can't start without its first frame.
  await Promise.all(
    shots
      .filter(
        (s) => s.video_status === "queued" && s.keyframe_status === "failed"
      )
      .map((s) =>
        update(s.id, { video_status: "failed", video_error: "keyframe_failed" })
      )
  )
  const rendering = shots.filter((s) => s.video_status === "rendering")
  await Promise.all(rendering.map((s) => pollVideo(p, e, s)))
  const ready = shots.filter(
    (s) => s.video_status === "queued" && s.keyframe_status === "ready"
  )
  await Promise.all(
    ready
      .slice(0, Math.max(0, MAX_RENDERING - rendering.length))
      .map((s) => submitVideo(p, e, s))
  )
  return (await loadShots(e.id)).some(isActive)
}

async function providerFor(userId: string) {
  if (fakeEnabled()) return fakeProvider()
  const connection = await payingConnection(userId)
  return connection ? openRouterProvider(connection) : null
}

// Nothing can run: an unusable account stops the queue instead of retrying
// into the same error every minute.
async function haltQueue(id: string, code: string) {
  const shots = db().from("comic_anime_shots")
  await Promise.all([
    shots
      .update({ keyframe_status: "failed", keyframe_error: code })
      .eq("episode_id", id)
      .eq("keyframe_status", "queued"),
    shots
      .update({ voice_status: "failed", voice_error: code })
      .eq("episode_id", id)
      .eq("voice_status", "queued"),
    shots
      .update({ video_status: "failed", video_error: code })
      .eq("episode_id", id)
      .eq("video_status", "queued"),
  ])
  await db()
    .from("comic_anime_episodes")
    .update({ director_error: code })
    .eq("id", id)
    .eq("status", "directing")
}

export async function advance(id: string, origin: string) {
  const held = await db()
    .from("comic_anime_episodes")
    .update({ leased_until: leaseUntil() })
    .eq("id", id)
    .or(`leased_until.is.null,leased_until.lt.${now()}`)
    .select("*")
    .maybeSingle()
  const start = held.data
  if (!start) return "skipped"
  const deadline = Date.now() + SLICE_MS
  let more = false
  try {
    const provider = await providerFor(start.user_id)
    if (!provider) {
      await haltQueue(id, "needs_openrouter")
      return "halted"
    }
    do {
      const { data: e } = await db()
        .from("comic_anime_episodes")
        .select("*")
        .eq("id", id)
        .maybeSingle()
      if (!e || e.director_error) break
      more = await pass(provider, e)
      if (more) await sleep(PASS_WAIT_MS)
    } while (more && Date.now() < deadline)
  } catch (error) {
    console.error("Anime run failed", id, error)
    const code = failureCode(error)
    if (stopsEverything(code) || start.status === "directing") {
      await haltQueue(id, code)
      more = false
    }
  } finally {
    await db()
      .from("comic_anime_episodes")
      .update({ leased_until: null })
      .eq("id", id)
  }
  if (more) await kick(origin, id)
  return more ? "continued" : "done"
}

const ACTIVE_SHOTS = [
  "keyframe_status.in.(queued,working)",
  "voice_status.in.(queued,working)",
  "video_status.in.(queued,submitting,rendering)",
].join(",")

export async function tick(origin: string) {
  const [{ data: shots }, { data: directing }] = await Promise.all([
    db()
      .from("comic_anime_shots")
      .select("episode_id")
      .or(ACTIVE_SHOTS)
      .limit(500),
    db()
      .from("comic_anime_episodes")
      .select("id")
      .eq("status", "directing")
      .is("director_error", null)
      .limit(20),
  ])
  const ids = [
    ...new Set([
      ...(directing ?? []).map((e) => e.id),
      ...(shots ?? []).map((s) => s.episode_id),
    ]),
  ].slice(0, 20)
  await Promise.all(ids.map((id) => kick(origin, id)))
  return ids.length
}
