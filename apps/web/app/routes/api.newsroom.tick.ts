import { createHash, timingSafeEqual } from "node:crypto"

import { tick } from "@/lib/newsroom/beats.server"

import type { Route } from "./+types/api.newsroom.tick"

export const config = { maxDuration: 60 }

const digest = (s: string) => createHash("sha256").update(s).digest()

// Woken once a minute by pg_cron. See the `newsroom-tick` migration.
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.MACHINES_CRON_SECRET?.trim()
  const given = request.headers.get("authorization") ?? ""
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`)))
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json({ done: await tick(new URL(request.url).origin) })
}
