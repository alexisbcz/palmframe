import { listProjects, respond } from "@/lib/api.server"

import type { Route } from "./+types/api.v1.projects"

// GET /api/v1/projects: the latest 100, most recently edited first.
export function loader({ request }: Route.LoaderArgs) {
  return respond(request, "read", listProjects)
}
