import { data, redirect } from "react-router"

import { NovelEditor } from "@/components/novel/editor"
import { toNovel } from "@/lib/novel/model"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/novel"

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.title || "The Stage"} · Palmframe` },
  PRIVATE,
]

// `/novels/draft` is one novel kept in this browser, from before signing in.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect(`/login?next=/novels/${params.id}`, { headers })
  if (!viewer.labs.novels)
    throw redirect("/projects?settings=labs", { headers })
  if (params.id === "draft")
    return data(
      {
        id: null,
        title: "",
        novel: null,
        revision: 0,
        userId: null,
        credits: null,
      },
      { headers }
    )
  const [{ data: row }, credits] = await Promise.all([
    supabase
      .from("comic_novels")
      .select("id, title, data, revision")
      .eq("id", params.id)
      .maybeSingle(),
    supabase.rpc("my_credits").then((r) => r.data ?? null),
  ])
  if (!row) throw data("Not found", { status: 404, headers })
  return data(
    {
      id: row.id,
      title: row.title,
      novel: toNovel(row.data),
      revision: row.revision,
      userId: viewer.id,
      credits: credits as number | null,
    },
    { headers }
  )
}

export default function NovelRoute({ loaderData }: Route.ComponentProps) {
  return (
    <NovelEditor
      key={loaderData.id ?? "draft"}
      id={loaderData.id}
      initial={loaderData.novel}
      revision={loaderData.revision}
      userId={loaderData.userId}
      credits={loaderData.credits}
    />
  )
}
