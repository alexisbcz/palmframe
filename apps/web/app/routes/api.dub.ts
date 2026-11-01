import { COSTS } from "@/lib/credits"
import { adapt, adapterFake, parseAdapt } from "@/lib/dub/adapt.server"
import { OpenRouterError, payingConnection } from "@/lib/openrouter.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.dub"

export const config = { maxDuration: 120 }

const error = (message: string, status: number, code?: string) =>
  Response.json({ error: message, ...(code && { code }) }, { status })

// The one thing the Booth can't do on its own: adapt dialogue with an LLM. Only
// the words come here; the film never leaves the person's computer. Same
// billing as the Stage: charged first, refunded on failure, free when their
// OpenRouter account pays.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const r = parseAdapt(await request.json().catch(() => null))
  if (!r) return error("Nothing to adapt.", 400, "invalid")
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to adapt.", 401, "unauthorized")
  if (!viewer.labs.dub) return error("Not found", 404)
  const openrouter = await payingConnection(viewer.id)
  if (!openrouter && !adapterFake() && !process.env.ANTHROPIC_API_KEY)
    return error("The adapter is not set up.", 501, "no_adapter")

  const job = crypto.randomUUID()
  let charged = false
  if (!openrouter && !adapterFake()) {
    const spent = await supabase.rpc("spend_credits", {
      p_cost: COSTS.dub_lines,
      p_kind: "dub_lines",
      p_job: job,
    })
    if (spent.error)
      return spent.error.code === "P0402"
        ? error(spent.error.message, 402, "insufficient_credits")
        : error("Could not charge credits.", 500)
    charged = true
  }
  try {
    return Response.json({ lines: await adapt(r, openrouter, request.signal) })
  } catch (e) {
    if (charged) await supabase.rpc("refund_credits", { p_job: job })
    if (e instanceof OpenRouterError && e.status === 402)
      return error(e.message, 402, "openrouter_credits")
    console.error("Dub adaptation failed", e)
    return error("The adapter failed.", request.signal.aborted ? 499 : 502)
  }
}
