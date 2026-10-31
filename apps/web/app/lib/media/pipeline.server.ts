import { COSTS } from "@/lib/credits"
import type { MachineRow, MediaRenditionRow } from "@/lib/database"
import { kick } from "@/lib/deepdive/run.server"
import { leadSchema } from "@/lib/deepdive/model"
import { LIMITS, holdReason } from "@/lib/machines/gate"
import {
  type Item,
  type MediaConfig,
  type OutputPlatform,
  machineConfig,
} from "@/lib/machines/model"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { availableFormats } from "./formats"
import type { FormatId, Rendition, Story } from "./model"
import { kickRender, queueRendition } from "./render.server"
import { machineHold } from "./render"

// Machines and media: a filed post can start a Story, a finished Story starts
// its formats, and a finished format can become a machine draft. Nothing here
// publishes. A draft goes through the machine's mode and gate like any other.
const STALE_MS = 6 * 60_000
const MAX_RESUMED = 8

// One platform post, so one draft. The other formats need a person or a
// publisher of their own, and wait in Studio.
const DRAFTABLE: Partial<Record<FormatId, OutputPlatform>> = {
  linkedin: "linkedin",
}

const dayStart = (now: number) =>
  `${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`

// Runs only pass here once a post has been filed, so a machine with Stories
// turned on still needs something worth saying first.
export async function startMachineStory(
  machine: MachineRow,
  media: MediaConfig,
  item: Item | undefined,
  key: string,
  origin: string
) {
  if (!media.enabled || !media.formats.length || !item) return false
  const admin = supabaseAdmin()
  const dives = () =>
    admin
      .from("comic_deep_dives")
      .select("id", { count: "exact", head: true })
      .eq("machine_id", machine.id)
  const { count: open } = await dives().in("status", ["queued", "running"])
  if (open) return false
  const { count: today } = await dives().gte("created_at", dayStart(Date.now()))
  if ((today ?? 0) >= media.storiesPerDay) return false

  const lead = leadSchema.safeParse(
    item.url.startsWith("https://") ? item.url : item.title
  )
  if (!lead.success) return false
  const job = `machine-story:${machine.id}:${key}`
  const spent = await admin.rpc("spend_credits_for", {
    p_user: machine.user_id,
    p_cost: COSTS.deep_dive,
    p_kind: "deep_dive",
    p_job: job,
  })
  if (spent.error) {
    console.error("Machine story not paid for", machine.id, spent.error.message)
    return false
  }
  const { data, error } = await admin
    .from("comic_deep_dives")
    .insert({
      user_id: machine.user_id,
      lead: lead.data,
      job,
      machine_id: machine.id,
    })
    .select("id")
    .single()
  if (error) {
    await admin.rpc("refund_credits_for", {
      p_user: machine.user_id,
      p_job: job,
    })
    throw new Error(error.message)
  }
  // No kick is fine: the next tick resumes it.
  await kick(origin, data.id).catch((e) =>
    console.error("Machine story kick failed", data.id, e)
  )
  return true
}

// A Story the checks passed, on a machine that still wants its formats.
export async function afterStory(
  storyId: string,
  machineId: string,
  origin: string
) {
  const admin = supabaseAdmin()
  const { data: machine } = await admin
    .from("comic_machines")
    .select("*")
    .eq("id", machineId)
    .maybeSingle()
  if (!machine?.enabled) return
  const config = machineConfig.safeParse(machine.config)
  if (!config.success || !config.data.media.enabled) return
  const offered = availableFormats()
  const formats = config.data.media.formats.filter((f) => offered.includes(f))
  for (const format of formats) {
    const job = `machine-render:${storyId}:${format}`
    const spent = await admin.rpc("spend_credits_for", {
      p_user: machine.user_id,
      p_cost: COSTS.media_render,
      p_kind: "media_render",
      p_job: job,
    })
    // A rerun of this same job has already started this format.
    if (spent.error?.code === "23505") continue
    if (spent.error) {
      console.error("Rendition not paid for", storyId, spent.error.message)
      break
    }
    try {
      await queueRendition(
        {
          user_id: machine.user_id,
          deep_dive_id: storyId,
          format,
          job,
          machine_id: machine.id,
        },
        origin
      )
    } catch (e) {
      console.error("Rendition not queued", storyId, format, e)
      await admin.rpc("refund_credits_for", {
        p_user: machine.user_id,
        p_job: job,
      })
    }
  }
}

const storyItems = (story: Story): Item[] =>
  story.sources.map((s) => ({
    key: s.url,
    source: "Story",
    title: s.title,
    summary: "",
    url: s.url,
    at: Date.now(),
  }))

// Files a finished rendition as a machine draft, under the machine's own rules.
export async function afterRendition(
  row: Pick<MediaRenditionRow, "id" | "machine_id" | "format" | "user_id"> & {
    status: "done" | "review"
    problems: string[]
  },
  rendition: Rendition,
  story: Story
) {
  const platform = DRAFTABLE[row.format]
  if (!platform || !row.machine_id) return
  const admin = supabaseAdmin()
  const { data: machine } = await admin
    .from("comic_machines")
    .select("*")
    .eq("id", row.machine_id)
    .maybeSingle()
  if (!machine?.outputs.some((o) => o.platform === platform)) return
  const config = machineConfig.parse(machine.config)
  const { count: today } = await admin
    .from("comic_machine_drafts")
    .select("id", { count: "exact", head: true })
    .eq("machine_id", machine.id)
    .gte("created_at", dayStart(Date.now()))

  const text = rendition.parts.map((p) => p.text).join("\n\n")
  const evidence = [
    story.article.body,
    ...story.facts.map((f) => `${f.claim} ${f.quote}`),
    ...story.sources.map((s) => s.text),
  ].join("\n")
  const items = storyItems(story)
  const held = machineHold({
    status: row.status,
    problems: row.problems,
    gate: holdReason(text, evidence, items),
    length: text.length,
    limit: LIMITS[platform],
    today: today ?? 0,
    dailyCap: config.dailyCap,
  })
  const auto = machine.publish_mode === "auto" && !held
  const { error } = await admin.from("comic_machine_drafts").insert({
    machine_id: machine.id,
    user_id: machine.user_id,
    signal_id: `rendition:${row.id}`,
    text: text.slice(0, LIMITS[platform]),
    sources: story.sources.slice(0, 10).map((s) => ({
      title: s.title,
      url: s.url,
      source: "Story",
    })),
    link: story.lead.startsWith("https://") ? story.lead : null,
    platform,
    held: machine.publish_mode === "auto" ? held : null,
    status: auto ? "approved" : "new",
  })
  // A rerun of the same rendition has already filed its draft.
  if (error && error.code !== "23505") throw new Error(error.message)
}

// A function that died mid-work leaves its row open with no one to wake it.
// The scheduled tick does, and each run's own limits still end it.
export async function resumeStalled(origin: string) {
  const admin = supabaseAdmin()
  const now = new Date()
  const before = new Date(now.getTime() - STALE_MS).toISOString()
  const free = `leased_until.is.null,leased_until.lt.${now.toISOString()}`
  const [dives, renders] = await Promise.all([
    admin
      .from("comic_deep_dives")
      .select("id")
      .in("status", ["queued", "running"])
      .lt("updated_at", before)
      .or(free)
      .limit(MAX_RESUMED),
    admin
      .from("comic_media_renditions")
      .select("id")
      .in("status", ["queued", "running"])
      .lt("updated_at", before)
      .or(free)
      .limit(MAX_RESUMED),
  ])
  await Promise.all([
    ...(dives.data ?? []).map((d) => kick(origin, d.id)),
    ...(renders.data ?? []).map((r) => kickRender(origin, r.id)),
  ])
}
