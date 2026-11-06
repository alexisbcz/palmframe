import { Outlet, redirect, useRouteLoaderData } from "react-router"

import "@/components/newsroom/newsroom.css"
import "@/components/autopilot/autopilot.css"
import { Shell, useLive, type AgentCardRow } from "@/components/autopilot/parts"
import { seo } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/autopilot"

export const meta: Route.MetaFunction = () =>
  seo({
    title: "Autopilot: a fleet of content agents",
    description:
      "Spin up AI agents that research X, Reddit, TikTok and the web on a schedule and post for you, with or without your review.",
    path: "/autopilot",
    noindex: true,
  })

export const AGENT_CARD =
  "id, name, handle, role, squad, brief, platforms, cadence, mode, hue, enabled, state, next_run_at, last_run_at, last_error, runs"

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer)
    throw redirect(`/login?next=${new URL(request.url).pathname}`, { headers })
  // The switch lives in Settings: without it, Autopilot isn't there.
  if (!viewer.labs.autopilot)
    throw redirect("/projects?settings=labs", { headers })
  const [agents, drafts] = await Promise.all([
    supabase
      .from("comic_autopilot_agents")
      .select(AGENT_CARD)
      .order("created_at", { ascending: false }),
    supabase
      .from("comic_autopilot_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
  ])
  return {
    agents: (agents.data ?? []) as AgentCardRow[],
    drafts: drafts.count ?? 0,
    now: Date.now(),
  }
}

export const useFleet = () =>
  useRouteLoaderData("routes/autopilot") as Route.ComponentProps["loaderData"]

export default function Autopilot({ loaderData }: Route.ComponentProps) {
  useLive(loaderData.agents.some((a) => a.state === "running"))
  return (
    <Shell agents={loaderData.agents} drafts={loaderData.drafts}>
      <Outlet />
    </Shell>
  )
}
