import { createHash, timingSafeEqual } from "node:crypto"

import { advance } from "@/lib/anime/run.server"

import type { Route } from "./+types/api.anime.work"

export const config = { maxDuration: 290 }

const digest = (s: string) => createHash("sha256").update(s).digest()

// One stretch of an episode. It spends real money, so it shares the runner's
// secret.
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.MACHINES_CRON_SECRET?.trim()
  const given = request.headers.get("authorization") ?? ""
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`)))
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as {
    id?: string
  } | null
  if (!body?.id) return Response.json({ error: "Invalid" }, { status: 400 })
  return Response.json({
    result: await advance(body.id, new URL(request.url).origin),
  })
}
