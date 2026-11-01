import { parse as parseYaml } from "yaml"

// vale.ts: the Vale prose linter's rule engine, in TypeScript, so it can run on
// every keystroke in a browser. Rules are Vale's own YAML, so a style written
// for the command line works here and the other way round. Implemented:
// existence, substitution, occurrence, repetition, consistency, conditional,
// capitalization, metric and readability. `sequence`, `spelling` and `script`
// need a tagger, a dictionary or a Tengo runtime; compileRule rejects them by
// name rather than quietly checking nothing. The test suite runs the real
// binary, when installed, against the same text and compares the alerts.

export type Level = "suggestion" | "warning" | "error"

export interface ValeRule {
  extends: string
  message?: string
  level?: Level
  scope?: string | string[]
  ignorecase?: boolean
  nonword?: boolean
  tokens?: string[]
  raw?: string[]
  exceptions?: string[]
  append?: boolean
  swap?: Record<string, string>
  either?: Record<string, string>
  max?: number
  min?: number
  token?: string
  alpha?: boolean
  first?: string
  second?: string
  match?: string
  formula?: string
  condition?: string
  metrics?: string[]
  grade?: number
  action?: { name?: string; params?: string[] }
  link?: string
  description?: string
}

export interface Alert {
  check: string
  message: string
  level: Level
  start: number
  end: number
  match: string
  // Text that would fix it, when the rule knows one. Empty means delete.
  fix?: string
}

export interface Block {
  text: string
  // Offset of the block in the document.
  start: number
  // "paragraph" in prose. Screenplays add "action", "dialogue" and so on, and
  // a rule's `scope` can name one to run only there.
  kind?: string
}

export interface CompiledRule {
  name: string
  rule: ValeRule
  scopes: string[]
  run(scope: string, offset: number, state: RunState): Alert[]
}

interface RunState {
  // Consistency rules remember what the document said first.
  seen: Map<string, string>
}

const UNSUPPORTED = new Set(["sequence", "spelling", "script"])
const LEVELS = new Set(["suggestion", "warning", "error"])

export class RuleError extends Error {}

// Go's RE2-flavoured patterns, as JavaScript. Leading flag groups have no JS
// form, so they move to the regex flags; POSIX classes get spelled out.
export function toRegExp(source: string, ignorecase = false) {
  let flags = "gmu"
  let body = source
  let insensitive = ignorecase
  const leading = /\(\?([ims]+)\)/g
  body = body.replace(leading, (_, f: string) => {
    if (f.includes("i")) insensitive = true
    if (f.includes("s")) flags += "s"
    return ""
  })
  body = body
    .replace(/\[\[:alpha:\]\]/g, "\\p{L}")
    .replace(/\[:alpha:\]/g, "\\p{L}")
    .replace(/\[\[:upper:\]\]/g, "\\p{Lu}")
    .replace(/\[:upper:\]/g, "\\p{Lu}")
    .replace(/\[\[:lower:\]\]/g, "\\p{Ll}")
    .replace(/\[:lower:\]/g, "\\p{Ll}")
    .replace(/\[\[:digit:\]\]/g, "\\d")
    .replace(/\[:digit:\]/g, "\\d")
    .replace(/\[\[:space:\]\]/g, "\\s")
    .replace(/\[:space:\]/g, "\\s")
  // ASCII word boundaries, as in Go, need no unicode flag, and the flag rejects
  // the loose escapes old rules are full of, like \' or \-.
  if (insensitive) flags += "i"
  try {
    return new RegExp(body, flags)
  } catch {
    try {
      return new RegExp(body, flags.replace("u", ""))
    } catch (e) {
      throw new RuleError(
        `Bad pattern ${source}: ${e instanceof Error ? e.message : e}`
      )
    }
  }
}

const WORD = (s: string) => `\\b(?:${s})\\b`
const NONWORD = (s: string) => `(?:${s})`

function format(message: string, ...args: string[]) {
  let i = 0
  return message
    .replace(/%\[(\d+)\]s/g, (_, n: string) => args[Number(n) - 1] ?? "")
    .replace(/%s/g, () => args[i++] ?? "")
}

const allMatches = (re: RegExp, s: string) => {
  re.lastIndex = 0
  const out: RegExpExecArray[] = []
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[0] === "") {
      re.lastIndex++
      continue
    }
    out.push(m)
  }
  return out
}

function exceptionTest(rule: ValeRule) {
  if (!rule.exceptions?.length) return () => false
  const re = toRegExp(
    `^(?:${rule.exceptions.join("|")})$`,
    rule.ignorecase ?? false
  )
  return (word: string) => {
    re.lastIndex = 0
    return re.test(word)
  }
}

function alertFrom(
  name: string,
  rule: ValeRule,
  start: number,
  end: number,
  match: string,
  message: string,
  fix?: string
): Alert {
  return {
    check: name,
    message,
    level: rule.level ?? "suggestion",
    start,
    end,
    match,
    ...(fix !== undefined && { fix }),
  }
}

function existence(name: string, rule: ValeRule) {
  const tokens = (rule.tokens ?? []).join("|")
  const useWord = !rule.nonword && !!rule.tokens?.length
  const body = useWord ? WORD(tokens) : tokens ? NONWORD(tokens) : ""
  const raw = (rule.raw ?? []).join("")
  const re = toRegExp(
    rule.append ? body + raw : raw + body,
    rule.ignorecase ?? false
  )
  const excepted = exceptionTest(rule)
  const removes = rule.action?.name === "remove"
  return (text: string, at: number) =>
    allMatches(re, text)
      .filter((m) => !excepted(m[0].trim()))
      .map((m) =>
        alertFrom(
          name,
          rule,
          at + m.index,
          at + m.index + m[0].length,
          m[0],
          format(rule.message ?? "", m[0].trim()),
          removes ? "" : undefined
        )
      )
}

function substitution(name: string, rule: ValeRule) {
  // Longest first, so a phrase beats the word inside it.
  const pairs = Object.entries(rule.swap ?? {}).sort(
    (a, b) => b[0].length - a[0].length
  )
  const wrap = rule.nonword ? NONWORD : WORD
  const groups: { index: number; to: string }[] = []
  let count = 1
  const alternatives = pairs.map(([from, to]) => {
    groups.push({ index: count, to })
    count += 1 + captures(from)
    return `(${from})`
  })
  const re = toRegExp(wrap(alternatives.join("|")), rule.ignorecase ?? false)
  const excepted = exceptionTest(rule)
  const twice = /%(\[2\])?s[\s\S]*%(\[\d\])?s/.test(rule.message ?? "")
  return (text: string, at: number) => {
    const out: Alert[] = []
    for (const m of allMatches(re, text)) {
      if (excepted(m[0])) continue
      const hit = groups.find((g) => m[g.index] !== undefined)
      if (!hit) continue
      const to = hit.to.replace(/\$(\d)/g, (_, n: string) => m[Number(n)] ?? "")
      if (to === m[0]) continue
      const choice = to.split("|")[0]!
      out.push(
        alertFrom(
          name,
          rule,
          at + m.index,
          at + m.index + m[0].length,
          m[0],
          twice
            ? format(rule.message ?? "", to.replace(/\|/g, "' or '"), m[0])
            : format(rule.message ?? "", to.replace(/\|/g, "' or '")),
          choice
        )
      )
    }
    return out
  }
}

function captures(pattern: string) {
  return (pattern.replace(/\\./g, "").match(/\((?!\?)/g) ?? []).length
}

function occurrence(name: string, rule: ValeRule) {
  const re = toRegExp(rule.token ?? "", rule.ignorecase ?? false)
  return (text: string, at: number) => {
    const found = allMatches(re, text)
    const n = found.length
    const over = (rule.max ?? 0) >= 1 && n > rule.max!
    const under = (rule.min ?? 0) >= 1 && n < rule.min!
    if (!over && !under) return []
    const first = found[0]
    const last = found[n - 1]
    const start = at + (under || !first ? 0 : first.index)
    const end =
      at + (under || !last ? text.length : last.index + last[0].length)
    return [
      alertFrom(
        name,
        rule,
        start,
        end,
        text.slice(start - at, end - at),
        format(rule.message ?? "", String(n))
      ),
    ]
  }
}

function repetition(name: string, rule: ValeRule) {
  const re = toRegExp((rule.tokens ?? []).join("|"), false)
  const alpha = /\p{L}/u
  const fold = (s: string) => (rule.ignorecase ? s.toLowerCase() : s)
  return (text: string, at: number) => {
    const out: Alert[] = []
    const tokens = allMatches(re, text)
    let run = 1
    for (let i = 1; i < tokens.length; i++) {
      const a = tokens[i - 1]!
      const b = tokens[i]!
      const same =
        fold(a[0]) === fold(b[0]) && (!rule.alpha || alpha.test(b[0]))
      run = same ? run + 1 : 1
      if (run > (rule.max ?? 1)) {
        const start = tokens[i - run + 1]!.index
        const end = b.index + b[0].length
        out.push(
          alertFrom(
            name,
            rule,
            at + start,
            at + end,
            text.slice(start, end),
            format(rule.message ?? "", b[0]),
            b[0]
          )
        )
      }
    }
    return out
  }
}

function consistency(name: string, rule: ValeRule) {
  const pairs = Object.entries(rule.either ?? {}).map(([a, b]) => ({
    a,
    b,
    key: `${name}:${a}|${b}`,
    re: toRegExp(
      (rule.nonword ? NONWORD : WORD)(`(${a})|(${b})`),
      rule.ignorecase ?? false
    ),
  }))
  return (text: string, at: number, state: RunState) => {
    const out: Alert[] = []
    for (const { a, b, key, re } of pairs)
      for (const m of allMatches(re, text)) {
        const form = m[1] !== undefined ? a : b
        const first = state.seen.get(key)
        if (!first) state.seen.set(key, form)
        else if (first !== form)
          out.push(
            alertFrom(
              name,
              rule,
              at + m.index,
              at + m.index + m[0].length,
              m[0],
              format(rule.message ?? "", m[0], first),
              first
            )
          )
      }
    return out
  }
}

function conditional(name: string, rule: ValeRule) {
  const first = toRegExp(rule.first ?? "", rule.ignorecase ?? false)
  const second = toRegExp(rule.second ?? "", rule.ignorecase ?? false)
  const excepted = exceptionTest(rule)
  return (text: string, at: number) => {
    const defined = new Set(allMatches(second, text).map((m) => m[1] ?? m[0]))
    return allMatches(first, text)
      .filter((m) => {
        const word = m[1] ?? m[0]
        return !defined.has(word) && !excepted(word)
      })
      .map((m) =>
        alertFrom(
          name,
          rule,
          at + m.index,
          at + m.index + m[0].length,
          m[0],
          format(rule.message ?? "", m[1] ?? m[0])
        )
      )
  }
}

const SMALL =
  /^(a|an|and|as|at|but|by|en|for|if|in|nor|of|on|or|per|the|to|v\.?|via|vs\.?)$/i
const capitalised = (w: string) => w === w[0]!.toUpperCase() + w.slice(1)

function capitalization(name: string, rule: ValeRule) {
  const excepted = exceptionTest(rule)
  const checks: Record<string, (s: string) => boolean> = {
    $upper: (s) => s === s.toUpperCase(),
    $lower: (s) => s === s.toLowerCase(),
    $sentence: (s) => {
      const words = s.split(/\s+/).filter(Boolean)
      return words.every((w, i) =>
        i === 0
          ? capitalised(w)
          : w === w.toLowerCase() || excepted(w) || w === w.toUpperCase()
      )
    },
    $title: (s) =>
      s
        .split(/\s+/)
        .filter(Boolean)
        .every((w, i) => i === 0 || SMALL.test(w) || capitalised(w)),
  }
  const check =
    checks[rule.match ?? ""] ??
    ((s: string) => {
      const re = toRegExp(rule.match ?? "", false)
      return allMatches(re, s).some((m) => m[0] === s)
    })
  return (text: string, at: number) => {
    const trimmed = text.trim()
    return trimmed && !check(trimmed)
      ? [
          alertFrom(
            name,
            rule,
            at,
            at + text.length,
            text,
            format(rule.message ?? "", trimmed)
          ),
        ]
      : []
  }
}

// Readability ---------------------------------------------------------------

const VOWELS = /[aeiouyàâäéèêëîïôöùûü]+/g

export function syllablesIn(word: string) {
  const w = word.toLowerCase().replace(/[^a-zà-ÿ]/g, "")
  if (!w) return 0
  if (w.length <= 3) return 1
  const t = w
    .replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
  return Math.max(1, t.match(VOWELS)?.length ?? 1)
}

const ABBREVIATION =
  /\b(?:mr|mrs|ms|dr|st|mt|jr|sr|prof|gen|rev|hon|capt|sgt|lt|col|vs|etc|e\.g|i\.e|no|fig|inc|ltd)\.$/i

export function sentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  const re = /[.!?…]+["'”’)\]]*(?=\s+|$)|\n+/g
  let start = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length
    if (m[0][0] !== "\n" && ABBREVIATION.test(text.slice(start, end))) continue
    if (m[0][0] === "\n") {
      if (text.slice(start, m.index).trim()) out.push({ start, end: m.index })
      start = end
      continue
    }
    // A lowercase word straight after is a mid-sentence ellipsis or quote.
    const next = /^\s+(\S)/.exec(text.slice(end))
    if (next && /[\p{Ll}]/u.test(next[1]!)) continue
    if (text.slice(start, end).trim()) out.push({ start, end })
    start = end
    while (start < text.length && /\s/.test(text[start]!)) start++
    re.lastIndex = start
  }
  if (text.slice(start).trim()) out.push({ start, end: text.length })
  return out
}

export interface TextStats {
  words: number
  sentences: number
  characters: number
  syllables: number
  complex_words: number
  polysyllabic_words: number
  long_words: number
  paragraphs: number
}

export function textStats(text: string): TextStats {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
  let syllables = 0
  let complex = 0
  let long = 0
  let characters = 0
  for (const w of words) {
    const n = syllablesIn(w)
    syllables += n
    characters += w.length
    if (n >= 3) complex++
    if (w.length > 6) long++
  }
  return {
    words: words.length,
    sentences: Math.max(sentences(text).length, words.length ? 1 : 0),
    characters,
    syllables,
    complex_words: complex,
    polysyllabic_words: complex,
    long_words: long,
    paragraphs: text.split(/\n+/).filter((l) => l.trim()).length,
  }
}

const per = (a: number, b: number) => (b ? a / b : 0)

export const READABILITY = {
  "Flesch-Kincaid": (s: TextStats) =>
    0.39 * per(s.words, s.sentences) + 11.8 * per(s.syllables, s.words) - 15.59,
  "Gunning Fog": (s: TextStats) =>
    0.4 * (per(s.words, s.sentences) + 100 * per(s.complex_words, s.words)),
  "Coleman-Liau": (s: TextStats) =>
    0.0588 * ((s.characters / Math.max(s.words, 1)) * 100) -
    0.296 * (per(s.sentences, s.words) * 100) -
    15.8,
  SMOG: (s: TextStats) =>
    1.043 * Math.sqrt(s.complex_words * per(30, s.sentences)) + 3.1291,
  "Automated Readability": (s: TextStats) =>
    4.71 * per(s.characters, s.words) + 0.5 * per(s.words, s.sentences) - 21.43,
}

// A little calculator for `metric` formulas. Written out because a rule may be
// pasted in by anyone, so it must never reach eval.
export function evaluate(formula: string, vars: Record<string, number>) {
  const tokens =
    formula.match(/\d+\.?\d*|[a-z_]+|\*\*|<=|>=|==|!=|[-+*/()<>,]/gi) ?? []
  let i = 0
  const peek = () => tokens[i]
  const FUNCS: Record<string, (...a: number[]) => number> = {
    sqrt: Math.sqrt,
    pow: Math.pow,
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    round: Math.round,
  }
  const primary = (): number => {
    const t = tokens[i++]
    if (t === undefined) throw new RuleError("Formula ends early")
    if (t === "(") {
      const v = sum()
      i++
      return v
    }
    if (t === "-") return -primary()
    if (/^\d/.test(t)) return Number(t)
    if (FUNCS[t] && peek() === "(") {
      i++
      const args = [sum()]
      while (peek() === ",") {
        i++
        args.push(sum())
      }
      i++
      return FUNCS[t](...args)
    }
    if (t in vars) return vars[t]!
    throw new RuleError(`Unknown name in formula: ${t}`)
  }
  const power = (): number => {
    const base = primary()
    if (peek() !== "**") return base
    i++
    return base ** power()
  }
  const product = (): number => {
    let v = power()
    while (peek() === "*" || peek() === "/") {
      const op = tokens[i++]
      const r = power()
      v = op === "*" ? v * r : r ? v / r : 0
    }
    return v
  }
  const sum = (): number => {
    let v = product()
    while (peek() === "+" || peek() === "-") {
      const op = tokens[i++]
      const r = product()
      v = op === "+" ? v + r : v - r
    }
    return v
  }
  return sum()
}

function metric(name: string, rule: ValeRule) {
  const condition = /^\s*(<=|>=|==|!=|<|>)\s*(-?\d+\.?\d*)\s*$/.exec(
    rule.condition ?? ""
  )
  if (!condition) throw new RuleError(`${name}: unreadable condition`)
  const [, op, limit] = condition
  const n = Number(limit)
  const test: Record<string, (v: number) => boolean> = {
    "<": (v) => v < n,
    ">": (v) => v > n,
    "<=": (v) => v <= n,
    ">=": (v) => v >= n,
    "==": (v) => v === n,
    "!=": (v) => v !== n,
  }
  evaluate(
    rule.formula ?? "0",
    new Proxy({}, { has: () => true, get: () => 1 })
  )
  return (text: string, at: number) => {
    const s = textStats(text)
    const vars = {
      ...s,
      "text.words": s.words,
      blocks: s.paragraphs,
    } as unknown as Record<string, number>
    const value = evaluate(
      (rule.formula ?? "0").replace(/\b(?:text|prose)\./g, ""),
      vars
    )
    return test[op!]!(value)
      ? [
          alertFrom(
            name,
            rule,
            at,
            at + text.length,
            text,
            format(rule.message ?? "", value.toFixed(2))
          ),
        ]
      : []
  }
}

function readability(name: string, rule: ValeRule) {
  const list = (rule.metrics ?? []).map((m) => {
    const f = READABILITY[m as keyof typeof READABILITY]
    if (!f) throw new RuleError(`${name}: unknown metric ${m}`)
    return f
  })
  return (text: string, at: number) => {
    const s = textStats(text)
    if (s.words < 10 || !list.length) return []
    const grade = list.reduce((sum, f) => sum + f(s), 0) / list.length
    return grade > (rule.grade ?? 8)
      ? [
          alertFrom(
            name,
            rule,
            at,
            at + text.length,
            text,
            format(rule.message ?? "", grade.toFixed(1))
          ),
        ]
      : []
  }
}

const EXTENSIONS: Record<
  string,
  (
    name: string,
    rule: ValeRule
  ) => (text: string, at: number, state: RunState) => Alert[]
> = {
  existence,
  substitution,
  occurrence,
  repetition,
  consistency,
  conditional,
  capitalization,
  metric,
  readability,
}

const DEFAULT_SCOPE: Record<string, string> = {
  capitalization: "heading",
  metric: "summary",
  readability: "summary",
}

export function compileRule(name: string, rule: ValeRule): CompiledRule {
  if (UNSUPPORTED.has(rule.extends))
    throw new RuleError(`${name}: "${rule.extends}" rules are not supported`)
  const make = EXTENSIONS[rule.extends]
  if (!make) throw new RuleError(`${name}: unknown extension ${rule.extends}`)
  if (rule.level && !LEVELS.has(rule.level))
    throw new RuleError(`${name}: unknown level ${rule.level}`)
  const scope = rule.scope ?? DEFAULT_SCOPE[rule.extends] ?? "text"
  const run = make(name, rule)
  return {
    name,
    rule,
    scopes: Array.isArray(scope) ? scope : [scope],
    run(text, at, state) {
      return run(text, at, state)
    },
  }
}

export function parseRule(source: string): ValeRule {
  let doc: unknown
  try {
    doc = parseYaml(source)
  } catch (e) {
    throw new RuleError(e instanceof Error ? e.message : "Not YAML")
  }
  if (!doc || typeof doc !== "object" || !("extends" in doc))
    throw new RuleError("A rule needs an `extends` line.")
  return doc as ValeRule
}

// Blocks and sentences ------------------------------------------------------

export function blocksOf(text: string): Block[] {
  const out: Block[] = []
  const re = /\n[^\S\n]*\n\s*/g
  let start = 0
  const push = (end: number) => {
    if (text.slice(start, end).trim())
      out.push({ text: text.slice(start, end), start, kind: "paragraph" })
  }
  for (let m = re.exec(text); m; m = re.exec(text)) {
    push(m.index)
    start = m.index + m[0].length
  }
  push(text.length)
  return out
}

export function lintBlocks(
  blocks: Block[],
  rules: CompiledRule[],
  accepted?: Set<string>
): Alert[] {
  const state: RunState = { seen: new Map() }
  const out: Alert[] = []
  const uses = (rule: CompiledRule, ...names: string[]) =>
    rule.scopes.some((s) => names.includes(s))

  for (const block of blocks) {
    const kind = block.kind ?? "paragraph"
    const spans = sentences(block.text)
    for (const rule of rules) {
      // A scope naming a kind of block, or Vale's own paragraph scope.
      const custom = rule.scopes.filter(
        (s) => !["text", "sentence", "summary", "raw"].includes(s)
      )
      const here = custom.some(
        (s) =>
          s === kind ||
          s === "paragraph" ||
          (s === "opening" && block === blocks[0])
      )
      if (custom.length && !here)
        if (!uses(rule, "text", "sentence", "summary", "raw")) continue
      if (uses(rule, "sentence"))
        for (const s of spans)
          out.push(
            ...rule.run(
              block.text.slice(s.start, s.end),
              block.start + s.start,
              state
            )
          )
      if (uses(rule, "text", "raw", ...(custom.length ? custom : [])))
        out.push(...rule.run(block.text, block.start, state))
    }
  }

  const summary = rules.filter((r) => uses(r, "summary"))
  if (summary.length && blocks.length) {
    const first = blocks[0]!
    const last = blocks[blocks.length - 1]!
    const joined = blocks.map((b) => b.text).join("\n\n")
    for (const rule of summary)
      for (const a of rule.run(joined, 0, state))
        out.push({
          ...a,
          start: first.start,
          end: last.start + last.text.length,
        })
  }

  const dropped = accepted?.size
    ? out.filter((a) => !accepted.has(a.match.trim().toLowerCase()))
    : out
  return dropped.sort((a, b) => a.start - b.start || a.end - b.end)
}

export const lint = (
  text: string,
  rules: CompiledRule[],
  accepted?: Set<string>
) => lintBlocks(blocksOf(text), rules, accepted)
