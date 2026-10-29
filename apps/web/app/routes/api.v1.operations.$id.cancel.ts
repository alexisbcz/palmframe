import { ApiError, apiError, cancelJob, respond } from "@/lib/api.server"

import type { Route } from "./+types/api.v1.operations.$id.cancel"

// POST /api/v1/operations/:id/cancel: stops a queued or running job and
// refunds it.
export function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST")
    return apiError(new ApiError(405, "method_not_allowed", "Use POST."))
  return respond(request, "write", (caller) => cancelJob(caller, params.id))
}
