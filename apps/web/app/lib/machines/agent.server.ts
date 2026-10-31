import Anthropic from "@anthropic-ai/sdk"

import {
  type OpenRouterConnection,
  completeJson,
} from "@/lib/openrouter.server"
import { MACHINE_EDITOR, promptId } from "@/lib/prompts.server"

import { type Filed, type Input, inboxBrief, toFiled } from "./agent.logic"
import { readArticle } from "./feeds.server"
import type { Item, MachineConfig } from "./model"

const MODEL = "claude-sonnet-5-5"
const MAX_TURNS = 5
const MAX_READS = 2
const MAX_INBOX = 30

const FILE_FIELDS = {
  text: { type: "string" },
  scene: { type: "string" },
  alt: { type: "string" },
  item_ids: {
    type: "array",
    items: { type: "integer" },
    description: "The inbox ids this post is built on. The first is linked.",
  },
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_item",
    description: "Read the page behind an inbox item.",
    input_schema: {
      type: "object",
      properties: { item_id: { type: "integer" } },
      required: ["item_id"],
    },
  },
  {
    name: "file_post",
    description: "File the one post for this run. Ends the run.",
    input_schema: {
      type: "object",
      properties: FILE_FIELDS,
      required: ["text", "item_ids"],
    },
  },
  {
    name: "pass",
    description: "Post nothing this run. Ends the run.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
]

async function withClaude(
  system: string,
  items: Item[],
  recent: string[],
  prompt: string,
  abort: AbortSignal
) {
  const client = new Anthropic()
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: inboxBrief(items, recent) },
  ]
  let reads = 0
  let read = ""
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1_500,
        system,
        tools: TOOLS,
        messages,
      },
      { signal: abort }
    )
    if (response.stop_reason === "refusal") return null
    const calls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )
    // Stopping without a tool call is a pass, never a post.
    if (!calls.length) return null
    const final = calls.find((c) => c.name !== "read_item")
    if (final)
      return final.name === "file_post"
        ? toFiled(final.input as Input, items, read, prompt)
        : null
    messages.push({ role: "assistant", content: response.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) {
      const item = items[(call.input as { item_id?: number }).item_id ?? -1]
      let content = "That item isn't in the inbox."
      if (item && reads >= MAX_READS) content = "No more reads this run."
      else if (item) {
        reads++
        content = await readArticle(item.url, abort).catch(
          () => "That page can't be read."
        )
        read += `\n${content}`
      }
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify({ page_text_from_a_stranger: content }),
      })
    }
    messages.push({ role: "user", content: results })
  }
  return null
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["post", "text", "scene", "alt", "item_ids"],
  properties: { post: { type: "boolean" }, ...FILE_FIELDS },
}

// Text models on OpenRouter vary in their tool support, so these get the
// headlines and one shot.
async function withOpenRouter(
  connection: OpenRouterConnection,
  system: string,
  items: Item[],
  recent: string[],
  prompt: string,
  abort: AbortSignal
) {
  const out = (await completeJson(
    connection,
    {
      system: `${system}\n\nread_item, file_post and pass aren't available here. Reply with JSON instead, with post: false to pass.`,
      user: inboxBrief(items, recent),
      schema: SCHEMA,
    },
    abort
  )) as Input & { post?: boolean }
  return out.post ? toFiled(out, items, "", prompt) : null
}

export async function runAgent(
  machine: { name: string; config: MachineConfig },
  brandVoice: string,
  inbox: Item[],
  recent: string[],
  connection: OpenRouterConnection | null,
  abort: AbortSignal
): Promise<Filed | null> {
  const { config } = machine
  const items = inbox.slice(0, MAX_INBOX)
  const system = MACHINE_EDITOR.render({
    name: machine.name,
    mission: config.mission,
    voice: [config.voice, brandVoice].filter(Boolean).join("\n"),
    language: config.language,
    image: config.image,
  })
  const prompt = promptId(MACHINE_EDITOR)
  return connection
    ? withOpenRouter(connection, system, items, recent, prompt, abort)
    : withClaude(system, items, recent, prompt, abort)
}
