import { data, redirect } from "react-router"

import { SiteEditor } from "@/components/sites/editor/editor"
import { seo } from "@/lib/seo"
import { toSite } from "@/lib/sites/model"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/sites.edit"

export const meta: Route.MetaFunction = ({ loaderData }) =>
  seo({
    title: `${loaderData?.site.name ?? "Site"} · Frontage`,
    path: "/sites",
    noindex: true,
  })

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer)
    throw redirect(`/login?next=/sites/${params.id}/edit`, { headers })
  if (!viewer.labs.sites) throw redirect("/projects?settings=labs", { headers })
  const [{ data: row }, { data: release }] = await Promise.all([
    supabase
      .from("comic_sites")
      .select("id, data, revision")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("comic_site_releases")
      .select("slug")
      .eq("site_id", params.id)
      .maybeSingle(),
  ])
  if (!row) throw data("Not found", { status: 404 })
  return {
    id: row.id,
    revision: row.revision,
    site: toSite(row.data),
    slug: release?.slug ?? null,
  }
}

export default function SiteEdit({ loaderData }: Route.ComponentProps) {
  return <SiteEditor {...loaderData} />
}
