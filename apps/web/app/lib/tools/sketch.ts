export type Point = { x: number; y: number }

// A stroke as drawn, or the clean outline Shapes turned it into.
export type Stroke = { points: Point[]; closed: boolean; kind: string | null }

const round = (n: number) => Math.round(n * 10) / 10

export const strokePath = ({ points, closed }: Stroke) =>
  points.length
    ? `M${points.map((p) => `${round(p.x)} ${round(p.y)}`).join("L")}${closed ? "Z" : ""}`
    : ""

export const toSvg = (strokes: Stroke[], width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${strokes
    .map((s) => `<path d="${strokePath(s)}"/>`)
    .join("")}</svg>`
