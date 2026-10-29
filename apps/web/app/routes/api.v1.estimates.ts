import {
  ApiError,
  apiError,
  estimatePanel,
  jsonBody,
  respond,
  type EstimateInput,
} from "@/lib/api.server"

import type { Route } from "./+types/api.v1.estimates"

// POST /api/v1/estimates { project_id, panel_id, prompt?, seed? }: what a
// panel render costs. Free; valid 10 minutes, for the current page_version.
export function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return apiError(new ApiError(405, "method_not_allowed", "Use POST."))
  return respond(
    request,
    "write",
    async (caller) =>
      estimatePanel(
        caller,
        (await jsonBody(request)) as unknown as EstimateInput
      ),
    201
  )
}
