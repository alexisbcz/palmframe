import Anthropic from "@anthropic-ai/sdk"

import { COSTS } from "@/lib/credits"
import { parseWrite, write, writerFake } from "@/lib/novel/write.server"
import { OpenRouterError, payingConnection } from "@/lib/openrouter.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.novels.write"

export const config = { maxDuration: 150 }

const error = (message: string, status: number, code?: string) =>
  Response.json({ error: message, ...(code && { code }) }, { status })

const KIND = {
  outline: "novel_outline",
  scene: "novel_scene",
  score: "novel_score",
} as const

const available = () => writerFake() || !!process.env.ANTHROPIC_API_KEY

export async function loader({ request }: Route.LoaderArgs) {
  const { viewer } = await getViewer(request)
  const openrouter = viewer ? await payingConnection(viewer.id) : null
  return Response.json({
    available: available() || !!openrouter,
    free: !!openrouter,
    costs: {
      outline: COSTS.novel_outline,
      scene: COSTS.novel_scene,
      score: COSTS.novel_score,
    },
    signedIn: !!viewer,
  })
}

// Same billing as the story planner: charged first, refunded on failure, and
// nothing in credits when the person's OpenRouter account pays.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const r = parseWrite(await request.json().catch(() => null))
  if (!r) return error("Nothing to write from.", 400)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to write.", 401)
  if (!viewer.labs.novels) return error("Not found", 404)
  const openrouter = viewer ? await payingConnection(viewer.id) : null
  if (!openrouter && !available())
    return error(
      "The writer is not set up: set ANTHROPIC_API_KEY on the server, or connect OpenRouter in Settings.",
      501
    )

  const job = crypto.randomUUID()
  let charged = false
  if (viewer && !openrouter) {
    const kind = KIND[r.mode]
    const spent = await supabase.rpc("spend_credits", {
      p_cost: COSTS[kind],
      p_kind: kind,
      p_job: job,
    })
    if (spent.error)
      return spent.error.code === "P0402"
        ? error(spent.error.message, 402, "insufficient_credits")
        : error(`Could not charge credits: ${spent.error.message}`, 500)
    charged = true
  }
  try {
    return Response.json(await write(r, openrouter, request.signal))
  } catch (e) {
    if (charged) await supabase.rpc("refund_credits", { p_job: job })
    if (e instanceof OpenRouterError && e.status === 402)
      return error(e.message, 402, "openrouter_credits")
    return error(
      e instanceof Anthropic.APIError
        ? `The writer failed (${e.status ?? "network"}): ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e),
      request.signal.aborted ? 499 : 502
    )
  }
}
