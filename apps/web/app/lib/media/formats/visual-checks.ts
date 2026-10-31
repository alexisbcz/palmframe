import type { Finding } from "@/lib/deepdive/model"

import type { Part } from "../model"

// Shared by the formats that put a number in a picture or in someone's ear.
// Only spec-flagged estimates can be seen here; the fact-checker covers the rest.
const ESTIMATE_LABEL = /\b(estimat\w*|napkin|approx\w*|rough(ly)?)\b/i

export const warning = (
  line: number,
  rule: string,
  message: string
): Finding => ({
  line,
  rule,
  level: "warning",
  message,
})

const hasEstimate = (part: Part) =>
  part.asset?.kind === "figure" && part.asset.series.some((s) => s.estimate)

// `words` is what the audience actually reads or hears on that part.
export function assetProblems(part: Part, n: number, words: string) {
  const problems: string[] = []
  const asset = part.asset
  if (!asset) return problems
  if (asset.kind !== "illustration" && !asset.sourceUrl.startsWith("https://"))
    problems.push(`Part ${n}: the ${asset.kind} needs an https sourceUrl.`)
  if (asset.kind === "figure" && !asset.series.length)
    problems.push(`Part ${n}: the figure has no data.`)
  if (asset.kind === "map" && !asset.places.length)
    problems.push(`Part ${n}: the map has no places.`)
  if (asset.kind === "illustration" && !asset.alt.trim())
    problems.push(`Part ${n}: the illustration needs alt text.`)
  if (hasEstimate(part) && !ESTIMATE_LABEL.test(words))
    problems.push(
      `Part ${n}: the figure holds an estimate, so its words must say so ("estimated", "our napkin math").`
    )
  return problems
}

const POSING = [
  /\b(hi|hey|hello)\b[,! ]+(i'm|i am|this is|my name is)\b/i,
  /\bin the (voice|style) of\b/i,
  /\bspeaking as\b/i,
  /\bsam parr\b/i,
  /\bthe hustle\b/i,
]

// The outlet narrates. Nobody real speaks through it, and the house style's
// inspiration never appears.
export const impersonates = (text: string) =>
  POSING.some((pattern) => pattern.test(text))

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
