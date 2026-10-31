import { coverage, metrics } from "./data/metrics.gen"

export type Face = "display" | "text" | "bold"

const FALLBACK = `'Noto Sans','Noto Sans Arabic','Noto Sans Hebrew','Noto Sans JP','Noto Sans SC','Noto Sans KR'`
const FAMILY: Record<Face, string> = {
  display: `'Palmframe Display',${FALLBACK}`,
  text: `'Palmframe Text',${FALLBACK}`,
  bold: `'Palmframe Text',${FALLBACK}`,
}

// Control characters are invalid in XML. Directional overrides would let a
// label visually reorder digits, so a chart could show a number it doesn't hold.
export const clean = (s: string) =>
  s
    .replace(/\p{Cs}/gu, "\uFFFD")
    .replace(/[\p{Cc}\s]+/gu, " ")
    .replace(/[‪-‮⁦-⁩￾￿]/g, "")
    .trim()

export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

export const isRtl = (s: string) => {
  const first = s.match(/\p{L}/u)?.[0]
  return !!first && /[\p{Script=Hebrew}\p{Script=Arabic}]/u.test(first)
}

const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-｠]/u
const MARK = /\p{M}/u

// Advance widths from the embedded fonts, kerning aside. Text in a fallback
// font is estimated; Arabic shapes into narrower runs than the estimate.
export function measure(s: string, face: Face, size: number) {
  const table = metrics[face] as Record<string, number>
  let total = 0
  for (const ch of s) {
    const known = table[ch.codePointAt(0)!]
    if (known !== undefined) total += known
    else if (WIDE.test(ch)) total += 1000
    else if (!MARK.test(ch)) total += 620
  }
  return (total / 1000) * size
}

export function ellipsize(s: string, face: Face, size: number, max: number) {
  if (measure(s, face, size) <= max) return s
  const chars = [...s]
  while (
    chars.length &&
    measure(chars.join("").trimEnd() + "…", face, size) > max
  )
    chars.pop()
  return chars.join("").trimEnd() + "…"
}

const TOKENS =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|\s+/gu

// Greedy wrapping. Japanese and Chinese break between any two characters.
export function wrap(
  s: string,
  face: Face,
  size: number,
  max: number,
  maxLines: number
) {
  const lines: string[] = []
  let line = ""
  const tokens = s.match(TOKENS) ?? []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (measure(line + token, face, size) <= max) {
      line += token
      continue
    }
    if (/^\s+$/.test(token)) continue
    if (line.trim()) lines.push(line.trim())
    line = token
    if (lines.length === maxLines - 1) {
      line = tokens.slice(i).join("")
      break
    }
    // One word wider than the box: cut it rather than overflow.
    while (measure(line, face, size) > max && lines.length < maxLines - 1) {
      const chars = [...line]
      let n = chars.length
      while (n > 1 && measure(chars.slice(0, n).join(""), face, size) > max) n--
      lines.push(chars.slice(0, n).join(""))
      line = chars.slice(n).join("")
    }
  }
  if (line.trim()) lines.push(ellipsize(line.trim(), face, size, max))
  return lines
}

// resvg's own fallback leaves Arabic as empty boxes at the display weight, so
// right-to-left text names its font first.
function familyFor(s: string, face: Face) {
  if (/\p{Script=Arabic}/u.test(s)) return `'Noto Sans Arabic',${FAMILY[face]}`
  if (/\p{Script=Hebrew}/u.test(s)) return `'Noto Sans Hebrew',${FAMILY[face]}`
  return FAMILY[face]
}

export interface TextOptions {
  size: number
  face?: Face
  fill: string
  anchor?: "start" | "middle" | "end"
  // Dark outline behind a label that sits on a map.
  halo?: string
  extra?: string
}

const WEIGHT: Record<Face, number> = { display: 900, text: 500, bold: 700 }

export function text(x: number, y: number, s: string, o: TextOptions) {
  const face = o.face ?? "text"
  const halo = o.halo
    ? ` stroke="${o.halo}" stroke-width="${round(o.size / 5)}" stroke-linejoin="round" paint-order="stroke"`
    : ""
  return `<text x="${round(x)}" y="${round(y)}" font-family="${familyFor(s, face)}" font-weight="${WEIGHT[face]}" font-size="${round(o.size)}" fill="${o.fill}" text-anchor="${o.anchor ?? "start"}"${halo}${o.extra ? " " + o.extra : ""}>${esc(s)}</text>`
}

export const round = (n: number) => Math.round(n * 10) / 10

const inRanges = (ranges: number[][], cp: number) => {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const range = ranges[mid]!
    if (cp < range[0]!) hi = mid - 1
    else if (cp > range[1]!) lo = mid + 1
    else return true
  }
  return false
}

export function fontGroupsFor(s: string) {
  const need = new Set<"world" | "cjk">()
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x250 || inRanges(coverage.core, cp)) continue
    if (inRanges(coverage.world, cp)) need.add("world")
    else if (inRanges(coverage.cjk, cp)) need.add("cjk")
  }
  return need
}

// What no embedded font can draw: emoji, Thai, Devanagari, rarer kanji.
export function unsupportedChars(s: string) {
  const out = new Set<string>()
  for (const ch of clean(s)) {
    const cp = ch.codePointAt(0)!
    const known =
      MARK.test(ch) ||
      cp === 0x20 ||
      inRanges(coverage.core, cp) ||
      inRanges(coverage.world, cp) ||
      inRanges(coverage.cjk, cp)
    if (!known) out.add(ch)
  }
  return [...out]
}
