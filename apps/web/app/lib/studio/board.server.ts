import Anthropic from "@anthropic-ai/sdk"

import { completeJson, payingConnection } from "@/lib/openrouter.server"
import { STUDIO_BOARD, promptId } from "@/lib/prompts.server"

import { BOARD_JSON_SCHEMA, type StudioSource, boardSchema } from "./model"

const MODEL = "claude-sonnet-5-5"

export class NoBoard extends Error {}

async function withAnthropic(
  system: string,
  user: string,
  signal: AbortSignal
) {
  const response = await new Anthropic().beta.messages.create(
    {
      model: MODEL,
      max_tokens: 4_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: BOARD_JSON_SCHEMA },
      },
      system,
      messages: [{ role: "user", content: user }],
    },
    { signal }
  )
  if (response.stop_reason === "refusal") throw new NoBoard()
  return JSON.parse(
    response.content.map((b) => (b.type === "text" ? b.text : "")).join("")
  ) as unknown
}

// What the model reads: the work itself, without links or file addresses.
export function brief(s: StudioSource) {
  if (s.kind === "ad") {
    const { body, title, cta, format, days, variants } = s.ad
    return JSON.stringify({
      ad_text: body,
      headline: title,
      button: cta,
      format,
      days_running: days,
      variants_running: variants,
    })
  }
  if (s.kind === "video") {
    const { title, transcript, views, likes, seconds, platform } = s.video
    return JSON.stringify({
      platform,
      title,
      transcript,
      views,
      likes,
      seconds,
    })
  }
  const { name, brand, description, price, currency, features, audience } =
    s.product
  return JSON.stringify({
    name,
    brand,
    description,
    price,
    currency,
    features,
    audience,
  })
}

export async function writeBoard(
  userId: string,
  source: StudioSource,
  brand: { name: string; description: string; voice: string } | null,
  language: string,
  signal: AbortSignal
) {
  const openrouter = await payingConnection(userId)
  const system = STUDIO_BOARD.render({ kind: source.kind, brand, language })
  const user = brief(source)
  const raw = openrouter
    ? await completeJson(
        openrouter,
        { system, user, schema: BOARD_JSON_SCHEMA },
        signal
      )
    : await withAnthropic(system, user, signal)
  const board = boardSchema.safeParse(raw)
  if (!board.success) throw new NoBoard()
  return { board: board.data, prompt: promptId(STUDIO_BOARD) }
}
