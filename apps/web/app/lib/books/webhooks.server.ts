import { createHmac, randomBytes } from "node:crypto"

import { sendPublic } from "@/lib/machines/feeds.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { DeliveryRow, JobRow } from "./database"

export const WEBHOOK_EVENTS = [
  "job.succeeded",
  "job.failed",
  "job.cancelled",
] as const

const MAX_ATTEMPTS = 6
const BATCH = 20

export const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`

// `t` is signed too, so a captured delivery can't be replayed later on.
export function signature(secret: string, timestamp: number, body: string) {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")
  return `t=${timestamp},v1=${mac}`
}

const backoff = (attempt: number) => 60_000 * 4 ** Math.min(attempt, 5)

// Claimed before sending, on the attempt count, so the tick and a job ending
// can't both send it. A crash after this retries at the backoff: at least once.
export async function claimDelivery(row: DeliveryRow) {
  const attempts = row.attempts + 1
  const { data } = await supabaseAdmin()
    .from("book_webhook_deliveries")
    .update({
      attempts,
      next_at: new Date(Date.now() + backoff(attempts)).toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("attempts", row.attempts)
    .select("id")
  return !!data?.length
}

async function deliver(row: DeliveryRow) {
  const db = supabaseAdmin()
  const { data: hook } = await db
    .from("book_webhooks")
    .select("url, secret")
    .eq("id", row.webhook_id)
    .maybeSingle()
  if (!hook) return
  if (!(await claimDelivery(row))) return
  const body = JSON.stringify({
    id: row.id,
    type: row.event,
    created_at: row.created_at,
    data: row.payload,
  })
  let status = 0
  try {
    // Connects to the address it checked, so a host can't pass the check and
    // then resolve somewhere private. Redirects aren't followed.
    const res = await sendPublic(hook.url, {
      method: "POST",
      hosts: [new URL(hook.url).hostname],
      body,
      headers: {
        "palmframe-signature": signature(
          hook.secret,
          Math.floor(Date.now() / 1000),
          body
        ),
      },
    })
    status = res.status
  } catch {
    status = 0
  }
  const ok = status >= 200 && status < 300
  await db
    .from("book_webhook_deliveries")
    .update({
      response_status: status || null,
      status: ok
        ? "delivered"
        : row.attempts + 1 >= MAX_ATTEMPTS
          ? "failed"
          : "pending",
    })
    .eq("id", row.id)
}

export async function deliverDue() {
  const { data } = await supabaseAdmin()
    .from("book_webhook_deliveries")
    .select("*")
    .eq("status", "pending")
    .lte("next_at", new Date().toISOString())
    .order("next_at")
    .limit(BATCH)
  await Promise.all((data ?? []).map(deliver))
}

export async function emitEvent(event: string, job: JobRow) {
  // Quiet bookkeeping nobody subscribes to; failures never touch the job.
  try {
    const db = supabaseAdmin()
    const { data: hooks } = await db
      .from("book_webhooks")
      .select("id, events")
      .eq("user_id", job.user_id)
    const targets = (hooks ?? []).filter((h) => h.events.includes(event))
    if (!targets.length) return
    const { data: rows } = await db
      .from("book_webhook_deliveries")
      .insert(
        targets.map((h) => ({
          webhook_id: h.id,
          user_id: job.user_id,
          event,
          payload: {
            job_id: job.id,
            book_id: job.book_id,
            kind: job.kind,
            status: job.status,
            error: job.error,
            credits_used: job.credits_used,
          },
        }))
      )
      .select("*")
    await Promise.all((rows ?? []).map(deliver))
  } catch (e) {
    console.error("Webhook event failed", event, job.id, e)
  }
}
