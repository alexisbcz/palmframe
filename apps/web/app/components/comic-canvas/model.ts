export type ImageFit = "cover" | "contain" | "fill"
// `message` is a text read on a phone: a rounded chat bubble in sentence case.
export type BubbleShape = "speech" | "thought" | "shout" | "caption" | "message"
export type TextAlign = "left" | "center" | "right"
export type FontId = "comic" | "bangers" | "inter"
export type StyleId =
  "graphic" | "color" | "retro" | "spot" | "noir" | "anime" | "raw"
// Danbooru colour themes ("red theme"…), plus sepia.
export type PaletteId =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "aqua"
  | "blue"
  | "purple"
  | "pink"
  | "brown"
  | "sepia"
export type Saturation = "vivid" | "balanced" | "muted"

// The carousel's look. Every panel draws in it unless it overrides it, so
// the slides read as one comic.
export interface Look {
  style: StyleId
  palette: PaletteId | null
  saturation: Saturation
}

export const DEFAULT_LOOK: Look = {
  style: "graphic",
  palette: null,
  saturation: "balanced",
}

interface BaseLayer {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  hidden: boolean
  locked: boolean
}

export interface PanelLayer extends BaseLayer {
  type: "panel"
  src: string | null
  fit: ImageFit
  imageZoom: number
  panX: number
  panY: number
  flipX: boolean
  flipY: boolean
  fill: string
  borderWidth: number
  borderColor: string
  radius: number
  blur: number
  brightness: number
  contrast: number
  saturation: number
  grayscale: number
  // Anima Turbo generation settings, kept on the panel so takes are reproducible.
  // Danbooru tags, kept in Anima's prompt order. `prompt` holds prose.
  tags?: string[]
  // Ids of the characters in the shot.
  cast?: string[]
  prompt?: string
  negative?: string
  // Overrides of the carousel look; unset means "same as the carousel".
  style?: StyleId
  palette?: PaletteId | null
  // With the spot colour style: what gets the colour ("hoodie", "neon sign").
  spotOn?: string
  seed?: number
  lockSeed?: boolean
  steps?: number
  // Images the panel had before and after AI edits, newest first, so an
  // edit can be compared and reverted.
  versions?: PanelVersion[]
  // A rough sketch directing pose and framing. Only Klein can read one, so
  // a panel with a guide always draws with Klein.
  guide?: LayoutGuide
  // The last coverage sheet: this moment from nine cameras, to pick from.
  coverage?: CoverageSheet
}

// `strict` beats the written description on pose and framing, never on
// identity or style. `loose` is a starting point the description may adjust.
export type GuideStrength = "loose" | "strict"

export interface LayoutGuide {
  // A lossless PNG fitting 1024 px: a pose lives in thin strokes.
  src: string
  strength: GuideStrength
}

export interface CoverageSheet {
  src: string
  seed: number
}

export interface PanelVersion {
  src: string
  // "original" is what the panel showed before its first edit.
  kind:
    | "original"
    | "edit"
    | "vary"
    | "inpaint"
    | "erase"
    | "outpaint"
    // Post-processing (postprocess-tools.tsx).
    | "upscale"
    | "remove_bg"
    | "face_fix"
    | "restyle"
}

export interface BubbleLayer extends BaseLayer {
  type: "bubble"
  shape: BubbleShape
  text: string
  font: FontId
  fontSize: number
  uppercase: boolean
  textColor: string
  fill: string
  borderColor: string
  borderWidth: number
  tail: boolean
  // Tail tip, relative to the bubble centre, in unrotated layer space.
  tailX: number
  tailY: number
}

export interface TextLayer extends BaseLayer {
  type: "text"
  text: string
  font: FontId
  fontSize: number
  uppercase: boolean
  align: TextAlign
  color: string
  strokeColor: string
  strokeWidth: number
}

export type Layer = PanelLayer | BubbleLayer | TextLayer
export type LayerType = Layer["type"]

export interface ComicDoc {
  version: 1
  width: number
  height: number
  background: string
  layers: Layer[]
}

export const FONTS: Record<
  FontId,
  { label: string; family: string; weight: number }
> = {
  comic: { label: "Comic Neue", family: '"Comic Neue"', weight: 700 },
  bangers: { label: "Bangers", family: "Bangers", weight: 400 },
  inter: { label: "Inter", family: '"Inter Variable"', weight: 800 },
}

export const FORMATS = [
  { id: "carousel", label: "Carousel 4:5", width: 1080, height: 1350 },
  { id: "reel", label: "Reel 9:16", width: 1080, height: 1920 },
  { id: "square", label: "Square 1:1", width: 1080, height: 1080 },
] as const

export function formatOf(doc: Pick<ComicDoc, "width" | "height">) {
  return FORMATS.find((f) => f.width === doc.width && f.height === doc.height)
}

export function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function base(name: string, rect: Rect): BaseLayer {
  return {
    id: uid(),
    name,
    ...rect,
    rotation: 0,
    opacity: 100,
    hidden: false,
    locked: false,
  }
}

export type Rect = { x: number; y: number; width: number; height: number }

export function createPanel(rect: Rect, src: string | null = null): PanelLayer {
  return {
    ...base("Panel", rect),
    type: "panel",
    src,
    fit: "cover",
    imageZoom: 100,
    panX: 0,
    panY: 0,
    flipX: false,
    flipY: false,
    fill: "#ffffff",
    borderWidth: 6,
    borderColor: "#111111",
    radius: 0,
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
  }
}

const BUBBLE_DEFAULTS: Record<
  BubbleShape,
  { name: string; text: string; size: [number, number]; fill: string }
> = {
  speech: {
    name: "Speech",
    text: "The demo starts in five minutes.",
    size: [420, 240],
    fill: "#ffffff",
  },
  thought: {
    name: "Thought",
    text: "Nobody read the spec.",
    size: [420, 260],
    fill: "#ffffff",
  },
  shout: { name: "Shout", text: "Ship it!", size: [440, 300], fill: "#ffffff" },
  message: {
    name: "Message",
    text: "Are you still up?",
    size: [440, 130],
    fill: "#e9e9ef",
  },
  caption: {
    name: "Caption",
    text: "Meanwhile, at 2:14 AM…",
    size: [460, 110],
    fill: "#fff3b0",
  },
}

export function createBubble(
  shape: BubbleShape,
  center: { x: number; y: number }
): BubbleLayer {
  const d = BUBBLE_DEFAULTS[shape]
  const [width, height] = d.size
  return {
    ...base(d.name, {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    }),
    type: "bubble",
    shape,
    text: d.text,
    font: shape === "message" ? "inter" : "comic",
    fontSize: shape === "shout" ? 52 : shape === "message" ? 34 : 40,
    uppercase: shape !== "message",
    textColor: "#111111",
    fill: d.fill,
    borderColor: "#111111",
    borderWidth: shape === "message" ? 0 : 5,
    tail: shape !== "caption",
    tailX: -width * 0.2,
    tailY: height * 0.85,
  }
}

export function createText(center: { x: number; y: number }): TextLayer {
  const width = 520
  const height = 200
  return {
    ...base("SFX", {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    }),
    type: "text",
    text: "KRAK!",
    font: "bangers",
    fontSize: 160,
    uppercase: true,
    align: "center",
    color: "#facc15",
    strokeColor: "#111111",
    strokeWidth: 10,
  }
}

export const LAYOUTS: {
  id: string
  label: string
  // Panels in a unit grid, before margins and gutters are applied.
  cells: Rect[]
}[] = [
  {
    id: "splash",
    label: "Splash",
    cells: [{ x: 0, y: 0, width: 1, height: 1 }],
  },
  {
    id: "two-tiers",
    label: "Two tiers",
    cells: [
      { x: 0, y: 0, width: 1, height: 0.5 },
      { x: 0, y: 0.5, width: 1, height: 0.5 },
    ],
  },
  {
    id: "three-tiers",
    label: "Three tiers",
    cells: [0, 1, 2].map((i) => ({ x: 0, y: i / 3, width: 1, height: 1 / 3 })),
  },
  {
    id: "grid",
    label: "Grid",
    cells: [0, 1, 2, 3].map((i) => ({
      x: (i % 2) / 2,
      y: Math.floor(i / 2) / 2,
      width: 0.5,
      height: 0.5,
    })),
  },
  {
    id: "big-two",
    label: "Big + two",
    cells: [
      { x: 0, y: 0, width: 1, height: 0.6 },
      { x: 0, y: 0.6, width: 0.5, height: 0.4 },
      { x: 0.5, y: 0.6, width: 0.5, height: 0.4 },
    ],
  },
  {
    id: "two-wide",
    label: "Two + wide",
    cells: [
      { x: 0, y: 0, width: 0.5, height: 0.45 },
      { x: 0.5, y: 0, width: 0.5, height: 0.45 },
      { x: 0, y: 0.45, width: 1, height: 0.55 },
    ],
  },
  {
    id: "staggered",
    label: "Staggered",
    cells: [
      { x: 0, y: 0, width: 0.62, height: 0.5 },
      { x: 0.62, y: 0, width: 0.38, height: 0.5 },
      { x: 0, y: 0.5, width: 0.38, height: 0.5 },
      { x: 0.38, y: 0.5, width: 0.62, height: 0.5 },
    ],
  },
]

export const PAGE_MARGIN = 48
export const PANEL_GUTTER = 24

export function layoutRects(
  cells: Rect[],
  width: number,
  height: number
): Rect[] {
  const m = PAGE_MARGIN
  const g = PANEL_GUTTER / 2
  const iw = width - m * 2 + g * 2
  const ih = height - m * 2 + g * 2
  return cells.map((c) => ({
    x: Math.round(m - g + c.x * iw + g),
    y: Math.round(m - g + c.y * ih + g),
    width: Math.round(c.width * iw - g * 2),
    height: Math.round(c.height * ih - g * 2),
  }))
}

export interface ComicPage {
  id: string
  layers: Layer[]
}

// The reference images one Klein render takes.
export const MAX_KLEIN_REFS = 4

// A carousel: every slide shares one format, as Instagram requires.
// A recurring character. Their look tags go into every panel they're cast
// in, so they draw the same from panel to panel.
export interface Character {
  id: string
  name: string
  kind: "girl" | "boy" | "other"
  tags: string[]
  portrait?: string
  // A model sheet (front, three-quarter, close-up). Panels they're cast in
  // are drawn from it, so face and outfit hold from panel to panel.
  sheet?: string
  seed?: number
}

export interface ComicProject {
  version: 2
  width: number
  height: number
  background: string
  pages: ComicPage[]
  cast?: Character[]
  look?: Look
  // Pages read right to left, manga style: layouts mirror, panels number from the right.
  rtl?: boolean
}

// The single-slide view the renderer and the editor panels work on.
export function pageDoc(project: ComicProject, index: number): ComicDoc {
  const page = project.pages[Math.min(index, project.pages.length - 1)]
  return {
    version: 1,
    width: project.width,
    height: project.height,
    background: project.background,
    layers: page?.layers ?? [],
  }
}

function layoutPanels(layoutId: string, width: number, height: number) {
  const layout = LAYOUTS.find((l) => l.id === layoutId) ?? LAYOUTS[0]!
  return layoutRects(layout.cells, width, height).map((r, i) => ({
    ...createPanel(r),
    name: `Panel ${i + 1}`,
  }))
}

// New slides repeat the panel grid they follow, empty, so a carousel keeps its rhythm.
export function createPage(after?: ComicPage): ComicPage {
  const panels =
    after?.layers.filter((l): l is PanelLayer => l.type === "panel") ?? []
  return {
    id: uid(),
    layers: panels.map((p) => ({
      ...createPanel({ x: p.x, y: p.y, width: p.width, height: p.height }),
      rotation: p.rotation,
      radius: p.radius,
      borderWidth: p.borderWidth,
      borderColor: p.borderColor,
      fill: p.fill,
      name: p.name,
    })),
  }
}

export function clonePage(page: ComicPage): ComicPage {
  return { id: uid(), layers: page.layers.map((l) => ({ ...l, id: uid() })) }
}

export function createDefaultProject(): ComicProject {
  const width = 1080
  const height = 1350
  const caption = createBubble("caption", { x: 320, y: 130 })
  const speech = createBubble("speech", { x: 720, y: 280 })
  speech.tailX = -60
  speech.tailY = 230
  const first = {
    id: uid(),
    layers: [...layoutPanels("big-two", width, height), caption, speech],
  }
  return {
    version: 2,
    width,
    height,
    background: "#ffffff",
    pages: [first],
    look: DEFAULT_LOOK,
  }
}

// A guide or sheet a hand-edited file broke is dropped, not sent to a render.
function cleanPanel(layer: Layer): Layer {
  if (layer?.type !== "panel") return layer
  const { guide, coverage, ...rest } = layer
  if (!guide && !coverage) return layer
  return {
    ...rest,
    ...(typeof guide?.src === "string" && {
      guide: {
        src: guide.src,
        strength: guide.strength === "strict" ? "strict" : "loose",
      },
    }),
    ...(typeof coverage?.src === "string" && {
      coverage: { src: coverage.src, seed: Number(coverage.seed) || 0 },
    }),
  }
}

// Accepts current projects and single-page files saved before carousels.
export function toProject(value: unknown): ComicProject | null {
  const v = value as {
    version?: number
    width?: number
    height?: number
    background?: string
    pages?: ComicPage[]
    layers?: Layer[]
    cast?: Character[]
    look?: Look
    rtl?: boolean
  } | null
  if (!v || typeof v.width !== "number" || typeof v.height !== "number")
    return null
  const background = typeof v.background === "string" ? v.background : "#ffffff"
  if (v.version === 2 && Array.isArray(v.pages) && v.pages.length) {
    const pages = v.pages
      .filter((p) => p && Array.isArray(p.layers))
      .map((p) => ({ ...p, layers: p.layers.map(cleanPanel) }))
    if (!pages.length) return null
    const cast = Array.isArray(v.cast) ? v.cast : undefined
    return {
      version: 2,
      width: v.width,
      height: v.height,
      background,
      pages,
      ...(cast && { cast }),
      ...(v.look && typeof v.look === "object" && { look: v.look }),
      ...(v.rtl === true && { rtl: true }),
    }
  }
  if (v.version === 1 && Array.isArray(v.layers)) {
    return {
      version: 2,
      width: v.width,
      height: v.height,
      background,
      pages: [{ id: uid(), layers: v.layers }],
    }
  }
  return null
}
