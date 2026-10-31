import Anthropic from "@anthropic-ai/sdk"

import { COSTS } from "@/lib/credits"
import {
  OpenRouterError,
  completeJson,
  payingConnection,
} from "@/lib/openrouter.server"
import { MACHINE_WRITER, promptId } from "@/lib/prompts.server"

import type { MachineConfig, Signal } from "./model"

const MODEL = "claude-sonnet-5-5"

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["post", "text", "scene", "alt"],
  properties: {
    post: { type: "boolean" },
    text: { type: "string" },
    scene: { type: "string" },
    alt: { type: "string" },
  },
}

export interface Written {
  text: string
  scene: string
  alt: string
  prompt: string | null
}

export interface Billing {
  spend: (cost: number) => Promise<void>
  refund: () => Promise<void>
}

export class OutOfCredits extends Error {}

async function withAnthropic(
  system: string,
  user: string,
  signal: AbortSignal
) {
  const response = await new Anthropic().beta.messages.create(
    {
      model: MODEL,
      max_tokens: 2_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system,
      messages: [{ role: "user", content: user }],
    },
    { signal }
  )
  if (response.stop_reason === "refusal") return { post: false }
  return JSON.parse(
    response.content.map((b) => (b.type === "text" ? b.text : "")).join("")
  ) as unknown
}

// The signal as the model reads it: facts first, strangers' words fenced off.
function brief(signal: Signal) {
  return JSON.stringify({
    FACTS: signal.facts,
    samples_from_the_stream: signal.samples,
  })
}

// The facts themselves, so a machine still works with no writer configured.
const plain = (signal: Signal): Written => ({
  text: signal.facts.slice(0, 240),
  scene: "",
  alt: "",
  prompt: null,
})

// One signal to one draft, or null when the writer passes on it. Paid for
// like the story planner: charged first, refunded on failure, and free when
// the person's OpenRouter account pays.
export async function writeDraft(
  userId: string,
  signal: Signal,
  config: MachineConfig,
  billing: Billing,
  abort: AbortSignal
): Promise<Written | null> {
  const openrouter = await payingConnection(userId)
  if (!openrouter && !process.env.ANTHROPIC_API_KEY) return plain(signal)
  if (!openrouter) await billing.spend(COSTS.machine_draft)
  const system = MACHINE_WRITER.render({
    signal,
    voice: config.voice,
    language: config.language,
  })
  try {
    const out = (
      openrouter
        ? await completeJson(
            openrouter,
            { system, user: brief(signal), schema: SCHEMA },
            abort
          )
        : await withAnthropic(system, brief(signal), abort)
    ) as Partial<Written> & { post?: boolean }
    if (!out.post || !out.text?.trim()) return null
    return {
      text: out.text.trim().slice(0, 500),
      scene: (out.scene ?? "").trim().slice(0, 1000),
      alt: (out.alt ?? "").trim().slice(0, 500),
      prompt: promptId(MACHINE_WRITER),
    }
  } catch (e) {
    if (!openrouter) await billing.refund()
    if (e instanceof OpenRouterError && e.status === 402)
      throw new OutOfCredits(e.message)
    throw e
  }
}
