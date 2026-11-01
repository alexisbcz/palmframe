import Anthropic from "@anthropic-ai/sdk"

import {
  completeJson,
  type OpenRouterConnection,
} from "@/lib/openrouter.server"

import { MUSIC_MODES } from "./model"
import { SCRIPT_GUIDE } from "./script"

const MODEL = "claude-sonnet-5-5"

export interface OutlineRequest {
  mode: "outline"
  premise: string
  genre: string
  tone: string
  length: number // scenes
  language: string
}

export interface SceneRequest {
  mode: "scene"
  // The world as names, so the script uses what exists.
  bible: string
  scene: string
  summary: string
  instruction: string
  current: string
  next: string[]
  language: string
}

export interface ScoreRequest {
  mode: "score"
  description: string
}

export type WriteRequest = OutlineRequest | SceneRequest | ScoreRequest

export interface Outline {
  title: string
  synopsis: string
  art_style: string
  characters: {
    name: string
    bio: string
    look: string
    poses: string[]
  }[]
  locations: { name: string; prompt: string }[]
  variables: { name: string; kind: "number" | "flag"; hud: boolean }[]
  scenes: {
    name: string
    summary: string
    leads_to: string[]
    is_ending: boolean
  }[]
}

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : ""

export function parseWrite(body: unknown): WriteRequest | null {
  const b = body as Record<string, unknown> | null
  if (b?.mode === "outline") {
    const premise = text(b.premise, 4_000)
    if (!premise) return null
    return {
      mode: "outline",
      premise,
      genre: text(b.genre, 80),
      tone: text(b.tone, 80),
      length: Math.min(24, Math.max(3, Number(b.length) || 8)),
      language: text(b.language, 20) || "en",
    }
  }
  if (b?.mode === "scene") {
    const scene = text(b.scene, 120)
    if (!scene) return null
    return {
      mode: "scene",
      scene,
      bible: text(b.bible, 12_000),
      summary: text(b.summary, 2_000),
      instruction: text(b.instruction, 2_000),
      current: text(b.current, 12_000),
      next: (Array.isArray(b.next) ? b.next : [])
        .map((n) => text(n, 120))
        .filter(Boolean)
        .slice(0, 12),
      language: text(b.language, 20) || "en",
    }
  }
  if (b?.mode === "score") {
    const description = text(b.description, 600)
    return description ? { mode: "score", description } : null
  }
  return null
}

const OUTLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "synopsis",
    "art_style",
    "characters",
    "locations",
    "variables",
    "scenes",
  ],
  properties: {
    title: { type: "string" },
    synopsis: { type: "string" },
    art_style: { type: "string" },
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "bio", "look", "poses"],
        properties: {
          name: { type: "string" },
          bio: { type: "string" },
          look: { type: "string" },
          poses: { type: "array", items: { type: "string" } },
        },
      },
    },
    locations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "prompt"],
        properties: { name: { type: "string" }, prompt: { type: "string" } },
      },
    },
    variables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "kind", "hud"],
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["number", "flag"] },
          hud: { type: "boolean" },
        },
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "summary", "leads_to", "is_ending"],
        properties: {
          name: { type: "string" },
          summary: { type: "string" },
          leads_to: { type: "array", items: { type: "string" } },
          is_ending: { type: "boolean" },
        },
      },
    },
  },
}

const SCENE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["script"],
  properties: { script: { type: "string" } },
}

const SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "mode",
    "root",
    "bpm",
    "swing",
    "pad",
    "keys",
    "pluck",
    "bass",
    "drums",
    "bell",
    "warmth",
    "space",
    "tape",
  ],
  properties: {
    name: { type: "string" },
    mode: { type: "string", enum: MUSIC_MODES },
    root: { type: "integer" },
    bpm: { type: "integer" },
    swing: { type: "number" },
    pad: { type: "number" },
    keys: { type: "number" },
    pluck: { type: "number" },
    bass: { type: "number" },
    drums: { type: "number" },
    bell: { type: "number" },
    warmth: { type: "number" },
    space: { type: "number" },
    tape: { type: "number" },
  },
}

const OUTLINE_SYSTEM = `You plan visual novels in the tradition of Ren'Py games. Given a premise, you design a story with real branches: choices that change what happens, not just what is said.

Rules:
- Between 2 and 5 characters. Give each a distinct voice and want. "look" is a precise visual description that an illustrator could repeat identically: age, build, hair, eyes, clothes. "poses" lists 3 to 5 expressions such as neutral, happy, sad, angry.
- Locations are places, with a "prompt" describing the empty place for a background painter. No people in them.
- Scenes form a graph. "leads_to" names later scenes, exactly as named. The first scene comes first in the list. Have at least two endings, and mark them with is_ending.
- Variables track what the reader's choices build up. Names are lowercase with underscores.
- "art_style" is one sentence describing the look of all the art.
- Write every name and summary in the language with code {language}, except variable names.`

const SCENE_SYSTEM = `You write one scene of a visual novel as a script. Answer with the script alone in the "script" field.

The script language:

${SCRIPT_GUIDE}

Rules:
- Use only characters, sets, tracks, poses, items and variables from the bible, by their script names. You may name a new set, track or pose if the scene truly needs one; it will be created.
- Start by setting the scene: a set, the people in it, and music if the mood changes.
- Direct it like a film: move people, change poses, use sound, camera and weather where they carry feeling. Don't decorate every line.
- Write dialogue people would say. Short lines. Subtext. No narrator explaining what a line already showed.
- A line of text must fit in about three lines of a textbox: under 200 characters.
- End the scene by leading on: a "jump", a "menu" whose options use "->", or "end <name>" if it's an ending. Only jump to the scenes listed as next.
- Write dialogue and narration in the language with code {language}. Keep the script's commands in English.`

const SCORE_SYSTEM = `You set a small synthesiser to match a description of a piece of music for a visual novel. root is 0 to 11 semitones above C. bpm is 50 to 150. Every other number is between 0 and 1. A voice at 0 is silent: use only the voices the piece needs. name is two or three evocative words.`

async function ask(
  system: string,
  user: string,
  schema: object,
  openrouter: OpenRouterConnection | null,
  signal: AbortSignal
) {
  if (openrouter)
    return completeJson(openrouter, { system, user, schema }, signal)
  const client = new Anthropic()
  const response = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: schema as never },
      },
      system,
      messages: [{ role: "user", content: user }],
    },
    { signal }
  )
  if (response.stop_reason === "refusal")
    throw new Error("The writer declined this story.")
  if (response.stop_reason === "max_tokens")
    throw new Error("The answer came back cut short; ask for less.")
  return JSON.parse(
    response.content.map((b) => (b.type === "text" ? b.text : "")).join("")
  ) as unknown
}

const FAKE_OUTLINE: Outline = {
  title: "The Night Train",
  synopsis: "Two strangers share the last train out of a city that is closing.",
  art_style: "Soft gouache anime backgrounds with clean line art",
  characters: [
    {
      name: "Ines",
      bio: "A conductor on her last shift.",
      look: "Woman, 30, short black hair, navy conductor's coat",
      poses: ["neutral", "happy", "sad"],
    },
    {
      name: "Tomas",
      bio: "A passenger with no ticket.",
      look: "Man, 28, curly brown hair, green scarf",
      poses: ["neutral", "surprised"],
    },
  ],
  locations: [
    {
      name: "Platform",
      prompt: "An empty night train platform under sodium lights",
    },
    { name: "Carriage", prompt: "An old train carriage interior at night" },
  ],
  variables: [{ name: "trust", kind: "number", hud: true }],
  scenes: [
    {
      name: "Last Call",
      summary: "Ines finds Tomas on the platform.",
      leads_to: ["The Ticket", "Left Behind"],
      is_ending: false,
    },
    {
      name: "The Ticket",
      summary: "She lets him board.",
      leads_to: [],
      is_ending: true,
    },
    {
      name: "Left Behind",
      summary: "The train leaves without him.",
      leads_to: [],
      is_ending: true,
    },
  ],
}

export const writerFake = () =>
  !process.env.VERCEL && !!process.env.NOVELS_AI_FAKE

export async function write(
  r: WriteRequest,
  openrouter: OpenRouterConnection | null,
  signal: AbortSignal
): Promise<unknown> {
  if (r.mode === "outline") {
    if (writerFake()) return FAKE_OUTLINE
    return ask(
      OUTLINE_SYSTEM.replace("{language}", r.language),
      `Premise: ${r.premise}\nGenre: ${r.genre || "any"}\nTone: ${r.tone || "any"}\nNumber of scenes: ${r.length}`,
      OUTLINE_SCHEMA,
      openrouter,
      signal
    )
  }
  if (r.mode === "scene") {
    if (writerFake())
      return {
        script: `"The rain had not stopped since noon."\nshow ines neutral at center with dissolve 0.5s\nines "Last call."\n${r.next[0] ? `jump ${r.next[0]}` : "end"}`,
      }
    return ask(
      SCENE_SYSTEM.replace("{language}", r.language),
      `The bible:\n${r.bible}\n\nThis scene: ${r.scene}\nWhat happens: ${r.summary || "(up to you)"}\nNext scenes: ${r.next.join(", ") || "(none: this is an ending)"}\n${r.current ? `\nThe scene so far, to rewrite or continue:\n${r.current}\n` : ""}${r.instruction ? `\nThe author asks: ${r.instruction}` : ""}`,
      SCENE_SCHEMA,
      openrouter,
      signal
    )
  }
  if (writerFake())
    return {
      name: "Fake Tide",
      mode: "minor",
      root: 2,
      bpm: 70,
      swing: 0,
      pad: 0.7,
      keys: 0.5,
      pluck: 0,
      bass: 0.3,
      drums: 0,
      bell: 0.4,
      warmth: 0.7,
      space: 0.7,
      tape: 0.3,
    }
  return ask(SCORE_SYSTEM, r.description, SCORE_SCHEMA, openrouter, signal)
}
