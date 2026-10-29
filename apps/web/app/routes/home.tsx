import { redirect } from "react-router"

import { ComicCanvasEditor } from "@/components/comic-canvas/editor"
import { getViewer } from "@/lib/supabase.server"
import { zernioEnabled } from "@/lib/zernio.server"

import type { Route } from "./+types/home"

export function meta() {
  return [{ title: "Palmframe" }]
}

// Signed in, carousels live in the account; signed out, the canvas keeps one
// in this browser. `?project=` files still open locally either way.
// The Zernio key never leaves the server: the page only learns whether it is set.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  if (viewer && !new URL(request.url).searchParams.has("project"))
    throw redirect("/projects", { headers })
  return { zernio: zernioEnabled() }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <ComicCanvasEditor zernio={loaderData.zernio} />
}
