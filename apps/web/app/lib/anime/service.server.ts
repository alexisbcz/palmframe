import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database"
import { payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import {
  ANIME_BUCKET,
  ASPECTS,
  DEFAULT_SETTINGS,
  DUB_LANGUAGES,
  LOOKS,
  MAX_SHOTS,
  SOUNDS,
  cleanLines,
  estimate,
  isSetup,
  type EpisodeSettings,
} from "./model"
import { fakeEnabled, videoModels } from "./provider.server"
import { kick, setupOf, settingsOf } from "./run.server"
import type { ShotRow } from "./database"

export class AnimeError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400
  ) {
    super(code)
  }
}

export interface Actor {
  id: string
  supabase: SupabaseClient<Database>
}

const SIGNED_SECONDS = 3_600
const uuid = /^[0-9a-f-]{36}$/i

const episodeOf = async (a: Actor, id: unknown) => {
  if (typeof id !== "string" || !uuid.test(id))
    throw new AnimeError("not_found", 404)
  const { data } = await a.supabase
    .from("comic_anime_episodes")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!data) throw new AnimeError("not_found", 404)
  return data
}

const shotsOf = async (a: Actor, id: string) => {
  const { data, error } = await a.supabase
    .from("comic_anime_shots")
    .select("*")
    .eq("episode_id", id)
    .order("position")
  if (error) throw new AnimeError("failed", 500)
  return data
}

async function requireConnection(a: Actor) {
  if (fakeEnabled()) return
  if (!(await payingConnection(a.id)))
    throw new AnimeError("needs_openrouter", 402)
}

export function cleanSettings(
  value: Partial<EpisodeSettings> | undefined,
  base: EpisodeSettings = DEFAULT_SETTINGS
): EpisodeSettings {
  const v = value ?? {}
  const one = <T>(list: readonly T[], item: unknown, fallback: T) =>
    list.includes(item as T) ? (item as T) : fallback
  const text = (item: unknown, fallback: string) =>
    typeof item === "string" && /^[\w.:/-]{1,100}$/.test(item) ? item : fallback
  const flag = (item: unknown, fallback: boolean) =>
    typeof item === "boolean" ? item : fallback
  return {
    look: one(LOOKS, v.look, base.look),
    aspect: one(ASPECTS, v.aspect, base.aspect),
    videoModel: text(v.videoModel, base.videoModel),
    resolution: text(v.resolution, base.resolution),
    sound: one(SOUNDS, v.sound, base.sound),
    speechModel: text(v.speechModel, base.speechModel),
    dub: one(DUB_LANGUAGES, v.dub, base.dub),
    subtitles: flag(v.subtitles, base.subtitles),
    fades: flag(v.fades, base.fades),
    titleCard: flag(v.titleCard, base.titleCard),
  }
}

export async function createEpisode(
  a: Actor,
  b: {
    title?: string
    rtl?: boolean
    projectId?: string
    rights?: boolean
    settings?: Partial<EpisodeSettings>
  }
) {
  const project =
    typeof b.projectId === "string" && uuid.test(b.projectId)
      ? b.projectId
      : null
  // An uploaded comic may be someone else's, and adapting it is on the person
  // uploading, who says so first. Their own Palmframe project needs no such word.
  if (!project && b.rights !== true) throw new AnimeError("rights_required")
  await requireConnection(a)
  if (project) {
    const { data: own } = await a.supabase
      .from("comic_projects")
      .select("id")
      .eq("id", project)
      .maybeSingle()
    if (!own) throw new AnimeError("not_found", 404)
  }
  const { data, error } = await supabaseAdmin()
    .from("comic_anime_episodes")
    .insert({
      user_id: a.id,
      title: String(b.title ?? "")
        .trim()
        .slice(0, 120),
      source: project ? "project" : "file",
      project_id: project,
      rtl: b.rtl === true,
      rights_confirmed_at: project ? null : new Date().toISOString(),
      settings: cleanSettings(b.settings),
    })
    .select("id")
    .single()
  if (error) throw new AnimeError("failed", 500)
  return { id: data.id, folder: `${a.id}/${data.id}/panels` }
}

export async function addPanels(
  a: Actor,
  id: unknown,
  panels: { path?: unknown; page?: unknown; hint?: unknown }[]
) {
  const e = await episodeOf(a, id)
  if (e.status !== "uploading") throw new AnimeError("conflict", 409)
  if (!Array.isArray(panels) || !panels.length || panels.length > MAX_SHOTS)
    throw new AnimeError("too_many_shots")
  const folder = `${a.id}/${e.id}/panels/`
  const rows = panels.map((p, position) => {
    const path = String(p.path ?? "")
    if (!path.startsWith(folder) || path.includes(".."))
      throw new AnimeError("invalid")
    return {
      episode_id: e.id,
      user_id: a.id,
      position,
      page: Math.max(0, Math.trunc(Number(p.page)) || 0),
      panel_path: path,
      hint: String(p.hint ?? "").slice(0, 4000),
    }
  })
  const { error } = await supabaseAdmin().from("comic_anime_shots").insert(rows)
  if (error) throw new AnimeError("failed", 500)
  await supabaseAdmin()
    .from("comic_anime_episodes")
    .update({ status: "directing" })
    .eq("id", e.id)
  return { ok: true }
}

// Links stay valid for an hour; the UI keeps the first it gets for each path.
async function signedLinks(paths: string[]) {
  if (!paths.length) return {}
  const { data } = await supabaseAdmin()
    .storage.from(ANIME_BUCKET)
    .createSignedUrls(paths, SIGNED_SECONDS)
  return Object.fromEntries(
    (data ?? []).flatMap((d) =>
      d.path && d.signedUrl ? [[d.path, d.signedUrl]] : []
    )
  )
}

const shotFiles = (s: ShotRow) =>
  [s.panel_path, s.keyframe_path, s.voice_path, s.video_path].filter(
    (p): p is string => !!p
  )

export async function status(a: Actor, id: unknown, known: string[] = []) {
  const episode = await episodeOf(a, id)
  const shots = await shotsOf(a, episode.id)
  const have = new Set(known)
  const paths = [
    ...shots.flatMap(shotFiles),
    ...(episode.final_path ? [episode.final_path] : []),
  ].filter((p) => !have.has(p))
  return {
    episode: { ...episode, settings: settingsOf(episode) },
    shots: shots.map((s) => ({ ...s, camera: setupOf(s) })),
    links: await signedLinks(paths),
  }
}

export async function updateEpisode(
  a: Actor,
  id: unknown,
  patch: {
    title?: unknown
    settings?: Partial<EpisodeSettings>
    cast?: unknown
  }
) {
  const e = await episodeOf(a, id)
  const update: Database["public"]["Tables"]["comic_anime_episodes"]["Update"] =
    {}
  if (typeof patch.title === "string") update.title = patch.title.slice(0, 120)
  if (patch.settings)
    update.settings = cleanSettings(patch.settings, settingsOf(e))
  if (Array.isArray(patch.cast))
    update.cast_list = patch.cast.slice(0, 60).map((c) => ({
      name: String(c?.name ?? "").slice(0, 60),
      description: String(c?.description ?? "").slice(0, 500),
      voice: String(c?.voice ?? "").slice(0, 40),
    }))
  const { error } = await supabaseAdmin()
    .from("comic_anime_episodes")
    .update(update)
    .eq("id", e.id)
  if (error) throw new AnimeError("failed", 500)
  return { ok: true }
}

export async function updateShot(
  a: Actor,
  id: unknown,
  shot: unknown,
  patch: Record<string, unknown>
) {
  const e = await episodeOf(a, id)
  const update: Partial<ShotRow> = {}
  if (typeof patch.action === "string")
    update.action = patch.action.slice(0, 2000)
  if (typeof patch.skip === "boolean") update.skip = patch.skip
  if (typeof patch.duration === "number")
    update.duration = Math.min(30, Math.max(1, Math.round(patch.duration)))
  if (isSetup(patch.camera)) update.camera = patch.camera
  if (patch.dialogue !== undefined) {
    update.dialogue = cleanLines(patch.dialogue)
    // Spoken words changed, so the old take no longer matches.
    update.voice_status = "none"
    update.voice_error = null
  }
  const { error } = await supabaseAdmin()
    .from("comic_anime_shots")
    .update(update)
    .eq("id", String(shot))
    .eq("episode_id", e.id)
  if (error) throw new AnimeError("failed", 500)
  return { ok: true }
}

export async function reorder(a: Actor, id: unknown, order: unknown) {
  const e = await episodeOf(a, id)
  const shots = await shotsOf(a, e.id)
  const ids = new Set(shots.map((s) => s.id))
  if (
    !Array.isArray(order) ||
    order.length !== ids.size ||
    new Set(order).size !== ids.size ||
    !order.every((o) => ids.has(o))
  )
    throw new AnimeError("invalid")
  await Promise.all(
    order.map((shot, position) =>
      supabaseAdmin()
        .from("comic_anime_shots")
        .update({ position })
        .eq("id", shot)
        .eq("episode_id", e.id)
    )
  )
  return { ok: true }
}

type Stage = "keyframes" | "voices" | "videos"

// Which stages a shot still needs for what was asked. Done work stays done
// unless the person asked for this one shot again.
export function plan(s: ShotRow, stage: Stage, redo: boolean, spoken: boolean) {
  const patch: Partial<ShotRow> = {}
  const open = (status: string) =>
    redo || status === "none" || status === "failed"
  const needsFrame = s.keyframe_status !== "ready"
  if (stage === "keyframes") {
    if (
      s.keyframe_status !== "queued" &&
      s.keyframe_status !== "working" &&
      open(s.keyframe_status)
    )
      Object.assign(patch, { keyframe_status: "queued", keyframe_error: null })
    return patch
  }
  if (stage === "voices") {
    if (
      spoken &&
      s.dialogue.length &&
      s.voice_status !== "queued" &&
      s.voice_status !== "working" &&
      open(s.voice_status)
    )
      Object.assign(patch, { voice_status: "queued", voice_error: null })
    return patch
  }
  if (
    s.video_status === "queued" ||
    s.video_status === "submitting" ||
    s.video_status === "rendering" ||
    !open(s.video_status)
  )
    return patch
  Object.assign(patch, {
    video_status: "queued",
    video_error: null,
    video_job: null,
  })
  if (
    needsFrame &&
    s.keyframe_status !== "queued" &&
    s.keyframe_status !== "working"
  )
    Object.assign(patch, { keyframe_status: "queued", keyframe_error: null })
  if (
    spoken &&
    s.dialogue.length &&
    (s.voice_status === "none" || s.voice_status === "failed")
  )
    Object.assign(patch, { voice_status: "queued", voice_error: null })
  return patch
}

export async function quote(a: Actor, id: unknown) {
  const e = await episodeOf(a, id)
  const settings = settingsOf(e)
  const model = (await videoModels()).find((m) => m.id === settings.videoModel)
  const shots = await shotsOf(a, e.id)
  const todo = shots.filter(
    (s) => !s.skip && ["none", "failed"].includes(s.video_status)
  )
  return {
    shots: todo.length,
    ...estimate(
      model,
      settings,
      todo.map((s) => s.duration)
    ),
  }
}

export async function start(
  a: Actor,
  id: unknown,
  origin: string,
  b: { stage?: unknown; shots?: unknown; maxUsd?: unknown }
) {
  const e = await episodeOf(a, id)
  if (e.status !== "ready") throw new AnimeError("conflict", 409)
  await requireConnection(a)
  const stage = b.stage as Stage
  if (!["keyframes", "voices", "videos"].includes(stage))
    throw new AnimeError("invalid")
  const settings = settingsOf(e)
  const model = (await videoModels()).find((m) => m.id === settings.videoModel)
  if (!model && stage === "videos")
    throw new AnimeError("model_unavailable", 409)
  const named = Array.isArray(b.shots) ? new Set(b.shots as string[]) : null
  const shots = (await shotsOf(a, e.id)).filter((s) =>
    named ? named.has(s.id) : !s.skip
  )
  const spoken = settings.sound === "voices"
  const work = shots.flatMap((s) => {
    const patch = plan(s, stage, !!named, spoken)
    return Object.keys(patch).length ? [{ s, patch }] : []
  })
  if (!work.length) return { queued: 0 }
  // What the person agreed to. A price that moved past it stops here.
  if (stage === "videos") {
    const cost = estimate(
      model,
      settings,
      work.map((w) => w.s.duration)
    )
    if (typeof b.maxUsd !== "number" || cost.usd > b.maxUsd + 0.005)
      throw new AnimeError("price_changed", 409)
  }
  await Promise.all(
    work.map(({ s, patch }) =>
      supabaseAdmin().from("comic_anime_shots").update(patch).eq("id", s.id)
    )
  )
  await kick(origin, e.id)
  return { queued: work.length }
}

export async function resume(a: Actor, id: unknown, origin: string) {
  const e = await episodeOf(a, id)
  await requireConnection(a)
  if (e.status === "directing") {
    await supabaseAdmin()
      .from("comic_anime_episodes")
      .update({ director_error: null })
      .eq("id", e.id)
  }
  await kick(origin, e.id)
  return { ok: true }
}

export async function cancel(a: Actor, id: unknown) {
  const e = await episodeOf(a, id)
  const shots = supabaseAdmin().from("comic_anime_shots")
  // A job the provider already took can't be called back.
  await Promise.all([
    shots
      .update({ keyframe_status: "none" })
      .eq("episode_id", e.id)
      .eq("keyframe_status", "queued"),
    shots
      .update({ voice_status: "none" })
      .eq("episode_id", e.id)
      .eq("voice_status", "queued"),
    shots
      .update({ video_status: "none" })
      .eq("episode_id", e.id)
      .eq("video_status", "queued"),
  ])
  return { ok: true }
}

export async function finalTarget(a: Actor, id: unknown) {
  const e = await episodeOf(a, id)
  const path = `${a.id}/${e.id}/final/${Date.now()}.mp4`
  const { data, error } = await supabaseAdmin()
    .storage.from(ANIME_BUCKET)
    .createSignedUploadUrl(path)
  if (error) throw new AnimeError("failed", 500)
  return { path, url: data.signedUrl }
}

export async function finalDone(a: Actor, id: unknown, path: unknown) {
  const e = await episodeOf(a, id)
  const folder = `${a.id}/${e.id}/final/`
  if (
    typeof path !== "string" ||
    !path.startsWith(folder) ||
    path.includes("..")
  )
    throw new AnimeError("invalid")
  await supabaseAdmin()
    .from("comic_anime_episodes")
    .update({ final_path: path, final_at: new Date().toISOString() })
    .eq("id", e.id)
  if (e.final_path)
    await supabaseAdmin().storage.from(ANIME_BUCKET).remove([e.final_path])
  return { ok: true }
}

export async function deleteEpisode(a: Actor, id: unknown) {
  const e = await episodeOf(a, id)
  const shots = await shotsOf(a, e.id)
  const storage = supabaseAdmin().storage.from(ANIME_BUCKET)
  const files = [
    ...shots.flatMap(shotFiles),
    ...(e.final_path ? [e.final_path] : []),
  ]
  for (let i = 0; i < files.length; i += 500)
    await storage.remove(files.slice(i, i + 500))
  await a.supabase.from("comic_anime_episodes").delete().eq("id", e.id)
  return { ok: true }
}

export async function modelsFor(a: Actor) {
  const [models, connection] = await Promise.all([
    videoModels(),
    fakeEnabled() ? Promise.resolve(true) : payingConnection(a.id),
  ])
  return { models, connected: !!connection }
}
