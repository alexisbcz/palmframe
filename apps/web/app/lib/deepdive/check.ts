import { unsupportedNumbers } from "@/lib/machines/gate"

import {
  type Article,
  type Fact,
  type Finding,
  type Source,
  MAX_WORDS,
  MIN_DOMAINS,
  MIN_FACTS,
  MIN_WORDS,
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

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

// What stands between a draft and a person's eyes. Plain code, because the
// agent spent the whole run reading strangers' text.
export function checkArticle(
  article: Article,
  facts: Fact[],
  sources: Source[],
  findings: Finding[]
) {
  const problems: string[] = []
  const words = wordCount(article.body)
  if (words < MIN_WORDS) problems.push(`${words} words, need ${MIN_WORDS}.`)
  if (words > MAX_WORDS) problems.push(`${words} words, cut to ${MAX_WORDS}.`)
  if (facts.length < MIN_FACTS)
    problems.push(`${facts.length} recorded facts, need ${MIN_FACTS}.`)
  const domains = new Set(facts.map((f) => host(f.url)))
  if (domains.size < MIN_DOMAINS)
    problems.push(`Facts come from ${domains.size} sites, need ${MIN_DOMAINS}.`)

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
      problems.push(`This quotation isn't in anything you read: "${q.slice(0, 80)}"`)
  for (const f of findings.filter((x) => x.level === "error").slice(0, 15))
    problems.push(`Line ${f.line}, ${f.rule}: ${f.message}`)
  return problems
}

export const isRecordable = (url: string, sources: Source[]) =>
  sources.some((s) => s.url === url)
