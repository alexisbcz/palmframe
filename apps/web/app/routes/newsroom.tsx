import { Outlet, redirect, useRouteLoaderData } from "react-router"

import { Shell } from "@/components/newsroom/shell"
import "@/components/newsroom/newsroom.css"
import { seo } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/newsroom"

export const meta: Route.MetaFunction = () =>
  seo({
    title: "Newsroom: AI-reported stories",
    description:
      "Give an AI reporter a lead. It researches news, the web and social media, then files a checked article in the template you pick.",
    path: "/newsroom",
    noindex: true,
  })

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  const next = new URL(request.url).pathname
  if (!viewer) throw redirect(`/login?next=${next}`, { headers })
  // The switch lives in Settings: without it, the Newsroom isn't there.
  if (!viewer.labs.newsroom)
    throw redirect("/projects?settings=labs", { headers })
  const { data } = await supabase
    .from("comic_deep_dives")
    .select("id, title, lead, status, template, cover, created_at")
    .not("template", "is", null)
    .order("created_at", { ascending: false })
    .limit(60)
  return { stories: data ?? [] }
}

export const useStories = () =>
  (useRouteLoaderData("routes/newsroom") as Route.ComponentProps["loaderData"])
    .stories

export default function Newsroom({ loaderData }: Route.ComponentProps) {
  return (
    <Shell stories={loaderData.stories}>
      <Outlet />
    </Shell>
  )
}
