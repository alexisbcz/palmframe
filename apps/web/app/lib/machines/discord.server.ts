import type { MachineDiscordRow, MachineRow } from "@/lib/database"
import {
  openSecret,
  sealSecret,
  secretsAvailable,
} from "@/lib/secret-box.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { lineStopFor, machinesHalted } from "./control.server"
import {
  type DiscordOutcome,
  DISCORD_HOSTS,
  MAX_DISCORD_ATTEMPTS,
  type Webhook,
  discordMessage,
  parseWebhook,
  readOutcome,
  retryDelay,
  testMessage,
} from "./discord"
import { sendPublic } from "./feeds.server"
import { HOLD_MS } from "./gate"
import { machineConfig } from "./model"
import { signOff } from "./signature"
import { usesDesk } from "./stance"

// Long enough for a send to finish. A run that dies mid-send leaves its post to be
// tried again after this, which may repeat a message: better than losing it.
const LEASE_MS = 2 * 60_000
const FREEZE_RETRY_MS = 15 * 60_000
const TEST_GAP_MS = 10_000
const MAX_PER_RUN = 20
const MAX_SWEPT_MACHINES = 500

const draftsTable = () => supabaseAdmin().from("comic_machine_drafts")

type Machine = Pick<MachineRow, "id" | "name" | "config" | "public">

// What a page may know about a webhook. The URL isn't here on purpose.
export type DiscordOutput = Pick<MachineDiscordRow, "machine_id" | "state"> & {
  hint: string
}

export const discordReady = secretsAvailable

export async function discordOutputs(userId: string) {
  if (!discordReady()) return [] as DiscordOutput[]
  const { data } = await supabaseAdmin()
    .from("comic_machine_discord")
    .select("machine_id, state, webhook_hint")
    .eq("user_id", userId)
  return (data ?? []).map((d): DiscordOutput => ({
    machine_id: d.machine_id,
    state: d.state,
    hint: d.webhook_hint,
  }))
}

export async function connectDiscord(
  machine: { id: string; user_id: string },
  webhook: Webhook
) {
  const { error } = await supabaseAdmin()
    .from("comic_machine_discord")
    .upsert(
      {
        machine_id: machine.id,
        user_id: machine.user_id,
        webhook_ciphertext: sealSecret(webhook.url),
        webhook_hint: webhook.hint,
        state: "active",
        retry_at: null,
      },
      { onConflict: "machine_id" }
    )
  return !error
}

export async function removeDiscord(machineId: string) {
  const admin = supabaseAdmin()
  await admin
    .from("comic_machine_drafts")
    .update({ discord_status: "withdrawn" })
    .eq("machine_id", machineId)
    .eq("discord_status", "pending")
  const { error } = await admin
    .from("comic_machine_discord")
    .delete()
    .eq("machine_id", machineId)
  return !error
}

async function hook(machineId: string) {
  const { data, error } = await supabaseAdmin()
    .from("comic_machine_discord")
    .select("webhook_ciphertext, state, retry_at, last_test_at")
    .eq("machine_id", machineId)
    .maybeSingle()
  return error ? null : data
}

export async function hasDiscord(machineId: string) {
  if (!discordReady()) return false
  return (await hook(machineId))?.state === "active"
}

// The stored value is checked again: this is the last step before a request, and
// nothing that isn't a Discord webhook goes out, whatever the table holds.
const stored = (ciphertext: string) => {
  try {
    return parseWebhook(openSecret(ciphertext))
  } catch {
    return null
  }
}

const disable = (machineId: string) =>
  supabaseAdmin()
    .from("comic_machine_discord")
    .update({ state: "disabled", retry_at: null })
    .eq("machine_id", machineId)

// Everything Discord can answer goes through here. Neither the URL nor a raw error
// goes in a log, because either can carry the token.
async function call(
  url: string,
  method: "POST" | "DELETE",
  body?: object
): Promise<DiscordOutcome> {
  try {
    return readOutcome(
      await sendPublic(url, {
        method,
        hosts: DISCORD_HOSTS,
        body: body && JSON.stringify(body),
      })
    )
  } catch (e) {
    console.error(
      "Discord request failed",
      (e as { code?: string })?.code ?? (e as Error)?.name
    )
    return { kind: "retry" }
  }
}

const rest = (machineId: string, ms: number) =>
  supabaseAdmin()
    .from("comic_machine_discord")
    .update({ retry_at: new Date(Date.now() + ms).toISOString() })
    .eq("machine_id", machineId)

export type TestResult =
  "sent" | "missing" | "gone" | "failed" | "halted" | { wait: number }

// Sends a fixed sentence, so it has no gate or desk to pass. A halt stops it all
// the same, since a halt means nothing leaves.
export async function testDiscord(machine: Machine): Promise<TestResult> {
  if (await machinesHalted()) return "halted"
  const row = await hook(machine.id)
  const webhook =
    row && row.state === "active" && stored(row.webhook_ciphertext)
  if (!webhook) return "missing"
  const seconds = (ms: number) => ({ wait: Math.ceil(ms / 1000) })
  const now = Date.now()
  const wait = Math.max(
    row.retry_at ? Date.parse(row.retry_at) - now : 0,
    row.last_test_at ? Date.parse(row.last_test_at) + TEST_GAP_MS - now : 0
  )
  if (wait > 0) return seconds(wait)
  const admin = supabaseAdmin()
  await admin
    .from("comic_machine_discord")
    .update({ last_test_at: new Date(now).toISOString() })
    .eq("machine_id", machine.id)
  const config = machineConfig.safeParse(machine.config)
  const outcome = await call(
    webhook.url,
    "POST",
    testMessage(machine.name, config.success ? config.data.language : "en")
  )
  if (outcome.kind === "sent") return "sent"
  if (outcome.kind === "gone") {
    await disable(machine.id)
    return "gone"
  }
  if (outcome.kind === "wait") {
    await rest(machine.id, outcome.ms)
    return seconds(outcome.ms)
  }
  return "failed"
}

// Puts a post on its way, unless it already is. Only for words that passed.
async function queue(id: string, machine: Machine) {
  if (!(await hasDiscord(machine.id))) return false
  const admin = supabaseAdmin()
  const { data } = await admin
    .from("comic_machine_drafts")
    .select("discord_status")
    .eq("id", id)
    .maybeSingle()
  const status = data?.discord_status
  if (status && status !== "withdrawn" && status !== "failed") return false
  const { error } = await admin
    .from("comic_machine_drafts")
    .update({
      discord_status: "pending",
      discord_attempts: 0,
      discord_message_id: null,
      discord_webhook_id: null,
      discord_next_at: new Date().toISOString(),
    })
    .eq("id", id)
  return !error
}

// For a person pressing a button: the post goes now, not on the next run. Anything
// going wrong here costs the Discord message, never what the person asked for.
export async function carryToDiscord(id: string, machine: Machine) {
  try {
    if (await queue(id, machine)) await deliverDiscord(id, machine)
  } catch (e) {
    console.error("Discord delivery failed", (e as Error)?.name)
  }
}

type Delivery = "sent" | "skipped" | "busy"

// One post, one try. Whatever waited since it was queued is looked at again here:
// a halt, a freeze, a dismissal, a block, a webhook that went away.
export async function deliverDiscord(
  id: string,
  machine: Machine
): Promise<Delivery> {
  if (await machinesHalted()) return "busy"
  const admin = supabaseAdmin()
  const { data: draft } = await admin
    .from("comic_machine_drafts")
    .select(
      "id, text, link, sources, status, held, desk, created_at, discord_status, discord_attempts"
    )
    .eq("id", id)
    .eq("machine_id", machine.id)
    .maybeSingle()
  if (!draft || draft.discord_status !== "pending") return "skipped"
  const setDraft = (
    fields: Parameters<ReturnType<typeof draftsTable>["update"]>[0]
  ) => draftsTable().update(fields).eq("id", id)
  const giveUp = () => setDraft({ discord_status: "failed" })
  const config = machineConfig.safeParse(machine.config)
  const gone =
    !config.success ||
    draft.held != null ||
    ((usesDesk(config.data) || draft.desk != null) && draft.desk !== "pass") ||
    ["blocked", "dismissed", "expired", "retracted"].includes(draft.status)
  if (gone) {
    await setDraft({ discord_status: "withdrawn" })
    return "skipped"
  }
  const now = Date.now()
  if (now - Date.parse(draft.created_at) > HOLD_MS) {
    await giveUp()
    return "skipped"
  }
  if (await lineStopFor(machine, config.data, now)) {
    await setDraft({
      discord_next_at: new Date(now + FREEZE_RETRY_MS).toISOString(),
    })
    return "skipped"
  }
  const row = await hook(machine.id)
  if (!row) {
    await setDraft({ discord_status: "withdrawn" })
    return "skipped"
  }
  const webhook = stored(row.webhook_ciphertext)
  if (row.state !== "active" || !webhook) {
    if (!webhook) await disable(machine.id)
    await giveUp()
    return "skipped"
  }
  if (row.retry_at && Date.parse(row.retry_at) > now) {
    await setDraft({ discord_next_at: row.retry_at })
    return "skipped"
  }

  // Claims the try, so an overlapping run can't send it as well.
  const before = draft.discord_attempts
  const attempts = before + 1
  const { data: claimed } = await setDraft({
    discord_attempts: attempts,
    discord_next_at: new Date(now + LEASE_MS).toISOString(),
  })
    .eq("discord_status", "pending")
    .eq("discord_attempts", before)
    .select("id")
  if (!claimed?.length) return "skipped"

  const outcome = await call(
    `${webhook.url}?wait=true`,
    "POST",
    discordMessage({
      text: draft.text,
      link: draft.link,
      signature: signOff(config.data.language, draft.sources),
      machine: machine.name,
      language: config.data.language,
    })
  )
  switch (outcome.kind) {
    case "sent": {
      const { data: kept } = await setDraft({
        discord_status: "sent",
        discord_message_id: outcome.messageId,
        discord_webhook_id: webhook.id,
        discord_next_at: null,
      })
        .eq("discord_status", "pending")
        .select("id")
      // Taken back while this was in the air, so it comes straight out again.
      if (!kept?.length) {
        await setDraft({
          discord_status: "sent",
          discord_message_id: outcome.messageId,
          discord_webhook_id: webhook.id,
        })
        await withdrawDiscord(id)
      }
      await admin
        .from("comic_machine_discord")
        .update({ last_sent_at: new Date().toISOString(), retry_at: null })
        .eq("machine_id", machine.id)
      return "sent"
    }
    case "wait": {
      await rest(machine.id, outcome.ms)
      // Being asked to wait isn't a failed try.
      await setDraft({
        discord_attempts: before,
        discord_next_at: new Date(now + outcome.ms).toISOString(),
      })
      return outcome.global ? "busy" : "skipped"
    }
    case "gone":
      await disable(machine.id)
      await giveUp()
      return "skipped"
    case "refused":
    case "no_message":
      await giveUp()
      return "skipped"
    case "retry":
      if (attempts >= MAX_DISCORD_ATTEMPTS) await giveUp()
      else
        await setDraft({
          discord_next_at: new Date(now + retryDelay(attempts)).toISOString(),
        })
      return "skipped"
  }
}

// Whatever is due, for the machines that are on. A machine turned off keeps its
// queue until it's back, when anything too old has gone stale.
export async function flushDiscord(
  machines: MachineRow[],
  deadline: number
): Promise<number> {
  if (!discordReady() || !machines.length) return 0
  const byId = new Map(machines.map((m) => [m.id, m]))
  const { data } = await draftsTable()
    .select("id, machine_id")
    .eq("discord_status", "pending")
    .lte("discord_next_at", new Date().toISOString())
    .in("machine_id", [...byId.keys()])
    .order("created_at")
    .limit(MAX_PER_RUN)
  let sent = 0
  for (const row of data ?? []) {
    if (Date.now() > deadline) break
    const machine = byId.get(row.machine_id)
    if (!machine) continue
    const result = await deliverDiscord(row.id, machine).catch((e) => {
      console.error("Discord delivery failed", (e as Error)?.name)
      return "skipped" as const
    })
    if (result === "busy") break
    if (result === "sent") sent++
  }
  return sent
}

// Compose links work for as long as a message stays up, so what the desk and the
// calendar decided before sending has to be looked at again afterwards. A line
// machine's messages come out when a freeze starts, or when they've gone stale.
// It reads every line machine, on or off: turning one off doesn't end a freeze.
export async function sweepDiscord(now: number, deadline: number) {
  if (!discordReady()) return
  const admin = supabaseAdmin()
  const columns = "id, public, config"
  const { data: lined } = await admin
    .from("comic_machines")
    .select(columns)
    .not("config->>line", "is", null)
    .limit(MAX_SWEPT_MACHINES)
  const { data: left } = await admin
    .from("comic_machine_line_notes")
    .select("machine_id")
    .is("to_stance", null)
    .gte("created_at", new Date(now - HOLD_MS).toISOString())
  const ids = (left ?? []).flatMap((n) => n.machine_id ?? [])
  const { data: dropped } = ids.length
    ? await admin.from("comic_machines").select(columns).in("id", ids)
    : { data: [] }
  const stale = new Date(now - HOLD_MS).toISOString()
  for (const machine of [...(lined ?? []), ...(dropped ?? [])]) {
    const config = machineConfig.safeParse(machine.config)
    const stopped =
      !config.success || (await lineStopFor(machine, config.data, now))
    const sent = draftsTable()
      .select("id")
      .eq("machine_id", machine.id)
      .eq("discord_status", "sent")
    const { data } = await (stopped ? sent : sent.lt("created_at", stale))
      .order("created_at")
      .limit(MAX_PER_RUN)
    for (const { id } of data ?? []) {
      if (Date.now() > deadline) return
      await withdrawDiscord(id)
    }
  }
}

// Takes a post back out of the channel, or at least out of the queue. Not stopped
// by a halt, like a retraction. A message that can't be removed is marked, so the
// page can ask a person to delete it. So is one sent through a webhook the machine
// no longer has: only that webhook can delete it, and asking the new one could come
// back as "no such message", which would read as removed.
export async function withdrawDiscord(id: string) {
  try {
    const { data: draft } = await draftsTable()
      .select(
        "machine_id, discord_status, discord_message_id, discord_webhook_id"
      )
      .eq("id", id)
      .maybeSingle()
    if (!draft) return
    const { discord_status: status, discord_message_id: messageId } = draft
    if (status !== "pending" && status !== "sent" && status !== "left") return
    const row = status === "pending" ? null : await hook(draft.machine_id)
    const webhook = row && stored(row.webhook_ciphertext)
    let removed = status === "pending"
    if (webhook && messageId && webhook.id === draft.discord_webhook_id) {
      const outcome = await call(
        `${webhook.url}/messages/${messageId}`,
        "DELETE"
      )
      removed = outcome.kind === "sent" || outcome.kind === "no_message"
    }
    await draftsTable()
      .update({
        discord_status: removed ? "withdrawn" : "left",
        discord_next_at: null,
        ...(removed && { discord_message_id: null }),
      })
      .eq("id", id)
  } catch (e) {
    console.error("Discord withdrawal failed", (e as Error)?.name)
  }
}
