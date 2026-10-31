import { LIMITS } from "@/lib/machines/gate"

import type { FormatDefinition, Rendition } from "../model"
import {
  FIDELITY,
  VOICE,
  baseProblems,
  graphemes,
  hasWords,
  linksIn,
  withLinks,
} from "./blog"
import { hashtagsIn, markdownProblem } from "./linkedin"

export const MIN_POSTS = 5
export const MAX_POSTS = 12
export const MAX_HASHTAGS = 2
// Same value as X_LINK in gate.ts, which is private. A test ties the two.
export const X_LINK = 23

// What X charges for a post: every link costs the same, however long it is.
export const xLength = (text: string) =>
  graphemes(withLinks(text.trim(), () => "x".repeat(X_LINK)))

const NUMBER = /^\(?(\d{1,2})\/(\d{1,2})?\)?(?=\s|$)/
const number = (post: string) => {
  const match = post.match(NUMBER)
  return match
    ? { at: Number(match[1]), of: match[2] ? Number(match[2]) : null }
    : null
}

function numberingProblems(posts: string[]) {
  const marks = posts.map(number)
  // One "24/7 support" in the middle of a thread is a phrase, not numbering.
  if (marks[0]?.at !== 1 && marks.filter(Boolean).length < 2) return []
  const problems: string[] = []
  marks.forEach((mark, i) => {
    if (mark?.at !== i + 1)
      problems.push(
        `Post ${i + 1} breaks the numbering. Number every post in order.`
      )
    else if (mark.of !== null && mark.of !== posts.length)
      problems.push(
        `Post ${i + 1} says ${mark.at}/${mark.of}, but the thread has ${posts.length} posts.`
      )
  })
  return problems
}

function check(r: Rendition) {
  const problems = baseProblems(r, "x_thread", { imageParts: false })
  const posts = r.parts.map((p) => p.text.trim())
  const filled = posts.filter(hasWords).length
  if (filled < MIN_POSTS)
    problems.push(`${filled} posts, a thread needs at least ${MIN_POSTS}.`)
  if (filled > MAX_POSTS) problems.push(`${filled} posts, cut to ${MAX_POSTS}.`)

  const limit = LIMITS.twitter
  const seen = new Map<string, number>()
  posts.forEach((post, i) => {
    const length = xLength(post)
    if (length > limit)
      problems.push(
        `Post ${i + 1} is ${length} characters with links at ${X_LINK}, cut ${length - limit}.`
      )
    if (/(?:…|\.\.\.)$/.test(post))
      problems.push(`Post ${i + 1} trails off as if clipped. End the sentence.`)
    if (post && !hasWords(post.replace(NUMBER, "")) && hasWords(post))
      problems.push(`Post ${i + 1} is only a number. Write the post.`)
    const twin = seen.get(post)
    if (post && twin)
      problems.push(`Post ${i + 1} repeats post ${twin}. X rejects duplicates.`)
    if (!twin) seen.set(post, i + 1)
  })

  const hook = posts[0] ?? ""
  if (linksIn(hook).length)
    problems.push(
      "Move the link out of the first post. It costs the hook its reach."
    )
  if (/🧵|^(?:\(?1\/\d*\)?\s+)?(?:a\s+)?thread\b/iu.test(hook))
    problems.push(
      'Cut the "thread" label from post 1. Open on the hook itself.'
    )

  const tags = hashtagsIn(posts.join("\n")).length
  if (tags > MAX_HASHTAGS)
    problems.push(`${tags} hashtags, keep ${MAX_HASHTAGS} at most.`)
  problems.push(
    ...markdownProblem(posts.join("\n")),
    ...numberingProblems(posts)
  )
  return { findings: [], problems }
}

export const xThread: FormatDefinition = {
  id: "x_thread",
  brief: `Format: a thread on X. The reader will give you one post. Each post has to earn the next one, and any post may be quoted alone, stripped of the rest.

Pick the one surprising line through the Story and tell it in order. This is a chain of facts, not an article cut into pieces.

Shape:
- title: a short internal label. It isn't published.
- parts: one post per part, in order. ${MIN_POSTS} to ${MAX_POSTS} posts. Fewer is better: stop when the story is told.
- Each post fits within ${LIMITS.twitter} characters. Emoji count as one, and every link counts as ${X_LINK} however long it is. Aim for 200, because a tight post gets read.
- Each post holds one idea, and each ends on a finished sentence. Nothing gets clipped for you, so never trail off with "...".
- Plain text. No Markdown.

The hook is post 1:
- The most surprising true thing in the Story, with a number or a name, in plain words and with no setup. The form, as an invented example only: "A 3-person shop bills $2M a year selling one screw."
- Don't announce a thread. No "A thread", no thread emoji, no "Here's what I found".
- No link in post 1. X buries it.

The middle: how it started, how the money works, what could kill it. Give the money math its own post or two, with each step visible. Keep the skeptic. Line breaks help, and a short list of numbers reads well here.

The end: one idea to steal. Then the link, in the last post, if there is one. No "follow me for more", no "like and retweet".

Number posts only when it helps: a list or a sequence that readers will count. Use "1/" at the start of every post, or "1/7" if the total is right, and never number only some of them. Most threads read better with no numbers. Up to ${MAX_HASHTAGS} hashtags in the whole thread, and zero is better.

Short posts are where caveats die, and any post can travel alone. So the label sits in the same post as the number, every time: "about $4M a year, by my estimate". Never put an estimate in one post and its caveat in the next. The same goes for attribution: "he says $10M" stays "he says" in the same post. If a claim and its caveat don't fit in one post, split the idea differently or cut the claim.

${VOICE}

${FIDELITY}`,
  check,
  valeRules: {
    "ThreadBait.yml": `extends: existence
message: "'%s' is thread bait. Let the facts pull the reader on."
level: error
ignorecase: true
tokens:
  - "thread below"
  - "here's a thread"
  - "follow me for"
  - "follow for more"
  - "like and retweet"
  - "retweet if"
  - "rt if"
  - "bookmark this"
  - "you won't believe"
  - "mind-blowing"
  - "nobody is talking about"
`,
  },
}
