import Anthropic from "@anthropic-ai/sdk"

import { GENRES, isKind, type AssetKind } from "@/components/catalog/model"
import { COSTS } from "@/lib/credits"
import {
  OpenRouterError,
  completeJson,
  payingConnection,
} from "@/lib/openrouter.server"
import { ASSET_IDEA } from "@/lib/prompts.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.catalog.idea"

// Turns a rough idea into a named, tagged catalog asset. The person reviews
// everything it proposes before anything is drawn or saved.
const MODEL = "claude-sonnet-5-5"
const MAX_IDEA = 600

export interface AssetIdea {
  name: string
  description: string
  tags: string[]
  genres: string[]
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "tags", "genres"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    genres: { type: "array", items: { type: "string", enum: [...GENRES] } },
  },
}

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

async function withAnthropic(user: string, signal: AbortSignal) {
  const client = new Anthropic()
  const response = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 2_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: ASSET_IDEA.render(),
      messages: [{ role: "user", content: user }],
    },
    { signal }
  )
  if (response.stop_reason === "refusal")
    throw new Error("The model declined this idea.")
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
  return JSON.parse(text) as unknown
}

function shaped(parsed: unknown): AssetIdea {
  const v = parsed as Partial<AssetIdea> | null
  const list = (l: unknown) =>
    Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : []
  return {
    name: String(v?.name ?? "").slice(0, 80),
    description: String(v?.description ?? "").slice(0, 400),
    tags: list(v?.tags).slice(0, 16),
    genres: list(v?.genres)
      .filter((g) => (GENRES as readonly string[]).includes(g))
      .slice(0, 3),
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const body = (await request.json().catch(() => null)) as {
    kind?: unknown
    idea?: unknown
  } | null
  const idea = typeof body?.idea === "string" ? body.idea.trim() : ""
  if (!isKind(body?.kind) || !idea || idea.length > MAX_IDEA)
    return error("Invalid request: a kind and a short idea are required.", 400)
  const kind: AssetKind = body.kind
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in first.", 401)
  const openrouter = await payingConnection(viewer.id)
  if (!openrouter && !process.env.ANTHROPIC_API_KEY)
    return error(
      "Polishing isn't set up: set ANTHROPIC_API_KEY on the server, or connect OpenRouter in Settings.",
      501
    )

  const job = crypto.randomUUID()
  let credits: number | null = null
  if (!openrouter) {
    const spent = await supabase.rpc("spend_credits", {
      p_cost: COSTS.asset_idea,
      p_kind: "asset_idea",
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

  const user = `Kind of asset: ${kind}\nIdea: ${idea}`
  let res: Response
  try {
    const parsed = openrouter
      ? await completeJson(
          openrouter,
          { system: ASSET_IDEA.render(), user, schema: SCHEMA },
          request.signal
        )
      : await withAnthropic(user, request.signal)
    res = Response.json(shaped(parsed))
    if (openrouter) res.headers.set("x-billed", "openrouter")
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    res =
      e instanceof OpenRouterError && e.status === 402
        ? Response.json(
            { error: message, code: "openrouter_credits" },
            { status: 402 }
          )
        : error(message, request.signal.aborted ? 499 : 502)
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
