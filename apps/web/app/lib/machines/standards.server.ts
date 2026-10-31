import Anthropic from "@anthropic-ai/sdk"

import { STANDARDS_DESK } from "@/lib/prompts.server"

import {
  type SettledPost,
  holdReason,
  reviewHold,
  settleTake,
  takeRoom,
} from "./gate"
import type { MachineConfig, OutputPlatform } from "./model"
import { signOff } from "./signature"
import { usesDesk } from "./stance"
import {
  type DeskAnswer,
  type DeskState,
  type PostParts,
  DESK_SCHEMA,
  codeBreach,
  parseAnswer,
} from "./standards"

// Pinned, on our key and with no fallbacks: every post at every stop is read by
// the same model, or it isn't read at all.
const DESK_MODEL = "claude-sonnet-5-5"
const MAX_EVIDENCE = 20_000

export const UNREAD_REASON =
  "The standards desk couldn't read this, so it can't go out yet."

export const UNREADABLE_CONFIG =
  "This machine's settings couldn't be read, so this can't go out yet."

// The reader gets the words and what they stand on. Nothing about the machine
// reaches this function, so nothing can tell it the stance. Null is every way
// of not getting an answer, and each caller treats that as a no.
async function askDesk(
  post: PostParts,
  evidence: string,
  abort: AbortSignal
): Promise<DeskAnswer | null> {
  try {
    const response = await new Anthropic().messages.create(
      {
        model: DESK_MODEL,
        max_tokens: 2_000,
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: DESK_SCHEMA },
        },
        system: STANDARDS_DESK.render(),
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              text: post.text,
              take: post.take,
              picture: post.scene,
              alt: post.alt,
              evidence: evidence.slice(0, MAX_EVIDENCE),
            }),
          },
        ],
      },
      { signal: abort }
    )
    if (response.stop_reason !== "end_turn") return null
    const said = response.content.flatMap((b) =>
      b.type === "text" ? [b.text] : []
    )
    return parseAnswer(JSON.parse(said.join("")))
  } catch (e) {
    console.error("Standards desk unavailable", e)
    return null
  }
}

export interface Judged extends SettledPost {
  // Null for a machine the desk doesn't read.
  desk: DeskState | null
  blockRule: string | null
}

// What becomes of what the agent filed. Machines without a stance or a funny
// style only get the gate they always had. Runs before any picture is paid for.
export async function judgePost(
  filed: PostParts,
  evidence: string,
  sources: readonly { source: string }[],
  link: string | null,
  config: MachineConfig,
  outputs: readonly { platform: OutputPlatform }[],
  abort: AbortSignal
): Promise<Judged> {
  const { language } = config
  if (!usesDesk(config))
    return {
      text: filed.text,
      take: "",
      takeNote: null,
      held: holdReason(filed.text, evidence, sources, language),
      desk: null,
      blockRule: null,
    }

  const blocked = (rule: string, why: string): Judged => ({
    text: filed.text.trim(),
    take: "",
    takeNote: null,
    held: why,
    desk: "block",
    blockRule: rule,
  })
  const breach = codeBreach(filed, evidence, language)
  if (breach) return blocked(breach.rule, breach.why)

  const room = takeRoom(outputs, link, signOff(language, sources))
  const settled = settleTake(filed, evidence, sources, language, room)
  const answer = await askDesk(
    { ...filed, take: settled.take },
    evidence,
    abort
  )
  if (!answer)
    return {
      ...settled,
      held: settled.held ?? UNREAD_REASON,
      desk: "unread",
      blockRule: null,
    }
  if (answer.verdict === "block") return blocked(answer.rule, answer.why)
  if (answer.verdict === "hold" && answer.part === "take" && settled.take)
    return {
      text: filed.text.trim(),
      take: "",
      takeNote: answer.why,
      held: settled.held,
      desk: "pass",
      blockRule: null,
    }
  if (answer.verdict === "hold")
    return {
      ...settled,
      held: settled.held ?? answer.why,
      desk: "hold",
      blockRule: null,
    }
  return { ...settled, desk: "pass", blockRule: null }
}

// A person changed the words, or the desk never got to read them.
async function reviewDesk(
  text: string,
  draft: { scene: string; alt: string; evidence: string },
  language: string,
  abort: AbortSignal
): Promise<{ desk: DeskState; held: string | null }> {
  const post = { text, take: "", scene: draft.scene, alt: draft.alt }
  const breach = codeBreach(post, draft.evidence, language)
  if (breach) return { desk: "block", held: breach.why }
  const answer = await askDesk(post, draft.evidence, abort)
  if (!answer) return { desk: "unread", held: UNREAD_REASON }
  if (answer.verdict === "pass") return { desk: "pass", held: null }
  return { desk: answer.verdict, held: answer.why }
}

// What a person pressing approve meets. Changed words go through the gate and
// then the desk. They can overrule a hold by approving the same words again,
// but never a block, and nothing the desk hasn't read gets through. A draft the
// desk has an opinion on keeps it, whatever the machine has been saved as since.
export async function approvalCheck(
  text: string,
  draft: Parameters<typeof reviewHold>[1] & {
    scene: string
    alt: string
    desk: DeskState | null
  },
  language: string,
  desk: boolean,
  abort: AbortSignal
): Promise<{ held: string | null; desk: DeskState | null }> {
  const held = reviewHold(text, draft, language)
  if (!desk && draft.desk === null) return { held, desk: null }
  const changed = text !== draft.text
  if (held) return { held, desk: changed ? "unread" : draft.desk }
  if (changed || draft.desk === "unread" || !draft.desk)
    return reviewDesk(text, draft, language, abort)
  return {
    held: draft.desk === "block" ? "The standards desk stopped this." : null,
    desk: draft.desk,
  }
}
