import { z } from "zod"

import { unsourcedQuotes } from "./gate"
import { type GateLanguage, GATE_LANGUAGES, gateLanguage } from "./gate.words"

// The plain-code half of the standards desk, and the shape of the reader's
// answer. Every machine with a stance or a funny style goes through both.

// What the desk has said about the words in a draft. `unread` means it couldn't
// say anything, which no post gets past.
export const DESK_STATES = ["pass", "hold", "block", "unread"] as const
export type DeskState = (typeof DESK_STATES)[number]

export const BLOCK_RULES = [
  "hate",
  "violence",
  "harassment",
  "fabrication",
  "impersonation",
  "election_claim",
] as const
export const HOLD_RULES = [
  "voting_procedure",
  "private_person",
  "death_or_illness",
  "harm",
  "partisan_as_fact",
  "accusation",
  "contradicted",
  "cause_as_fact",
] as const
export type DeskRule =
  (typeof BLOCK_RULES)[number] | (typeof HOLD_RULES)[number] | "handle"

const RULES: readonly string[] = [...BLOCK_RULES, ...HOLD_RULES]

export const DESK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "rule", "part", "why"],
  properties: {
    verdict: { type: "string", enum: ["pass", "hold", "block"] },
    rule: { type: "string", enum: ["none", ...RULES] },
    part: { type: "string", enum: ["post", "take"] },
    why: { type: "string" },
  },
}

const answer = z.object({
  verdict: z.enum(["pass", "hold", "block"]),
  rule: z.string(),
  part: z.enum(["post", "take"]),
  why: z.string().max(1000),
})
export type DeskAnswer = z.infer<typeof answer>

// Null for anything but a well-formed answer. A hold or block with no rule on
// the list or no reason isn't one: the owner would be told nothing. The schema
// can't say this, because the API takes no string lengths and a pass has no why.
export function parseAnswer(raw: unknown): DeskAnswer | null {
  const parsed = answer.safeParse(raw)
  if (!parsed.success) return null
  const { verdict, rule, why } = parsed.data
  const reason = why.trim().slice(0, 280)
  if (verdict !== "pass" && (!RULES.includes(rule) || !reason)) return null
  return { ...parsed.data, why: reason }
}

// Phrases, not words: "parasites" is a health story and "invasion" is a war. A
// short hand-kept list of what no stance needs. It catches the lazy cases, and
// the reader is there for the rest.
const STOPLIST: Record<GateLanguage, RegExp> = {
  en: /\b(globalists?|great replacement|subhumans?|untermenschen|(?:are|is a|are all|these) (?:vermin|cockroaches|parasites|animals|a plague|an infestation)|(?:hang|shoot|lynch|exterminate|deport) them all)\b/iu,
  fr: /(mondialistes?|grand remplacement|sous-hommes?|(?:sont|est) (?:de la |des )(?:vermine|cafards|parasites)|(?:pendez|fusillez|exterminez)-les)/iu,
  es: /(globalistas?|gran reemplazo|subhumanos?|(?:son|es) (?:una )?(?:alimañas?|cucarachas|parásitos|plaga)|(?:ahórquenlos|fusílenlos|exterminadlos))/iu,
  de: /(globalisten|gro(?:ß|ss)er austausch|untermenschen?|(?:sind|ist) (?:ungeziefer|kakerlaken|parasiten)|(?:hängt|erschießt|vernichtet) sie)/iu,
  it: /(globalisti|grande sostituzione|subumani|(?:sono|è) (?:parassiti|scarafaggi|feccia)|(?:impiccateli|fucilateli|sterminateli))/iu,
  ja: /(グローバリスト|大置換|害虫ども|ゴキブリども|皆殺し)/u,
}

const HANDLE = /(?<![\p{L}\p{N}._%+-])@[\p{L}\p{N}_][\p{L}\p{N}_.-]{1,}/u

export interface PostParts {
  text: string
  take: string
  scene: string
  alt: string
}

const every = (post: PostParts) =>
  [post.text, post.take, post.scene, post.alt].join("\n")

export const stopped = (text: string, language: GateLanguage) =>
  STOPLIST[language].test(text) || STOPLIST.en.test(text)

// A breach the code can see by itself. Read in every field, taken or not:
// a slur in a take isn't excused by the take being dropped.
export function codeBreach(
  post: PostParts,
  evidence: string,
  machineLanguage: string
): { rule: DeskRule; why: string } | null {
  const language = gateLanguage(machineLanguage)
  const all = every(post)
  if (GATE_LANGUAGES.includes(language) && stopped(all, language))
    return { rule: "hate", why: "It uses a phrase on the standards stoplist." }
  if (HANDLE.test(all))
    return { rule: "handle", why: "It names an account with an @handle." }
  const quoted = unsourcedQuotes(`${post.scene}\n${post.alt}`, evidence)
  if (quoted.length)
    return {
      rule: "fabrication",
      why: `The picture quotes "${quoted[0]!.slice(0, 80)}", which the sources don't say.`,
    }
  return null
}
