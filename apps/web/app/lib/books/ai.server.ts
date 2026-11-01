import Anthropic from "@anthropic-ai/sdk"

import {
  OpenRouterError,
  completeJson,
  type OpenRouterConnection,
} from "@/lib/openrouter.server"

import { fakeModel } from "./fake"

export const BOOK_MODEL = "claude-sonnet-5-5"

export type ModelTask =
  "translate" | "extract" | "summary" | "ocr" | "backcheck"

export interface ModelCall {
  task: ModelTask
  // Stable across a book, so it can be cached.
  system: string
  // Changes every call, so it sits after the cache point.
  context?: string
  user: string
  schema: object
  images?: { media: string; data: string }[]
  effort?: "low" | "medium" | "high"
  maxTokens?: number
}

export interface Usage {
  input: number
  output: number
  cache_read: number
  cache_write: number
}

export interface ModelReply {
  value: unknown
  usage: Usage
}

export interface BatchResult {
  id: string
  ok: boolean
  value?: unknown
  usage?: Usage
}

export interface BatchApi {
  create(calls: { id: string; call: ModelCall }[]): Promise<string>
  // Null while it's still running.
  results(id: string): Promise<BatchResult[] | null>
}

export interface BookModel {
  json(call: ModelCall, signal?: AbortSignal): Promise<ModelReply>
  // Only the server's Anthropic key has the Batch API behind it.
  batch?: BatchApi
}

// The model said no to this text. Worth marking the segments, not stopping.
export class ModelDeclined extends Error {}
// Worth another try with less text.
export class ModelCutShort extends Error {}
// Nothing more can be done until a person pays or reconnects.
export class PayerFailed extends Error {}

const ZERO: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 }

const usageOf = (u: {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}): Usage => ({
  input: u.input_tokens ?? 0,
  output: u.output_tokens ?? 0,
  cache_read: u.cache_read_input_tokens ?? 0,
  cache_write: u.cache_creation_input_tokens ?? 0,
})

const textOf = (content: { type: string; text?: string }[]) =>
  content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("")

function userContent(call: ModelCall) {
  return [
    ...(call.images ?? []).map((image) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: image.media as "image/png",
        data: image.data,
      },
    })),
    { type: "text" as const, text: call.user },
  ]
}

function anthropicParams(call: ModelCall, cache: boolean) {
  return {
    model: BOOK_MODEL,
    max_tokens: call.maxTokens ?? 16_000,
    output_config: {
      effort: call.effort ?? "low",
      format: { type: "json_schema" as const, schema: call.schema as never },
    },
    system: [
      {
        type: "text" as const,
        text: call.system,
        ...(cache && { cache_control: { type: "ephemeral" as const } }),
      },
      ...(call.context ? [{ type: "text" as const, text: call.context }] : []),
    ],
    messages: [{ role: "user" as const, content: userContent(call) }],
  }
}

function anthropicModel(): BookModel {
  const client = new Anthropic()
  return {
    async json(call, signal) {
      const response = await client.beta.messages.create(
        {
          ...anthropicParams(call, true),
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal }
      )
      if (response.stop_reason === "refusal")
        throw new ModelDeclined("The model declined this text.")
      if (response.stop_reason === "max_tokens")
        throw new ModelCutShort("The reply came back cut short.")
      return {
        value: JSON.parse(textOf(response.content)) as unknown,
        usage: usageOf(response.usage),
      }
    },
    // No caching here: requests in a batch run out of order, so hits are luck,
    // and output is where a book's money goes. Fallbacks aren't accepted on
    // the Batches API, so a declined chunk comes back to the standard path.
    batch: {
      async create(calls) {
        const batch = await client.messages.batches.create({
          requests: calls.map(({ id, call }) => ({
            custom_id: id,
            params: anthropicParams(call, false),
          })),
        })
        return batch.id
      },
      async results(id) {
        const batch = await client.messages.batches.retrieve(id)
        if (batch.processing_status !== "ended") return null
        const out: BatchResult[] = []
        for await (const entry of await client.messages.batches.results(id)) {
          if (
            entry.result.type !== "succeeded" ||
            entry.result.message.stop_reason !== "end_turn"
          ) {
            out.push({ id: entry.custom_id, ok: false })
            continue
          }
          try {
            out.push({
              id: entry.custom_id,
              ok: true,
              value: JSON.parse(textOf(entry.result.message.content)),
              usage: usageOf(entry.result.message.usage),
            })
          } catch {
            out.push({ id: entry.custom_id, ok: false })
          }
        }
        return out
      },
    },
  }
}

function openRouterModel(c: OpenRouterConnection): BookModel {
  return {
    async json(call, signal) {
      try {
        const value = await completeJson(
          c,
          {
            system: [call.system, call.context].filter(Boolean).join("\n\n"),
            user: call.user,
            schema: call.schema,
            images: call.images?.map((i) => `data:${i.media};base64,${i.data}`),
          },
          signal
        )
        return { value, usage: ZERO }
      } catch (e) {
        if (
          e instanceof OpenRouterError &&
          (e.status === 402 || e.status === 401)
        )
          throw new PayerFailed(e.message)
        throw e
      }
    },
  }
}

// Fails closed: only on a developer's machine or under test, and never on any
// Vercel deployment, previews included, however the flag got there.
export const fakeEnabled = () =>
  process.env.BOOKS_AI_FAKE === "1" &&
  !process.env.VERCEL &&
  !process.env.VERCEL_ENV &&
  (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")

export const modelAvailable = (openrouter: OpenRouterConnection | null) =>
  fakeEnabled() || !!openrouter || !!process.env.ANTHROPIC_API_KEY

// The person's OpenRouter account pays when it's on; else the server's key.
export function bookModel(openrouter: OpenRouterConnection | null): BookModel {
  if (fakeEnabled()) return fakeModel()
  return openrouter ? openRouterModel(openrouter) : anthropicModel()
}
