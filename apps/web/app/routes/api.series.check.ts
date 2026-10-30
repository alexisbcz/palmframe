import Anthropic from "@anthropic-ai/sdk"

import { cleanFacts } from "@/components/comic-canvas/series"
import { COSTS } from "@/lib/credits"
import {
  OpenRouterError,
  completeJson,
  payingConnection,
  type OpenRouterConnection,
} from "@/lib/openrouter.server"
import { CONTINUITY_CHECK } from "@/lib/prompts.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.series.check"

// The continuity check: an LLM compares a carousel's text with the series'
// facts. It only proposes; changing a fact or a slide stays with the person.
const MODEL = "claude-sonnet-5-5"
const MAX_TEXT = 10_000
const MAX_FINDINGS = 12

export interface ContinuityRequest {
  facts: string[]
  // What the panels show and say, from carouselText.
  text: string
}

export interface Contradiction {
  fact: string
  // The words that contradict it, and what's wrong.
  quote: string
  problem: string
  // The fact reworded, if the story could simply be moving on.
  revised: string
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["contradictions"],
  properties: {
    contradictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fact", "quote", "problem", "revised"],
        properties: {
          fact: { type: "integer" },
          quote: { type: "string" },
          problem: { type: "string" },
          revised: { type: "string" },
        },
      },
    },
  },
}

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

function parse(body: unknown): ContinuityRequest | null {
  const b = body as Partial<ContinuityRequest> | null
  const facts = cleanFacts(b?.facts)
  const text = typeof b?.text === "string" ? b.text.trim() : ""
  if (!facts.length || !text || text.length > MAX_TEXT) return null
  return { facts, text }
}

const brief = (r: ContinuityRequest) =>
  JSON.stringify({
    facts: r.facts.map((text, i) => ({ number: i + 1, text })),
    carousel: r.text,
  })

async function compareWithAnthropic(r: ContinuityRequest, signal: AbortSignal) {
  const client = new Anthropic()
  const response = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: CONTINUITY_CHECK.render(),
      messages: [{ role: "user", content: brief(r) }],
    },
    { signal }
  )
  if (response.stop_reason === "refusal")
    throw new Error("The check declined this carousel.")
  if (response.stop_reason === "max_tokens")
    throw new Error("The check came back cut short; try again.")
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
  return JSON.parse(text) as unknown
}

// Numbers become the facts that were sent, so a finding can't invent one.
function findings(r: ContinuityRequest, parsed: unknown): Contradiction[] {
  const list = (parsed as { contradictions?: unknown } | null)?.contradictions
  if (!Array.isArray(list))
    throw new Error("The check came back unreadable; try again.")
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  return list
    .flatMap((c): Contradiction[] => {
      const fact = r.facts[Number(c?.fact) - 1]
      const problem = text(c?.problem)
      if (!fact || !problem) return []
      return [
        {
          fact,
          problem,
          quote: text(c.quote),
          revised: text(c.revised),
        },
      ]
    })
    .slice(0, MAX_FINDINGS)
}

// The person's OpenRouter account reads when it pays; else the server's key.
async function compare(
  r: ContinuityRequest,
  signal: AbortSignal,
  openrouter: OpenRouterConnection | null
) {
  const parsed = openrouter
    ? await completeJson(
        openrouter,
        {
          system: CONTINUITY_CHECK.render(),
          user: brief(r),
          schema: SCHEMA,
        },
        signal
      )
    : await compareWithAnthropic(r, signal)
  return findings(r, parsed)
}

// Same contract as /api/check, for signed-in people only, as series are.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const r = parse(await request.json().catch(() => null))
  if (!r)
    return error(
      `Invalid request: facts and the carousel's text (up to ${MAX_TEXT} characters) are required.`,
      400
    )
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in to check.", 401)
  const openrouter = await payingConnection(viewer.id)
  if (!openrouter && !process.env.ANTHROPIC_API_KEY)
    return error(
      "The continuity check is not set up: set ANTHROPIC_API_KEY on the server, or connect OpenRouter in Settings.",
      501
    )

  const job = crypto.randomUUID()
  let credits: number | null = null
  if (!openrouter) {
    const spent = await supabase.rpc("spend_credits", {
      p_cost: COSTS.continuity_check,
      p_kind: "continuity_check",
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
    res = Response.json({
      contradictions: await compare(r, request.signal, openrouter),
    })
    if (openrouter) res.headers.set("x-billed", "openrouter")
  } catch (e) {
    const message =
      e instanceof Anthropic.APIError
        ? `The check failed (${e.status ?? "network"}): ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e)
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
