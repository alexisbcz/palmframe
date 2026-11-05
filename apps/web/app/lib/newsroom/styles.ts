// How a story is written, on top of its template: a voice and a language.
// Shared by server and browser.
import { z } from "zod"

export const VOICE_IDS = [
  "house",
  "punchy",
  "analytical",
  "conversational",
  "plain",
  "witty",
  "formal",
  "narrative",
] as const

export type VoiceId = (typeof VOICE_IDS)[number]

// What each voice tells the writer. "house" adds nothing: the template's own
// voice. A template's rules still apply, so a wire brief stays neutral.
export const VOICE_BRIEFS: Record<VoiceId, string> = {
  house: "",
  punchy:
    "Punchy: high energy and fast. Very short paragraphs, strong verbs, one idea per line. Lead every section with its most surprising fact.",
  analytical:
    "Analytical: measured and precise. Put the evidence first, separate what is known from what is inferred, and spell out second-order effects and trade-offs.",
  conversational:
    "Conversational: talk to one reader as 'you', in plain spoken language. Contractions are welcome. Warm, never chummy.",
  plain:
    "Plain language: write for a 12-year-old. Sentences under 15 words, everyday words, define every term in the same sentence it appears.",
  witty:
    "Witty: dry, understated humour drawn from the facts themselves. One good line per section at most. Never mock private people.",
  formal:
    "Formal: institutional and exact. No contractions, no slang, full titles and dates, careful hedging where the evidence is thin.",
  narrative:
    "Narrative: tell it as a story with people, moments and a sense of time passing, while every detail stays sourced.",
}

export const LANGUAGES = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  ja: "日本語",
} as const

export type LanguageId = keyof typeof LANGUAGES

export const LANGUAGE_IDS = Object.keys(LANGUAGES) as LanguageId[]

export const storyOptions = z.object({
  voice: z.enum(VOICE_IDS).default("house"),
  language: z.enum(LANGUAGE_IDS as [LanguageId, ...LanguageId[]]).default("en"),
})

export type StoryOptions = z.infer<typeof storyOptions>

export const readOptions = (raw: unknown): StoryOptions => {
  const parsed = storyOptions.safeParse(raw ?? {})
  return parsed.success ? parsed.data : { voice: "house", language: "en" }
}

// The instruction added to a template's style guide.
export function styleAddendum(o: StoryOptions) {
  const lines: string[] = []
  if (o.voice !== "house")
    lines.push(`Voice for this story: ${VOICE_BRIEFS[o.voice]}`)
  if (o.language !== "en")
    lines.push(
      `Write the whole article (title, dek, body and subheads) in ${LANGUAGES[o.language]}. Keep quotations in the language they were said or written in, and give a translation in parentheses after a quote the reader may not understand. Facts you record with record_fact may stay in English.`
    )
  return lines.join("\n\n")
}

export const THEME_IDS = ["paper", "broadsheet", "midnight", "zine"] as const
export type ThemeId = (typeof THEME_IDS)[number]
