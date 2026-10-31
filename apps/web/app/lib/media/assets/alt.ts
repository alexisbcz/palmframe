import type { AssetSpec } from "@/lib/media/model"

import { formatValue, waterfallSteps } from "./format"
import { sourceLabel } from "./frame"
import { clean } from "./text"

const CHART = {
  bar: "Bar chart",
  line: "Line chart",
  stat: "Key figure",
  comparison: "Comparison",
  waterfall: "Waterfall chart",
}

const value = (v: number, unit?: string, estimate?: boolean) =>
  `${formatValue(v, unit, false)}${estimate ? " (estimate)" : ""}`

// States every number, so a reader who can't see the chart loses nothing.
export function altText(spec: AssetSpec) {
  if (spec.kind === "illustration") return clean(spec.alt)
  const source = `Source: ${clean(sourceLabel(spec.sourceUrl))}.`
  if (spec.kind === "map") {
    const places = spec.places
      .map((p) => clean(p.name) + (p.value ? ` (${clean(p.value)})` : ""))
      .join("; ")
    return `Map: ${clean(spec.title)}. Marked: ${places}. ${source}`
  }
  const items =
    spec.chart === "waterfall"
      ? waterfallSteps(spec.series).map((d) =>
          d.total
            ? `${clean(d.label)} comes to ${value(d.value, spec.unit, d.estimate)}`
            : `${clean(d.label)}: ${value(d.value, spec.unit, d.estimate)}`
        )
      : spec.series.map(
          (d) => `${clean(d.label)}: ${value(d.value, spec.unit, d.estimate)}`
        )
  return `${CHART[spec.chart]}: ${clean(spec.title)}. ${items.join("; ")}. ${source}`
}
