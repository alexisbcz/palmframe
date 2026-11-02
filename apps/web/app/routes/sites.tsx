import { Outlet, redirect, useRouteLoaderData } from "react-router"

import { Shell } from "@/components/sites/shell"
import "@/components/sites/frontage.css"
import { seo } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/sites"

export const meta: Route.MetaFunction = () =>
  seo({
    title: "Frontage: build a website",
    description:
      "Start from a designed template or a sentence, change anything by dragging it, and publish a site with a store, bookings and a blog.",
    path: "/sites",
    noindex: true,
  })

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  const next = new URL(request.url).pathname
  if (!viewer) throw redirect(`/login?next=${next}`, { headers })
  // The switch lives in Settings: without it, Frontage isn't there.
  if (!viewer.labs.sites) throw redirect("/projects?settings=labs", { headers })
  const [{ data: sites }, { data: releases }] = await Promise.all([
    supabase
      .from("comic_sites")
      .select("id, name, template, updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("comic_site_releases").select("site_id, slug"),
  ])
  const slugs = new Map((releases ?? []).map((r) => [r.site_id, r.slug]))
  return {
    sites: (sites ?? []).map((s) => ({ ...s, slug: slugs.get(s.id) ?? null })),
  }
}

export const useSites = () =>
  (useRouteLoaderData("routes/sites") as Route.ComponentProps["loaderData"])
    .sites

export default function Sites({ loaderData }: Route.ComponentProps) {
  return (
    <Shell sites={loaderData.sites}>
      <Outlet />
    </Shell>
  )
}
