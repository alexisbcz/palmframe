import type { MachineDraftRow, MachineRow } from "@/lib/database"
import {
  InstagramError,
  existingProfile,
  instagramEnabled,
  postToAccount,
  unpublishPost,
} from "@/lib/instagram.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { lineStopFor, machinesHalted } from "./control.server"
import { withdrawDiscord } from "./discord.server"
import { HOLD_MS, NEEDS_IMAGE, compose, publishOutcome } from "./gate"
import type { MachineOutput, PublishReceipt, RetractReason } from "./model"
import { RETRACTABLE, machineConfig } from "./model"
import { signOff } from "./signature"
import { type LineStop, usesDesk } from "./stance"

const receipt = (
  o: MachineOutput,
  fields: Partial<PublishReceipt>
): PublishReceipt => ({
  accountId: o.accountId,
  platform: o.platform,
  username: o.username,
  url: null,
  postId: null,
  error: null,
  ...fields,
})

async function sendOne(
  draft: MachineDraftRow,
  output: MachineOutput,
  profileId: string | null,
  signature: string
) {
  if (NEEDS_IMAGE.includes(output.platform) && !draft.image_url)
    return receipt(output, { error: "This platform needs a picture." })
  if (!profileId)
    return receipt(output, { error: "That account isn't connected any more." })
  try {
    const result = await postToAccount({
      profileId,
      platform: output.platform,
      accountId: output.accountId,
      text: compose(draft.text, draft.link, output.platform, signature),
      imageUrl: draft.image_url,
      alt: draft.alt,
      // A retry of the same post to the same account can't post it twice.
      idempotencyKey: `machine-${draft.id}-${output.accountId}`,
    })
    return receipt(output, {
      url: result.url,
      postId: result.postId,
      error: result.error,
    })
  } catch (e) {
    if (!(e instanceof InstagramError)) console.error("Machine post failed", e)
    return receipt(output, {
      error: e instanceof InstagramError ? e.message : "Posting failed.",
    })
  }
}

export interface PublishResult {
  published: boolean
  halted: boolean
  // Why a line machine can't publish right now.
  stopped?: LineStop
  errors: PublishReceipt[]
}

// Claims the draft first, so two overlapping runs can't both send it. The halt
// is read on every call, so it also stops a queue that's already draining. A
// halted draft stays approved and goes out once the halt is lifted. So does one
// stopped by its arena's calendar, unless it's stale by then. Machines the desk
// reads only publish words it has read: `approved` alone isn't enough for them.
export async function publishDraft(
  id: string,
  machine: MachineRow
): Promise<PublishResult | null> {
  const nothing = { published: false, halted: false, errors: [] }
  if (await machinesHalted()) return { ...nothing, halted: true }
  const config = machineConfig.safeParse(machine.config)
  const stored = machine.config as { line?: unknown } | null
  const stopped: LineStop | null = config.success
    ? await lineStopFor(machine, config.data, Date.now())
    : stored?.line
      ? "no_calendar"
      : null
  if (stopped) return { ...nothing, stopped }
  const admin = supabaseAdmin()
  let claim = admin
    .from("comic_machine_drafts")
    .update({ status: "publishing" })
    .eq("id", id)
    .eq("machine_id", machine.id)
    .eq("status", "approved")
  if (config.success && usesDesk(config.data))
    claim = claim.in("desk", ["pass", "hold"])
  const { data: draft } = await claim.select("*").maybeSingle()
  if (!draft) return null

  // What a freeze held back is old news once it lifts, and a political post
  // going out days late can read as something else entirely.
  if (
    config.success &&
    config.data.line &&
    Date.now() - Date.parse(draft.created_at) > HOLD_MS
  ) {
    await admin
      .from("comic_machine_drafts")
      .update({ status: "expired" })
      .eq("id", draft.id)
    await withdrawDiscord(draft.id)
    return nothing
  }

  // Accounts that already took this post keep their receipt on a retry.
  const done = draft.receipts.filter((r) => r.postId && !r.error)
  const pending = machine.outputs.filter(
    (o) =>
      (!draft.platform || o.platform === draft.platform) &&
      !done.some((r) => r.accountId === o.accountId)
  )
  let profileId: string | null = null
  if (pending.length && instagramEnabled()) {
    try {
      profileId = await existingProfile(machine.user_id)
    } catch (e) {
      console.error("Machine profile lookup failed", e)
    }
  }
  const signature = signOff(
    config.success ? config.data.language : "en",
    draft.sources
  )
  const sent: PublishReceipt[] = []
  for (const output of pending)
    sent.push(await sendOne(draft, output, profileId, signature))
  const receipts = [...done, ...sent]
  const landed = publishOutcome(machine.public, receipts.length, receipts)
  await admin
    .from("comic_machine_drafts")
    .update({
      status: landed ? "published" : "failed",
      receipts,
      published_at: landed ? new Date().toISOString() : null,
    })
    .eq("id", draft.id)
  return {
    published: landed,
    halted: false,
    errors: receipts.filter((r) => r.error),
  }
}

// Takes a published post back. It leaves the public page and feed at once, and
// a short note stays in its place. Each account is then asked to remove it;
// whatever can't be removed from here is marked for the owner to do by hand.
// Not stopped by the halt: taking something down is what a halt is for.
export async function retractDraft(
  id: string,
  machine: Pick<MachineRow, "id" | "user_id">,
  reason: RetractReason
) {
  const admin = supabaseAdmin()
  const { data: draft } = await admin
    .from("comic_machine_drafts")
    .update({
      status: "retracted",
      retract_reason: reason,
      retracted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("machine_id", machine.id)
    .eq("status", "published")
    .select("*")
    .maybeSingle()
  if (!draft) return null
  await withdrawDiscord(draft.id)
  const receipts: PublishReceipt[] = []
  for (const r of draft.receipts) {
    if (!r.postId || r.error) {
      receipts.push(r)
      continue
    }
    let removed = false
    if (RETRACTABLE[r.platform] && instagramEnabled()) {
      try {
        await unpublishPost({
          postId: r.postId,
          platform: r.platform,
          accountId: r.accountId,
        })
        removed = true
      } catch (e) {
        if (!(e instanceof InstagramError))
          console.error("Machine retract failed", e)
      }
    }
    receipts.push({ ...r, retraction: removed ? "removed" : "manual" })
  }
  await admin
    .from("comic_machine_drafts")
    .update({ receipts })
    .eq("id", draft.id)
  return { manual: receipts.filter((r) => r.retraction === "manual") }
}
