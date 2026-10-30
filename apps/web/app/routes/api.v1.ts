import { capabilities, respond } from "@/lib/api.server"

import type { Route } from "./+types/api.v1"

// GET /api/v1: prices and limits.
export function loader({ request }: Route.LoaderArgs) {
  return respond(request, "any", async () => capabilities())
}
