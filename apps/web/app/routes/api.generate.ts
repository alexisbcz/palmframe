import { COSTS } from "@/lib/credits"
import { error, operation, parse, render } from "@/lib/generate.server"
import { imageResponse, payingConnection } from "@/lib/openrouter.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.generate"

export type { GenerateRequest } from "@/lib/generate.server"

// Signed in, every render is paid for in credits: charged before it starts,
// refunded if it fails or is cancelled. Signed out, it's only allowed off
// Vercel, for local work.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const r = parse(await request.json().catch(() => null))
  if (!r)
    return error(
      "Invalid request: prompt, width, height, seed and steps are required.",
      400
    )
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) {
    if (process.env.VERCEL) return error("Sign in to generate.", 401)
    return render(r, request)
  }

  // A connected OpenRouter account pays instead of credits.
  const openrouter = await payingConnection(viewer.id)
  if (openrouter)
    return imageResponse(
      openrouter,
      {
        // A coverage sheet's prompt already says what it may and may not show.
        prompt: r.coverage
          ? r.prompt
          : `${r.prompt}\n\nNo text, no letters, no speech bubbles, no captions, no panel borders.`,
        width: r.width,
        height: r.height,
        refs: r.refs,
        seed: r.seed,
      },
      request.signal
    )

  const job = crypto.randomUUID()
  const op = operation(r)
  const spent = await supabase.rpc("spend_credits", {
    p_cost: COSTS[op],
    p_kind: op,
    p_job: job,
  })
  if (spent.error)
    return spent.error.code === "P0402"
      ? Response.json(
          { error: spent.error.message, code: "insufficient_credits" },
          { status: 402 }
        )
      : error(`Could not charge credits: ${spent.error.message}`, 500)

  let res: Response
  try {
    res = await render(r, request)
  } catch (e) {
    res = error(e instanceof Error ? e.message : String(e), 500)
  }
  if (res.ok) {
    res.headers.set("x-credits", String(spent.data))
    return res
  }
  const refunded = await supabase.rpc("refund_credits", { p_job: job })
  if (!refunded.error) res.headers.set("x-credits", String(refunded.data))
  return res
}
