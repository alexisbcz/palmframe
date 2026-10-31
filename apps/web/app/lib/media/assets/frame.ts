import { ASSET_SIZES, type AssetSize, INK, scaleOf } from "./theme"
import { clean, ellipsize, isRtl, measure, round, text, wrap } from "./text"

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Canvas {
  W: number
  H: number
  s: number
  m: number
  portrait: boolean
  rtl: boolean
  // Mirrors a horizontal position for right-to-left titles.
  mx: (x: number) => number
  anchor: (a: "start" | "end") => "start" | "end"
}

export function canvas(size: AssetSize, title: string): Canvas {
  const { width: W, height: H } = ASSET_SIZES[size]
  const s = scaleOf(W, H)
  const rtl = isRtl(title)
  return {
    W,
    H,
    s,
    m: Math.round(56 * s),
    portrait: H > W,
    rtl,
    mx: (x) => (rtl ? W - x : x),
    anchor: (a) => (rtl ? (a === "start" ? "end" : "start") : a),
  }
}

export function sourceLabel(url: string) {
  try {
    const u = new URL(url)
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")
    return decodeURI(u.hostname.replace(/^www\./, "") + path)
  } catch {
    return url
  }
}

export const hatch = (id: string, color: string, s: number) => {
  const gap = round(9 * s)
  return `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${gap}" height="${gap}" fill="${INK.ground}"/><rect width="${round(gap * 0.42)}" height="${gap}" fill="${color}"/></pattern>`
}

export const open = (c: Canvas, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${c.W}" height="${c.H}" viewBox="0 0 ${c.W} ${c.H}"><defs>${hatch("hatch", INK.amber, c.s)}${hatch("hatch-bone", INK.bone, c.s)}${hatch("hatch-steel", INK.steel, c.s)}${defs}</defs><rect width="${c.W}" height="${c.H}" fill="${INK.ground}"/>`

// The masthead: amber rule, condensed title, optional unit note.
export function header(c: Canvas, rawTitle: string, note: string | null) {
  const { s, m, W } = c
  const title = clean(rawTitle)
  const maxW = W - m * 2
  const big = (c.portrait ? 74 : 60) * s
  const small = 36 * s
  const maxLines = c.portrait ? 4 : 2
  let size = big
  let lines = wrap(title, "display", size, maxW, maxLines)
  while (
    size > small &&
    measure(title, "display", size) > maxW * lines.length * 0.98
  ) {
    size -= 2 * s
    lines = wrap(title, "display", size, maxW, maxLines)
  }
  const anchor = c.anchor("start")
  let y = m
  let svg = `<rect x="${round(Math.min(c.mx(m), c.mx(m + 72 * s)))}" y="${y}" width="${round(72 * s)}" height="${round(8 * s)}" fill="${INK.amber}"/>`
  // Arabic stacks taller than Latin and collides at the Latin line height.
  const leading = size * (/\p{Script=Arabic}/u.test(title) ? 1.34 : 1.1)
  y += 8 * s + size * 1.1
  for (const line of lines) {
    svg += text(c.mx(m), y, line, {
      size,
      face: "display",
      fill: INK.primary,
      anchor,
    })
    y += leading
  }
  y -= leading
  if (note) {
    y += 34 * s
    svg += text(c.mx(m), y, ellipsize(clean(note), "text", 24 * s, maxW), {
      size: 24 * s,
      fill: INK.muted,
      anchor,
    })
  }
  return { svg, bottom: y }
}

// Source line, and the key that says what hatching means.
export function footer(
  c: Canvas,
  sourceUrl: string,
  estimate: "hatched" | "dashed" | null
) {
  const { s, m, W, H } = c
  const size = 21 * s
  const y = H - m + 6 * s
  const keyText =
    estimate === "dashed"
      ? "Dashed = estimate, not sourced"
      : "Hatched = estimate, not sourced"
  const keyW = estimate ? measure(keyText, "text", size) + 38 * s : 0
  const label = ellipsize(
    `Source: ${clean(sourceLabel(sourceUrl))}`,
    "text",
    size,
    W - m * 2 - keyW - 24 * s
  )
  let svg = text(m, y, label, { size, fill: INK.muted })
  if (estimate) {
    const x = W - m - keyW
    svg +=
      estimate === "dashed"
        ? `<line x1="${round(x)}" x2="${round(x + 28 * s)}" y1="${round(y - size * 0.33)}" y2="${round(y - size * 0.33)}" stroke="${INK.amber}" stroke-width="${round(3 * s)}" stroke-dasharray="${round(7 * s)} ${round(5 * s)}"/>`
        : `<rect x="${round(x)}" y="${round(y - size * 0.85)}" width="${round(26 * s)}" height="${round(size)}" fill="url(#hatch)" stroke="${INK.amber}" stroke-width="${round(1.5 * s)}"/>`
    svg += text(W - m, y, keyText, { size, fill: INK.primary, anchor: "end" })
  }
  return { svg, top: y - size - 22 * s }
}
