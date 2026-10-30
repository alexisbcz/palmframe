import Anthropic from "@anthropic-ai/sdk"

import { cleanFacts } from "@/components/comic-canvas/series"
import { COSTS } from "@/lib/credits"
import {
  OpenRouterError,
  completeJson,
  payingConnection,
  type OpenRouterConnection,
} from "@/lib/openrouter.server"
import { STORY_PLANNER, promptId } from "@/lib/prompts.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.story"

// The story planner: one LLM call turns a story (or "Panel 1: …" beats) into
// a shot per existing panel frame, in Anima's dialect, plus the lettering.
const MODEL = "claude-sonnet-5-5"
const MAX_STORY = 6_000

export type DialogueKind = "say" | "think" | "shout" | "caption"

// Where a slide sits in a story told across several.
export interface StoryPart {
  slide: number
  slides: number
}

export interface StoryRequest {
  story: string
  // In reading order. Sizes tell the planner which frames are wide or tall.
  panels: { id: string; width: number; height: number }[]
  cast: { name: string; kind: "girl" | "boy" | "other"; tags: string[] }[]
  style: string
  rtl: boolean
  // What the slide before this one showed, so the story carries on.
  recap: string
  part?: StoryPart
  // In a series: how the carousel before ended, and the facts to respect.
  previous: string
  facts: string[]
}

export interface PlannedPanel {
  panel_id: string
  characters: string[]
  tags: string[]
  prompt: string
  dialogue: { speaker: string; kind: DialogueKind; text: string }[]
}

export const storyAvailable = () => !!process.env.ANTHROPIC_API_KEY

// Whether the planner is set up for this person, and what a plan costs:
// nothing in credits when their OpenRouter account pays.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer } = await getViewer(request)
  const openrouter = viewer ? await payingConnection(viewer.id) : null
  return Response.json({
    available: storyAvailable() || !!openrouter,
    cost: openrouter ? 0 : COSTS.story_plan,
  })
}

function parse(body: unknown): StoryRequest | null {
  const b = body as Partial<StoryRequest> | null
  const story = typeof b?.story === "string" ? b.story.trim() : ""
  if (!story || story.length > MAX_STORY || !Array.isArray(b?.panels))
    return null
  const panels = b.panels
    .filter(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.width === "number" &&
        typeof p.height === "number"
    )
    .slice(0, 12)
  if (!panels.length) return null
  const cast = (Array.isArray(b.cast) ? b.cast : [])
    .filter((c) => c && typeof c.name === "string" && c.name.trim())
    .slice(0, 12)
    .map((c) => ({
      name: c.name.trim().slice(0, 60),
      kind: (["girl", "boy", "other"] as const).includes(c.kind)
        ? c.kind
        : "other",
      tags: Array.isArray(c.tags)
        ? c.tags.filter((t) => typeof t === "string").slice(0, 30)
        : [],
    }))
  return {
    story,
    panels,
    cast,
    style: typeof b.style === "string" ? b.style.slice(0, 40) : "graphic",
    rtl: b.rtl === true,
    recap: typeof b.recap === "string" ? b.recap.slice(0, 2_000) : "",
    ...(Number.isInteger(b.part?.slide) &&
      Number.isInteger(b.part?.slides) &&
      b.part!.slide >= 1 &&
      b.part!.slide <= b.part!.slides && {
        part: { slide: b.part!.slide, slides: b.part!.slides },
      }),
    previous: typeof b.previous === "string" ? b.previous.slice(0, 2_000) : "",
    facts: cleanFacts(b.facts),
  }
}

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

function schema(ids: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["panels"],
    properties: {
      panels: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["panel_id", "characters", "tags", "prompt", "dialogue"],
          properties: {
            panel_id: { type: "string", enum: ids },
            characters: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
            prompt: { type: "string" },
            dialogue: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["speaker", "kind", "text"],
                properties: {
                  speaker: { type: "string" },
                  kind: {
                    type: "string",
                    enum: ["say", "think", "shout", "caption"],
                  },
                  text: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  }
}

async function planWithAnthropic(
  r: StoryRequest,
  ids: string[],
  signal: AbortSignal
) {
  const client = new Anthropic()
  const response = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: schema(ids) },
      },
      system: STORY_PLANNER.render(r),
      messages: [{ role: "user", content: r.story }],
    },
    { signal }
  )
  if (response.stop_reason === "refusal")
    throw new Error("The planner declined this story.")
  if (response.stop_reason === "max_tokens")
    throw new Error("The plan came back cut short; try a shorter story.")
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
  return JSON.parse(text) as unknown
}

// The person's OpenRouter account plans when it pays; else the server's key.
async function plan(
  r: StoryRequest,
  signal: AbortSignal,
  openrouter: OpenRouterConnection | null
) {
  const ids = r.panels.map((p) => p.id)
  const parsed = (
    openrouter
      ? await completeJson(
          openrouter,
          {
            system: STORY_PLANNER.render(r),
            user: r.story,
            schema: schema(ids),
          },
          signal
        )
      : await planWithAnthropic(r, ids, signal)
  ) as { panels: PlannedPanel[] }
  // One shot per frame, in the frames' order, whatever came back.
  const names = new Map(r.cast.map((c) => [c.name.toLowerCase(), c.name]))
  return ids.map((id): PlannedPanel => {
    const p = parsed.panels.find((x) => x.panel_id === id)
    return {
      panel_id: id,
      characters: [
        ...new Set(
          (p?.characters ?? [])
            .map((n) => names.get(n.trim().toLowerCase()))
            .filter((n): n is string => !!n)
        ),
      ],
      tags: (p?.tags ?? []).map((t) => t.trim()).filter(Boolean),
      prompt: p?.prompt.trim() ?? "",
      dialogue: (p?.dialogue ?? []).filter((d) => d.text.trim()).slice(0, 4),
    }
  })
}

// Signed in, a plan is paid for in credits like a render: charged first,
// refunded if planning fails, unless the person's OpenRouter account pays.
// Signed out, it's only allowed off Vercel.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const r = parse(await request.json().catch(() => null))
  if (!r)
    return error(
      `Invalid request: a story (up to ${MAX_STORY} characters) and at least one panel are required.`,
      400
    )
  const { supabase, viewer } = await getViewer(request)
  if (!viewer && process.env.VERCEL) return error("Sign in to plan.", 401)
  const openrouter = viewer ? await payingConnection(viewer.id) : null
  if (!openrouter && !storyAvailable())
    return error(
      "The story planner is not set up: set ANTHROPIC_API_KEY on the server, or connect OpenRouter in Settings.",
      501
    )

  const job = crypto.randomUUID()
  let credits: number | null = null
  if (viewer && !openrouter) {
    const spent = await supabase.rpc("spend_credits", {
      p_cost: COSTS.story_plan,
      p_kind: "story_plan",
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
      panels: await plan(r, request.signal, openrouter),
      prompt: promptId(STORY_PLANNER),
    })
    if (openrouter) res.headers.set("x-billed", "openrouter")
  } catch (e) {
    const message =
      e instanceof Anthropic.APIError
        ? `The planner failed (${e.status ?? "network"}): ${e.message}`
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
