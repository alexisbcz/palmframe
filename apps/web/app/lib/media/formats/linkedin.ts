import { LIMITS } from "@/lib/machines/gate"

import type { FormatDefinition, Rendition } from "../model"
import {
  FIDELITY,
  VOICE,
  baseProblems,
  bodyOf,
  graphemes,
  linksIn,
  metaProblems,
} from "./blog"

export const POST_MIN = 300
// LinkedIn cuts the feed preview at about this many characters on desktop.
export const FOLD = 210
export const LINE_MAX = 200
export const MAX_HASHTAGS = 3
export const COMMENT_MAX = 1250

// Used by every format that posts plain text, where Markdown shows up raw.
const MARKDOWN = /\*\*|^#{1,6}\s|\[[^\]]+\]\(https?:|^```/m
export const markdownProblem = (text: string) =>
  MARKDOWN.test(text)
    ? [
        "Remove the Markdown. This platform shows plain text, so the marks print.",
      ]
    : []

export const hashtagsIn = (text: string) =>
  text.match(/(?<![\p{L}\p{N}_&/#])#[\p{L}\p{N}_]+/gu) ?? []

function check(r: Rendition) {
  const problems = baseProblems(r, "linkedin")
  const post = bodyOf(r)
  const length = graphemes(post)
  if (length > LIMITS.linkedin)
    problems.push(
      `The post is ${length} characters, cut ${length - LIMITS.linkedin} to reach ${LIMITS.linkedin}.`
    )
  if (post && length < POST_MIN)
    problems.push(
      `The post is ${length} characters. Write at least ${POST_MIN}, enough for the story and its caveats.`
    )

  const lines = post
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const [first = "", second = ""] = lines
  if (lines.length === 1)
    problems.push(
      "Break the post into lines. A single block gets scrolled past."
    )
  if (lines.length && graphemes(first) + graphemes(second) > FOLD)
    problems.push(
      `The first two lines run ${graphemes(first) + graphemes(second)} characters and LinkedIn folds at about ${FOLD}. Shorten them so the hook shows.`
    )
  if (hashtagsIn(`${first}\n${second}`).length)
    problems.push(
      "Move hashtags out of the first two lines. The hook gets that space."
    )
  const long = lines.filter((l) => graphemes(l) > LINE_MAX)
  if (long.length)
    problems.push(
      `${long.length} lines run past ${LINE_MAX} characters, starting "${long[0]!.slice(0, 40)}". Break them up for phones.`
    )

  const tags = new Set(
    [...hashtagsIn(post), ...hashtagsIn(r.meta.hashtags ?? "")].map((t) =>
      t.toLowerCase()
    )
  )
  if (tags.size > MAX_HASHTAGS)
    problems.push(`${tags.size} hashtags, keep ${MAX_HASHTAGS} at most.`)

  const inPost = linksIn(post)
  if (inPost.length)
    problems.push(
      `Move ${inPost[0]} to meta.firstComment. A link in the post costs it reach.`
    )
  problems.push(...markdownProblem(post))

  problems.push(
    ...metaProblems(r, "firstComment", "first comment", { max: COMMENT_MAX })
  )
  const comment = r.meta.firstComment?.trim()
  if (comment && !linksIn(comment).some(isWebLink))
    problems.push("meta.firstComment needs a full https:// link to the story.")
  return { findings: [], problems }
}

function isWebLink(link: string) {
  try {
    return new URL(link).protocol === "https:"
  } catch {
    return false
  }
}

export const linkedin: FormatDefinition = {
  id: "linkedin",
  brief: `Format: one LinkedIn post. The reader is at work, on a phone, thumb moving. They stop for a number that changes how they see a business, and they stay for a clear lesson. They share what makes them look sharp, so give them something worth repeating.

Pick one idea from the Story. A post that covers the whole article covers nothing.

The fold:
- LinkedIn shows about ${FOLD} characters, then "see more". Your first two lines must fit inside that and win the click.
- Line one: the sharpest concrete fact or tension, with a number or a name. Under 12 words is best.
- Line two: raise the stakes or open the gap. Together they should make the next line feel necessary.
- No throat clearing before the hook. Never open with news about yourself.

Shape:
- title: a short internal label for this post. It isn't published.
- parts: one short paragraph or line per part, in order. They are joined with a blank line. Up to ${LINE_MAX} characters per line, one to two sentences each.
- ${POST_MIN} to ${LIMITS.linkedin} characters in all, blank lines included. 900 to 1,500 reads best. Go longer only when the money math needs it.
- Plain text. Markdown prints as raw symbols, so no bold marks, headings or link syntax.
- Run the middle as: what happened, how the money works, why it might fail. End on the idea a reader can use.
- Close with a statement or one specific question you want answered. No bait: no "Agree?", no "Thoughts?", no "comment YES", no "follow for more", no "repost if".
- Don't write the humble-brag voice, and don't invent a lesson from your own career. The reporting is the authority.
- Zero to ${MAX_HASHTAGS} specific hashtags, at the very end, or none at all. Never in the first two lines. Emoji only when a person would use one, and never as bullet points.

The link: no URL anywhere in the post. Put it in meta.firstComment, which is required: one plain sentence and the full https:// link to the Story's article, or to its main source when no article link was given. You can tell readers the link is in the first comment.

An estimate stays an estimate here too, and the hook is where it is most tempting to drop the label. If line one uses an estimated number, line one says "about" or "my estimate", and a later line gives the assumptions in a few words. If the skeptic's point changes how a number should be read, it stays in the post, above the end.

${VOICE}

${FIDELITY}`,
  check,
  valeRules: {
    "LinkedInBait.yml": `extends: existence
message: "'%s' is LinkedIn bait. Say the fact or ask something specific."
level: error
ignorecase: true
nonword: true
tokens:
  - '\\bagree\\?'
  - '\\bthoughts\\?'
  - '\\bcomment below\\b'
  - '\\bdrop a comment\\b'
  - '\\btag someone\\b'
  - '\\bfollow me for\\b'
  - '\\bfollow for more\\b'
  - '\\brepost if\\b'
  - '\\bthrilled to\\b'
  - '\\bexcited to (?:announce|share)\\b'
  - '\\bhumbled\\b'
  - '\\blessons? I learned\\b'
  - '\\bhere are \\d+ lessons\\b'
`,
  },
}
