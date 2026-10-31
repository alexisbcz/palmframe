import Anthropic from "@anthropic-ai/sdk"

import { MAX_STYLE_NAME, MAX_STYLE_PAGES } from "@/lib/comic-import/limits"
import { COSTS } from "@/lib/credits"
import { kleinAvailable } from "@/lib/klein.server"
import { OpenRouterError, payingConnection } from "@/lib/openrouter.server"
import {
  StyleError,
  analyzeStyle,
  deleteStyle,
  listStyles,
  prepareStyle,
} from "@/lib/styles.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.styles"

// Styles learned from uploaded comics, for signed-in people only. Reads and
// row creation run as the viewer, so row-level security scopes them. Only the
// verdict of an analysis is written with the admin client, after this server
// has read the pages itself.
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to use styles.", 401)
  try {
    const openrouter = await payingConnection(viewer.id)
    return Response.json({
      styles: await listStyles(supabase),
      // Whether renders here can see images, or only the written analysis.
      references: !!openrouter || kleinAvailable(),
    })
  } catch (e) {
    return e instanceof StyleError
      ? error(e.message, e.status)
      : error("Could not load styles.", 500)
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to use styles.", 401)
  const b = (await request.json().catch(() => null)) as {
    intent?: string
    id?: unknown
    name?: unknown
    pages?: unknown
    rights?: unknown
  } | null

  try {
    if (b?.intent === "prepare") {
      const name =
        typeof b.name === "string" ? b.name.trim().slice(0, MAX_STYLE_NAME) : ""
      const pages = b.pages
      if (
        !name ||
        typeof pages !== "number" ||
        !Number.isInteger(pages) ||
        pages < 1 ||
        pages > MAX_STYLE_PAGES
      )
        return error("Invalid request.", 400)
      if (b.rights !== true)
        return error("Confirm you may use these pages first.", 400)
      return Response.json(await prepareStyle(supabase, viewer.id, name, pages))
    }
    if (!validId(b?.id)) return error("Invalid request.", 400)
    if (b.intent === "delete") {
      await deleteStyle(supabase, b.id)
      return Response.json({ ok: true })
    }
    if (b.intent === "analyze") return await analyze(request, b.id)
    return error("Invalid request.", 400)
  } catch (e) {
    return e instanceof StyleError
      ? error(e.message, e.status)
      : error(e instanceof Error ? e.message : String(e), 500)
  }
}

// Same contract as /api/check: charged first and refunded if it fails, unless
// the person's OpenRouter account pays.
async function analyze(request: Request, id: string) {
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to use styles.", 401)
  const openrouter = await payingConnection(viewer.id)
  if (!openrouter && !process.env.ANTHROPIC_API_KEY)
    return error(
      "Style analysis is not set up: set ANTHROPIC_API_KEY on the server, or connect OpenRouter in Settings.",
      501
    )

  const job = crypto.randomUUID()
  let credits: number | null = null
  if (!openrouter) {
    const spent = await supabase.rpc("spend_credits", {
      p_cost: COSTS.style_analysis,
      p_kind: "style_analysis",
      p_job: job,
    })
    if (spent.error)
      return spent.error.code === "P0402"
        ? Response.json(
            { error: spent.error.message, code: "insufficient_credits" },
            { status: 402 }
          )
        : error(`Could not charge credits: ${spent.error.message}`, 500)
    credits = spent.data as number
  }

  let res: Response
  try {
    const analysis = await analyzeStyle(
      supabase,
      id,
      openrouter,
      request.signal
    )
    const { error: saved } = await supabaseAdmin()
      .from("comic_styles")
      .update({ status: "ready", analysis })
      .eq("id", id)
      .eq("user_id", viewer.id)
    if (saved) throw new StyleError(saved.message, 500)
    res = Response.json({ analysis })
    if (openrouter) res.headers.set("x-billed", "openrouter")
  } catch (e) {
    if (e instanceof OpenRouterError && e.status === 402)
      res = Response.json(
        { error: e.message, code: "openrouter_credits" },
        { status: 402 }
      )
    else if (e instanceof StyleError) res = error(e.message, e.status)
    else if (e instanceof Anthropic.APIError)
      res = error(
        `The analysis failed (${e.status ?? "network"}): ${e.message}`,
        502
      )
    else
      res = error(
        e instanceof Error ? e.message : String(e),
        request.signal.aborted ? 499 : 502
      )
  }
  if (res.ok) {
    if (credits !== null) res.headers.set("x-credits", String(credits))
    return res
  }
  if (credits !== null) {
    const refunded = await supabase.rpc("refund_credits", { p_job: job })
    if (!refunded.error) res.headers.set("x-credits", String(refunded.data))
  }
  return res
}
