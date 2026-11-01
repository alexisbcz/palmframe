import { createHash, timingSafeEqual } from "node:crypto"

import { tick } from "@/lib/anime/run.server"

import type { Route } from "./+types/api.anime.tick"

export const config = { maxDuration: 30 }

const digest = (s: string) => createHash("sha256").update(s).digest()

// Woken once a minute by pg_cron. See the `anime-tick` migration.
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.MACHINES_CRON_SECRET?.trim()
  const given = request.headers.get("authorization") ?? ""
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`)))
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json({ woken: await tick(new URL(request.url).origin) })
}
