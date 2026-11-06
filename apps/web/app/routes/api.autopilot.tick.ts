import { createHash, timingSafeEqual } from "node:crypto"

import { tick } from "@/lib/autopilot/run.server"

import type { Route } from "./+types/api.autopilot.tick"

export const config = { maxDuration: 60 }

const digest = (s: string) => createHash("sha256").update(s).digest()

// Woken once a minute by pg_cron. See the `autopilot` migration.
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.MACHINES_CRON_SECRET?.trim()
  const given = request.headers.get("authorization") ?? ""
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`)))
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json({ kicked: await tick(new URL(request.url).origin) })
}
