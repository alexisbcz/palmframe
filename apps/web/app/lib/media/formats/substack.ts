import { wordCount } from "@/lib/deepdive/check"

import type { FormatDefinition, Rendition } from "../model"
import {
  FIDELITY,
  VOICE,
  baseProblems,
  bodyOf,
  hasWords,
  metaProblems,
} from "./blog"

export const SUBJECT_MAX = 60
export const PREVIEW_MAX = 140
export const MIN_WORDS = 400
export const MAX_WORDS = 1200
export const MIN_SECTIONS = 2
export const MAX_SECTIONS = 5
export const OPENER_MAX_WORDS = 120
export const SIGN_OFF_MAX_WORDS = 40

const HEADING = /^#{1,6}\s/m

// What survives a paste into the Substack editor, and what arrives as litter.
const PASTE_TRAPS: [RegExp, string][] = [
  [/<(?!https?:)\/?[a-z][^>\n]*>/i, "HTML tags"],
  [/^\s*\|.*\|\s*$/m, "a table"],
  [/\[\^[^\]]+\]/, "a footnote marker"],
  [/\]\[[^\]]*\]|^\[[^\]]+\]:\s/m, "a reference-style link"],
  [/!\[[^\]]*\]\(/, "an inline image"],
]

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

function check(r: Rendition) {
  const problems = baseProblems(r, "substack")
  const body = bodyOf(r)
  const words = wordCount(body)
  if (words < MIN_WORDS)
    problems.push(`${words} words, write at least ${MIN_WORDS}.`)
  if (words > MAX_WORDS) problems.push(`${words} words, cut to ${MAX_WORDS}.`)

  problems.push(
    ...metaProblems(r, "subject", "subject line", { max: SUBJECT_MAX }),
    ...metaProblems(r, "previewText", "preview text", { max: PREVIEW_MAX })
  )
  const { subject, previewText } = r.meta
  if (subject && previewText && norm(subject) === norm(previewText))
    problems.push(
      "The preview text repeats the subject line. Add something new."
    )

  if (/^#\s/m.test(body))
    problems.push(
      'Remove the "# " heading. The title is the edition\'s headline.'
    )
  const sections = body.match(/^##\s+\S/gm)?.length ?? 0
  if (sections < MIN_SECTIONS)
    problems.push(
      `${sections} sections, use "## " headings to reach ${MIN_SECTIONS}.`
    )
  if (sections > MAX_SECTIONS)
    problems.push(`${sections} sections, merge down to ${MAX_SECTIONS}.`)

  const texts = r.parts.map((p) => p.text.trim()).filter(hasWords)
  const opener = texts[0]
  const signOff = texts.at(-1)
  if (opener) {
    if (HEADING.test(opener))
      problems.push(
        "Part 1 must be the personal opener alone, with the first heading after it."
      )
    if (wordCount(opener) > OPENER_MAX_WORDS)
      problems.push(
        `The opener is ${wordCount(opener)} words, cut it to ${OPENER_MAX_WORDS}.`
      )
    if (!/\bI\b|\b(?:my|you|your)\b/i.test(opener))
      problems.push(
        'The opener reads like an article. Talk to the reader with "I" or "you".'
      )
  }
  if (signOff && texts.length > 1) {
    if (HEADING.test(signOff) || wordCount(signOff) > SIGN_OFF_MAX_WORDS)
      problems.push(
        `End with a sign-off of up to ${SIGN_OFF_MAX_WORDS} words in its own last part, with no heading.`
      )
  } else if (signOff) {
    problems.push(
      "Split the edition: opener first, sections next, sign-off last."
    )
  }

  for (const [trap, name] of PASTE_TRAPS)
    if (trap.test(body))
      problems.push(`Remove ${name}. It won't paste cleanly into Substack.`)
  return { findings: [], problems }
}

export const substack: FormatDefinition = {
  id: "substack",
  brief: `Format: one newsletter edition, read in an inbox by people who chose to get it. They already trust you a little. Don't spend that trust. Write to one reader, not to a list.

This isn't the article with a greeting on top. It is shorter and warmer, and it picks the part of the Story that made you sit up.

Inbox fields in meta, both required:
- subject: up to ${SUBJECT_MAX} characters, and the first 40 should work alone on a phone. Curiosity plus one concrete detail. It must be true and paid off in the edition. No "Re:", no all caps, no edition number.
- previewText: up to ${PREVIEW_MAX} characters, the line beside the subject. Add a second reason to open. Never repeat the subject and never write "View in browser".

Shape:
- title: the headline shown on the web version. It can match the subject.
- parts, in order, one Markdown block per part. Three kinds of block, in this order.
- Opener: part 1, alone, up to ${OPENER_MAX_WORDS} words, no heading. Speak as "I" to "you". Say what caught your eye in this story and why you think the reader will care. "Personal" means your reaction to the reporting. Don't invent a trip, a coffee, a family moment, a conversation or a past job. Nobody may read it as a real, named person's memoir.
- Sections: ${MIN_SECTIONS} to ${MAX_SECTIONS} sections, each opening with a "## " heading part. Short paragraphs of three sentences at most. Good section order: the hook, how the money works, what could kill it.
- Sign-off: the last part, up to ${SIGN_OFF_MAX_WORDS} words, no heading. One idea to steal or one question you want answered, then a plain goodbye. No "Thanks for reading", no begging for shares.
- ${MIN_WORDS} to ${MAX_WORDS} words in all.

It must paste cleanly into the Substack editor: plain paragraphs, "## " headings, bold, lists, blockquotes and inline links. No HTML, no tables, no footnotes, no reference-style links, no Markdown images. Put a picture on a part's asset instead. An image alone in a part is fine.

The subject and preview are the shortest text in the edition, so caveats die there first. If the number in the subject is an estimate, the subject says "about" or "an estimated", or it uses a different number. A caveat that sat in the article's money section moves with the number, wherever the number lands.

${VOICE}

${FIDELITY}

Pictures: attach a figure asset to the part it belongs with wherever the numbers earn it, usually one to three in a piece: a waterfall for napkin math, a bar or comparison for prices and revenue claims, a stat for one striking number. Mark every estimated value as an estimate. When geography matters to the story, add a map of the places it names.`,
  check,
}
