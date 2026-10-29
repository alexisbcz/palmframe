import {
  ApiError,
  apiError,
  jsonBody,
  respond,
  startJob,
} from "@/lib/api.server"

import type { Route } from "./+types/api.v1.generations"

// POST /api/v1/generations { estimate_id, page_version, max_credits } with
// an Idempotency-Key header: charges the estimate and queues the render.
// Poll GET /api/v1/operations/:id.
export function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return apiError(new ApiError(405, "method_not_allowed", "Use POST."))
  return respond(
    request,
    "write",
    async (caller) => {
      const body = await jsonBody(request)
      return startJob(caller, {
        estimate_id: String(body.estimate_id ?? ""),
        page_version: Number(body.page_version),
        max_credits: Number(body.max_credits),
        idempotency_key:
          request.headers.get("idempotency-key") ??
          String(body.idempotency_key ?? ""),
      })
    },
    202
  )
}
