import { random } from "./synth"

// Sets and actors with no model behind them: a paper theatre drawn as SVG.
// A novel can be finished with these alone, and they stand in for art not made
// yet. The url holds the recipe, so a document stays small.

export const FLAT_PLACES = [
  "harbor",
  "city",
  "street",
  "forest",
  "mountains",
  "school",
  "room",
  "cafe",
  "station",
  "shrine",
  "chart",
] as const
export type FlatPlace = (typeof FLAT_PLACES)[number]
export const FLAT_TIMES = ["dawn", "day", "dusk", "night"] as const
export type FlatTime = (typeof FLAT_TIMES)[number]

const SKIES: Record<FlatTime, [string, string, string]> = {
  dawn: ["#4a4f7c", "#d98b86", "#f7cf9c"],
  day: ["#5fa3cf", "#a8d3e3", "#efe6c9"],
  dusk: ["#2b2a55", "#b25468", "#f3a55f"],
  night: ["#090d22", "#172145", "#35406e"],
}
const INK: Record<FlatTime, [string, string, string]> = {
  dawn: ["#7a6a8d", "#4f4670", "#2a2747"],
  day: ["#7d9f96", "#4c7270", "#26474a"],
  dusk: ["#6d3e63", "#3f2a50", "#1e1730"],
  night: ["#2a3460", "#1a2147", "#0c1029"],
}
const WINDOW: Record<FlatTime, string> = {
  dawn: "#ffd9a0",
  day: "#dfeef2",
  dusk: "#ffc876",
  night: "#ffd68a",
}

const W = 1600
const H = 900

type R = () => number

const ridge = (
  rand: R,
  base: number,
  rough: number,
  steps: number,
  fill: string
) => {
  let d = `M0 ${H}L0 ${base}`
  for (let i = 1; i <= steps; i++)
    d += `L${Math.round((i / steps) * W)} ${Math.round(base + (rand() - 0.5) * rough)}`
  return `<path d="${d}L${W} ${H}Z" fill="${fill}"/>`
}

const sky = (time: FlatTime) => {
  const [a, b, c] = SKIES[time]
  return `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${a}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><rect width="${W}" height="${H}" fill="url(#s)"/>`
}

const orb = (rand: R, time: FlatTime) => {
  const x = 300 + rand() * 1000
  const y = time === "day" ? 160 : time === "night" ? 170 : 430
  const c =
    time === "night" ? "#f5eed6" : time === "day" ? "#fff6d8" : "#ffe2ae"
  const r = time === "night" ? 54 : 74
  return `<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="${c}" opacity=".12"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".95"/>`
}

const stars = (rand: R, time: FlatTime) => {
  if (time !== "night") return ""
  let s = ""
  for (let i = 0; i < 90; i++)
    s += `<circle cx="${Math.round(rand() * W)}" cy="${Math.round(rand() * 520)}" r="${(0.8 + rand() * 1.6).toFixed(1)}" fill="#fff" opacity="${(0.3 + rand() * 0.7).toFixed(2)}"/>`
  return s
}

const clouds = (rand: R, time: FlatTime) => {
  let s = ""
  const c = time === "night" ? "#2c3660" : time === "day" ? "#fff" : "#ffd6c0"
  for (let i = 0; i < 5; i++) {
    const x = rand() * W
    const y = 90 + rand() * 280
    const w = 160 + rand() * 280
    s += `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${14 + rand() * 18}" fill="${c}" opacity=".35"/>`
  }
  return s
}

function buildings(
  rand: R,
  time: FlatTime,
  base: number,
  tall: number,
  fill: string,
  lit: number
) {
  let s = ""
  let x = -20
  while (x < W) {
    const w = 70 + rand() * 120
    const h = tall * (0.4 + rand() * 0.6)
    const top = base - h
    s += `<rect x="${x}" y="${top}" width="${w}" height="${H - top}" fill="${fill}"/>`
    for (let wy = top + 18; wy < base - 16; wy += 30)
      for (let wx = x + 12; wx < x + w - 16; wx += 24)
        if (rand() < lit)
          s += `<rect x="${wx}" y="${wy}" width="12" height="16" fill="${WINDOW[time]}" opacity="${(0.5 + rand() * 0.5).toFixed(2)}"/>`
    x += w + rand() * 8
  }
  return s
}

const pines = (
  rand: R,
  base: number,
  size: number,
  count: number,
  fill: string
) => {
  let s = ""
  for (let i = 0; i < count; i++) {
    const x = (i / count) * W + rand() * (W / count)
    const h = size * (0.7 + rand() * 0.6)
    const y = base + rand() * 30
    for (let t = 0; t < 3; t++) {
      const top = y - h + (t * h) / 3.4
      const half = (h / 5) * (t + 1.2)
      s += `<path d="M${x} ${top}L${x + half} ${top + h / 2.2}L${x - half} ${top + h / 2.2}Z" fill="${fill}"/>`
    }
  }
  return s
}

const water = (rand: R, y: number, time: FlatTime) => {
  const [, b, c] = SKIES[time]
  const [, , deep] = INK[time]
  let s = `<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${c}"/><stop offset=".25" stop-color="${b}"/><stop offset="1" stop-color="${deep}"/></linearGradient><rect y="${y}" width="${W}" height="${H - y}" fill="url(#w)"/>`
  for (let i = 0; i < 40; i++) {
    const yy = y + rand() * (H - y)
    s += `<rect x="${rand() * W}" y="${yy}" width="${40 + rand() * 160}" height="2" fill="#fff" opacity="${(0.05 + rand() * 0.13).toFixed(2)}"/>`
  }
  return s
}

function interior(
  rand: R,
  time: FlatTime,
  wall: string,
  floor: string,
  extra: string
) {
  const light = time === "night" ? 0.45 : 0.14
  const win = `<g><rect x="1010" y="130" width="400" height="390" fill="#2b1f1a"/><g clip-path="url(#win)">${sky(time).replace('id="s"', 'id="s2"').replace("url(#s)", "url(#s2)")}${orb(rand, time)}${pines(rand, 520, 120, 10, INK[time][1])}</g><path d="M1210 130V520M1010 325H1410" stroke="#2b1f1a" stroke-width="12"/></g>`
  return `<clipPath id="win"><rect x="1010" y="130" width="400" height="390"/></clipPath><rect width="${W}" height="${H}" fill="${wall}"/><rect y="700" width="${W}" height="200" fill="${floor}"/><rect y="690" width="${W}" height="14" fill="#000" opacity=".3"/>${win}${extra}<rect width="${W}" height="${H}" fill="#0b0d24" opacity="${light}"/>`
}

export function flatSvg(place: FlatPlace, time: FlatTime, seed: number) {
  const rand = random(seed + 11)
  const [far, mid, near] = INK[time]
  let body = ""
  const open =
    sky(time) + stars(rand, time) + orb(rand, time) + clouds(rand, time)
  switch (place) {
    case "chart": {
      // A sea chart: land in ink on old paper, for a map screen.
      let d = ""
      for (let i = 0; i < 40; i++)
        d += `<rect x="${rand() * W}" y="${rand() * H}" width="${60 + rand() * 300}" height="1.5" fill="#6b4f2c" opacity=".12"/>`
      const land = (cx: number, cy: number, r: number) => {
        let p = ""
        for (let a = 0; a < 40; a++) {
          const t = (a / 40) * Math.PI * 2
          const q = r * (0.86 + Math.sin(a * 0.9 + cx) * 0.13 + rand() * 0.1)
          p += `${a ? "L" : "M"}${Math.round(cx + Math.cos(t) * q * 1.5)} ${Math.round(cy + Math.sin(t) * q)}`
        }
        return `<path d="${p}Z" fill="#c9ad7a" stroke="#5a4020" stroke-width="3"/>`
      }
      body = `<rect width="${W}" height="${H}" fill="#e6d3a8"/>${d}${land(420, 330, 210)}${land(1130, 560, 250)}${land(1210, 170, 90)}${land(300, 730, 90)}
      <g stroke="#5a4020" stroke-width="1" opacity=".3">${Array.from({ length: 9 }, (_, i) => `<path d="M${(i + 1) * 160} 0V${H}M0 ${(i + 1) * 90}H${W}"/>`).join("")}</g>
      <g transform="translate(1440 770)" fill="#5a4020"><circle r="62" fill="none" stroke="#5a4020" stroke-width="2"/><path d="M0 -76L10 -10L76 0L10 10L0 76L-10 10L-76 0L-10 -10Z"/></g>
      <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#5a4020" stroke-width="4"/>`
      break
    }
    case "harbor":
      body = `${open}${ridge(rand, 520, 90, 16, far)}${buildings(rand, time, 560, 90, mid, 0.3)}${water(rand, 560, time)}
      <path d="M0 760L640 690L660 720L0 830Z" fill="${near}"/>
      ${[80, 240, 400, 560].map((x) => `<rect x="${x}" y="660" width="16" height="170" fill="${near}"/>`).join("")}
      <path d="M930 610h280l-40 44h-200z" fill="${mid}"/><rect x="1030" y="540" width="100" height="70" fill="${mid}"/><rect x="1056" y="480" width="20" height="60" fill="${mid}"/><rect x="1044" y="556" width="22" height="20" fill="${WINDOW[time]}"/>`
      break
    case "city":
      body = `${open}${buildings(rand, time, 620, 320, far, 0.16)}${buildings(rand, time, 720, 420, mid, 0.24)}${buildings(rand, time, 860, 300, near, 0.3)}`
      break
    case "street":
      body = `${open}${buildings(rand, time, 640, 260, mid, 0.22)}<rect y="640" width="${W}" height="260" fill="${near}"/><path d="M0 760H${W}" stroke="${WINDOW[time]}" stroke-width="5" stroke-dasharray="60 50" opacity=".5"/>
      ${[260, 800, 1340].map((x) => `<g><rect x="${x}" y="360" width="10" height="290" fill="${near}"/><rect x="${x - 40}" y="356" width="60" height="9" fill="${near}"/><circle cx="${x - 38}" cy="378" r="14" fill="${WINDOW[time]}"/><circle cx="${x - 38}" cy="378" r="60" fill="${WINDOW[time]}" opacity=".12"/></g>`).join("")}`
      break
    case "forest":
      body = `${open}${ridge(rand, 560, 70, 14, far)}${pines(rand, 640, 260, 13, far)}${pines(rand, 740, 340, 10, mid)}<rect y="760" width="${W}" height="140" fill="${near}"/>${pines(rand, 900, 460, 6, near)}`
      break
    case "mountains":
      body = `${open}${ridge(rand, 430, 300, 9, far)}${ridge(rand, 570, 240, 11, mid)}${pines(rand, 760, 130, 22, near)}<rect y="750" width="${W}" height="150" fill="${near}"/>`
      break
    case "school":
      body = interior(
        rand,
        time,
        "#c9b892",
        "#7a5a3c",
        `<rect x="120" y="170" width="620" height="280" fill="#2e4a3d" stroke="#5a4028" stroke-width="16"/><path d="M180 240h300M180 290h220M180 340h360" stroke="#e6ead8" stroke-width="5" opacity=".45"/>
        ${[160, 520, 880].map((x) => `<g fill="#6a4b2f"><rect x="${x}" y="640" width="250" height="20"/><rect x="${x + 16}" y="660" width="14" height="130"/><rect x="${x + 220}" y="660" width="14" height="130"/></g>`).join("")}`
      )
      break
    case "room":
      body = interior(
        rand,
        time,
        "#8f7a8b",
        "#5a4238",
        `<g fill="#3a2a30"><rect x="120" y="170" width="280" height="14"/><rect x="120" y="290" width="280" height="14"/></g>
        ${Array.from({ length: 14 }, (_, i) => `<rect x="${130 + i * 19}" y="${118 + (i % 3) * 8}" width="15" height="${52 - (i % 3) * 8}" fill="${["#b75d4f", "#d9b56a", "#5f8a86", "#e6dcc8"][i % 4]}"/>`).join("")}
        <rect x="90" y="590" width="620" height="170" rx="20" fill="#e9dfc9"/><rect x="90" y="560" width="190" height="70" rx="20" fill="#fff6e4"/><rect x="250" y="600" width="460" height="160" rx="14" fill="#a44f55"/>`
      )
      break
    case "cafe":
      body = interior(
        rand,
        time,
        "#6b4a38",
        "#37261e",
        `<rect x="0" y="560" width="900" height="26" fill="#2c1b13"/><rect x="0" y="586" width="900" height="160" fill="#4d3226"/>
        <g fill="#2c1b13"><rect x="120" y="220" width="460" height="10"/></g>
        ${[150, 230, 310, 400, 480].map((x, i) => `<rect x="${x}" y="${162 + (i % 2) * 8}" width="46" height="${58 - (i % 2) * 8}" rx="6" fill="${["#c9783f", "#d9c28a", "#7c9a78"][i % 3]}"/>`).join("")}
        ${[280, 620, 800].map((x) => `<g><path d="M${x} 0V110" stroke="#120b08" stroke-width="3"/><path d="M${x - 44} 150L${x} 106L${x + 44} 150Z" fill="#1d120d"/><circle cx="${x}" cy="154" r="16" fill="#ffd68a"/><circle cx="${x}" cy="154" r="70" fill="#ffd68a" opacity=".15"/></g>`).join("")}`
      )
      break
    case "station":
      body = `${open}${buildings(rand, time, 560, 140, far, 0.2)}<rect y="560" width="${W}" height="340" fill="${mid}"/><rect y="640" width="${W}" height="20" fill="#e5c35e" opacity=".8"/><rect y="660" width="${W}" height="240" fill="${near}"/>
      <path d="M0 140L${W} 120V170L0 200Z" fill="${near}"/>
      ${[240, 800, 1360].map((x) => `<rect x="${x}" y="150" width="20" height="500" fill="${near}"/>`).join("")}
      <rect x="520" y="300" width="240" height="66" fill="${near}"/><rect x="536" y="316" width="208" height="34" fill="${WINDOW[time]}" opacity=".85"/>`
      break
    case "shrine":
      body = `${open}${ridge(rand, 560, 60, 12, far)}${pines(rand, 700, 300, 11, mid)}<rect y="730" width="${W}" height="170" fill="${near}"/>
      <g fill="#b23a32"><path d="M500 210Q800 250 1100 210L1120 260Q800 290 480 260Z"/><rect x="560" y="312" width="480" height="32"/><rect x="620" y="260" width="46" height="540"/><rect x="934" y="260" width="46" height="540"/></g>
      ${Array.from({ length: 7 }, (_, i) => `<rect x="${730 - i * 22}" y="${770 + i * 18}" width="${140 + i * 44}" height="10" fill="${far}" opacity=".6"/>`).join("")}`
      break
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`
}

export const PAPER_HAIR = [
  "bob",
  "long",
  "short",
  "spiky",
  "bun",
  "shaved",
] as const
export type PaperHair = (typeof PAPER_HAIR)[number]
export const PAPER_FACES = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "shy",
] as const
export type PaperFace = (typeof PAPER_FACES)[number]

export interface PaperActor {
  hair: PaperHair
  hairColor: string
  skin: string
  coat: string
  face: PaperFace
}

function faceMarks(face: PaperFace) {
  const ink = "#2a1c1c"
  const line = `fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"`
  const eye = (x: number) =>
    face === "happy"
      ? `<path d="M${x - 22} 322Q${x} 298 ${x + 22} 322" ${line}/>`
      : face === "surprised"
        ? `<circle cx="${x}" cy="316" r="17" fill="#fff"/><circle cx="${x}" cy="316" r="9" fill="${ink}"/>`
        : face === "shy"
          ? `<path d="M${x - 20} 318Q${x} 330 ${x + 20} 318" ${line}/>`
          : `<ellipse cx="${x}" cy="316" rx="13" ry="${face === "sad" ? 15 : 17}" fill="${ink}"/><circle cx="${x + 5}" cy="310" r="4" fill="#fff"/>`
  const brow = (x: number, side: number) => {
    const tilt = face === "angry" ? 14 * side : face === "sad" ? -12 * side : 0
    const y = face === "surprised" ? 262 : 280
    return `<path d="M${x - 26} ${y + tilt}L${x + 26} ${y - tilt}" ${line}/>`
  }
  const mouth = {
    neutral: `<path d="M278 404H322" ${line}/>`,
    happy: `<path d="M260 392Q300 442 340 392Z" fill="${ink}"/>`,
    sad: `<path d="M268 416Q300 386 332 416" ${line}/>`,
    angry: `<path d="M268 410Q300 396 332 410" ${line}/>`,
    surprised: `<ellipse cx="300" cy="410" rx="18" ry="24" fill="${ink}"/>`,
    shy: `<path d="M284 406Q300 416 316 406" ${line}/>`,
  }[face]
  const blush =
    face === "shy" || face === "happy"
      ? `<ellipse cx="208" cy="372" rx="30" ry="15" fill="#e8605c" opacity=".4"/><ellipse cx="392" cy="372" rx="30" ry="15" fill="#e8605c" opacity=".4"/>`
      : ""
  return `${brow(232, 1)}${brow(368, -1)}${eye(232)}${eye(368)}${mouth}${blush}`
}

const HAIR_BACK: Record<PaperHair, string> = {
  bob: `<path d="M126 310Q120 120 300 118Q480 120 474 310L470 470Q440 500 410 470V300H190V470Q160 500 130 470Z"/>`,
  long: `<path d="M120 300Q116 118 300 116Q484 118 480 300L506 760Q440 800 402 740V300H198V740Q160 800 94 760Z"/>`,
  short: `<path d="M138 300Q130 124 300 120Q470 124 462 300Z"/>`,
  spiky: `<path d="M136 300L110 200L168 212L170 130L238 170L290 90L340 168L420 124L430 206L490 196L464 300Z"/>`,
  bun: `<circle cx="300" cy="86" r="62"/><path d="M138 300Q130 130 300 124Q470 130 462 300Z"/>`,
  shaved: `<path d="M150 260Q160 138 300 134Q440 138 450 260Z" opacity=".5"/>`,
}
const HAIR_FRINGE: Record<PaperHair, string> = {
  bob: `<path d="M144 300Q176 180 300 176Q424 180 456 300Q400 230 300 236Q200 230 144 300Z"/>`,
  long: `<path d="M150 290Q200 170 330 180Q270 216 216 214Q170 250 150 290ZM330 180Q420 190 450 290Q410 226 330 180Z"/>`,
  short: `<path d="M146 276Q210 150 400 180Q450 210 456 276Q380 214 300 226Q210 220 146 276Z"/>`,
  spiky: `<path d="M146 276L196 196L232 244L280 180L326 240L376 190L454 276Q300 232 146 276Z"/>`,
  bun: `<path d="M146 270Q300 130 456 270Q300 200 146 270Z"/>`,
  shaved: "",
}

export function actorSvg(a: PaperActor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" width="600" height="1000">
  <g fill="${a.hairColor}">${HAIR_BACK[a.hair]}</g>
  <path d="M60 1000Q70 650 210 590L300 640L390 590Q530 650 540 1000Z" fill="${a.coat}"/>
  <path d="M210 590L300 720L390 590L300 640Z" fill="#000" opacity=".18"/>
  <path d="M254 480H346V590L300 640L254 590Z" fill="${a.skin}"/><path d="M254 520Q300 560 346 520V560Q300 590 254 560Z" fill="#000" opacity=".12"/>
  <path d="M146 300Q146 150 300 150Q454 150 454 300Q454 420 372 490Q300 530 228 490Q146 420 146 300Z" fill="${a.skin}"/>
  ${faceMarks(a.face)}
  <g fill="${a.hairColor}">${HAIR_FRINGE[a.hair]}</g>
  </svg>`
}

export function flatUrl(place: FlatPlace, time: FlatTime, seed = 1) {
  return `flat:${place}:${time}:${seed}`
}

export function paperUrl(a: PaperActor) {
  return `paper:${a.hair}:${a.hairColor}:${a.skin}:${a.coat}:${a.face}`
}

const resolved = new Map<string, string>()

// What an <img> can load, from whatever a document stores.
export function assetUrl(url: string | null | undefined) {
  if (!url) return ""
  if (!url.startsWith("flat:") && !url.startsWith("paper:")) return url
  let done = resolved.get(url)
  if (!done) {
    const p = url.split(":")
    const svg =
      p[0] === "flat"
        ? flatSvg(p[1] as FlatPlace, p[2] as FlatTime, Number(p[3]) || 1)
        : actorSvg({
            hair: p[1] as PaperHair,
            hairColor: p[2]!,
            skin: p[3]!,
            coat: p[4]!,
            face: p[5] as PaperFace,
          })
    done = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    resolved.set(url, done)
  }
  return done
}
