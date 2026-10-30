import { newShareToken } from "@/lib/share.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.share.$id"

// A project's reader link. All of this runs as the signed-in person, so
// row-level security is what limits it to their own projects.
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

const noProject = () => error("No such project.", 404)
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id)

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to share.", 401)
  if (!validId(params.id)) return noProject()
  const { data, error: failed } = await supabase
    .from("comic_projects")
    .select("share_token")
    .eq("id", params.id)
    .maybeSingle()
  if (failed) return error(failed.message, 500)
  if (!data) return noProject()
  return Response.json({ token: data.share_token })
}

// POST makes the link, or returns the one that exists; DELETE revokes it.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "DELETE")
    return error("Method not allowed", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to share.", 401)
  if (!validId(params.id)) return noProject()

  if (request.method === "DELETE") {
    const { data, error: failed } = await supabase
      .from("comic_projects")
      .update({ share_token: null })
      .eq("id", params.id)
      .select("id")
    if (failed) return error(failed.message, 500)
    return data.length ? Response.json({ token: null }) : noProject()
  }

  const { data, error: failed } = await supabase
    .from("comic_projects")
    .update({ share_token: newShareToken() })
    .eq("id", params.id)
    .is("share_token", null)
    .select("share_token")
  if (failed) return error(failed.message, 500)
  if (data[0]) return Response.json({ token: data[0].share_token })
  // Nothing updated: it already has a link, or it isn't theirs.
  const existing = await supabase
    .from("comic_projects")
    .select("share_token")
    .eq("id", params.id)
    .maybeSingle()
  if (existing.error) return error(existing.error.message, 500)
  return existing.data
    ? Response.json({ token: existing.data.share_token })
    : noProject()
}
