import { data, redirect } from "react-router"

import { ComicCanvasEditor } from "@/components/comic-canvas/editor"
import { toProject } from "@/components/comic-canvas/model"
import { withShared } from "@/components/comic-canvas/series"
import { seriesOf } from "@/lib/series.server"
import { getViewer } from "@/lib/supabase.server"
import { instagramEnabled } from "@/lib/instagram.server"

import type { Route } from "./+types/project"

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData?.title ? `${loaderData.title} · Palmframe` : "Palmframe",
  },
]

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer)
    throw redirect(
      `/login?next=${encodeURIComponent(new URL(request.url).pathname)}`,
      { headers }
    )
  // Row-level security already limits this to the viewer's own projects.
  const { data: row } = await supabase
    .from("comic_projects")
    .select("id, title, data, revision, cover")
    .eq("id", params.id)
    .maybeSingle()
  const project = row && toProject(row.data)
  if (!row || !project) throw data("Not found", { status: 404, headers })
  const series = await seriesOf(supabase, row.id)
  return data(
    {
      id: row.id,
      userId: viewer.id,
      title: row.title,
      revision: row.revision,
      hasCover: !!row.cover,
      project: series ? withShared(project, series) : project,
      series: series?.context ?? null,
      instagram: instagramEnabled(),
    },
    { headers }
  )
}

// Saves happen in the browser; reloading after them would reset the canvas.
export const shouldRevalidate = () => false

export default function Project({ loaderData }: Route.ComponentProps) {
  const { instagram, ...cloud } = loaderData
  // A new key per project, so switching projects starts a fresh editor.
  return (
    <ComicCanvasEditor key={cloud.id} instagram={instagram} cloud={cloud} />
  )
}
