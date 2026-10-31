import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core"
import { createModels } from "@earendil-works/pi-ai"
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic"

import { RESEARCH_METHOD, STYLE_GUIDE } from "./style"
import { type Run, researchTools } from "./tools.server"

const MODEL = "claude-sonnet-5-5"

const system = () =>
  `${RESEARCH_METHOD.replace("{today}", new Date().toISOString().slice(0, 10))}\n\nHow the article must read:\n${STYLE_GUIDE}`

// A run cut off mid-reply can't be continued from a half-written answer.
export function resumable(messages: AgentMessage[]) {
  const kept = [...messages]
  while (kept.length) {
    const last = kept.at(-1) as { role?: string; stopReason?: string }
    if (last.role === "assistant") kept.pop()
    else break
  }
  return kept
}

// One stretch of work. Returns the conversation so the next one can pick up.
export async function workOn(
  lead: string,
  saved: AgentMessage[],
  run: Run,
  budgetMs: number,
  hooks: {
    log: (tool: string, label: string) => void
    checkpoint: (messages: AgentMessage[]) => Promise<void>
  }
) {
  const models = createModels()
  models.setProvider(anthropicProvider())
  const model = models.getModel("anthropic", MODEL)
  if (!model) throw new Error(`Model ${MODEL} isn't available.`)
  const agent = new Agent({
    initialState: {
      systemPrompt: system(),
      model,
      tools: researchTools(run, hooks.log),
      messages: resumable(saved),
    },
    streamFn: models.streamSimple.bind(models),
  })
  agent.subscribe(async (event) => {
    if (event.type === "turn_end")
      await hooks.checkpoint(agent.state.messages as AgentMessage[])
  })
  const timer = setTimeout(() => agent.abort(), budgetMs)
  try {
    if (agent.state.messages.some((m) => m.role !== "system"))
      await agent.continue()
    else
      await agent.prompt(
        `The lead: ${lead}\n\nResearch it and file the article.`
      )
  } finally {
    clearTimeout(timer)
  }
  return agent.state.messages as AgentMessage[]
}
