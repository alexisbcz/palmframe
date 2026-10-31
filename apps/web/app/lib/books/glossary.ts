import { stripTags } from "./inline"
import { languageOf, type Term, type TermKind } from "./model"
import { Element, findAll, parseXml, textOf, walk } from "./xml"

export type GlossaryTerm = Pick<
  Term,
  "source" | "target" | "dnt" | "case_sensitive"
>

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const hasSpaces = (lang: string) => !languageOf(lang)?.cjk && lang !== "th"

const CACHE = new Map<string, RegExp>()

// Whole words where the language has them; Japanese and friends don't, so any
// occurrence counts there. Lookarounds rather than `\b`, which is ASCII-only.
function termPattern(term: string, caseSensitive: boolean, spaced: boolean) {
  const key = `${caseSensitive}${spaced}${term}`
  let re = CACHE.get(key)
  if (!re) {
    const body = escapeRegex(term.trim()).replace(/\s+/g, "\\s+")
    re = new RegExp(
      spaced ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body,
      caseSensitive ? "gu" : "giu"
    )
    if (CACHE.size > 20_000) CACHE.clear()
    CACHE.set(key, re)
  }
  re.lastIndex = 0
  return re
}

export const countTerm = (
  term: string,
  text: string,
  lang: string,
  caseSensitive = false
) =>
  term.trim()
    ? (text.match(termPattern(term, caseSensitive, hasSpaces(lang)))?.length ??
      0)
    : 0

// Words change their endings: "Zauberstab" reads "Zauberstäbe" and "Zauberstabs"
// in German. Each word of the wanted rendering must appear by its stem. This
// accepts a little too much on purpose: a false alarm on every noun would
// teach people to ignore the check.
function countInflected(want: string, text: string) {
  const words = want.trim().split(/\s+/)
  const stems = words.map((w) => {
    const letters = [...w]
    return letters
      .slice(0, Math.max(3, Math.ceil(letters.length * 0.7)))
      .join("")
  })
  const body = stems
    .map((s) => `${escapeRegex(s)}[\\p{L}\\p{M}'’-]{0,6}`)
    .join("\\s+")
  return (
    text.match(new RegExp(`(?<![\\p{L}\\p{N}])${body}`, "giu"))?.length ?? 0
  )
}

export interface GlossaryBreak {
  term: string
  expected: string
  found: number
  wanted: number
}

// Every approved term in the source must show up in the translation: as often,
// and spelled as agreed. A do-not-translate term must stay exactly as written.
export function checkGlossary(
  source: string,
  target: string,
  terms: GlossaryTerm[],
  sourceLang: string,
  targetLang: string
): GlossaryBreak[] {
  const from = stripTags(source)
  const to = stripTags(target)
  const breaks: GlossaryBreak[] = []
  const covered: [number, number][] = []
  // Longest first: "New York Times" shouldn't also count as "New York".
  for (const term of [...terms].sort(
    (a, b) => b.source.length - a.source.length
  )) {
    if (!term.source.trim()) continue
    const pattern = termPattern(
      term.source,
      term.case_sensitive,
      hasSpaces(sourceLang)
    )
    let wanted = 0
    for (const m of from.matchAll(pattern)) {
      const start = m.index
      const end = start + m[0].length
      if (covered.some(([a, b]) => start < b && end > a)) continue
      covered.push([start, end])
      wanted++
    }
    if (!wanted) continue
    const expected = term.dnt ? term.source : term.target
    if (!expected.trim()) continue
    const exact = countTerm(
      expected,
      to,
      targetLang,
      term.dnt || term.case_sensitive
    )
    const found =
      exact >= wanted || term.dnt || !hasSpaces(targetLang)
        ? exact
        : Math.max(exact, countInflected(expected, to))
    // A language can drop a repeated name for a pronoun, so being short is a
    // break only when the term is missing outright or badly undercounted.
    if (found === 0 || (term.dnt && found < wanted))
      breaks.push({ term: term.source, expected, found, wanted })
  }
  return breaks
}

// Only the terms a chunk uses: a book's glossary can run to thousands of lines
// and a request pays for every one.
export function termsFor<T extends GlossaryTerm>(
  terms: T[],
  sources: string[],
  lang: string
) {
  const text = sources.map(stripTags).join("\n")
  return terms.filter(
    (t) => countTerm(t.source, text, lang, t.case_sensitive) > 0
  )
}

const STOP = new Set(
  "the a an and or but of to in on at by for with from as is was were be been this that these those it its he she they we you i his her their our your my not no so if then than when while there here what who whom which how why all any some one two le la les un une des du de et ou mais dans sur pour avec par ce cette ces il elle ils elles nous vous je tu el los las una unos unas y o pero en con por para esto esta der die das ein eine und oder aber im am mit von zu für il lo gli i una uno e ma con per".split(
    " "
  )
)

export interface Candidate {
  source: string
  count: number
  context: string
  kind: TermKind
}

// Cheap first pass, no model: names show up capitalised away from the start of
// a sentence, and terms repeat. The model then judges this short list instead
// of reading the whole book, which is most of what keeps extraction cheap.
export function findCandidates(texts: string[], limit = 300): Candidate[] {
  const found = new Map<string, { count: number; context: string }>()
  const bump = (word: string, text: string, at: number) => {
    const hit = found.get(word)
    if (hit) hit.count++
    else
      found.set(word, {
        count: 1,
        context: text.slice(Math.max(0, at - 60), at + word.length + 60),
      })
  }
  const NAME =
    /(?<=[\p{L}\p{N},;'’)] )(\p{Lu}[\p{L}'’-]+(?: (?:(?:de|du|van|von|la|le|of|the) )?\p{Lu}[\p{L}'’-]+){0,3})/gu
  const SINGLE = /\p{Lu}[\p{L}'’-]{2,}/gu
  for (const raw of texts) {
    const text = stripTags(raw)
    for (const m of text.matchAll(NAME)) bump(m[1]!, text, m.index)
    // Sentence openers count only for words already seen capitalised mid-text.
    for (const m of text.matchAll(SINGLE))
      if (found.has(m[0]) && m.index === 0) bump(m[0], text, m.index)
  }
  return [...found]
    .filter(
      ([word, { count }]) =>
        count >= 2 && !STOP.has(word.toLowerCase()) && word.length < 60
    )
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([source, { count, context }]) => ({
      source,
      count,
      context,
      kind: "name" as const,
    }))
}

// CSV as RFC 4180: quotes may hold commas and line breaks.
export function parseCsv(input: string) {
  const text = input.replace(/^﻿/, "")
  const delimiter =
    (text.split("\n")[0]?.split(";").length ?? 0) >
    (text.split("\n")[0]?.split(",").length ?? 0)
      ? ";"
      : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(cell)
      if (row.some((v) => v.trim())) rows.push(row)
      row = []
      cell = ""
    } else cell += c
  }
  row.push(cell)
  if (row.some((v) => v.trim())) rows.push(row)
  return rows
}

export type ImportedTerm = Omit<Term, "id" | "state">

const truthy = (s: string | undefined) =>
  /^(1|true|yes|y|oui|ja|sí|si|はい)$/i.test(s?.trim() ?? "")

const KINDS: TermKind[] = ["name", "place", "term", "title", "phrase"]

const clean = (s: string | undefined, max: number) =>
  (s ?? "").trim().slice(0, max)

const toTerm = (r: {
  source?: string
  target?: string
  kind?: string
  dnt?: string
  note?: string
  caseSensitive?: string
}): ImportedTerm | null => {
  const source = clean(r.source, 200)
  if (!source) return null
  const kind = KINDS.find((k) => k === r.kind?.trim().toLowerCase()) ?? "term"
  return {
    source,
    target: clean(r.target, 200),
    kind,
    dnt: truthy(r.dnt),
    note: clean(r.note, 500),
    case_sensitive: truthy(r.caseSensitive),
  }
}

export function importCsv(input: string): ImportedTerm[] {
  const rows = parseCsv(input)
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? []
  const named = header.includes("source")
  const col = (name: string, fallback: number) => {
    const at = header.indexOf(name)
    return named ? at : fallback
  }
  const c = {
    source: col("source", 0),
    target: col("target", 1),
    kind: col("type", 2),
    dnt: col("do_not_translate", 3),
    note: col("note", 4),
    cs: col("case_sensitive", 5),
  }
  return (named ? rows.slice(1) : rows).flatMap((row) => {
    const term = toTerm({
      source: row[c.source],
      target: row[c.target],
      kind: row[c.kind],
      dnt: row[c.dnt],
      note: row[c.note],
      caseSensitive: row[c.cs],
    })
    return term ? [term] : []
  })
}

// A cell starting with these runs as a formula when opened in a spreadsheet,
// and a glossary can hold terms pulled from a stranger's book.
const defuse = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)

const csvCell = (s: string) => {
  const safe = defuse(s)
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function exportCsv(terms: Omit<Term, "id" | "state">[]) {
  const header = "source,target,type,do_not_translate,note,case_sensitive"
  const rows = terms.map((t) =>
    [
      t.source,
      t.target,
      t.kind,
      t.dnt ? "yes" : "",
      t.note,
      t.case_sensitive ? "yes" : "",
    ]
      .map(csvCell)
      .join(",")
  )
  return `${[header, ...rows].join("\r\n")}\r\n`
}

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// TBX-Basic: one concept per term, one language section per side.
export function exportTbx(
  terms: Omit<Term, "id" | "state">[],
  sourceLang: string,
  targetLang: string
) {
  const entries = terms
    .map(
      (t, i) => `      <termEntry id="c${i + 1}">
        <descrip type="subjectField">${xmlEscape(t.kind)}</descrip>${
          t.note ? `\n        <note>${xmlEscape(t.note)}</note>` : ""
        }${t.dnt ? `\n        <termNote type="administrativeStatus">doNotTranslate</termNote>` : ""}
        <langSet xml:lang="${xmlEscape(sourceLang)}"><tig><term>${xmlEscape(t.source)}</term></tig></langSet>
        <langSet xml:lang="${xmlEscape(targetLang)}"><tig><term>${xmlEscape(t.dnt ? t.source : t.target)}</term></tig></langSet>
      </termEntry>`
    )
    .join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX-Basic" xml:lang="en">
  <martifHeader>
    <fileDesc><sourceDesc><p>Palmframe</p></sourceDesc></fileDesc>
    <encodingDesc><p type="XCSURI">TBXBasicXCSV02.xcs</p></encodingDesc>
  </martifHeader>
  <text>
    <body>
${entries}
    </body>
  </text>
</martif>
`
}

export function importTbx(
  xml: string,
  sourceLang: string,
  targetLang: string
): ImportedTerm[] {
  const doc = parseXml(xml)
  const base = (code: string) => code.split(/[-_]/)[0]!.toLowerCase()
  return findAll(doc, "termentry").flatMap((entry) => {
    const langs = findAll(entry, "langset").map((set) => ({
      lang: set.attribs["xml:lang"] ?? set.attribs.lang ?? "",
      term: textOf(findAll(set, "term")[0] ?? new Element("x", {})).trim(),
    }))
    const pick = (code: string) =>
      langs.find((l) => l.lang === code)?.term ??
      langs.find((l) => base(l.lang) === base(code))?.term
    const source = pick(sourceLang) ?? langs[0]?.term
    const target = pick(targetLang) ?? langs[1]?.term
    let dnt = false
    let kind: string | undefined
    let note = ""
    for (const e of walk(entry)) {
      const type = e.attribs.type ?? ""
      if (/^(administrativeStatus|usageNote)$/.test(type))
        dnt ||= /doNotTranslate/i.test(textOf(e))
      if (type === "subjectField") kind = textOf(e)
      if (e.name === "note") note ||= textOf(e)
    }
    const term = toTerm({
      source,
      target,
      kind,
      dnt: dnt ? "yes" : "",
      note,
    })
    return term ? [term] : []
  })
}
