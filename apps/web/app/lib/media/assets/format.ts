export interface Datum {
  label: string
  value: number
  estimate?: boolean
}

const exact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 })
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
})

// Prints the value itself: rounding here would change what the source said.
// toPrecision only removes binary float noise such as 0.30000000000000004.
function digits(value: number) {
  const clean = Number(value.toPrecision(14))
  const size = Math.abs(clean)
  if (size >= 1e15 || (size > 0 && size < 1e-6)) return clean.toExponential()
  return exact.format(size)
}

function withUnit(text: string, unit: string | undefined) {
  const u = unit?.trim()
  if (!u || u.length > LONG_UNIT) return text
  const currency = u.match(/^([$€£¥₹])\s*(.*)$/u)
  if (currency) return `${currency[1]}${text}${currency[2] ?? ""}`
  if (/^[A-Z]{3}$/.test(u)) return `${u} ${text}`
  if (/^(%|‰|°\w?|x|×|[kKMBT])$/u.test(u)) return `${text}${u}`
  return `${text} ${u}`
}

// A longer unit goes on its own line under the title, not beside every value.
const LONG_UNIT = 12
export const unitNote = (unit: string | undefined) =>
  unit && unit.trim().length > LONG_UNIT ? unit.trim() : null

export function formatValue(value: number, unit?: string, estimate?: boolean) {
  if (!Number.isFinite(value)) throw new Error(`Not a number: ${value}`)
  const sign = value < 0 ? "−" : ""
  const body = sign + withUnit(digits(value), unit)
  return estimate ? `≈${body}` : body
}

export function formatTick(value: number, unit?: string) {
  const sign = value < 0 ? "−" : ""
  return sign + withUnit(compact.format(Math.abs(value)), unit)
}

export interface Step extends Datum {
  from: number
  to: number
  total: boolean
}

// Every entry is a change, added to a running sum. If the author already put
// the sum last it becomes the total bar; otherwise one is computed, so the
// chart always lands on the number its steps add up to. A total built on any
// estimate is an estimate too.
export function waterfallSteps(series: Datum[]): Step[] {
  const sumBefore = series.slice(0, -1).reduce((sum, d) => sum + d.value, 0)
  const last = series.at(-1)!
  const closes =
    series.length > 2 &&
    Math.abs(last.value - sumBefore) < 1e-9 * (1 + Math.abs(sumBefore))
  const changes = closes ? series.slice(0, -1) : series
  let run = 0
  let tainted = false
  const steps: Step[] = changes.map((d) => {
    const from = run
    run += d.value
    tainted ||= !!d.estimate
    return { ...d, from, to: run, total: false }
  })
  if (series.length === 1) return steps
  const total = closes ? last : { label: "Total", value: run }
  steps.push({
    ...total,
    value: run,
    estimate: tainted || total.estimate,
    from: 0,
    to: run,
    total: true,
  })
  return steps
}
