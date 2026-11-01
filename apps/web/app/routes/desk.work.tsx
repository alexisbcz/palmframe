import { data, redirect } from "react-router"

import { Workbench } from "@/components/desk/workbench"
import { toManuscript } from "@/lib/desk/model"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/desk.work"

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.title || "The Desk"} · Palmframe` },
  PRIVATE,
]

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect(`/login?next=/desk/${params.id}`, { headers })
  if (!viewer.labs.desk) throw redirect("/projects?settings=labs", { headers })
  const { data: row } = await supabase
    .from("comic_manuscripts")
    .select("id, title, data, revision")
    .eq("id", params.id)
    .maybeSingle()
  if (!row) throw data("Not found", { status: 404, headers })
  return data(
    {
      id: row.id,
      title: row.title,
      manuscript: toManuscript(row.data),
      revision: row.revision,
    },
    { headers }
  )
}

export default function DeskWork({ loaderData }: Route.ComponentProps) {
  return (
    <Workbench
      key={loaderData.id}
      id={loaderData.id}
      initial={loaderData.manuscript}
      revision={loaderData.revision}
    />
  )
}
