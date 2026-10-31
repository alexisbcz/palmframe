import { createHash, timingSafeEqual } from "node:crypto"

import { runMachines } from "@/lib/machines/run.server"

import type { Route } from "./+types/api.machines.tick"

const digest = (s: string) => createHash("sha256").update(s).digest()

// The scheduled runner's door (.github/workflows/machines.yml). It spends
// people's credits, so without a configured secret it stays shut.
export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.MACHINES_CRON_SECRET?.trim()
  const given = request.headers.get("authorization") ?? ""
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`)))
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json(await runMachines(new URL(request.url).origin))
}
