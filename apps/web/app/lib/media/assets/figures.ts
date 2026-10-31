import type { AssetSpec } from "@/lib/media/model"

import { type AssetSize, INK } from "./theme"
import {
  type Datum,
  formatTick,
  formatValue,
  unitNote,
  waterfallSteps,
} from "./format"
import { canvas, type Canvas, footer, header, open, type Rect } from "./frame"
import { clean, ellipsize, type Face, measure, round, text, wrap } from "./text"

type Figure = Extract<AssetSpec, { kind: "figure" }>
type Tone = "amber" | "bone" | "steel"

interface Mark {
  label: string
  from: number
  to: number
  value: string
  tone: Tone
  estimate: boolean
}

const paint = (tone: Tone, estimate: boolean) => {
  const color = INK[tone]
  if (!estimate) return `fill="${color}"`
  const id = tone === "amber" ? "hatch" : `hatch-${tone}`
  return `fill="url(#${id})" stroke="${color}"`
}

function box(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  tone: Tone,
  estimate: boolean
) {
  const left = c.rtl ? c.W - x - w : x
  const r = round(Math.min(3 * c.s, w / 2, h / 2))
  return `<rect x="${round(left)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${r}" ${paint(tone, estimate)} stroke-width="${round(1.5 * c.s)}"/>`
}

const longest = (items: string[], face: Face, size: number) =>
  Math.max(0, ...items.map((t) => measure(t, face, size)))

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

// Horizontal rows carry long labels best, in any language.
function rows(c: Canvas, plot: Rect, marks: Mark[], waterfall: boolean) {
  const { s } = c
  const pitch = Math.min(plot.h / marks.length, (c.portrait ? 118 : 84) * s)
  const size = clamp(pitch * 0.44, 15 * s, 27 * s)
  const twoLines = pitch >= size * 2.5
  const gap = 18 * s

  const labelW = Math.min(
    longest(
      marks.map((m) => clean(m.label)),
      "text",
      size
    ) + 2,
    plot.w * (c.portrait ? 0.34 : 0.3)
  )
  const lo = Math.min(0, ...marks.flatMap((m) => [m.from, m.to]))
  const hi = Math.max(0, ...marks.flatMap((m) => [m.from, m.to]))
  const valueW =
    longest(
      marks.map((m) => m.value),
      "bold",
      size
    ) +
    12 * s
  const leftPad = !waterfall && lo < 0 ? valueW : 0
  const start = plot.x + labelW + gap + leftPad
  const span = Math.max(40 * s, plot.x + plot.w - valueW - start)
  const at = (v: number) => start + ((v - lo) / (hi - lo || 1)) * span

  let svg = ""
  const top = plot.y + (plot.h - pitch * marks.length) / 2
  const thick = Math.max(pitch * 0.64, Math.min(pitch - 2 * s, 6 * s))
  marks.forEach((m, i) => {
    const mid = top + pitch * (i + 0.5)
    const lines = wrap(clean(m.label), "text", size, labelW, twoLines ? 2 : 1)
    lines.forEach((line, n) => {
      const y = mid + size * 0.35 + (n - (lines.length - 1) / 2) * size * 1.14
      svg += text(c.mx(plot.x), y, line, {
        size,
        fill: INK.primary,
        anchor: c.anchor("start"),
      })
    })
    const a = at(Math.min(m.from, m.to))
    const b = at(Math.max(m.from, m.to))
    svg += box(
      c,
      a,
      mid - thick / 2,
      Math.max(b - a, 2 * s),
      thick,
      m.tone,
      m.estimate
    )
    const left = !waterfall && m.to < m.from
    svg += text(
      c.mx(left ? a - 10 * s : b + 10 * s),
      mid + size * 0.35,
      m.value,
      {
        size,
        face: "bold",
        fill: INK.primary,
        anchor: c.anchor(left ? "end" : "start"),
      }
    )
    const next = marks[i + 1]
    if (waterfall && next) {
      const x = c.mx(at(m.to))
      svg += `<line x1="${round(x)}" x2="${round(x)}" y1="${round(mid + thick / 2)}" y2="${round(mid + pitch - thick / 2)}" stroke="${INK.muted}" stroke-width="${round(1.5 * s)}" stroke-dasharray="${round(3 * s)} ${round(3 * s)}"/>`
    }
  })
  const zero = c.mx(at(0))
  svg += `<line x1="${round(zero)}" x2="${round(zero)}" y1="${round(top)}" y2="${round(top + pitch * marks.length)}" stroke="${INK.muted}" stroke-width="${round(1.5 * s)}"/>`
  return svg
}

// Picks which points get a printed value on a dense chart.
function notable(values: number[]) {
  const pick = new Set([values.length - 1])
  pick.add(values.indexOf(Math.max(...values)))
  pick.add(values.indexOf(Math.min(...values)))
  pick.add(0)
  return [...pick]
}

function callouts(
  c: Canvas,
  plot: Rect,
  points: { x: number; y: number; up: boolean; value: string; label: string }[],
  // Highest ink between two x positions, so a label clears neighbouring bars.
  clearance?: (a: number, b: number) => number
) {
  const { s } = c
  const size = 22 * s
  let svg = ""
  const placed: { a: number; b: number; y: number }[] = []
  for (const p of points) {
    const label = ellipsize(clean(p.label), "text", size * 0.86, 200 * s)
    const w = Math.max(
      measure(p.value, "bold", size),
      measure(label, "text", size * 0.86)
    )
    const x = clamp(p.x, plot.x + w / 2, plot.x + plot.w - w / 2)
    const top = clearance ? clearance(x - w / 2, x + w / 2) : p.y
    const y = clamp(
      p.up ? top - 12 * s - size * 1.1 : p.y + 12 * s + size,
      plot.y + size,
      plot.y + plot.h - size * 1.3
    )
    const hit = placed.some(
      (o) =>
        x - w / 2 < o.b + 12 * s &&
        x + w / 2 > o.a - 12 * s &&
        Math.abs(o.y - y) < size * 2.3
    )
    if (hit) continue
    placed.push({ a: x - w / 2, b: x + w / 2, y })
    svg += text(x, y, p.value, {
      size,
      face: "bold",
      fill: INK.primary,
      anchor: "middle",
      halo: INK.ground,
    })
    svg += text(x, y + size * 1.02, label, {
      size: size * 0.86,
      fill: INK.muted,
      anchor: "middle",
      halo: INK.ground,
    })
  }
  return svg
}

const denseNote = (c: Canvas, plot: Rect, n: number) =>
  text(
    c.mx(plot.x),
    plot.y + plot.h + 26 * c.s,
    `${n} values. Printed: first, last, highest and lowest.`,
    { size: 19 * c.s, fill: INK.muted, anchor: c.anchor("start") }
  )

// When there are too many points for labelled rows. The alt text lists them all.
function columns(c: Canvas, area: Rect, marks: Mark[]) {
  const { s } = c
  const plot = { ...area, h: area.h - 36 * s }
  const head = 62 * s
  const lo = Math.min(0, ...marks.flatMap((m) => [m.from, m.to]))
  const hi = Math.max(0, ...marks.flatMap((m) => [m.from, m.to]))
  const y = (v: number) =>
    plot.y +
    head +
    (1 - (v - lo) / (hi - lo || 1)) * (plot.h - head * (lo < 0 ? 2 : 1))
  const pitch = plot.w / marks.length
  const barW = Math.max(pitch - Math.min(2 * s, pitch * 0.25), 1)
  let svg = ""
  marks.forEach((m, i) => {
    const a = y(Math.max(m.from, m.to))
    const b = y(Math.min(m.from, m.to))
    svg += box(
      c,
      plot.x + pitch * i,
      a,
      barW,
      Math.max(b - a, 2 * s),
      m.tone,
      m.estimate
    )
  })
  svg += `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${round(y(0))}" y2="${round(y(0))}" stroke="${INK.muted}" stroke-width="${round(1.5 * s)}"/>`
  const picks = notable(marks.map((m) => m.to - m.from))
  const tops = marks.map((m) => y(Math.max(m.from, m.to)))
  svg += callouts(
    c,
    plot,
    picks.map((i) => {
      const m = marks[i]!
      return {
        x: c.mx(plot.x + pitch * (i + 0.5)),
        y: y(m.to),
        up: m.to >= m.from,
        value: m.value,
        label: m.label,
      }
    }),
    (a, b) => {
      const left = c.rtl ? c.W - b : a
      const right = c.rtl ? c.W - a : b
      const first = Math.max(0, Math.floor((left - plot.x) / pitch))
      const last = Math.min(
        marks.length - 1,
        Math.ceil((right - plot.x) / pitch)
      )
      return Math.min(...tops.slice(first, last + 1))
    }
  )
  return svg + denseNote(c, plot, marks.length)
}

function bars(c: Canvas, plot: Rect, marks: Mark[], waterfall: boolean) {
  const thin = plot.h / marks.length < 25 * c.s
  return thin ? columns(c, plot, marks) : rows(c, plot, marks, waterfall)
}

function ticks(lo: number, hi: number, target: number) {
  const raw = (hi - lo) / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].find((f) => f * mag >= raw)! * mag
  const out: number[] = []
  for (
    let v = Math.floor(lo / step) * step;
    v <= Math.ceil(hi / step) * step + step / 2;
    v += step
  )
    out.push(Number(v.toPrecision(12)))
  return out
}

function line(c: Canvas, area: Rect, spec: Figure) {
  const { s } = c
  const series = spec.series
  const plotBottom = area.y + area.h - (series.length > 20 ? 62 : 36) * s
  const values = series.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = max === min ? Math.abs(max) * 0.1 || 1 : 0
  // A shallow trend keeps zero in view so a small move doesn't look like a cliff.
  const floor = min > 0 && min < max * 0.5 ? 0 : min
  // Headroom, so the highest point's label stays clear of the title.
  const scale = ticks(floor - pad, max + pad + (max - floor) * 0.14, 5)
  const lo = scale[0]!
  const hi = scale.at(-1)!
  const tickSize = 19 * s
  const tickW = longest(
    scale.map((t) => formatTick(t, spec.unit)),
    "text",
    tickSize
  )
  const plot = {
    x: area.x + tickW + 16 * s,
    y: area.y + 12 * s,
    w: area.w - tickW - 16 * s - 44 * s,
    h: plotBottom - area.y - 12 * s,
  }
  const X = (i: number) => plot.x + (plot.w * i) / (series.length - 1)
  const Y = (v: number) => plot.y + (1 - (v - lo) / (hi - lo)) * plot.h

  let svg = ""
  for (const t of scale) {
    const stroke = t === 0 ? INK.muted : INK.line
    svg += `<line x1="${round(plot.x)}" x2="${round(plot.x + plot.w)}" y1="${round(Y(t))}" y2="${round(Y(t))}" stroke="${stroke}" stroke-width="${round(s)}"/>`
    svg += text(
      plot.x - 14 * s,
      Y(t) + tickSize * 0.35,
      formatTick(t, spec.unit),
      {
        size: tickSize,
        fill: INK.muted,
        anchor: "end",
      }
    )
  }
  const width = round(3.5 * s)
  series.slice(1).forEach((d, i) => {
    const prev = series[i]!
    const guess = d.estimate || prev.estimate
    const dash = guess
      ? ` stroke-dasharray="${round(9 * s)} ${round(8 * s)}"`
      : ""
    svg += `<line x1="${round(X(i))}" y1="${round(Y(prev.value))}" x2="${round(X(i + 1))}" y2="${round(Y(d.value))}" stroke="${INK.amber}" stroke-width="${width}" stroke-linecap="round"${dash}/>`
  })
  const picks = notable(values)
  series.forEach((d, i) => {
    const big = picks.includes(i)
    if (series.length > 24 && !big) return
    const r = round((big ? 7 : 4.5) * s)
    svg += `<circle cx="${round(X(i))}" cy="${round(Y(d.value))}" r="${r}" fill="${d.estimate ? INK.ground : INK.amber}" stroke="${d.estimate ? INK.amber : INK.ground}" stroke-width="${round(2.5 * s)}"/>`
  })
  svg += callouts(
    c,
    plot,
    picks.map((i) => {
      const d = series[i]!
      const neighbour = (values[i - 1] ?? values[i + 1] ?? d.value) as number
      const peak = d.value >= max || d.value >= neighbour
      return {
        x: X(i),
        y: Y(d.value),
        up: peak && d.value !== min,
        value: formatValue(d.value, spec.unit, d.estimate),
        label: d.label,
      }
    })
  )
  if (series.length > 20)
    svg += denseNote(
      c,
      { ...plot, h: plotBottom - plot.y + 8 * s },
      series.length
    )
  return svg
}

function bigNumber(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  d: Datum,
  unit: string | undefined,
  size: number,
  tone: Tone
) {
  const { s } = c
  const value = formatValue(d.value, unit, d.estimate)
  const anchor = c.anchor("start")
  const lift = size * 0.82
  // Hatching needs a big glyph to read. A small estimate is drawn in outline.
  const fill = !d.estimate
    ? INK[tone]
    : size < 120 * s
      ? INK.ground
      : `url(#${tone === "amber" ? "hatch" : `hatch-${tone}`})`
  let svg = text(c.mx(x), y + lift, value, {
    size,
    face: "display",
    fill,
    anchor,
    extra: d.estimate
      ? `stroke="${INK[tone]}" stroke-width="${round(Math.max(1.5 * s, size / 60))}"`
      : undefined,
  })
  const labelSize = Math.max(30 * s, Math.min(size * 0.2, 40 * s))
  let bottom = y + lift + size * 0.1 + labelSize * 1.2
  const lines = wrap(clean(d.label), "text", labelSize, w, 3)
  lines.forEach((label, n) => {
    svg += text(c.mx(x), bottom + n * labelSize * 1.16, label, {
      size: labelSize,
      fill: INK.primary,
      anchor,
    })
  })
  bottom += (lines.length - 1) * labelSize * 1.16
  if (d.estimate) {
    bottom += labelSize * 1.2
    svg += text(c.mx(x), bottom, "ESTIMATE", {
      size: 24 * s,
      face: "bold",
      fill: INK.amber,
      anchor,
      extra: `letter-spacing="${round(2.4 * s)}"`,
    })
  }
  return { svg, bottom }
}

const fitNumber = (spec: Figure, w: number, max: number) =>
  Math.min(
    max,
    ...spec.series.map(
      (d) =>
        (w /
          measure(formatValue(d.value, spec.unit, d.estimate), "display", 1)) *
        0.98
    )
  )

function stat(c: Canvas, plot: Rect, spec: Figure) {
  const { s } = c
  const n = spec.series.length
  if (n === 1) {
    const size = fitNumber(spec, plot.w, (c.portrait ? 260 : 210) * s)
    const probe = bigNumber(
      c,
      plot.x,
      0,
      plot.w,
      spec.series[0]!,
      spec.unit,
      size,
      "amber"
    )
    const y = plot.y + Math.max(0, (plot.h - probe.bottom) / 2)
    return bigNumber(
      c,
      plot.x,
      y,
      plot.w,
      spec.series[0]!,
      spec.unit,
      size,
      "amber"
    ).svg
  }
  const cols = c.portrait ? (n === 2 ? 1 : 2) : n
  const rowsCount = Math.ceil(n / cols)
  const gap = 40 * s
  const w = (plot.w - gap * (cols - 1)) / cols
  const h = plot.h / rowsCount
  // One size across the row, so the numbers share a baseline.
  const size = fitNumber(spec, w, h * 0.5)
  let svg = ""
  spec.series.forEach((d, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = plot.x + col * (w + gap)
    const y = plot.y + row * h
    svg += `<rect x="${round(c.mx(x) - (c.rtl ? w : 0))}" y="${round(y + 14 * s)}" width="${round(w)}" height="${round(2 * s)}" fill="${INK.line}"/>`
    svg += bigNumber(
      c,
      x,
      y + 40 * s,
      w,
      d,
      spec.unit,
      size,
      i === 0 ? "amber" : "bone"
    ).svg
  })
  return svg
}

function comparison(c: Canvas, plot: Rect, spec: Figure) {
  const { s } = c
  const series = spec.series
  const max = Math.max(...series.map((d) => d.value))
  const pitch = plot.h / series.length
  const size = Math.min(pitch * 0.46, 92 * s)
  const label = Math.max(26 * s, size * 0.42)
  const thick = Math.min(pitch * 0.26, 44 * s)
  let svg = ""
  series.forEach((d, i) => {
    const top =
      plot.y + pitch * i + Math.max(0, pitch - size - thick - 22 * s) / 2
    const value = formatValue(d.value, spec.unit, d.estimate)
    const baseline = top + size * 0.86
    const valueW = measure(value, "display", size)
    svg += text(c.mx(plot.x + plot.w), baseline, value, {
      size,
      face: "display",
      fill: INK.primary,
      anchor: c.anchor("end"),
    })
    const lines = wrap(
      clean(d.label),
      "text",
      label,
      plot.w - valueW - 32 * s,
      2
    )
    lines.forEach((l, n) => {
      svg += text(
        c.mx(plot.x),
        baseline - (lines.length - 1 - n) * label * 1.14,
        l,
        {
          size: label,
          fill: INK.primary,
          anchor: c.anchor("start"),
        }
      )
    })
    svg += box(
      c,
      plot.x,
      baseline + 18 * s,
      Math.max((Math.max(d.value, 0) / max) * plot.w, 2 * s),
      thick,
      i === 0 ? "amber" : "bone",
      !!d.estimate
    )
  })
  return svg
}

export function figureSvg(spec: Figure, size: AssetSize) {
  if (!spec.series.length) throw new Error("A figure needs at least one value")
  for (const d of spec.series)
    if (!Number.isFinite(d.value)) throw new Error(`Bad value for ${d.label}`)

  const c = canvas(size, spec.title)
  const estimate = spec.series.some((d) => d.estimate)
  const head = header(c, spec.title, unitNote(spec.unit))
  const drawsLine = spec.chart === "line" && spec.series.length > 1
  const foot = footer(
    c,
    spec.sourceUrl,
    !estimate ? null : drawsLine ? "dashed" : "hatched"
  )
  const plot: Rect = {
    x: c.m,
    y: head.bottom + 34 * c.s,
    w: c.W - c.m * 2,
    h: foot.top - head.bottom - 34 * c.s,
  }
  const asBar = (): Mark[] =>
    spec.series.map((d) => ({
      label: d.label,
      from: 0,
      to: d.value,
      value: formatValue(d.value, spec.unit, d.estimate),
      tone: d.value < 0 ? "steel" : "amber",
      estimate: !!d.estimate,
    }))

  let body: string
  const n = spec.series.length
  const anyBelowZero = spec.series.some((d) => d.value < 0)
  const allZero = spec.series.every((d) => d.value === 0)
  if (spec.chart === "stat" && n <= 4) body = stat(c, plot, spec)
  else if (spec.chart === "line" && n === 1) body = stat(c, plot, spec)
  else if (spec.chart === "line") body = line(c, plot, spec)
  else if (spec.chart === "comparison" && n === 1) body = stat(c, plot, spec)
  else if (spec.chart === "comparison" && n <= 4 && !anyBelowZero && !allZero)
    body = comparison(c, plot, spec)
  else if (spec.chart === "waterfall") {
    const marks = waterfallSteps(spec.series).map((d): Mark => ({
      label: d.label,
      from: d.from,
      to: d.to,
      value: formatValue(d.value, spec.unit, d.estimate),
      tone: d.total ? "bone" : d.to < d.from ? "steel" : "amber",
      estimate: !!d.estimate,
    }))
    body = bars(c, plot, marks, true)
  } else body = bars(c, plot, asBar(), false)

  return `${open(c)}${head.svg}${body}${foot.svg}</svg>`
}
