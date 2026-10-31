import {
  type GateLanguage,
  DIRECTIONS,
  GATE_LANGUAGES,
  MONTHS,
  NAMES_BY_CAPITAL,
  NUMBER_WORDS,
  PERCENT,
  SHORT_UNITS,
  UNITS,
  VOTING,
  calendarWords,
  gateLanguage,
} from "./gate.words"
import type {
  Item,
  MachineConfig,
  OutputPlatform,
  PublishReceipt,
} from "./model"

// The agent's output is untrusted: it read strangers' text. Everything between
// it and a public post is plain code in this file.
export const LIMITS: Record<OutputPlatform, number> = {
  bluesky: 300,
  twitter: 280,
  threads: 500,
  linkedin: 3000,
  instagram: 2200,
}
// X counts every link as this many characters, however long it is.
const X_LINK = 23
// Below this, a link would leave no room to say anything.
const MIN_BODY = 80

export const NEEDS_IMAGE: OutputPlatform[] = ["instagram"]
export const MAX_FAILURES = 3
export const FRESH_MS = 48 * 3_600_000
// A held post nobody looked at is old news by then.
export const HOLD_MS = 48 * 3_600_000
// Passes are billed and file nothing, so the cap alone doesn't bound a day.
export const ATTEMPTS_PER_CAP = 2
// What the shared key pays Zernio for one X post with a link, $0.20, in
// credits at an assumed 1 cent each. Nobody is charged this: it only moves the
// breaker, until the X link decision is made.
export const X_LINK_CREDITS = 20

// What a post from a machine with a take can be, before the signature and link.
export const LINE_POST_MAX = 215

// Statuses that count against the daily cap. Dismissed and expired posts took
// nobody's attention, and held ones are filtered out on top of this list.
export const PUBLISHED_TRACK = [
  "new",
  "used",
  "approved",
  "publishing",
  "published",
  "failed",
  "retracted",
] as const

const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].length

const NUMBER = String.raw`\d+(?:[.,   ]\d{3})*(?:[.,]\d+)?`

// Digit runs, however they are grouped: "1,200" and "1 200" are both 1200.
const numbers = (s: string) =>
  (s.match(new RegExp(NUMBER, "g")) ?? []).map((n) =>
    n.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "")
  )

// Numbers a post states that none of its sources do. News accounts live on
// numbers, and a made-up one is the worst thing this can publish. Rounded or
// reformatted figures end up here too; they cost a human glance, not a post.
export function unsupportedNumbers(text: string, evidence: string) {
  const known = new Set(numbers(evidence))
  return [
    ...new Set(numbers(text).filter((n) => n.length > 1 && !known.has(n))),
  ]
}

export const evidenceOf = (items: Pick<Item, "title" | "summary">[]) =>
  items.map((i) => `${i.title} ${i.summary}`).join("\n")

// What a draft keeps of its evidence. Cutting it can only hold an edited post
// by mistake, never pass a wrong one.
export const evidenceLimit = (evidence: string) => evidence.slice(0, 60_000)

const NOT_IN_WORD = String.raw`(?![\p{L}\p{N}])`
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const anyOf = (words: Iterable<string>) =>
  [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .map(escaped)
    .join("|")

// 1,200 and 1.200 are 1200; 4,3 and 4.3 are 4.3. Three digits after the last
// separator read as grouping, in every language this checks.
function valueOf(raw: string) {
  const s = raw.replace(/[   ]/g, "")
  const decimals = s.match(/[.,](\d+)$/)?.[1]
  if (!decimals || decimals.length === 3) return Number(s.replace(/[.,]/g, ""))
  const whole = s.slice(0, -decimals.length - 1).replace(/[.,]/g, "")
  return Number(`${whole}.${decimals}`)
}

interface Claim {
  label: string
  // Null for a number with no unit from the closed set.
  scale: number | typeof PERCENT | null
  value: number
}

interface Reader {
  languages: readonly GateLanguage[]
  head: RegExp
  unit: RegExp
  short: RegExp
}

function reader(languages: readonly GateLanguage[]): Reader {
  const units = languages.flatMap((l) => Object.keys(UNITS[l]))
  const latin = units.filter((u) => /^\p{Script=Latin}/u.test(u))
  const glued = units.filter((u) => !latin.includes(u))
  const spelled = anyOf(languages.flatMap((l) => Object.keys(NUMBER_WORDS[l])))
  return {
    languages,
    head: new RegExp(
      spelled
        ? `(?<![\\p{L}\\p{N}])(?<spelled>${spelled})(?=[\\s\\u00a0])|${NUMBER}`
        : NUMBER,
      "giu"
    ),
    unit: new RegExp(
      `^[\\s\\u00a0]?(?:${latin.length ? `(${anyOf(latin)})${NOT_IN_WORD}|` : ""}(${anyOf(glued)}))`,
      "iu"
    ),
    short: new RegExp(
      `^(${anyOf(Object.keys(SHORT_UNITS))})${NOT_IN_WORD}`,
      "iu"
    ),
  }
}

const OWN = new Map(GATE_LANGUAGES.map((l) => [l, reader([l])]))
const EVERY_LANGUAGE = reader(GATE_LANGUAGES)

function scalesOf(word: string, languages: readonly GateLanguage[]) {
  const unit = word.toLowerCase().replace(/\s+/g, " ")
  return [
    ...new Set(
      languages.flatMap((l) => {
        const scale = UNITS[l][unit]
        return scale === undefined ? [] : [scale]
      })
    ),
  ]
}

function claimsIn(text: string, { languages, head, unit, short }: Reader) {
  const claims: Claim[] = []
  for (const m of text.matchAll(head)) {
    const spelled = m.groups?.spelled?.toLowerCase()
    const base = spelled
      ? languages
          .map((l) => NUMBER_WORDS[l][spelled])
          .find((n) => n !== undefined)!
      : valueOf(m[0])
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 24)
    const glued = !spelled && rest.match(short)
    if (glued) {
      const scale = SHORT_UNITS[glued[1]!.toLowerCase()]!
      claims.push({
        label: `${m[0]}${glued[0]}`,
        scale,
        value: base * scale,
      })
      continue
    }
    const named = rest.match(unit)
    if (named)
      for (const scale of scalesOf(named.slice(1).find(Boolean)!, languages))
        claims.push({
          label: `${m[0]}${named[0]}`,
          scale,
          value: scale === PERCENT ? base : base * scale,
        })
    // A spelled number with no unit stays with the reader: see NUMBER_WORDS.
    else if (!spelled) claims.push({ label: m[0], scale: null, value: base })
  }
  return claims
}

const same = (value: number) => value.toPrecision(10)

// A day beside a month is a claim even when it's one digit: "May 7".
function dayNumbers(text: string, language: GateLanguage) {
  if (language === "ja")
    return [...text.matchAll(/(\d{1,2})月(\d{1,2})日/g)].flatMap((m) => [
      Number(m[1]),
      Number(m[2]),
    ])
  const months = anyOf(MONTHS[language])
  const after = new RegExp(
    `(?<!\\p{L})(?:${months})\\s+(\\d{1,2})(?!\\d)`,
    "giu"
  )
  const before = new RegExp(
    `(?<![\\d.,])(\\d{1,2})\\.?\\s+(?:de\\s+)?(?:${months})${NOT_IN_WORD}`,
    "giu"
  )
  return [...text.matchAll(after), ...text.matchAll(before)].map((m) =>
    Number(m[1])
  )
}

// Numbers a post states that its sources don't, each bound to its unit, so a
// source's 4.3% doesn't vouch for "4.3 million". Evidence is read in every
// language, because a feed and a post don't have to share one. A bare single
// digit stays exempt: "top 3" and "2 of 5" are harmless, and holding them would
// stall a machine for nothing.
export function unboundNumbers(
  text: string,
  evidence: string,
  language: GateLanguage = "en"
) {
  const said = claimsIn(evidence, EVERY_LANGUAGE)
  const percents = new Set(
    said.filter((c) => c.scale === PERCENT).map((c) => same(c.value))
  )
  // Any number stands for itself, whatever unit it had in the source.
  const plain = new Set(said.map((c) => same(c.value)))
  for (const m of evidence.matchAll(new RegExp(NUMBER, "g")))
    plain.add(same(valueOf(m[0])))

  const missing = claimsIn(text, OWN.get(language)!).filter((c) => {
    if (c.scale === PERCENT) return !percents.has(same(c.value))
    if (c.scale !== null) return !plain.has(same(c.value))
    return c.value >= 10 && !plain.has(same(c.value))
  })
  const days = dayNumbers(text, language).filter(
    (n) => n < 10 && !plain.has(same(n))
  )
  return [...new Set([...missing.map((c) => c.label), ...days.map(String)])]
}

const QUOTE_PAIRS: RegExp[] = [
  /"([^"\n]{3,300})"/g,
  /“([^”\n]{3,300})”/g,
  /„([^“”\n]{3,300})[“”]/g,
  /«([^»\n]{3,300})»/g,
  /‹([^›\n]{3,300})›/g,
  /「([^」\n]{2,300})」/g,
  /『([^』\n]{2,300})』/g,
  /‘([^’\n]{3,300})’/g,
  /(?<![\p{L}\p{N}])'([^'\n]{3,300})'(?![\p{L}\p{N}])/gu,
]

const plainWords = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

const isPhrase = (q: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(q) ||
  q.split(/\s+/).length >= 2

// Words in quotation marks that nothing the machine read contains. One word is
// a scare quote; two are already enough to put words in someone's mouth.
export function unsourcedQuotes(text: string, evidence: string) {
  const said = ` ${plainWords(evidence)} `
  return QUOTE_PAIRS.flatMap((pair) =>
    [...text.matchAll(pair)].map((m) => m[1]!.trim())
  )
    .filter(isPhrase)
    .filter((q) => !said.includes(` ${plainWords(q)} `))
}

// Capitalised words in mid-sentence that the sources never use. It can't see a
// swapped name at the start of a sentence, or in a language without name caps.
export function unknownNames(
  text: string,
  evidence: string,
  language: GateLanguage = "en"
) {
  if (!NAMES_BY_CAPITAL.includes(language)) return []
  const said = evidence.toLowerCase()
  const calendar = calendarWords(language)
  const names = [...text.matchAll(/\p{Lu}\p{Ll}{2,}/gu)]
    .filter((m) => {
      const before = text.slice(0, m.index)
      if (/[\p{L}\p{N}-]$/u.test(before)) return false
      const trimmed = before.trimEnd()
      return trimmed && !/[.!?:;\n«"“(]$/.test(trimmed)
    })
    .map((m) => m[0])
  return [
    ...new Set(
      names.filter(
        (w) => !calendar.has(w.toLowerCase()) && !said.includes(w.toLowerCase())
      )
    ),
  ]
}

// A post saying something fell when its sources only ever say it rose. Sources
// are read in every language, the post in its own. Whether both sides talk
// about the same thing is the reader's job: this only sees one-way evidence.
export function flippedDirection(
  text: string,
  evidence: string,
  language: GateLanguage = "en"
) {
  const up = DIRECTIONS[language].up.test(text)
  const down = DIRECTIONS[language].down.test(text)
  if (up === down) return false
  const said = (side: "up" | "down") =>
    GATE_LANGUAGES.some((l) => DIRECTIONS[l][side].test(evidence))
  return up ? said("down") && !said("up") : said("up") && !said("down")
}

export const votingClaim = (text: string, language: GateLanguage = "en") =>
  VOTING[language].test(text) || VOTING.en.test(text)

// Why this can't go out by itself, or null when it can. Everything here is a
// closed list or an exact match. `gate.mutation.test.ts` scores what it
// catches, what it holds by mistake and what still gets through.
export function holdReason(
  text: string,
  evidence: string,
  sources: readonly unknown[],
  machineLanguage = "en"
): string | null {
  if (!sources.length) return "It doesn't cite anything the machine heard."
  const language = gateLanguage(machineLanguage)
  if (votingClaim(text, language))
    return "It says something about how voting works, which a person has to check."
  const made = unboundNumbers(text, evidence, language)
  if (made.length)
    return `It states ${made.slice(0, 3).join(", ")}, which the sources don't.`
  const quoted = unsourcedQuotes(text, evidence)
  if (quoted.length)
    return `It quotes "${quoted[0]!.slice(0, 80)}", which the sources don't say.`
  if (flippedDirection(text, evidence, language))
    return "It says this moved the opposite way from its sources."
  const names = unknownNames(text, evidence, language)
  if (names.length)
    return `It names ${names.slice(0, 3).join(", ")}, which the sources don't.`
  return null
}

// A person changed the words, so the check runs again on what they wrote,
// against the evidence stored with the draft. Their unchanged approval never
// gets here: by then they have read the post and the reason it was held.
export function reviewHold(
  text: string,
  draft: {
    text: string
    evidence: string
    sources: readonly unknown[]
    signal: unknown
  },
  language: string
) {
  if (text === draft.text) return null
  // Live wire drafts cite their signal, not an inbox item.
  const cited = draft.sources.length
    ? draft.sources
    : draft.signal
      ? [draft.signal]
      : []
  return holdReason(text, draft.evidence, cited, language)
}

// What a machine has used so far today.
export interface DayUsage {
  // Drafts on the published track, not counting held ones.
  posts: number
  // Times the agent was started, billed or not.
  attempts: number
  credits: number
}

export type BudgetStop = "breaker" | "capped" | "ceiling"

export const attemptCeiling = (dailyCap: number) => dailyCap * ATTEMPTS_PER_CAP

// Why this machine can't start the agent again today, or null when it can.
export function budgetStop(
  usage: DayUsage,
  config: Pick<MachineConfig, "dailyCap" | "maxCreditsPerDay">,
  nextCost: number
): BudgetStop | null {
  if (usage.credits + nextCost > config.maxCreditsPerDay) return "breaker"
  if (usage.posts >= config.dailyCap) return "capped"
  if (usage.attempts >= attemptCeiling(config.dailyCap)) return "ceiling"
  return null
}

// A public page always "works", so it can't be what proves a post went out. An
// account has to have taken it, unless no account was ever meant to.
export function publishOutcome(
  isPublic: boolean,
  targets: number,
  receipts: PublishReceipt[]
) {
  return (
    receipts.some((r) => r.postId && !r.error) || (isPublic && targets === 0)
  )
}

// A post's words and link fitted to one platform, with the signature saying a
// machine wrote it. The signature's room comes off the limit before any words
// are cut, so no length of post can clip it away. Bluesky counts links in full,
// so a long one is dropped before the words are cut.
export function compose(
  text: string,
  link: string | null,
  platform: OutputPlatform,
  signature: string
) {
  const body = text.trim()
  const signed = (words: string) => `${words}\n\n${signature}`
  const room = LIMITS[platform] - graphemes(signature) - 2
  if (!link || platform === "instagram") return signed(clip(body, room))
  const cost = platform === "twitter" ? X_LINK : graphemes(link)
  const words = room - 1 - cost
  if (graphemes(body) <= words) return `${signed(body)}\n${link}`
  if ((platform === "bluesky" && cost > 100) || words < MIN_BODY)
    return signed(clip(body, room))
  return `${signed(clip(body, words))}\n${link}`
}

// The most words a post can have on the tightest place it goes, after the
// signature and the link. `compose` would have to cut anything longer, and it
// cuts from the end, which is where the take is.
export function takeRoom(
  outputs: readonly { platform: OutputPlatform }[],
  link: string | null,
  signature: string
) {
  const room = (platform: OutputPlatform) => {
    const words = LIMITS[platform] - graphemes(signature) - 2
    if (!link || platform === "instagram") return words
    return words - 1 - (platform === "twitter" ? X_LINK : graphemes(link))
  }
  return Math.min(LINE_POST_MAX, ...outputs.map((o) => room(o.platform)))
}

export const joinTake = (text: string, take: string) =>
  take ? `${text.trim()} ${take.trim()}` : text.trim()

export interface SettledPost {
  text: string
  take: string
  // Why the agent's take didn't go out with the post, for its owner.
  takeNote: string | null
  held: string | null
}

// Decides once, before anything is stored, what goes out. The whole post has to
// pass, take included, and a take that doesn't pass or fit costs the take, never
// the post. Only the fact can hold a post.
export function settleTake(
  filed: { text: string; take: string },
  evidence: string,
  sources: readonly unknown[],
  language: string,
  room: number
): SettledPost {
  const text = filed.text.trim()
  const take = filed.take.trim()
  const held =
    holdReason(text, evidence, sources, language) ??
    (graphemes(text) > LINE_POST_MAX
      ? "It's longer than a post from this machine can be."
      : null)
  if (held || !take)
    return {
      text,
      take: "",
      takeNote: take ? "The post was held, so the take was left out." : null,
      held,
    }
  const whole = joinTake(text, take)
  if (graphemes(whole) > room)
    return { text, take: "", takeNote: "The take didn't fit.", held: null }
  const failed = holdReason(whole, evidence, sources, language)
  return failed
    ? { text, take: "", takeNote: failed, held: null }
    : { text: whole, take, takeNote: null, held: null }
}

function clip(s: string, max: number) {
  const parts = [...new Intl.Segmenter().segment(s)].map((p) => p.segment)
  return parts.length <= max
    ? s
    : `${parts
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
}

export function nextRunAt(now: number, everyMinutes: number) {
  return new Date(now + everyMinutes * 60_000).toISOString()
}

export function isDue(nextRun: string | null, now: number) {
  return !nextRun || Date.parse(nextRun) <= now
}

// One outlet shouldn't reach a person twice from the same story in a row.
export function freshItems(items: Item[], now: number) {
  return items.filter((i) => now - i.at <= FRESH_MS).sort((a, b) => b.at - a.at)
}
