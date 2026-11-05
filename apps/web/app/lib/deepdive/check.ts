import { unsupportedNumbers } from "@/lib/machines/gate"

import {
  type Article,
  type Fact,
  type Finding,
  type Limits,
  type Source,
  DEFAULT_LIMITS,
} from "./model"

const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()

// Text in quotation marks, at least four words, so scare quotes don't count.
export const quotations = (body: string) =>
  [...body.matchAll(/["“]([^"”\n]{10,400})["”]/g)]
    .map((m) => m[1]!.replace(/[.,!?]$/, "").trim())
    .filter((q) => q.split(/\s+/).length >= 4)

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const SOCIAL =
  /(^|\.)(x\.com|twitter\.com|tiktok\.com|reddit\.com|instagram\.com|youtube\.com|youtu\.be|threads\.net|bsky\.app)$/

export const isSocial = (url: string) => SOCIAL.test(host(url))

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

// What stands between a draft and a person's eyes. Plain code, because the
// agent spent the whole run reading strangers' text.
export function checkArticle(
  article: Article,
  facts: Fact[],
  sources: Source[],
  findings: Finding[],
  limits: Limits = DEFAULT_LIMITS
) {
  const problems: string[] = []
  const words = wordCount(article.body)
  if (words < limits.minWords)
    problems.push(`${words} words, need ${limits.minWords}.`)
  if (words > limits.maxWords)
    problems.push(`${words} words, cut to ${limits.maxWords}.`)
  if (facts.length < limits.minFacts)
    problems.push(`${facts.length} recorded facts, need ${limits.minFacts}.`)
  const domains = new Set(facts.map((f) => host(f.url)))
  if (domains.size < limits.minDomains)
    problems.push(
      `Facts come from ${domains.size} sites, need ${limits.minDomains}.`
    )
  const social = new Set(facts.filter((f) => isSocial(f.url)).map((f) => f.url))
  if (social.size < limits.minSocial)
    problems.push(
      `Facts cite ${social.size} social posts or videos, need ${limits.minSocial}. Use search_social and record what people posted.`
    )

  const evidence = sources.map((s) => s.text).join("\n")
  const ledger = facts.map((f) => `${f.claim} ${f.quote}`).join("\n")
  const made = unsupportedNumbers(
    `${article.title} ${article.body}`,
    `${evidence}\n${ledger}`
  )
  // Napkin math produces new numbers, so those are named for the agent to
  // label, and a person sees any that remain.
  if (made.length)
    problems.push(
      `Numbers with no source: ${made.slice(0, 12).join(", ")}. Source them, remove them, or record each as a labelled estimate with record_fact.`
    )
  const said = normal(evidence)
  for (const q of quotations(article.body))
    if (!said.includes(normal(q)))
      problems.push(
        `This quotation isn't in anything you read: "${q.slice(0, 80)}"`
      )
  for (const f of findings.filter((x) => x.level === "error").slice(0, 15))
    problems.push(`Line ${f.line}, ${f.rule}: ${f.message}`)
  return problems
}

export const isRecordable = (url: string, sources: Source[]) =>
  sources.some((s) => s.url === url)
