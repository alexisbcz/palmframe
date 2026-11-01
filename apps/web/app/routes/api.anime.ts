import { AnimeError, type Actor } from "@/lib/anime/service.server"
import * as anime from "@/lib/anime/service.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.anime"

export const config = { maxDuration: 30 }

type Body = Record<string, any>

function run(a: Actor, b: Body, origin: string): Promise<unknown> {
  switch (b.intent) {
    case "models":
      return anime.modelsFor(a)
    case "create":
      return anime.createEpisode(a, b)
    case "panels":
      return anime.addPanels(a, b.id, b.panels)
    case "direct":
      return anime.resume(a, b.id, origin)
    case "status":
      return anime.status(a, b.id, b.known)
    case "update":
      return anime.updateEpisode(a, b.id, b.patch ?? {})
    case "shot":
      return anime.updateShot(a, b.id, b.shot, b.patch ?? {})
    case "reorder":
      return anime.reorder(a, b.id, b.order)
    case "quote":
      return anime.quote(a, b.id)
    case "start":
      return anime.start(a, b.id, origin, b)
    case "cancel":
      return anime.cancel(a, b.id)
    case "finalTarget":
      return anime.finalTarget(a, b.id)
    case "finalDone":
      return anime.finalDone(a, b.id, b.path)
    case "delete":
      return anime.deleteEpisode(a, b.id)
    default:
      throw new AnimeError("invalid")
  }
}

// Studio's side of comics to anime: one POST with an intent. Replies carry a
// code for the client to word.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return Response.json({ error: "unauthorized" }, { status: 401 })
  if (!viewer.labs.machines)
    return Response.json({ error: "unauthorized" }, { status: 403 })
  const body = (await request.json().catch(() => null)) as Body | null
  if (!body) return Response.json({ error: "invalid" }, { status: 400 })
  try {
    return Response.json(
      await run({ id: viewer.id, supabase }, body, new URL(request.url).origin)
    )
  } catch (e) {
    if (e instanceof AnimeError)
      return Response.json({ error: e.code }, { status: e.status })
    console.error("Anime request failed", body.intent, e)
    return Response.json({ error: "failed" }, { status: 500 })
  }
}
