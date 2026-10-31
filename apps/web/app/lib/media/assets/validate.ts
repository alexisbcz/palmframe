import type { AssetSpec, Story } from "@/lib/media/model"

import { clean, unsupportedChars } from "./text"

export interface AssetCheck {
  ok: boolean
  // Blocking problems, in plain words the writer agent can act on.
  problems: string[]
}

const SCALE: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  千: 1e3,
  万: 1e4,
  million: 1e6,
  millions: 1e6,
  mn: 1e6,
  m: 1e6,
  mio: 1e6,
  亿: 1e8,
  億: 1e8,
  billion: 1e9,
  billions: 1e9,
  bn: 1e9,
  b: 1e9,
  mrd: 1e9,
  milliard: 1e9,
  milliards: 1e9,
  trillion: 1e12,
  trillions: 1e12,
  tn: 1e12,
  t: 1e12,
  兆: 1e12,
}

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  half: 0.5,
}

const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))

const fold = (s: string) =>
  normalize(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

const SCALE_WORD =
  "thousand|k|千|万|millions?|mn|m|mio|亿|億|billions?|bn|b|mrd|milliards?|trillions?|tn|t|兆"
const NUMBER = new RegExp(
  `(?<![\\p{L}\\d.,])(\\d{1,3}(?:[,. \\u00A0\\u202F]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)(?:\\s*(${SCALE_WORD})(?![\\p{L}]))?`,
  "giu"
)
const NUMBER_WORD = new RegExp(
  `\\b(${Object.keys(WORDS).join("|")})\\b(?:\\s+(${SCALE_WORD})\\b)?`,
  "gi"
)

// "1,234" is 1234 in English and 1.234 in much of Europe, so both count.
function readings(digits: string) {
  const compact = digits.replace(/[   ]/g, "")
  const out = new Set<number>()
  const add = (t: string) => {
    const n = Number(t)
    if (Number.isFinite(n)) out.add(n)
  }
  add(compact.replace(/,/g, ""))
  add(compact.replace(/\./g, "").replace(",", "."))
  return out
}

interface Mention {
  value: number
  at: number
}

function mentions(raw: string) {
  const s = normalize(raw)
  const out: Mention[] = []
  for (const m of s.matchAll(NUMBER)) {
    const scale = m[2] ? SCALE[m[2].toLowerCase()] : undefined
    for (const n of readings(m[1]!)) {
      out.push({ value: n, at: m.index })
      if (scale) out.push({ value: n * scale, at: m.index })
    }
  }
  for (const m of s.matchAll(NUMBER_WORD)) {
    const n = WORDS[m[1]!.toLowerCase()]!
    const scale = m[2] ? SCALE[m[2].toLowerCase()] : undefined
    out.push({ value: n, at: m.index })
    if (scale) out.push({ value: n * scale, at: m.index })
  }
  return { text: s, list: out }
}

const same = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

function unitScale(unit: string | undefined) {
  const word = fold(unit ?? "").replace(/[^\p{L}]/gu, "")
  return SCALE[word] ?? 1
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "total",
  "other",
  "per",
  "all",
  "new",
  "des",
  "les",
  "une",
  "que",
  "pour",
])

function keywords(label: string) {
  const words = fold(label).match(/[\p{L}\p{N}]+/gu) ?? []
  return words.filter(
    (w) =>
      !STOP.has(w) && (w.length >= 3 || /\d/.test(w) || /[^\x00-\x7f]/.test(w))
  )
}

const WINDOW = 160

interface Passage {
  text: string
  list: Mention[]
  // Facts are short, so the whole fact is the context of its numbers.
  whole: boolean
}

function passages(story: Story): Passage[] {
  const facts = story.facts.map((f) => ({
    ...mentions(`${f.claim} ${f.quote}`),
    whole: true,
  }))
  const sources = story.sources.map((s) => ({
    ...mentions(s.text),
    whole: false,
  }))
  return [...facts, ...sources]
}

// A number on its own proves little: "40" is on every page. So the number and
// the thing it measures have to appear together, in one fact or nearby in a
// source. This can refuse a true value worded differently; it fails towards
// asking the writer to fix it or mark it as an estimate.
function traced(
  value: number,
  unit: string | undefined,
  label: string,
  all: Passage[]
) {
  const size = Math.abs(value)
  const wanted = [size, size * unitScale(unit)]
  const keys = keywords(label)
  return all.some((p) => {
    const body = p.whole ? fold(p.text) : ""
    return p.list.some((m) => {
      if (!wanted.some((w) => same(w, m.value))) return false
      if (!keys.length) return true
      const near = p.whole
        ? body
        : fold(p.text.slice(Math.max(0, m.at - WINDOW), m.at + WINDOW))
      return keys.some((k) => near.includes(k))
    })
  })
}

function storyText(story: Story) {
  return fold(
    [
      story.title,
      story.dek,
      story.article.title,
      story.article.dek,
      story.article.body,
      ...story.facts.flatMap((f) => [f.claim, f.quote]),
    ].join("\n")
  )
}

const canonical = (url: string) => {
  try {
    const u = new URL(url)
    u.hash = ""
    return u.href.replace(/\/$/, "")
  } catch {
    return url
  }
}

function checkSource(url: string, story: Story, problems: string[]) {
  const known = new Set(
    [...story.sources, ...story.facts].map((s) => canonical(s.url))
  )
  if (!/^https:\/\//.test(url) || !known.has(canonical(url)))
    problems.push(`Source ${url} is not one of the Story's sources.`)
}

function checkGlyphs(fields: string[], problems: string[]) {
  const bad = new Set(fields.flatMap(unsupportedChars))
  if (bad.size)
    problems.push(
      `These characters can't be drawn, remove them: ${[...bad].join(" ")}`
    )
}

function nameIn(name: string, body: string) {
  const target = fold(clean(name))
  if (!target) return false
  let at = body.indexOf(target)
  while (at >= 0) {
    const before = body[at - 1] ?? " "
    const after = body[at + target.length] ?? " "
    const edge = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
      target
    )
    if (edge || (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)))
      return true
    at = body.indexOf(target, at + 1)
  }
  return false
}

function checkTitleNumbers(
  title: string,
  allowed: number[],
  story: Story,
  all: Passage[],
  problems: string[]
) {
  const everything = [
    ...all,
    {
      ...mentions(`${story.title} ${story.dek} ${story.article.body}`),
      whole: true,
    },
  ]
  for (const m of mentions(title).list.filter(
    (m, i, l) => l.findIndex((o) => o.at === m.at) === i
  )) {
    const options = mentions(title)
      .list.filter((o) => o.at === m.at)
      .map((o) => o.value)
    const found = options.some(
      (v) =>
        allowed.some((a) => same(a, v)) ||
        everything.some((p) => p.list.some((o) => same(o.value, v)))
    )
    if (!found)
      problems.push(`The title says ${m.value}, which is not in the Story.`)
  }
}

export function validateAsset(spec: AssetSpec, story: Story): AssetCheck {
  const problems: string[] = []
  if (spec.kind === "illustration") {
    if (!spec.scene.trim()) problems.push("The illustration has no scene.")
    if (!spec.alt.trim()) problems.push("The illustration has no alt text.")
    return { ok: !problems.length, problems }
  }

  if (!clean(spec.title)) problems.push("The title is empty.")
  checkSource(spec.sourceUrl, story, problems)
  const all = passages(story)

  if (spec.kind === "figure") {
    if (!spec.series.length) problems.push("The chart has no values.")
    for (const d of spec.series) {
      if (!clean(d.label)) problems.push("A value has no label.")
      if (!Number.isFinite(d.value)) {
        problems.push(`${d.label} has no usable number.`)
        continue
      }
      if (d.estimate) continue
      const total =
        spec.chart === "waterfall" &&
        d === spec.series.at(-1) &&
        spec.series.length > 2 &&
        same(
          d.value,
          spec.series.slice(0, -1).reduce((sum, o) => sum + o.value, 0)
        )
      if (!total && !traced(d.value, spec.unit, d.label, all))
        problems.push(
          `${d.label} = ${d.value} can't be traced to the Story's facts or sources. Use a sourced value or mark it as an estimate.`
        )
    }
    checkTitleNumbers(
      spec.title,
      spec.series.flatMap((d) => [d.value, Math.abs(d.value)]),
      story,
      all,
      problems
    )
    checkGlyphs(
      [spec.title, spec.unit ?? "", ...spec.series.map((d) => d.label)],
      problems
    )
    return { ok: !problems.length, problems }
  }

  if (!spec.places.length) problems.push("The map has no places.")
  const body = storyText(story)
  for (const p of spec.places) {
    const bounds =
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lng) <= 180
    if (!bounds)
      problems.push(`${p.name} has invalid coordinates (${p.lat}, ${p.lng}).`)
    // 0,0 is open ocean, and what a failed geocode usually leaves behind.
    else if (p.lat === 0 && p.lng === 0)
      problems.push(
        `${p.name} sits at 0,0, which looks like a missing location.`
      )
    if (!nameIn(p.name, body))
      problems.push(`${p.name} is not named in the Story.`)
    if (p.value && !/estimate|est\.|≈|~/i.test(p.value)) {
      for (const m of new Map(
        mentions(p.value).list.map((m) => [m.at, m])
      ).values()) {
        const options = mentions(p.value).list.filter((o) => o.at === m.at)
        if (!options.some((o) => traced(o.value, undefined, p.name, all)))
          problems.push(
            `The value "${p.value}" for ${p.name} can't be traced to the Story's facts or sources.`
          )
      }
    }
  }
  checkTitleNumbers(spec.title, [], story, all, problems)
  checkGlyphs(
    [spec.title, ...spec.places.flatMap((p) => [p.name, p.value ?? ""])],
    problems
  )
  return { ok: !problems.length, problems }
}
