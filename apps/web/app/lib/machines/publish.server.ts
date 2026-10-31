import type { MachineDraftRow, MachineRow } from "@/lib/database"
import {
  InstagramError,
  existingProfile,
  instagramEnabled,
  postToAccount,
} from "@/lib/instagram.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { compose, NEEDS_IMAGE } from "./gate"
import type { MachineOutput, PublishReceipt } from "./model"

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
  profileId: string | null
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
      text: compose(draft.text, draft.link, output.platform),
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

// Claims the draft first, so two overlapping runs can't both send it.
export async function publishDraft(id: string, machine: MachineRow) {
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
  const sent: PublishReceipt[] = []
  for (const output of pending)
    sent.push(await sendOne(draft, output, profileId))
  const receipts = [...done, ...sent]
  // The public page counts as an output, so a post can succeed with no account.
  const landed = machine.public || receipts.some((r) => r.postId && !r.error)
  const failed = receipts.some((r) => r.error) && !landed
  await admin
    .from("comic_machine_drafts")
    .update({
      status: failed || !landed ? "failed" : "published",
      receipts,
      published_at: landed ? new Date().toISOString() : null,
    })
    .eq("id", draft.id)
  return {
    published: landed && !failed,
    errors: receipts.filter((r) => r.error),
  }
}
