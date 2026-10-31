import { createHmac, randomBytes } from "node:crypto"

import { assertPublic } from "@/lib/machines/feeds.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { DeliveryRow, JobRow } from "./database"

export const WEBHOOK_EVENTS = [
  "job.succeeded",
  "job.failed",
  "job.cancelled",
] as const

const MAX_ATTEMPTS = 6
const BATCH = 20
const TIMEOUT_MS = 10_000

export const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`

// `t` is signed too, so a captured delivery can't be replayed later on.
export function signature(secret: string, timestamp: number, body: string) {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")
  return `t=${timestamp},v1=${mac}`
}

const backoff = (attempt: number) => 60_000 * 4 ** Math.min(attempt, 5)

async function deliver(row: DeliveryRow) {
  const db = supabaseAdmin()
  const { data: hook } = await db
    .from("book_webhooks")
    .select("url, secret")
    .eq("id", row.webhook_id)
    .maybeSingle()
  if (!hook) return
  const body = JSON.stringify({
    id: row.id,
    type: row.event,
    created_at: row.created_at,
    data: row.payload,
  })
  let status = 0
  try {
    // Redirects aren't followed: a public URL mustn't hand this off inside.
    const url = new URL(hook.url)
    await assertPublic(url)
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "palmframe-signature": signature(
          hook.secret,
          Math.floor(Date.now() / 1000),
          body
        ),
      },
      body,
    })
    status = res.status
    await res.body?.cancel()
  } catch {
    status = 0
  }
  const ok = status >= 200 && status < 300
  const attempts = row.attempts + 1
  await db
    .from("book_webhook_deliveries")
    .update({
      attempts,
      response_status: status || null,
      status: ok
        ? "delivered"
        : attempts >= MAX_ATTEMPTS
          ? "failed"
          : "pending",
      next_at: new Date(Date.now() + backoff(attempts)).toISOString(),
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
