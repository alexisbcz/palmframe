// Verse: syllables, stress, metre, rhyme and form. English reads the Carnegie
// Mellon Pronouncing Dictionary, which is 4.7MB, so it arrives lazily and every
// function here works from the heuristics until it does. French counts syllables
// by the rules of classical prosody (mute e, elision).

export type Phones = string[]
export type Dict = Record<string, string>

let dictionary: Dict | null = null

export async function loadDictionary() {
  if (dictionary) return dictionary
  const mod = await import("cmu-pronouncing-dictionary")
  dictionary = mod.dictionary as Dict
  return dictionary
}

export const useDictionary = (d: Dict | null) => {
  dictionary = d
}
export const hasDictionary = () => !!dictionary

const VOWEL = /^[AEIOU]/
const clean = (w: string) =>
  w
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^'+|'+$/g, "")

export function phonesOf(word: string): Phones | null {
  const entry = dictionary?.[clean(word)]
  return entry ? entry.split(" ") : null
}

const EN_GROUPS = /[aeiouy]+/g

function guessEnglish(word: string): { count: number; stress: number[] } {
  const w = clean(word).replace(/[^a-z]/g, "")
  if (!w) return { count: 0, stress: [] }
  let t = w
  if (t.length > 3)
    t = t.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m) => m[0]!)
  const count = Math.max(1, t.match(EN_GROUPS)?.length ?? 1)
  // Two syllables stress the first; more, the antepenult. It's only a guess.
  const stressAt = count === 1 ? 0 : count === 2 ? 0 : count - 3
  return {
    count,
    stress: Array.from({ length: count }, (_, i) => (i === stressAt ? 1 : 0)),
  }
}

// Words that are stressed in the dictionary but go unstressed in a line.
const LIGHT = new Set(
  "a an the of to in on at by for from with and or but nor so as if than that this these those is am are was were be been it its he him his she her they them their we us our you your i my me who whom which what when where while do does did has have had can could shall should will would may might must not no".split(
    " "
  )
)

export interface WordScan {
  word: string
  start: number
  end: number
  stress: number[]
  known: boolean
}

export function scanWords(line: string): WordScan[] {
  const out: WordScan[] = []
  const re = /[\p{L}][\p{L}'’]*/gu
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const word = m[0]
    const phones = phonesOf(word)
    let stress: number[]
    if (phones) {
      stress = phones
        .filter((p) => VOWEL.test(p))
        .map((p) => (p.endsWith("1") ? 1 : p.endsWith("2") ? 1 : 0))
      // One-syllable words go by their weight in the line.
      if (stress.length === 1) stress = [LIGHT.has(clean(word)) ? 0 : 1]
    } else {
      stress = guessEnglish(word).stress
      if (stress.length === 1 && LIGHT.has(clean(word))) stress = [0]
    }
    out.push({
      word,
      start: m.index,
      end: m.index + word.length,
      stress,
      known: !!phones,
    })
  }
  return out
}

// French ---------------------------------------------------------------------

const FR_VOWELS = "aàâäeéèêëiîïoôöuùûüyÿœæ"
const FR_GROUP = new RegExp(`[${FR_VOWELS}]+`, "g")
const HIATUS = /(?:[iï]a|i[éèo]|ué|oé|éa|éo|éi|ïe)/g

export function frenchSyllables(line: string): number {
  const words = line
    .toLowerCase()
    .replace(/[’]/g, "'")
    .match(/[\p{L}'-]+/gu)
  if (!words) return 0
  let total = 0
  words.forEach((raw, i) => {
    const w = raw.replace(/^(?:[ldjmntsc]|qu)'/, "")
    const next = words[i + 1]
    let groups = w.match(FR_GROUP)?.length ?? 0
    // Diaeresis and the hiatus of "ri-en" count double where they split.
    groups += (w.match(/ï|ü/g) ?? []).length ? 1 : 0
    if (HIATUS.test(w) && w.length > 6) groups += 0
    HIATUS.lastIndex = 0
    const mute = /(?:[^aàâeéèêiîoôuûy])es?$|(?:[^aàâeéèêiîoôuûy])ent$/.test(w)
    const isVerbEnt =
      /[^aeiouy]ent$/.test(w) &&
      w.length > 4 &&
      !/(?:ment|vent|dent|cent|lent)$/.test(w)
    const endsMute = /[^aàâeéèêiîoôuûy]es?$/.test(w) || isVerbEnt
    const beforeVowel = next && new RegExp(`^[${FR_VOWELS}h]`).test(next)
    if (groups > 1 && endsMute && (!next || (beforeVowel && !/s$|nt$/.test(w))))
      groups--
    else if (groups > 1 && !next && mute) groups--
    total += Math.max(w.length ? 1 : 0, groups)
  })
  return total
}

// Lines ----------------------------------------------------------------------

export function syllableCount(line: string, language: "en" | "fr" = "en") {
  if (language === "fr") return frenchSyllables(line)
  return scanWords(line).reduce((n, w) => n + w.stress.length, 0)
}

export const METERS = [
  { id: "iamb", foot: "01" },
  { id: "trochee", foot: "10" },
  { id: "anapest", foot: "001" },
  { id: "dactyl", foot: "100" },
] as const
export type MeterId = (typeof METERS)[number]["id"]

export interface Scansion {
  pattern: string
  meter: MeterId | null
  feet: number
  // Share of syllables that fit the metre, 0 to 1.
  fit: number
}

// One word of stress can't be wrong by much in English verse: promotion and
// demotion are normal, so this scores agreement rather than demanding it.
export function scan(line: string): Scansion {
  const pattern = scanWords(line)
    .flatMap((w) => w.stress)
    .join("")
  if (pattern.length < 3) return { pattern, meter: null, feet: 0, fit: 0 }
  let best: Scansion = { pattern, meter: null, feet: 0, fit: 0 }
  for (const m of METERS) {
    let hits = 0
    for (let i = 0; i < pattern.length; i++)
      if (pattern[i] === m.foot[i % m.foot.length]) hits++
    const fit = hits / pattern.length
    if (fit > best.fit)
      best = {
        pattern,
        meter: m.id,
        fit,
        feet: Math.max(1, Math.round(pattern.length / m.foot.length)),
      }
  }
  return best.fit >= 0.7 ? best : { ...best, meter: null }
}

export function dominantMeter(lines: string[]) {
  const tally = new Map<string, number>()
  for (const l of lines) {
    const s = scan(l)
    if (s.meter) {
      const k = `${s.meter}:${s.feet}`
      tally.set(k, (tally.get(k) ?? 0) + 1)
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!top || top[1] < lines.filter((l) => l.trim()).length / 2) return null
  const [meter, feet] = top[0].split(":")
  return { meter: meter as MeterId, feet: Number(feet) }
}

// Rhyme ----------------------------------------------------------------------

export const lastWord = (line: string) =>
  /([\p{L}][\p{L}'’]*)[^\p{L}]*$/u.exec(line)?.[1] ?? ""

// From the last stressed vowel to the end: the part that rhymes.
export function rhymeKey(word: string, language: "en" | "fr" = "en"): string {
  if (language === "fr") return frenchRhyme(word)
  const phones = phonesOf(word)
  if (phones) {
    let at = -1
    for (let i = phones.length - 1; i >= 0; i--)
      if (/[12]$/.test(phones[i]!)) {
        at = i
        break
      }
    if (at < 0) at = phones.findIndex((p) => VOWEL.test(p))
    return phones
      .slice(Math.max(at, 0))
      .map((p) => p.replace(/\d/, ""))
      .join(" ")
  }
  const w = clean(word).replace(/[^a-z]/g, "")
  return (/[aeiouy]+[^aeiouy]*e?$/.exec(w)?.[0] ?? w).replace(/e$/, "")
}

function frenchRhyme(word: string) {
  return clean(word)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(?:es|ent|e|s|x|t|d)$/, "")
    .replace(/eau$|aux?$/, "o")
    .replace(/ai[ts]?$|et$|ez$|er$/, "e")
    .slice(-3)
}

const vowelOf = (key: string) => key.split(" ")[0] ?? ""
const codaOf = (key: string) => key.split(" ").slice(1).join(" ")

export type RhymeKind = "perfect" | "slant"

export function rhymes(
  a: string,
  b: string,
  language: "en" | "fr" = "en"
): RhymeKind | null {
  if (!a || !b) return null
  if (clean(a) === clean(b)) return null
  const x = rhymeKey(a, language)
  const y = rhymeKey(b, language)
  if (x && x === y) return "perfect"
  if (language === "en" && phonesOf(a) && phonesOf(b)) {
    const coda = codaOf(x)
    if (coda && coda === codaOf(y)) return "slant"
    if (vowelOf(x) === vowelOf(y) && codaOf(x).length && codaOf(y).length)
      return "slant"
  }
  return null
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

export interface RhymeLine {
  letter: string
  kind: RhymeKind | null
  // Does any other line share the letter?
  paired: boolean
}

export function rhymeScheme(
  lines: string[],
  language: "en" | "fr" = "en"
): (RhymeLine | null)[] {
  const words = lines.map((l) => (l.trim() ? lastWord(l) : ""))
  // Perfect rhymes set the groups. A slant rhyme only joins words nothing else
  // claimed, or "mud" and "tide" would share a letter over one final consonant.
  const groups: { key: string; first: number; members: number[] }[] = []
  const groupOf = new Map<number, number>()
  words.forEach((w, i) => {
    if (!w) return
    const key = rhymeKey(w, language)
    let g = groups.findIndex((x) => x.key === key)
    if (g < 0) g = groups.push({ key, first: i, members: [] }) - 1
    groups[g]!.members.push(i)
    groupOf.set(i, g)
  })
  const kinds = new Map<number, RhymeKind>()
  for (const g of groups)
    if (g.members.length > 1) for (const i of g.members) kinds.set(i, "perfect")
  const single = groups.filter((g) => g.members.length === 1)
  for (const g of single) {
    if (g.members.length !== 1) continue
    const i = g.first
    const mate = single.find(
      (o) =>
        o !== g &&
        o.members.length === 1 &&
        rhymes(words[i]!, words[o.first]!, language)
    )
    if (mate) {
      const j = mate.first
      g.members.push(j)
      mate.members.length = 0
      groupOf.set(j, groups.indexOf(g))
      kinds.set(i, "slant")
      kinds.set(j, "slant")
    }
  }
  const letters = new Map<number, string>()
  words.forEach((w, i) => {
    if (!w) return
    const g = groupOf.get(i)!
    if (!letters.has(g)) letters.set(g, LETTERS[letters.size % 26]!)
  })
  return words.map((w, i) => {
    if (!w) return null
    const g = groupOf.get(i)!
    return {
      letter: letters.get(g)!,
      kind: kinds.get(i) ?? null,
      paired: groups[g]!.members.length > 1,
    }
  })
}

export interface RhymeHit {
  word: string
  syllables: number
  kind: RhymeKind
}

let reverse: Map<string, string[]> | null = null

export function rhymesFor(word: string, limit = 80): RhymeHit[] {
  if (!dictionary) return []
  const key = rhymeKey(word)
  if (!reverse) {
    reverse = new Map()
    for (const w of Object.keys(dictionary)) {
      if (!/^[a-z']+$/.test(w)) continue
      const k = rhymeKey(w)
      const list = reverse.get(k)
      if (list) list.push(w)
      else reverse.set(k, [w])
    }
  }
  const syl = (w: string) =>
    dictionary![w]!.split(" ").filter((p) => VOWEL.test(p)).length
  const self = clean(word)
  const make = (kind: RhymeKind) => (w: string) => ({
    word: w,
    syllables: syl(w),
    kind,
  })
  const perfect = (reverse.get(key) ?? [])
    .filter((w) => w !== self)
    .map(make("perfect"))
  const coda = codaOf(key)
  const slant: RhymeHit[] = []
  if (perfect.length < limit && coda)
    for (const [k, list] of reverse) {
      if (
        k !== key &&
        codaOf(k) === coda &&
        k.split(" ").length === key.split(" ").length
      )
        slant.push(...list.slice(0, 6).map(make("slant")))
      if (slant.length > limit) break
    }
  // The dictionary is full of names and oddities and has no frequencies, so
  // words spelled like the original come first: tide finds side before eid.
  const shared = (w: string) => {
    let n = 0
    while (
      n < w.length &&
      n < self.length &&
      w[w.length - 1 - n] === self[self.length - 1 - n]
    )
      n++
    return n
  }
  const usable = (h: RhymeHit) =>
    h.word.length > 2 && !h.word.includes("'") && !self.endsWith(h.word)
  const rank = (a: RhymeHit, b: RhymeHit) =>
    Math.min(shared(b.word), 3) - Math.min(shared(a.word), 3) ||
    a.syllables - b.syllables ||
    a.word.length - b.word.length
  return [
    ...perfect.filter(usable).sort(rank),
    ...slant.filter(usable).sort(rank),
  ].slice(0, limit)
}

// Forms ----------------------------------------------------------------------

export interface PoemForm {
  id: string
  lines?: number
  // Stanza sizes; repeated as the scheme runs.
  stanzas?: number[]
  scheme?: string
  syllables?: number[]
  meter?: { meter: MeterId; feet: number }
  // Which earlier line each refrain repeats: line (0-based) -> source line.
  refrains?: Record<number, number>
  // A pantoum, sestina or ghazal is checked by its own function.
  check?: "sestina" | "pantoum" | "ghazal"
  language?: "fr"
}

const IAMBIC5 = { meter: "iamb", feet: 5 } as const

export const FORMS: PoemForm[] = [
  { id: "free" },
  { id: "blank", meter: IAMBIC5 },
  { id: "couplets", scheme: "AABB", meter: IAMBIC5 },
  {
    id: "shakespearean",
    lines: 14,
    stanzas: [4, 4, 4, 2],
    scheme: "ABABCDCDEFEFGG",
    meter: IAMBIC5,
  },
  {
    id: "petrarchan",
    lines: 14,
    stanzas: [8, 6],
    scheme: "ABBAABBACDECDE",
    meter: IAMBIC5,
  },
  { id: "haiku", lines: 3, syllables: [5, 7, 5] },
  { id: "tanka", lines: 5, syllables: [5, 7, 5, 7, 7] },
  { id: "cinquain", lines: 5, syllables: [2, 4, 6, 8, 2] },
  { id: "limerick", lines: 5, scheme: "AABBA", syllables: [8, 8, 5, 5, 8] },
  { id: "ballad", stanzas: [4], scheme: "ABCB", syllables: [8, 6, 8, 6] },
  { id: "terza", stanzas: [3], scheme: "ABABCBCDC" },
  {
    id: "villanelle",
    lines: 19,
    stanzas: [3, 3, 3, 3, 3, 4],
    scheme: "ABAABAABAABAABAABAA".replace(/./g, (c) => c),
    refrains: { 5: 0, 11: 0, 17: 0, 8: 2, 14: 2, 18: 2 },
    meter: IAMBIC5,
  },
  { id: "pantoum", stanzas: [4], check: "pantoum" },
  {
    id: "sestina",
    lines: 39,
    stanzas: [6, 6, 6, 6, 6, 6, 3],
    check: "sestina",
  },
  { id: "ghazal", stanzas: [2], check: "ghazal" },
  { id: "alexandrin", syllables: [12], language: "fr", scheme: "AABB" },
  {
    id: "sonnet-fr",
    lines: 14,
    stanzas: [4, 4, 3, 3],
    scheme: "ABBAABBACCDEDE",
    syllables: [12],
    language: "fr",
  },
]

export const formById = (id?: string) =>
  FORMS.find((f) => f.id === id) ?? FORMS[0]!

export type FormIssue =
  | { code: "lines"; expected: number; got: number }
  | { code: "stanza"; stanza: number; expected: number; got: number }
  | { code: "syllables"; line: number; expected: number; got: number }
  | { code: "rhyme"; line: number; expected: string; with: number }
  | { code: "refrain"; line: number; source: number }
  | { code: "meter"; line: number }
  | { code: "endword"; line: number; expected: string }
  | { code: "repeat"; line: number; source: number }

const SESTINA = [
  [5, 0, 4, 1, 3, 2],
  [2, 5, 3, 0, 1, 4],
  [4, 2, 1, 5, 0, 3],
  [3, 4, 0, 2, 5, 1],
  [1, 3, 5, 4, 2, 0],
]

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()

export function checkForm(
  body: string,
  form: PoemForm,
  language: "en" | "fr" = "en"
): FormIssue[] {
  const all = body.split("\n")
  const lines = all.filter((l) => l.trim())
  const issues: FormIssue[] = []
  if (form.id === "free" || !lines.length) return issues
  // Index into the editor's lines, blanks included.
  const at: number[] = []
  all.forEach((l, i) => {
    if (l.trim()) at.push(i)
  })
  if (form.lines && lines.length !== form.lines)
    issues.push({ code: "lines", expected: form.lines, got: lines.length })
  if (form.stanzas) {
    const sizes = body
      .split(/\n\s*\n/)
      .map((s) => s.split("\n").filter((l) => l.trim()).length)
      .filter(Boolean)
    const cycle = form.lines === undefined
    sizes.forEach((got, s) => {
      const expected = cycle
        ? form.stanzas![s % form.stanzas!.length]!
        : form.stanzas![s]
      if (expected !== undefined && got !== expected)
        issues.push({ code: "stanza", stanza: s, expected, got })
    })
  }
  if (form.syllables)
    lines.forEach((line, i) => {
      const expected = form.syllables![i % form.syllables!.length]!
      const got = syllableCount(line, language)
      if (got !== expected)
        issues.push({ code: "syllables", line: at[i]!, expected, got })
    })
  if (form.scheme) {
    const firstOf = new Map<string, number>()
    lines.forEach((line, i) => {
      const letter =
        form.lines === undefined
          ? `${form.scheme![i % form.scheme!.length]!}${Math.floor(i / form.scheme!.length)}`
          : form.scheme![i]
      if (!letter) return
      const first = firstOf.get(letter)
      if (first === undefined) {
        firstOf.set(letter, i)
        return
      }
      const a = lastWord(lines[first]!)
      const b = lastWord(line)
      if (norm(a) !== norm(b) && !rhymes(a, b, language))
        issues.push({
          code: "rhyme",
          line: at[i]!,
          expected: a,
          with: at[first]!,
        })
    })
  }
  if (form.refrains)
    for (const [i, src] of Object.entries(form.refrains)) {
      const line = lines[Number(i)]
      if (line !== undefined && norm(line) !== norm(lines[src] ?? ""))
        issues.push({ code: "refrain", line: at[Number(i)]!, source: at[src]! })
    }
  if (form.meter)
    lines.forEach((line, i) => {
      const s = scan(line)
      if (s.meter !== form.meter!.meter || s.feet !== form.meter!.feet)
        issues.push({ code: "meter", line: at[i]! })
    })
  if (form.check === "pantoum")
    for (let i = 4; i + 3 < lines.length; i += 4) {
      const pairs = [
        [i, i - 3],
        [i + 2, i - 1],
      ] as const
      for (const [line, source] of pairs)
        if (norm(lines[line]!) !== norm(lines[source]!))
          issues.push({ code: "refrain", line: at[line]!, source: at[source]! })
    }
  if (form.check === "sestina" && lines.length >= 6) {
    const words = lines.slice(0, 6).map(lastWord)
    SESTINA.forEach((order, s) =>
      order.forEach((w, i) => {
        const n = 6 * (s + 1) + i
        if (
          lines[n] !== undefined &&
          norm(lastWord(lines[n]!)) !== norm(words[w]!)
        )
          issues.push({ code: "endword", line: at[n]!, expected: words[w]! })
      })
    )
  }
  if (form.check === "ghazal" && lines.length >= 2) {
    const radif = norm(lastWord(lines[0]!))
    for (let i = 1; i < lines.length; i += 2)
      if (norm(lastWord(lines[i]!)) !== radif)
        issues.push({
          code: "endword",
          line: at[i]!,
          expected: lastWord(lines[0]!),
        })
  }
  return issues
}

// Sound: repeated first consonants inside a line.
export function alliteration(line: string) {
  const words = [...line.matchAll(/[\p{L}][\p{L}'’]*/gu)]
  const key = (w: string) => {
    const p = phonesOf(w)
    if (p) return VOWEL.test(p[0]!) ? null : p[0]!
    const c = clean(w)[0]
    return c && !/[aeiouy]/.test(c) ? c.toUpperCase() : null
  }
  const groups = new Map<string, { start: number; end: number }[]>()
  for (const m of words) {
    if (LIGHT.has(clean(m[0]))) continue
    const k = key(m[0])
    if (!k) continue
    const list = groups.get(k) ?? []
    list.push({ start: m.index, end: m.index + 1 })
    groups.set(k, list)
  }
  return [...groups.values()].filter((g) => g.length >= 3).flat()
}
