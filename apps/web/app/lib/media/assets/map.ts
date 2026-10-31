import {
  type GeoPermissibleObjects,
  geoAzimuthalEqualArea,
  geoCircle,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoNaturalEarth1,
  geoPath,
} from "d3-geo"
import { feature } from "topojson-client"
import { brotliDecompressSync } from "node:zlib"

import type { AssetSpec } from "@/lib/media/model"

import { canvas, type Canvas, footer, header, open, type Rect } from "./frame"
import type { AssetSize } from "./theme"
import { INK } from "./theme"
import { clean, ellipsize, measure, round, text } from "./text"

type MapSpec = Extract<AssetSpec, { kind: "map" }>
type Place = MapSpec["places"][number]
type Country = GeoJSON.Feature<GeoJSON.Geometry, { name: string }>

let countries: Promise<Country[]> | undefined
const world = () =>
  (countries ??= import("./data/world.gen").then((m) => {
    const topology = JSON.parse(
      brotliDecompressSync(Buffer.from(m.default, "base64")).toString()
    )
    return (
      feature(topology, topology.objects.countries) as unknown as {
        features: Country[]
      }
    ).features
  }))

const DEG = 180 / Math.PI

function centerOf(places: Place[]): [number, number] {
  let x = 0
  let y = 0
  let z = 0
  for (const p of places) {
    const lat = p.lat / DEG
    const lng = p.lng / DEG
    x += Math.cos(lat) * Math.cos(lng)
    y += Math.cos(lat) * Math.sin(lng)
    z += Math.sin(lat)
  }
  if (Math.hypot(x, y, z) < 1e-6) return [places[0]!.lng, places[0]!.lat]
  return [Math.atan2(y, x) * DEG, Math.atan2(z, Math.hypot(x, y)) * DEG]
}

// Equal-area around the story keeps a regional map honest about size. It also
// copes with the antimeridian and the poles, where a Mercator fit falls apart.
function projectionFor(places: Place[], fit: Rect, frameW: number) {
  const center = centerOf(places)
  const reach = Math.max(
    ...places.map((p) => geoDistance(center, [p.lng, p.lat]) * DEG)
  )
  const extent: [[number, number], [number, number]] = [
    [fit.x, fit.y],
    [fit.x + fit.w, fit.y + fit.h],
  ]
  if (reach > 70) {
    // Use the full width and let the empty polar caps fall off the frame,
    // unless the story itself reaches that far.
    const full = geoNaturalEarth1()
      .rotate([-center[0], 0])
      .fitWidth(frameW, { type: "Sphere" })
    const ys = places.map((p) => full([p.lng, p.lat])![1])
    const low = Math.min(...ys)
    const high = Math.max(...ys)
    if (high - low > fit.h)
      return geoNaturalEarth1()
        .rotate([-center[0], 0])
        .fitExtent(extent, { type: "Sphere" })
    const [tx, ty] = full.translate()
    return full.translate([tx, ty + fit.y + fit.h / 2 - (low + high) / 2])
  }

  const radius = Math.max(2.4, reach * 0.14)
  const circles: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      properties: {},
      geometry: geoCircle().center([p.lng, p.lat]).radius(radius)(),
    })),
  }
  return geoAzimuthalEqualArea()
    .rotate([-center[0], -center[1]])
    .clipAngle(120)
    .fitExtent(extent, circles)
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
const hits = (a: Box, b: Box) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

interface Label {
  place: Place
  x: number
  y: number
  index: number
  box?: Box
  anchor?: "start" | "end" | "middle"
  tx?: number
  ty?: number
  far?: boolean
}

// Greedy placement: try close positions, then further ones with a leader line.
// A place that still has no room keeps its marker and gets a number in the key,
// so nothing is silently dropped.
function placeLabels(c: Canvas, labels: Label[], area: Box) {
  const { s } = c
  const size = 26 * s
  const taken: Box[] = labels.map((l) => ({
    x0: l.x - 9 * s,
    y0: l.y - 9 * s,
    x1: l.x + 9 * s,
    y1: l.y + 9 * s,
  }))
  const order = [...labels].sort(
    (a, b) => +!!b.place.value - +!!a.place.value || a.y - b.y
  )
  for (const l of order) {
    const name = clean(l.place.name)
    const value = l.place.value ? clean(l.place.value) : ""
    const w = Math.max(
      measure(name, "bold", size),
      measure(value, "display", size * 1.15)
    )
    const h = size * 1.2 * (value ? 2.05 : 1)
    const near = 15 * s
    for (const reach of [1, 2.4, 4]) {
      const d = near * reach
      const spots: {
        x: number
        y: number
        anchor: "start" | "end" | "middle"
      }[] = [
        { x: l.x + d, y: l.y - h / 2, anchor: "start" },
        { x: l.x - d, y: l.y - h / 2, anchor: "end" },
        { x: l.x, y: l.y - d - h, anchor: "middle" },
        { x: l.x, y: l.y + d, anchor: "middle" },
        { x: l.x + d * 0.75, y: l.y - d * 0.75 - h, anchor: "start" },
        { x: l.x - d * 0.75, y: l.y - d * 0.75 - h, anchor: "end" },
        { x: l.x + d * 0.75, y: l.y + d * 0.75, anchor: "start" },
        { x: l.x - d * 0.75, y: l.y + d * 0.75, anchor: "end" },
      ]
      const spot = spots.find((p) => {
        const x0 =
          p.anchor === "start"
            ? p.x
            : p.anchor === "end"
              ? p.x - w
              : p.x - w / 2
        const b = { x0: x0 - 6 * s, y0: p.y, x1: x0 + w + 6 * s, y1: p.y + h }
        if (
          b.x0 < area.x0 ||
          b.x1 > area.x1 ||
          b.y0 < area.y0 ||
          b.y1 > area.y1
        )
          return false
        return !taken.some((o) => hits(b, o))
      })
      if (!spot) continue
      const x0 =
        spot.anchor === "start"
          ? spot.x
          : spot.anchor === "end"
            ? spot.x - w
            : spot.x - w / 2
      l.box = { x0, y0: spot.y, x1: x0 + w, y1: spot.y + h }
      l.anchor = spot.anchor
      l.tx = spot.x
      l.ty = spot.y
      l.far = reach > 1
      taken.push(l.box)
      break
    }
  }
  return taken
}

export async function mapSvg(spec: MapSpec, size: AssetSize) {
  if (!spec.places.length) throw new Error("A map needs at least one place")
  for (const p of spec.places)
    if (
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lng) > 180
    )
      throw new Error(`Bad coordinates for ${p.name}`)

  const c = canvas(size, spec.title)
  const { s, W, H, m } = c
  const head = header(c, spec.title, null)
  const foot = footer(c, spec.sourceUrl, null)
  const all = await world()

  // A second pass makes room for the key, so no marker ends up beneath it.
  const layout = (keyH: number) => {
    const fit: Rect = {
      x: m + 24 * s,
      y: head.bottom + 64 * s,
      w: W - 2 * m - 48 * s,
      h: foot.top - keyH - head.bottom - 110 * s,
    }
    const projection = projectionFor(spec.places, fit, W).clipExtent([
      [-4, -4],
      [W + 4, H + 4],
    ])
    const labels: Label[] = spec.places.map((place, index) => {
      const [x, y] = projection([place.lng, place.lat]) ?? [W / 2, H / 2]
      return { place, x, y, index }
    })
    const area = {
      x0: m,
      y0: head.bottom + 24 * s,
      x1: W - m,
      y1: foot.top - keyH - 8 * s,
    }
    return { projection, labels, area, taken: placeLabels(c, labels, area) }
  }
  const keySize = 20 * s
  const lineH = keySize * 1.3
  const cols = c.portrait ? 2 : 4
  let plan = layout(0)
  const missed = plan.labels.filter((l) => !l.box).length
  const keyRows = Math.min(Math.ceil((missed * 1.5) / cols), c.portrait ? 6 : 3)
  if (missed) plan = layout(keyRows * lineH + 22 * s)
  const { projection, labels, area, taken } = plan
  const path = geoPath(projection).digits(1)
  const homes = new Set<Country>()
  for (const p of spec.places) {
    const home = all.find((f) => geoContains(f, [p.lng, p.lat]))
    if (home) homes.add(home)
  }

  let body = ""
  const grat = path(geoGraticule10() as GeoPermissibleObjects)
  if (grat)
    body += `<path d="${grat}" fill="none" stroke="${INK.primary}" stroke-opacity="0.05" stroke-width="${round(s)}"/>`
  const land = all
    .filter((f) => !homes.has(f))
    .map((f) => path(f) ?? "")
    .join("")
  body += `<path d="${land}" fill="${INK.raised}" stroke="${INK.line}" stroke-width="${round(0.8 * s)}" stroke-linejoin="round"/>`
  const lit = [...homes].map((f) => path(f) ?? "").join("")
  if (lit)
    body += `<path d="${lit}" fill="#403725" stroke="#6E5A30" stroke-width="${round(1 * s)}" stroke-linejoin="round"/>`

  // Country names for orientation, only where the shape has room for them.
  const contextSize = 18 * s
  const named = all
    .map((f) => ({ f, area: path.area(f), at: path.centroid(f) }))
    .filter((o) => o.area > 9000 * s * s && Number.isFinite(o.at[0]))
    .sort((a, b) => b.area - a.area)
  let contextCount = 0
  for (const { f, at } of named) {
    if (contextCount >= 9) break
    const label = clean(f.properties.name).toUpperCase()
    const w = measure(label, "text", contextSize) * 1.16
    const b = {
      x0: at[0] - w / 2,
      y0: at[1] - contextSize,
      x1: at[0] + w / 2,
      y1: at[1] + contextSize * 0.4,
    }
    if (b.x0 < area.x0 || b.x1 > area.x1 || b.y0 < area.y0 || b.y1 > area.y1)
      continue
    if (taken.some((o) => hits(b, o))) continue
    taken.push(b)
    contextCount++
    body += text(at[0], at[1], label, {
      size: contextSize,
      fill: "#7C7A74",
      anchor: "middle",
      extra: `letter-spacing="${round(contextSize * 0.1)}"`,
    })
  }

  const unplaced = labels.filter((l) => !l.box)
  labels.forEach((l) => {
    if (l.far && l.box) {
      const y = (l.box.y0 + l.box.y1) / 2
      const x =
        l.anchor === "end"
          ? l.box.x1 + 4 * s
          : l.anchor === "start"
            ? l.box.x0 - 4 * s
            : l.x
      const ty =
        l.anchor === "middle" ? (l.box.y0 > l.y ? l.box.y0 : l.box.y1) : y
      body += `<line x1="${round(l.x)}" y1="${round(l.y)}" x2="${round(x)}" y2="${round(ty)}" stroke="${INK.muted}" stroke-width="${round(1.2 * s)}"/>`
    }
  })
  labels.forEach((l) => {
    body += `<circle cx="${round(l.x)}" cy="${round(l.y)}" r="${round(13 * s)}" fill="${INK.amber}" fill-opacity="0.18"/>`
    body += `<circle cx="${round(l.x)}" cy="${round(l.y)}" r="${round(6.5 * s)}" fill="${INK.amber}" stroke="${INK.ground}" stroke-width="${round(2.5 * s)}"/>`
  })
  labels.forEach((l) => {
    const size = 26 * s
    if (!l.box) return
    const name = clean(l.place.name)
    body += text(l.tx!, l.ty! + size * 0.95, name, {
      size,
      face: "bold",
      fill: INK.primary,
      anchor: l.anchor,
      halo: INK.ground,
    })
    if (l.place.value)
      body += text(l.tx!, l.ty! + size * 2.1, clean(l.place.value), {
        size: size * 1.15,
        face: "display",
        fill: INK.amber,
        anchor: l.anchor,
        halo: INK.ground,
      })
  })

  // The key for places that found no room on the map.
  if (unplaced.length) {
    const colW = (W - 2 * m) / cols
    const rowsShown = keyRows
    const fitsCount = rowsShown * cols
    const shown = unplaced.slice(
      0,
      unplaced.length > fitsCount ? fitsCount - 1 : fitsCount
    )
    const top = foot.top - rowsShown * lineH
    body += `<rect x="0" y="${round(top - 22 * s)}" width="${W}" height="${round(H - top + 22 * s)}" fill="${INK.ground}" fill-opacity="0.9"/>`
    labels.forEach((l) => {
      if (l.box) return
      const n = shown.indexOf(l) + 1
      if (n)
        body += text(l.x, l.y - 11 * s, String(n), {
          size: 18 * s,
          face: "bold",
          fill: INK.primary,
          anchor: "middle",
          halo: INK.ground,
        })
    })
    shown.forEach((l, i) => {
      const col = Math.floor(i / rowsShown)
      const x = m + col * colW
      const y = top + (i % rowsShown) * lineH + keySize
      const value = l.place.value ? ` ${clean(l.place.value)}` : ""
      body += text(
        x,
        y,
        ellipsize(
          `${i + 1}  ${clean(l.place.name)}${value}`,
          "text",
          keySize,
          colW - 12 * s
        ),
        {
          size: keySize,
          fill: INK.primary,
        }
      )
    })
    const rest = unplaced.length - shown.length
    if (rest > 0)
      body += text(
        m + (cols - 1) * colW,
        top + (rowsShown - 1) * lineH + keySize,
        `+${rest} more`,
        {
          size: keySize,
          fill: INK.muted,
        }
      )
  }

  const scrim = `<linearGradient id="top" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${INK.ground}"/><stop offset="0.72" stop-color="${INK.ground}" stop-opacity="0.92"/><stop offset="1" stop-color="${INK.ground}" stop-opacity="0"/></linearGradient><linearGradient id="bottom" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${INK.ground}" stop-opacity="0"/><stop offset="0.6" stop-color="${INK.ground}" stop-opacity="0.92"/><stop offset="1" stop-color="${INK.ground}"/></linearGradient>`
  const scrims =
    `<rect width="${W}" height="${round(head.bottom + 40 * s)}" fill="url(#top)"/>` +
    `<rect y="${round(foot.top - 30 * s)}" width="${W}" height="${round(H - foot.top + 30 * s)}" fill="url(#bottom)"/>`
  return `${open(c, scrim)}${body}${scrims}${head.svg}${foot.svg}</svg>`
}
