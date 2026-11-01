import { COSTS } from "@/lib/credits"
import { artRoute, makeArt, parseArt } from "@/lib/novel/art.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.novels.art"

export const config = { maxDuration: 150 }

// What the Darkroom needs to show before anyone presses the shutter.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer } = await getViewer(request)
  const route = await artRoute(viewer)
  return Response.json({
    route,
    cost: route === "credits" ? COSTS.novel_art : 0,
    signedIn: !!viewer,
  })
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 })
  const r = parseArt(await request.json().catch(() => null))
  if (!r)
    return Response.json({ error: "A prompt is required." }, { status: 400 })
  const { supabase, viewer } = await getViewer(request)
  if (!viewer)
    return Response.json({ error: "Sign in to draw." }, { status: 401 })
  if (!viewer.labs.novels)
    return Response.json({ error: "Not found" }, { status: 404 })
  return makeArt(r, request, supabase, viewer)
}
