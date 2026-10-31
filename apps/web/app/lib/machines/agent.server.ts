import Anthropic from "@anthropic-ai/sdk"

import {
  type OpenRouterConnection,
  completeJson,
} from "@/lib/openrouter.server"

import {
  type AgentResult,
  type Input,
  type Memory,
  FILE_FIELDS,
  editorFor,
  fromTool,
  inboxBrief,
  passed,
  toolsFor,
} from "./agent.logic"
import { readArticle } from "./feeds.server"
import type { Item, MachineConfig } from "./model"
import { usesDesk } from "./stance"

const MODEL = "claude-sonnet-5-5"
const MAX_TURNS = 5
const MAX_READS = 2
const MAX_INBOX = 30

async function withClaude(
  system: string,
  tools: Anthropic.Tool[],
  items: Item[],
  memory: Memory,
  prompt: string,
  abort: AbortSignal
): Promise<AgentResult> {
  const client = new Anthropic()
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: inboxBrief(items, memory) },
  ]
  let reads = 0
  let read = ""
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1_500,
        system,
        tools,
        messages,
      },
      { signal: abort }
    )
    if (response.stop_reason === "refusal")
      return { decision: "refused", reason: "", prompt }
    const calls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )
    // Stopping without a tool call is a pass, never a post.
    if (!calls.length) {
      const said = response.content.flatMap((b) =>
        b.type === "text" ? [b.text] : []
      )
      return passed(said.join(" "), prompt)
    }
    const final = calls.find((c) => c.name !== "read_item")
    if (final)
      return final.name === "file_post"
        ? fromTool(final.input as Input, items, read, prompt)
        : passed((final.input as { reason?: unknown }).reason, prompt)
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
  return { decision: "exhausted", reason: "", prompt }
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["post", "reason", "text", "scene", "alt", "item_ids"],
  properties: {
    post: { type: "boolean" },
    reason: { type: "string" },
    ...FILE_FIELDS,
  },
}

// Text models on OpenRouter vary in their tool support, so these get the
// headlines and one shot.
async function withOpenRouter(
  connection: OpenRouterConnection,
  system: string,
  items: Item[],
  memory: Memory,
  prompt: string,
  abort: AbortSignal
): Promise<AgentResult> {
  const out = (await completeJson(
    connection,
    {
      system: `${system}\n\nread_item, file_post and pass aren't available here. Reply with JSON instead, with post: false to pass and why in reason.`,
      user: inboxBrief(items, memory),
      schema: SCHEMA,
    },
    abort
  )) as Input & { post?: boolean; reason?: unknown }
  return out.post
    ? fromTool(out, items, "", prompt)
    : passed(out.reason, prompt)
}

export async function runAgent(
  machine: { name: string; config: MachineConfig },
  brandVoice: string,
  inbox: Item[],
  memory: Memory,
  connection: OpenRouterConnection | null,
  abort: AbortSignal
): Promise<AgentResult> {
  const items = inbox.slice(0, MAX_INBOX)
  const { system, prompt } = editorFor(machine, brandVoice)
  const desk = usesDesk(machine.config)
  // The desk runs on our key, so these machines never run on OpenRouter. The
  // runner stops them first; this is the backstop.
  if (connection && desk) throw new Error("This machine needs Claude.")
  return connection
    ? withOpenRouter(connection, system, items, memory, prompt, abort)
    : withClaude(system, toolsFor(desk), items, memory, prompt, abort)
}
