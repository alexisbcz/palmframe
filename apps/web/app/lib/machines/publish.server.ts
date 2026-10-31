import type { MachineDraftRow, MachineRow } from "@/lib/database"
import {
  InstagramError,
  existingProfile,
  instagramEnabled,
  postToAccount,
} from "@/lib/instagram.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { machinesHalted } from "./control.server"
import { NEEDS_IMAGE, compose, publishOutcome } from "./gate"
import type { MachineOutput, PublishReceipt } from "./model"
import { machineConfig } from "./model"
import { signatureFor } from "./signature"

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

// Claims the draft first, so two overlapping runs can't both send it. The halt
// is read on every call, so it also stops a queue that's already draining. A
// halted draft stays approved and goes out once the halt is lifted.
export async function publishDraft(id: string, machine: MachineRow) {
  if (await machinesHalted())
    return { published: false, halted: true, errors: [] as PublishReceipt[] }
  const admin = supabaseAdmin()
  const { data: draft } = await admin
    .from("comic_machine_drafts")
    .update({ status: "publishing" })
    .eq("id", id)
    .eq("machine_id", machine.id)
    .eq("status", "approved")
    .select("*")
    .maybeSingle()
  if (!draft) return null

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
  const config = machineConfig.safeParse(machine.config)
  const signature = signatureFor(config.success ? config.data.language : "en")
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
