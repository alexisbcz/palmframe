// "Spawn a squad": one model call that invents several distinct agents for a
// niche, each with its own role, angle, voice and handle, so a fleet of twenty
// doesn't post twenty versions of the same thing.
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import { PLATFORMS, ROLES, type Platform } from "./model"

const MODEL = "claude-sonnet-5-5"

export const MAX_SQUAD = 12

const agentSchema = z.object({
  name: z.string().min(1).max(60),
  handle: z.string().max(40),
  role: z.enum(ROLES.map((r) => r.id) as [string, ...string[]]),
  brief: z.string().min(3).max(2000),
  voice: z.string().max(600),
  topics: z.array(z.string().max(60)).max(8),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
})

export type SquadAgent = z.infer<typeof agentSchema>

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["agents"],
  properties: {
    agents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "handle",
          "role",
          "brief",
          "voice",
          "topics",
          "platforms",
        ],
        properties: {
          name: { type: "string" },
          handle: { type: "string" },
          role: { type: "string", enum: ROLES.map((r) => r.id) },
          brief: { type: "string" },
          voice: { type: "string" },
          topics: { type: "array", items: { type: "string" } },
          platforms: {
            type: "array",
            items: { type: "string", enum: [...PLATFORMS] },
          },
        },
      },
    },
  },
} as const

export async function inventSquad(input: {
  niche: string
  count: number
  platforms: Platform[]
  product?: string
}) {
  const roles = ROLES.map((r) => `- ${r.id}: ${r.name}. ${r.pitch}`).join("\n")
  const response = await new Anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 8_000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: `You design squads of autonomous social media agents for a creator. Each agent researches the web, X, Reddit and TikTok on its own and posts on a schedule. Agents in one squad must not overlap: give each a different role or a clearly different sub-niche, angle and voice. Briefs are instructions to the agent, in the second person, 2 to 4 sentences, concrete about what to look for and what to post. Voices are one or two sentences about tone and form. Handles are short, lowercase, plausible and not real people's. Names are short persona names (\"The Benchmarker\", \"Ops Oracle\"), never real people.\n\nRoles:\n${roles}`,
    messages: [
      {
        role: "user",
        content: `Niche: ${input.niche}\n${input.product ? `What the creator sells or builds: ${input.product}\n` : ""}Networks available: ${input.platforms.join(", ")}\nDesign exactly ${input.count} agents.`,
      },
    ],
  })
  if (response.stop_reason === "refusal")
    throw new Error("The model declined that niche.")
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
  const parsed = z
    .object({ agents: z.array(z.unknown()) })
    .parse(JSON.parse(text))
  return parsed.agents
    .map((a) => agentSchema.safeParse(a))
    .filter((r) => r.success)
    .map((r) => {
      const a = r.data!
      const platforms = a.platforms.filter((p) => input.platforms.includes(p))
      return {
        ...a,
        platforms: platforms.length ? platforms : input.platforms.slice(0, 1),
      }
    })
    .slice(0, input.count)
}
