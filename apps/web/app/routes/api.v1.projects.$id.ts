import { getProject, respond } from "@/lib/api.server"

import type { Route } from "./+types/api.v1.projects.$id"

// GET /api/v1/projects/:id: pages, panels and cast.
export function loader({ request, params }: Route.LoaderArgs) {
  return respond(request, "read", (caller) => getProject(caller, params.id))
}
