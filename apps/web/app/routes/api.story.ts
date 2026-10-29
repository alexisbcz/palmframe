import Anthropic from "@anthropic-ai/sdk"

import { TAG_GROUPS } from "@/components/comic-canvas/anima-tags"
import { COSTS } from "@/lib/credits"
import {
  OpenRouterError,
  completeJson,
  payingConnection,
  type OpenRouterConnection,
} from "@/lib/openrouter.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.story"

// The story planner: one LLM call turns a story (or "Panel 1: …" beats) into
// a shot per existing panel frame, in Anima's dialect, plus the lettering.
const MODEL = "claude-sonnet-5-5"
const MAX_STORY = 6_000

export type DialogueKind = "say" | "think" | "shout" | "caption"

export interface StoryRequest {
  story: string
  // In reading order. Sizes tell the planner which frames are wide or tall.
  panels: { id: string; width: number; height: number }[]
  cast: { name: string; kind: "girl" | "boy" | "other"; tags: string[] }[]
  style: string
  rtl: boolean
  // What the slide before this one showed, so the story carries on.
  recap: string
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
  }
}

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

function shape(p: { width: number; height: number }) {
  const r = p.width / p.height
  return r > 1.6 ? "wide" : r < 0.7 ? "tall" : "squarish"
}

// The tags Anima knows best, by group; the planner may add other Danbooru tags.
const VOCABULARY = TAG_GROUPS.filter((g) => g.id !== "count")
  .map((g) => `${g.label}: ${g.tags.join(", ")}`)
  .join("\n")

function system(r: StoryRequest) {
  const ids = r.panels.map((p) => p.id)
  return `You are a manga and comic storyboard artist planning one page of an Instagram comic.

The page already has ${ids.length} panel frame${ids.length > 1 ? "s" : ""}. Write exactly one shot per frame, in reading order (${r.rtl ? "right to left, manga style" : "left to right"}):
${r.panels.map((p, i) => `${i + 1}. panel_id "${p.id}", ${shape(p)} (${Math.round(p.width)}x${Math.round(p.height)})`).join("\n")}

If the story is written as "Panel 1: …" beats, follow them one beat per frame. Otherwise split the story into ${ids.length} beats that read well in this order: establish, build, pay off. Use wide frames for establishing shots and tall frames for full-body or vertical action.

Cast (use these exact names in "characters" and as speakers; match names case-insensitively in the story, never invent cast members):
${r.cast.length ? r.cast.map((c) => `- ${c.name} (${c.kind})${c.tags.length ? `: ${c.tags.join(", ")}` : ""}`).join("\n") : "- none: characters stay unnamed, describe them in the prompt"}

The image model is Anima, an anime model that reads Danbooru tags and short English prose. For each frame:
- "tags": 3 to 10 lowercase Danbooru tags with spaces, not underscores, for framing, camera angle, gaze, expression, pose, setting, lighting and effects. Prefer this vocabulary:
${VOCABULARY}
  Never add subject-count tags (1girl, 2boys…), character names, hair or outfit tags of cast members, quality tags or style tags: the app adds those itself.
- "prompt": one or two plain English sentences describing the action, poses, expressions and setting. Cast members are referred to by name. Never quote dialogue, never mention text, letters, signs with writing, speech bubbles or captions: lettering is added later on top of the image.
- "characters": the cast names visible in the frame (may be empty).
- "dialogue": the lines lettered on this frame, at most 3, short enough for a speech bubble (under 90 characters each). kind "say" for speech ("Aki says: …"), "think" for thoughts ("Aki thinks: …"), "shout" for shouting, "caption" for narration boxes (speaker ""). Keep the story's own lines verbatim when it has them. Write dialogue in the language the story is written in. A frame can have no dialogue.

The art style of the comic is "${r.style}"; do not describe the style, only the content.${r.recap ? `\n\nThe previous slide showed:\n${r.recap}` : ""}`
}

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
      system: system(r),
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
          { system: system(r), user: r.story, schema: schema(ids) },
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
