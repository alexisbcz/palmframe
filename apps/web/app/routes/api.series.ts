import {
  cleanFacts,
  type SharedChanges,
} from "@/components/comic-canvas/series"
import {
  SeriesError,
  addToSeries,
  leaveSeries,
  listSeries,
  newCarousel,
  newSeries,
  setFacts,
  syncChanges,
} from "@/lib/series.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.series"

// Series, for signed-in people only. Row-level security is what limits all
// of this to their own rows.
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)

const MAX_ENTRIES = 100

// What a carousel says changed. These are the person's own entries going
// into their own row; this only keeps them in shape.
function changes(value: unknown): SharedChanges | null {
  const v = value as Partial<Record<keyof SharedChanges, unknown>> | null
  const list = (l: unknown) => {
    const p = l as { upsert?: unknown; remove?: unknown } | null
    if (!Array.isArray(p?.upsert) || !Array.isArray(p?.remove)) return null
    if (p.upsert.length > MAX_ENTRIES || p.remove.length > MAX_ENTRIES)
      return null
    const shaped =
      p.upsert.every(
        (e) => typeof e?.id === "string" && typeof e?.name === "string"
      ) && p.remove.every((id) => typeof id === "string")
    return shaped ? { upsert: p.upsert, remove: p.remove as string[] } : null
  }
  const characters = list(v?.characters)
  const world = list(v?.world)
  return characters && world ? { characters, world } : null
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to use series.", 401)
  return Response.json({ series: await listSeries(supabase) })
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to use series.", 401)
  const b = (await request.json().catch(() => null)) as {
    intent?: string
    id?: unknown
    projectId?: unknown
    title?: unknown
    facts?: unknown
    changes?: unknown
  } | null
  const title = typeof b?.title === "string" ? b.title.trim().slice(0, 120) : ""
  const { id, projectId } = b ?? {}
  try {
    if (b?.intent === "create")
      return Response.json({ id: await newSeries(supabase, title) })
    if (b?.intent === "leave" && validId(projectId)) {
      await leaveSeries(supabase, projectId)
      return Response.json({ ok: true })
    }
    if (!validId(id)) return error("Invalid request.", 400)
    switch (b?.intent) {
      case "rename": {
        const { error: failed } = await supabase
          .from("comic_series")
          .update({ title })
          .eq("id", id)
        if (failed) return error(failed.message, 500)
        return Response.json({ ok: true })
      }
      case "delete": {
        // Its carousels stay, with their copies of the cast and world.
        const { error: failed } = await supabase
          .from("comic_series")
          .delete()
          .eq("id", id)
        if (failed) return error(failed.message, 500)
        return Response.json({ ok: true })
      }
      case "facts":
        return Response.json({
          facts: (await setFacts(supabase, id, cleanFacts(b.facts))).facts,
        })
      case "join":
        if (!validId(projectId)) return error("Invalid request.", 400)
        await addToSeries(supabase, id, projectId)
        return Response.json({ ok: true })
      case "carousel":
        return Response.json({ id: await newCarousel(supabase, id) })
      case "sync": {
        const parsed = changes(b.changes)
        if (!parsed) return error("Invalid request.", 400)
        await syncChanges(supabase, id, parsed)
        return Response.json({ ok: true })
      }
    }
    return error("Unknown intent", 400)
  } catch (e) {
    if (e instanceof SeriesError) return error(e.message, e.status)
    throw e
  }
}
