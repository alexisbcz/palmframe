import type {
  Character,
  Look,
  PaletteId,
  WorldItem,
} from "@/components/comic-canvas/model"

// The catalog's shared vocabulary. A kind says how an asset looks in the
// grid; its payload says what using it does to a carousel.
export const GROUPS = {
  cast: ["character", "creature", "outfit"],
  world: ["location", "background", "prop"],
  look: ["style"],
  direction: ["shot", "lighting", "pose", "effect"],
  words: ["sfx", "story"],
} as const

export type AssetGroup = keyof typeof GROUPS
export type AssetKind = (typeof GROUPS)[AssetGroup][number]

export const KINDS = Object.values(GROUPS).flat() as AssetKind[]
export const isKind = (v: unknown): v is AssetKind =>
  KINDS.includes(v as AssetKind)
export const groupOf = (kind: AssetKind) =>
  (Object.keys(GROUPS) as AssetGroup[]).find((g) =>
    (GROUPS[g] as readonly AssetKind[]).includes(kind)
  )!

// Width over height of a kind's image, which is also its card.
export const RATIO: Record<AssetKind, number> = {
  character: 3 / 4,
  creature: 3 / 4,
  outfit: 3 / 4,
  location: 3 / 2,
  background: 3 / 4,
  prop: 1,
  style: 3 / 4,
  shot: 3 / 4,
  lighting: 3 / 4,
  pose: 3 / 4,
  effect: 3 / 4,
  sfx: 4 / 3,
  story: 3 / 4,
}

export const GENRES = [
  "action",
  "comedy",
  "crime",
  "drama",
  "fantasy",
  "historical",
  "horror",
  "romance",
  "scifi",
  "slice",
] as const
export type Genre = (typeof GENRES)[number]
export const isGenre = (v: unknown): v is Genre => GENRES.includes(v as Genre)

export type AssetColor = PaletteId | "mono"
export const COLORS: { id: AssetColor; swatch: string }[] = [
  { id: "red", swatch: "#e5484d" },
  { id: "orange", swatch: "#f76b15" },
  { id: "yellow", swatch: "#ffc53d" },
  { id: "green", swatch: "#30a46c" },
  { id: "aqua", swatch: "#12a594" },
  { id: "blue", swatch: "#0090ff" },
  { id: "purple", swatch: "#8e4ec6" },
  { id: "pink", swatch: "#d6409f" },
  { id: "brown", swatch: "#a07553" },
  { id: "sepia", swatch: "#b8a07e" },
  { id: "mono", swatch: "#71717a" },
]
export const isColor = (v: unknown): v is AssetColor =>
  COLORS.some((c) => c.id === v)

// Extra direction on top of a built-in style, kept with the carousel's look.
export type StyleRecipe = NonNullable<Look["recipe"]>

export type AssetPayload =
  | {
      type: "character"
      character: Character["kind"]
      tags: string[]
      // A model sheet: panels they're cast in draw from it.
      sheet?: string
    }
  | { type: "world"; world: WorldItem["kind"]; tags: string[] }
  | { type: "outfit"; tags: string[] }
  // An image that goes straight into a panel.
  | { type: "backdrop"; tags: string[] }
  | { type: "look"; look: Omit<Look, "recipe">; recipe?: StyleRecipe }
  // Added to the panel's tags; `prompt` fills an empty panel's description.
  | { type: "direction"; tags: string[]; prompt?: string }
  | {
      type: "sfx"
      text: string
      font: "bangers" | "comic" | "inter"
      color: string
      strokeColor: string
    }
  | { type: "story"; brief: string; facts?: string[] }

export interface Asset {
  id: string
  kind: AssetKind
  name: string
  description: string
  genres: Genre[]
  color: AssetColor | null
  image: string | null
  payload: AssetPayload
  official: boolean
  // Searchable, but not shown.
  keywords?: string
  author: string | null
  saves: number
  uses: number
  createdAt: string
  // Only on the viewer's own and saved assets.
  mine?: boolean
  saved?: boolean
  isPublic?: boolean
  hidden?: boolean
}

// A themed set of assets that go into a carousel together.
export interface Pack {
  id: string
  name: string
  blurb: string
  assets: string[]
}

export const SORTS = ["popular", "newest", "name"] as const
export type Sort = (typeof SORTS)[number]

export const SOURCES = [
  "all",
  "official",
  "community",
  "mine",
  "saved",
] as const
export type Source = (typeof SOURCES)[number]

export interface Filters {
  q: string
  group: AssetGroup | null
  kind: AssetKind | null
  genres: Genre[]
  color: AssetColor | null
  source: Source
  sort: Sort
  // Only what carries a reference image, so it holds from panel to panel.
  refs: boolean
  limit: number
}

export const PAGE_SIZE = 40
export const MAX_LIMIT = 400

export const NO_FILTERS: Filters = {
  q: "",
  group: null,
  kind: null,
  genres: [],
  color: null,
  source: "all",
  sort: "popular",
  refs: false,
  limit: PAGE_SIZE,
}

// The URL is the state, so a filtered catalog can be shared and reloaded.
export function readFilters(params: URLSearchParams): Filters {
  const pick = <T extends string>(
    all: readonly T[],
    key: string,
    fallback: T
  ) => {
    const v = params.get(key) as T | null
    return v && all.includes(v) ? v : fallback
  }
  const group = params.get("group")
  const kind = params.get("kind")
  const color = params.get("color")
  const limit = Number(params.get("limit"))
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    group: group && group in GROUPS ? (group as AssetGroup) : null,
    kind: isKind(kind) ? kind : null,
    genres: params.getAll("genre").filter(isGenre),
    color: isColor(color) ? color : null,
    source: pick(SOURCES, "source", "all"),
    sort: pick(SORTS, "sort", "popular"),
    refs: params.get("refs") === "1",
    limit:
      Number.isInteger(limit) && limit > 0
        ? Math.min(limit, MAX_LIMIT)
        : PAGE_SIZE,
  }
}

export function writeFilters(f: Filters) {
  const params = new URLSearchParams()
  if (f.q) params.set("q", f.q)
  if (f.kind) params.set("kind", f.kind)
  else if (f.group) params.set("group", f.group)
  for (const g of f.genres) params.append("genre", g)
  if (f.color) params.set("color", f.color)
  if (f.source !== "all") params.set("source", f.source)
  if (f.sort !== "popular") params.set("sort", f.sort)
  if (f.refs) params.set("refs", "1")
  if (f.limit !== PAGE_SIZE) params.set("limit", String(f.limit))
  return params
}

export const hasReference = (a: Pick<Asset, "image" | "payload">) =>
  !!a.image && (a.payload.type === "character" || a.payload.type === "world")

const haystack = (a: Asset) => {
  const p = a.payload
  return [
    a.name,
    a.description,
    a.kind,
    a.author ?? "",
    a.keywords ?? "",
    ...a.genres,
    ...("tags" in p ? p.tags : []),
  ]
    .join(" ")
    .toLowerCase()
}

// Every word has to match, so adding words narrows the results.
export function matches(a: Asset, f: Filters) {
  if (f.kind ? a.kind !== f.kind : f.group && groupOf(a.kind) !== f.group)
    return false
  if (f.genres.length && !f.genres.some((g) => a.genres.includes(g)))
    return false
  if (f.color && a.color !== f.color) return false
  if (f.refs && !hasReference(a)) return false
  if (f.source === "official" && !a.official) return false
  if (f.source === "community" && a.official) return false
  if (f.source === "mine" && !a.mine) return false
  if (f.source === "saved" && !a.saved) return false
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = haystack(a)
  return words.every((w) => text.includes(w))
}

export function sorted(assets: Asset[], sort: Sort) {
  const all = [...assets]
  if (sort === "name") return all.sort((a, b) => a.name.localeCompare(b.name))
  if (sort === "newest")
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  // A use says more than a save. Ties keep the catalog's curated order.
  return all.sort((a, b) => b.uses * 3 + b.saves - (a.uses * 3 + a.saves))
}

const hexToRgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]

// Which swatch an image reads as, from raw RGB bytes of a small copy. Pixels
// count by how colourful they are, so a red coat beats a white wall.
export function dominantColor(rgb: ArrayLike<number>, step = 3): AssetColor {
  const scores = new Map<AssetColor, number>()
  let colourful = 0
  const pixels = rgb.length / step
  for (let i = 0; i + 2 < rgb.length; i += step) {
    const [r, g, b] = [rgb[i]!, rgb[i + 1]!, rgb[i + 2]!]
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    if (chroma < 40) continue
    colourful++
    let best: AssetColor = "mono"
    let bestDistance = Infinity
    for (const c of COLORS) {
      if (c.id === "mono") continue
      const [cr, cg, cb] = hexToRgb(c.swatch)
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
      if (d < bestDistance) {
        bestDistance = d
        best = c.id
      }
    }
    scores.set(best, (scores.get(best) ?? 0) + chroma)
  }
  if (colourful / pixels < 0.08) return "mono"
  return [...scores].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mono"
}
