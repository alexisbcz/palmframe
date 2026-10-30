import { getJob, respond } from "@/lib/api.server"

import type { Route } from "./+types/api.v1.operations.$id"

// GET /api/v1/operations/:id: an estimate or a job, and its result.
export function loader({ request, params }: Route.LoaderArgs) {
  return respond(request, "any", (caller) => getJob(caller, params.id))
}
