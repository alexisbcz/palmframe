import Anthropic from "@anthropic-ai/sdk"

import {
  completeJson,
  type OpenRouterConnection,
} from "@/lib/openrouter.server"

import { PALETTES, TYPEFACES } from "./looks"
import type { Site } from "./model"
import { applySlots, slotsOf, type Slots } from "./slots"
import { TEMPLATES } from "./templates"

const MODEL = "claude-sonnet-5-5"

export const draftFake = () =>
  !process.env.VERCEL && !!process.env.SITES_AI_FAKE
export const draftAvailable = () =>
  draftFake() || !!process.env.ANTHROPIC_API_KEY

async function ask(
  system: string,
  user: string,
  schema: object,
  openrouter: OpenRouterConnection | null,
  signal: AbortSignal
): Promise<unknown> {
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
        effort: "low",
        format: { type: "json_schema", schema: schema as never },
      },
      system,
      messages: [{ role: "user", content: user }],
    },
    { signal }
  )
  const text = response.content.find((c) => c.type === "text")
  if (!text || text.type !== "text")
    throw new Error("The model returned nothing.")
  return JSON.parse(text.text)
}

const CHOICE = {
  type: "object",
  additionalProperties: false,
  required: ["template", "name", "palette", "typeface"],
  properties: {
    template: { type: "string", enum: TEMPLATES.map((t) => t.id) },
    name: { type: "string" },
    palette: { type: "string", enum: PALETTES.map((p) => p.id) },
    typeface: { type: "string", enum: TYPEFACES.map((t) => t.id) },
  },
}

export interface Choice {
  template: string
  name: string
  palette: string
  typeface: string
}

const VOICE =
  "Write the way a good owner talks: specific, warm and plain. Never invent facts the brief doesn't give, such as awards, customer counts, addresses or real people; where a fact is needed, keep it general. No em dashes. Avoid the words unlock, elevate, seamless and journey."

export function chooseTemplate(
  brief: string,
  fixed: string | null,
  openrouter: OpenRouterConnection | null,
  signal: AbortSignal
): Promise<Choice> {
  if (draftFake())
    return Promise.resolve({
      template: fixed ?? TEMPLATES[0]!.id,
      name: brief.split(/[.,\n]/)[0]!.slice(0, 40),
      palette: "paper",
      typeface: "soft",
    })
  const catalog = TEMPLATES.map(
    (t) => `${t.id}: ${t.name}, ${t.category}. ${t.blurb}`
  ).join("\n")
  return ask(
    `You pick the best starting template, colours and type for a new website. Give the business a name if the brief has none. ${fixed ? `The template must be ${fixed}.` : ""}\n\nTemplates:\n${catalog}\n\nPalettes: ${PALETTES.map((p) => p.id).join(", ")}\nTypefaces: ${TYPEFACES.map((t) => `${t.id} (${t.heading})`).join(", ")}`,
    brief,
    CHOICE,
    openrouter,
    signal
  ) as Promise<Choice>
}

export async function writeSite(
  site: Site,
  brief: string,
  name: string,
  language: string,
  openrouter: OpenRouterConnection | null,
  signal: AbortSignal
): Promise<Site> {
  const slots = slotsOf(site)
  if (draftFake()) return { ...site, name }
  const keys = Object.keys(slots)
  const reply = (await ask(
    `You rewrite every piece of copy on a website template for a new business, in the language with code "${language}". Each entry is one slot. Keep each new text about as long as the old one, because it has to fit the same space. Keep prices and numbers that aren't claims about the business. The field called "${site.name}" anywhere in a slot is the template's old business name: use "${name}" instead. ${VOICE}`,
    `Business brief:\n${brief}\n\nSlots as JSON:\n${JSON.stringify(slots)}`,
    {
      type: "object",
      additionalProperties: false,
      required: ["slots"],
      properties: {
        slots: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "text"],
            properties: { key: { type: "string" }, text: { type: "string" } },
          },
        },
      },
    },
    openrouter,
    signal
  )) as { slots: { key: string; text: string }[] }
  const next: Slots = {}
  for (const { key, text } of reply.slots)
    if (keys.includes(key) && text.trim()) next[key] = text.slice(0, 20_000)
  return { ...applySlots(site, next), name }
}

export async function rewriteText(
  text: string,
  instruction: string,
  openrouter: OpenRouterConnection | null,
  signal: AbortSignal
): Promise<string> {
  if (draftFake()) return `${text} (rewritten)`
  const reply = (await ask(
    `You rewrite one piece of website copy as asked. Keep it about the same length unless told otherwise. ${VOICE}`,
    `Instruction: ${instruction}\n\nText:\n${text}`,
    {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string" } },
    },
    openrouter,
    signal
  )) as { text: string }
  return reply.text
}
