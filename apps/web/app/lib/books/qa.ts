import { checkGlossary, type GlossaryTerm } from "./glossary"
import { checkTags, stripTags } from "./inline"
import {
  languageOf,
  type IssueKind,
  type SegmentKind,
  type Severity,
} from "./model"

export interface Issue {
  kind: IssueKind
  severity: Severity
  detail: Record<string, string | number>
}

export interface CheckedSegment {
  source: string
  target: string | null
  status: string
  translatable: boolean
  kind?: SegmentKind
}

const digits = (s: string) => {
  const found = s.match(/\d[\d\s.,'’٬٫]*\d|\d/gu) ?? []
  // 1,000 and 1 000 and 1.000 are one number in three locales: group marks go.
  return found
    .map((n) => n.replace(/[\s.,'’٬٫]/g, ""))
    .map((n) => n.replace(/^0+(?=\d)/, ""))
    .sort()
}

const toWestern = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))

// Target length as a share of source, in characters. Dense scripts need far
// fewer; German needs more.
const EXPECTED: Record<string, number> = {
  ja: 0.55,
  "zh-Hans": 0.4,
  "zh-Hant": 0.4,
  ko: 0.65,
  de: 1.15,
  fr: 1.12,
  es: 1.1,
  it: 1.08,
  pt: 1.1,
  ru: 1.08,
}

const dense = (lang: string) => !!languageOf(lang)?.cjk

function lengthAnomaly(
  source: string,
  target: string,
  sourceLang: string,
  targetLang: string
) {
  // Short lines swing wildly and mean nothing.
  if (source.length < 60) return null
  const expected = (EXPECTED[targetLang] ?? 1) / (EXPECTED[sourceLang] ?? 1)
  const ratio = target.length / source.length / expected
  return ratio < 0.5 || ratio > 1.9 ? Math.round(ratio * 100) / 100 : null
}

function wordOverlap(a: string, b: string) {
  const words = (s: string) =>
    new Set(s.toLowerCase().match(/\p{L}{3,}/gu) ?? [])
  const x = words(a)
  const y = words(b)
  if (x.size < 4) return 0
  return [...x].filter((w) => y.has(w)).length / x.size
}

// Capitalised words away from the start of a sentence, repeated in the target
// unless the target uses another script altogether.
function lostNames(source: string, target: string, targetLang: string) {
  const latinTarget = /\p{Script=Latin}/u.test(target)
  if (!latinTarget || dense(targetLang)) return []
  const names = [
    ...source.matchAll(
      /(?<=[\p{L}\p{N},;] )\p{Lu}\p{Ll}{2,}(?: \p{Lu}\p{Ll}{2,})*/gu
    ),
  ].map((m) => m[0])
  return [...new Set(names)].filter(
    (name) => !target.toLowerCase().includes(name.split(" ")[0]!.toLowerCase())
  )
}

export function checkSegment(
  s: CheckedSegment,
  terms: GlossaryTerm[],
  sourceLang: string,
  targetLang: string
): Issue[] {
  if (!s.translatable || s.status === "fixed") return []
  const source = stripTags(s.source)
  if (!s.target?.trim())
    return [{ kind: "missing", severity: "error", detail: {} }]
  const target = stripTags(s.target)
  const issues: Issue[] = []

  const sameScriptOverlap = wordOverlap(source, target)
  if (
    source.trim() === target.trim() ||
    (source.length > 30 && sameScriptOverlap > 0.7)
  )
    issues.push({ kind: "untranslated", severity: "error", detail: {} })

  const a = digits(toWestern(source))
  const b = digits(toWestern(target))
  if (a.join() !== b.join()) {
    const missing = a.filter((n) => !b.includes(n))
    const added = b.filter((n) => !a.includes(n))
    if (missing.length || added.length)
      issues.push({
        kind: "numbers",
        severity: "error",
        detail: { missing: missing.join(", "), added: added.join(", ") },
      })
  }

  for (const hit of checkGlossary(
    s.source,
    s.target,
    terms,
    sourceLang,
    targetLang
  ))
    issues.push({
      kind: "glossary",
      severity: "error",
      detail: {
        term: hit.term,
        expected: hit.expected,
        found: hit.found,
        wanted: hit.wanted,
      },
    })

  const known = new Set(terms.map((t) => t.source.toLowerCase()))
  // Titles capitalise every word, so capitals there say nothing about names.
  const titled = s.kind === "heading" || s.kind === "meta"
  const names = titled
    ? []
    : lostNames(source, target, targetLang).filter(
        (n) => !known.has(n.toLowerCase())
      )
  if (names.length)
    issues.push({
      kind: "names",
      severity: "warning",
      detail: { names: names.slice(0, 5).join(", ") },
    })

  const tags = checkTags(s.source, s.target)
  if (tags)
    issues.push({
      kind: "formatting",
      severity: "warning",
      detail: { missing: tags.missing.length, extra: tags.extra.length },
    })

  const ratio = lengthAnomaly(source, target, sourceLang, targetLang)
  if (ratio !== null)
    issues.push({ kind: "length", severity: "warning", detail: { ratio } })
  return issues
}

// 100 is clean. Errors weigh three times warnings, per translated segment, so
// a long chapter isn't punished for being long.
export function chapterScore(
  segments: number,
  issues: { severity: Severity }[]
) {
  if (!segments) return 100
  const weight = issues.reduce(
    (n, i) => n + (i.severity === "error" ? 3 : 1),
    0
  )
  return Math.max(0, Math.round(100 - (weight / segments) * 100))
}

// Repeatable, so a re-run looks at the same lines and a score can be compared.
export function sampleForBackCheck<T extends { id: string }>(
  segments: T[],
  share = 0.03,
  min = 3,
  max = 12
) {
  const count = Math.min(
    segments.length,
    Math.max(min, Math.min(max, Math.ceil(segments.length * share)))
  )
  if (!count) return []
  const step = segments.length / count
  return Array.from(
    { length: count },
    (_, i) => segments[Math.floor(i * step + step / 2)]!
  )
}
