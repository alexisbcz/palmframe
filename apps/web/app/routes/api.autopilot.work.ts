import { createHash, timingSafeEqual } from "node:crypto"

import { runSlice, type WakeRequest } from "@/lib/autopilot/run.server"

import type { Route } from "./+types/api.autopilot.work"

// The runner stores the session after SLICE_MS (230 s) and hands over.
export const config = { maxDuration: 300 }

const digest = (s: string) => createHash("sha256").update(s).digest()

// One slice of one agent's work. It spends real money, so it shares the
// runner's secret.
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.MACHINES_CRON_SECRET?.trim()
  const given = request.headers.get("authorization") ?? ""
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`)))
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as {
    id?: string
    wake?: WakeRequest
  } | null
  if (!body?.id || !body.wake)
    return Response.json({ error: "Invalid" }, { status: 400 })
  return Response.json({
    result: await runSlice(body.id, body.wake, new URL(request.url).origin),
  })
}
