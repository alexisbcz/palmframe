import { balance, respond } from "@/lib/api.server"

import type { Route } from "./+types/api.v1.credits"

// GET /api/v1/credits: the key owner's balance, shared with the
// app, and the key's own limit and spending.
export function loader({ request }: Route.LoaderArgs) {
  return respond(request, "read", balance)
}
