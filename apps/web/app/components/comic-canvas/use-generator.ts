import * as React from "react"

import { TAG_GROUPS, sortTags } from "./anima-tags"
import { COVERAGE_CELLS } from "./coverage"
import {
  DEFAULT_LOOK,
  MAX_REFS,
  createPanel,
  sheetReady,
  type Character,
  type ComicProject,
  type Engine,
  type Look,
  type Outfit,
  type PaletteId,
  type PanelLayer,
  type PanelVersion,
  type StyleId,
  type WorldItem,
} from "./model"
import { isStyleErrorCode, styleSlots } from "@/lib/comic-import/style"
import { COSTS } from "@/lib/credits"
import { INSUFFICIENT_CREDITS, setCredits } from "@/lib/credits-store"
import { styleErrorText } from "./style-import.messages"

import { readImageFile } from "./render"
import { setDimension } from "./setups"
import type { ComicEditor } from "./use-editor"

// Tags checked against Danbooru: "western comics (style)", not "western
// comics"; there is no "cel shading" tag.
const COMIC =
  "comic, western comics (style), (high contrast:1.3), (heavy black shadows:1.4), spot blacks, bold lines"

export const STYLES: Record<
  StyleId,
  {
    tags: string
    negative: string
    // The same look in words, for Klein, which reads sentences, not tags.
    prose: string
    // Whether the palette and saturation controls mean anything for it.
    palette: boolean
    saturation: boolean
  }
> = {
  graphic: {
    tags: `limited palette, (flat color:1.2), ${COMIC}, black outline`,
    negative: "gradient, photo, realistic, 3d",
    prose:
      "Modern graphic novel art: clean confident black ink linework with variable line weight, solid spot blacks, flat cel colors with a single shadow tone, subtle halftone dots in the shadows, no gradients.",
    palette: true,
    saturation: true,
  },
  color: {
    tags: "comic, western comics (style), flat color, bold lines, black outline, heavy black shadows, spot blacks",
    negative: "gradient, soft shading, photo, realistic, 3d",
    prose:
      "Classic comic book art: bold black outlines, flat colors, heavy black shadows and spot blacks.",
    palette: true,
    saturation: true,
  },
  retro: {
    tags: "retro artstyle, 1990s (style), halftone, comic, western comics (style), flat color, limited palette, bold lines, black outline",
    negative: "gradient, photo, realistic, 3d",
    prose:
      "1990s retro comic book art: halftone dots, flat colors, limited palette, bold black outlines.",
    palette: true,
    saturation: true,
  },
  // Greyscale with one colour. Anima only colours what is named, so the
  // panel says what carries it (spotOn), e.g. "red hoodie".
  spot: {
    tags: "(monochrome:1.2), greyscale, (spot color:1.5), comic, western comics (style), (high contrast:1.3), heavy black shadows, bold lines",
    negative: "photo, realistic, 3d",
    prose:
      "Black and white ink comic art with a single spot color, high contrast, heavy black shadows.",
    palette: true,
    saturation: false,
  },
  noir: {
    tags: `monochrome, greyscale, traditional media, ${COMIC}`,
    negative: "color, colorful, gradient, soft shading, photo, realistic, 3d",
    prose:
      "Black and white noir comic art: heavy black ink, hatching, high contrast, no color at all.",
    palette: false,
    saturation: false,
  },
  anime: {
    tags: "anime screencap, anime coloring",
    negative: "photo, realistic, 3d, sketch",
    prose: "Anime screenshot style with anime cel coloring.",
    palette: true,
    saturation: true,
  },
  raw: {
    tags: "",
    negative: "",
    prose: "",
    palette: false,
    saturation: false,
  },
}

export const PALETTES: { id: PaletteId; swatch: string }[] = [
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
]

// The panel's own style and palette win over the carousel's.
export function lookOf(panel: PanelLayer, look: Look = DEFAULT_LOOK): Look {
  const style = panel.style ?? look.style
  const palette = panel.palette !== undefined ? panel.palette : look.palette
  return {
    style,
    // Spot colour needs a colour; red is the genre's default.
    palette: style === "spot" ? (palette ?? "red") : palette,
    saturation: look.saturation,
    // A panel on its own style has left the carousel's recipe behind.
    ...(look.recipe && style === look.style && { recipe: look.recipe }),
    ...(look.styleRef && style === look.style && { styleRef: look.styleRef }),
  }
}

export function lookTags(panel: PanelLayer, look: Look) {
  const style = STYLES[look.style]
  const tags: string[] = [style.tags, look.recipe?.tags ?? ""]
  const negative: string[] = [style.negative, look.recipe?.negative ?? ""]
  const named = look.style === "spot" && !!panel.spotOn?.trim()
  // A theme tag tints the whole panel; with a named object, spot colour
  // only needs the object's colour.
  if (style.palette && look.palette && !named) {
    tags.push(
      look.palette === "sepia" ? "(sepia:1.2)" : `(${look.palette} theme:1.2)`
    )
  }
  if (style.saturation && look.saturation === "vivid") {
    tags.push("(colorful:1.2)")
    negative.push("muted color")
  } else if (style.saturation && look.saturation === "muted") {
    tags.push("(muted color:1.2)")
    negative.push("colorful")
  }
  const spot =
    look.style === "spot" && panel.spotOn?.trim()
      ? `${look.palette === "sepia" ? "brown" : look.palette} ${panel.spotOn.trim()}`
      : null
  return {
    tags: tags.filter(Boolean),
    negative: negative.filter(Boolean),
    spot,
  }
}

// Klein's version of the look: style, palette and saturation in words.
export function lookProse(panel: PanelLayer, look: Look) {
  const style = STYLES[look.style]
  const parts = [style.prose, look.recipe?.prose]
  if (look.style === "spot" && look.palette)
    parts.push(
      `The spot color is ${look.palette === "sepia" ? "brown" : look.palette}${panel.spotOn?.trim() ? `, only on the ${panel.spotOn.trim()}` : ""}.`
    )
  else if (style.palette && look.palette)
    parts.push(
      look.palette === "sepia"
        ? "Sepia tones."
        : `Limited palette dominated by ${look.palette} tones, with warm light accents.`
    )
  if (style.saturation && look.saturation === "vivid")
    parts.push("Vivid, saturated colors.")
  if (style.saturation && look.saturation === "muted")
    parts.push("Muted, desaturated colors.")
  return parts.filter(Boolean).join(" ")
}

const KIND: Record<Character["kind"], string> = {
  girl: "a woman",
  boy: "a man",
  other: "a character",
}

// Lettering is done in the canvas, never generated.
const KLEIN_NO_TEXT =
  "No text, no letters, no speech bubbles, no panel borders, a single image."

export const wornOutfit = (panel: PanelLayer, c: Character) =>
  c.outfits?.find((o) => o.id === panel.outfits?.[c.id])

const words = (o: Pick<Outfit | WorldItem, "name" | "tags">) =>
  [o.name.trim(), ...o.tags].filter(Boolean).join(", ")

export function panelMembers(panel: PanelLayer, cast: Character[] = []) {
  return (panel.cast ?? [])
    .map((id) => cast.find((c) => c.id === id))
    .filter((c): c is Character => !!c)
}

type RefSources = Pick<ComicProject, "cast" | "world" | "look">

// The panel's location first, then its props, whatever order they were added.
function panelWorld(panel: PanelLayer, world: WorldItem[] = []) {
  const items = (panel.world ?? [])
    .map((id) => world.find((w) => w.id === id))
    .filter((w): w is WorldItem => !!w)
  return [
    ...items.filter((w) => w.kind === "location"),
    ...items.filter((w) => w.kind !== "location"),
  ]
}

type NamedRef =
  | { src: string; character: Character; outfit?: Outfit; item?: undefined }
  | { src: string; item: WorldItem; character?: undefined; outfit?: undefined }

export type PanelRef =
  | NamedRef
  | { src: string; item?: undefined; character?: undefined; outfit?: undefined }

// What a panel attaches, in the fixed order the prompt counts them: characters,
// location, props, then the layout guide. An outfit's image is a redraw of the
// whole sheet, so it takes the sheet's place, keeping one slot per character.
// Whatever doesn't fit is dropped here, never by the server, so the prompt's
// numbers stay right and the left-out are described in words instead. The
// guide always keeps a slot: the last reference gives way, never the guide.
// A learned style's pages come last, added by the server: `styleSlots` is how
// many, and they push out references the same way.
export function panelRefs(
  panel: PanelLayer,
  { cast, world, look }: RefSources
) {
  const wanted: NamedRef[] = [
    ...panelMembers(panel, cast)
      .filter(sheetReady)
      .map((character) => {
        const outfit = wornOutfit(panel, character)
        return outfit?.sheet
          ? { src: outfit.sheet, character, outfit }
          : { src: character.sheet!, character }
      }),
    ...panelWorld(panel, world)
      .filter((item) => item.image)
      .map((item) => ({ src: item.image!, item })),
  ]
  const pages = look ? lookOf(panel, look).styleRef?.pages : 0
  const slots = pages ? styleSlots(wanted.length, !!panel.guide, pages) : 0
  const room = MAX_REFS - (panel.guide ? 1 : 0) - slots
  const refs: PanelRef[] = wanted.slice(0, room)
  if (panel.guide) refs.push({ src: panel.guide.src })
  return { refs, dropped: wanted.slice(room), styleSlots: slots }
}

const refCount = (panel: PanelLayer, project: RefSources) => {
  const { refs, styleSlots: slots } = panelRefs(panel, project)
  return refs.length + slots
}

export const usesKlein = (panel: PanelLayer, project: RefSources) =>
  refCount(panel, project) > 0

// Up front, because the written description otherwise out-votes a sketch
// the model only skims. The wording follows OpenManga's POSE / LAYOUT section.
function guideProse(panel: PanelLayer, image: string) {
  if (!panel.guide) return ""
  const rule =
    panel.guide.strength === "strict"
      ? "Copy the pose of every figure, where each figure stands in the frame, and the framing from the sketch. Where the description disagrees with the sketch on pose, figure placement or framing, the sketch wins. Identity, outfits and the art style still come from the character references and the description, never from the sketch."
      : "Start from the sketch for the poses, where the figures stand and the framing; the description may adjust it."
  return `${image} is a rough layout sketch. ${rule} Ignore its drawing style, line quality and any text in it.`
}

// Pages of someone else's comic: the model gets told what they are for and,
// as firmly, what they are not.
function styleProse(first: number, count: number, total: number) {
  const which =
    count > 1
      ? `Reference images ${first + 1} and ${first + 2} are pages`
      : total > 1
        ? `Reference image ${first + 1} is a page`
        : "The reference image is a page"
  return `${which} from another comic, shown only for how the art is drawn. Match the line work, inking, shading, color palette, texture and panel rhythm. Take the style only: never copy the characters, faces, costumes, scenes, logos, lettering or text.`
}

// For Klein: the shot in sentences, each reference image named for what it
// holds, and the look spelled out.
function kleinPrompt(
  panel: PanelLayer,
  {
    cast = [],
    world = [],
    look,
  }: Pick<ComicProject, "cast" | "world" | "look">,
  lead: string,
  close: string
) {
  const effective = lookOf(panel, look)
  const { refs, styleSlots: slots } = panelRefs(panel, { cast, world, look })
  const total = refs.length + slots
  const tags = (panel.tags ?? []).filter((t) => !COUNT_TAGS.has(t))
  const image = (i: number) =>
    total > 1 ? `reference image ${i + 1}` : "the reference image"
  const name = (c: Character) => c.name.trim() || KIND[c.kind]
  const drawn = refs.map((r, i) => {
    if (r.item) {
      const what = r.item.name.trim() || "This"
      return r.item.kind === "location"
        ? `${what} is the place in ${image(i)}: keep its layout and landmarks, redrawn in this panel's art style.`
        : `${what} is the object in ${image(i)}: keep its shape and details, redrawn in this panel's art style.`
    }
    const c = r.character
    if (!c) return ""
    const worn = wornOutfit(panel, c)
    if (worn && !r.outfit)
      return `${name(c)} is the person in ${image(i)}: keep the same face, hair and skin, but dress them in ${words(worn)} instead of the clothes in that image.`
    const clothes = r.outfit ? words(r.outfit) : c.tags.join(", ")
    return `${name(c)} is the person in ${image(i)}: keep the same face, hair, skin and outfit${clothes ? ` (${clothes})` : ""}.`
  })
  const others = panelMembers(panel, cast)
    .filter((c) => !refs.some((r) => r.character?.id === c.id))
    .map((c) => {
      const worn = wornOutfit(panel, c)
      return `${name(c)}: ${[KIND[c.kind], ...c.tags, ...(worn ? [words(worn)] : [])].join(", ")}.`
    })
  const guide =
    total > 1 ? `Reference image ${refs.length}` : "The reference image"
  const unseen = panelWorld(panel, world)
    .filter((w) => !refs.some((r) => r.item?.id === w.id))
    .map((w) => `Also in the shot: ${words(w)}.`)
  return [
    lead,
    guideProse(panel, guide),
    panel.prompt?.trim(),
    tags.length ? `Details: ${tags.join(", ")}.` : "",
    ...drawn,
    ...others,
    ...unseen,
    slots ? styleProse(refs.length, slots, total) : "",
    !slots && refs.some((r) => r.character)
      ? "Keep the art style of the character reference images."
      : "",
    lookProse(panel, effective),
    panel.negative?.trim() ? `Avoid: ${panel.negative.trim()}.` : "",
    close,
  ]
    .filter(Boolean)
    .join(" ")
}

export const buildKleinPrompt = (
  panel: PanelLayer,
  options: Pick<ComicProject, "cast" | "world" | "look"> = {}
) => kleinPrompt(panel, options, "Comic book panel.", KLEIN_NO_TEXT)

// One image of the panel's moment from nine cameras. The panel's own guide
// and camera tags stay out: they would pin every cell to one shot. The
// wording follows OpenManga's coverage sheet template.
export function buildCoveragePrompt(
  panel: PanelLayer,
  options: Pick<ComicProject, "cast" | "world" | "look"> = {}
) {
  const tags = setDimension(
    setDimension(panel.tags ?? [], "framing", null),
    "angle",
    null
  )
  return kleinPrompt(
    { ...panel, tags, guide: undefined },
    options,
    `Comic coverage sheet: one image divided into a 3x3 grid of nine equal cells with thin clean white gutters, each cell the same shape as the whole image. Every cell shows the same moment, with the same people, clothes, place, light and action, from a different camera setup. Left to right, top to bottom: ${COVERAGE_CELLS.map((c, i) => `${i + 1}. ${c.prose}`).join("; ")}.`,
    "Identity, outfits, the place and the lighting are identical in all nine cells; only the camera changes. No numbers, captions, labels or text of any kind."
  )
}

const QUALITY = "masterpiece, best quality, score_7, safe"
// Lettering is done in the canvas, never generated.
export const BASE_NEGATIVE =
  "worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration, extra limbs, bad hands, text, watermark, signature, speech bubble, letters, logo"

// The model card recommends 8-12 steps for Turbo.
export const DEFAULT_STEPS = 8
// ~0.6 MP keeps Anima Turbo near 10 s warm on the M4 Pro.
const TARGET_AREA = 640 * 960

export function renderSize(width: number, height: number) {
  const ratio = Math.min(4, Math.max(0.25, width / height))
  const snap = (n: number) =>
    Math.min(1536, Math.max(256, Math.round(n / 64) * 64))
  const w = Math.sqrt(TARGET_AREA * ratio)
  return { width: snap(w), height: snap(TARGET_AREA / w) }
}

export const hasPrompt = (panel: PanelLayer) =>
  !!panel.tags?.length ||
  !!panel.prompt?.trim() ||
  !!panel.cast?.length ||
  !!panel.world?.length

const COUNT_TAGS = new Set(
  TAG_GROUPS.find((g) => g.id === "count")!.tags.filter((t) => t !== "solo")
)

// 2 girls → "2girls", 6 or more → "6+girls", as Danbooru tags them.
function countTag(n: number, noun: string) {
  if (!n) return null
  if (n === 1) return `1${noun}`
  return `${n > 5 ? "6+" : n}${noun}s`
}

// Anima's order: quality, subject count, characters (named, then described),
// then tags. Style tags follow, and prose goes last: the model mixes tags and
// sentences freely, and the sentences read best at the end.
export function buildPrompt(
  panel: PanelLayer,
  {
    cast = [],
    world = [],
    look,
  }: Pick<ComicProject, "cast" | "world" | "look"> = {}
) {
  const effective = lookOf(panel, look)
  // Raw means no direction at all, which a recipe is.
  const raw = effective.style === "raw" && !effective.recipe
  const styled = lookTags(panel, effective)
  const members = panelMembers(panel, cast)
  const kinds = (k: Character["kind"]) =>
    members.filter((m) => m.kind === k).length
  const counts = members.length
    ? [
        countTag(kinds("girl"), "girl"),
        countTag(kinds("boy"), "boy"),
        countTag(kinds("other"), "other"),
      ]
    : []
  // With a cast, the cast decides the head count.
  const tags = sortTags(
    (panel.tags ?? []).filter((t) => !members.length || !COUNT_TAGS.has(t))
  )
  const people = members.map((m) => {
    const worn = wornOutfit(panel, m)
    return [m.name.trim(), ...m.tags, ...(worn ? [words(worn)] : [])]
      .filter(Boolean)
      .join(", ")
  })
  return {
    prompt: [
      raw ? "" : QUALITY,
      ...counts,
      ...people,
      ...panelWorld(panel, world).map(words),
      styled.spot,
      tags.join(", "),
      ...styled.tags,
      panel.prompt?.trim(),
    ]
      .filter(Boolean)
      .join(", "),
    negative: [BASE_NEGATIVE, ...styled.negative, panel.negative?.trim()]
      .filter(Boolean)
      .join(", "),
  }
}

export async function render(
  body: {
    prompt: string
    negative: string
    width: number
    height: number
    seed: number
    steps: number
    engine?: Engine
    refs?: string[]
    coverage?: boolean
    style?: { id: string; slots: number }
    fallback?: {
      prompt: string
      negative: string
      width: number
      height: number
      steps: number
    }
  },
  signal?: AbortSignal
) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify(body),
  })
  const credits = res.headers.get("x-credits")
  if (credits !== null) setCredits(Number(credits))
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    if (json?.code === INSUFFICIENT_CREDITS)
      throw new Error(INSUFFICIENT_CREDITS)
    if (isStyleErrorCode(json?.code))
      throw new Error(styleErrorText(json.code, document.documentElement.lang))
    throw new Error(json?.error ?? `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const img = await readImageFile(
    new File([blob], "panel.png", { type: blob.type })
  )
  return {
    src: img.src,
    ms: Number(res.headers.get("x-render-ms")) || 0,
    model: res.headers.get("x-model") ?? undefined,
    // A connected OpenRouter account draws with its own model.
    engine:
      res.headers.get("x-billed") === "openrouter"
        ? undefined
        : ((res.headers.get("x-engine") as Engine | null) ??
          body.engine ??
          "anima"),
  }
}

// A head-and-shoulders reference of a character, used as their avatar and
// to check the look before casting them.
export async function renderPortrait(
  character: Character,
  seed: number,
  look?: Look
) {
  const panel: PanelLayer = {
    ...createPanel({ x: 0, y: 0, width: 4, height: 5 }),
    cast: [character.id],
    tags: [
      "portrait",
      "looking at viewer",
      "simple background",
      "white background",
    ],
  }
  const { src } = await render({
    ...buildPrompt(panel, { cast: [character], look }),
    width: 512,
    height: 640,
    seed,
    steps: DEFAULT_STEPS,
  })
  return src
}

// A model sheet: front, three-quarter and close-up of one character, drawn
// with Klein so later panels can be drawn from it.
export async function renderSheet(
  character: Character,
  seed: number,
  look: Look = DEFAULT_LOOK,
  signal?: AbortSignal
) {
  const panel = createPanel({ x: 0, y: 0, width: 3, height: 2 })
  const prompt = [
    `Character model sheet of ${character.name.trim() || "a character"}, ${KIND[character.kind]}, on a plain off-white background:`,
    "full body front view, full body three-quarter view, and a large head-and-shoulders close-up. Same person in every view.",
    character.tags.length ? `Look: ${character.tags.join(", ")}.` : "",
    lookProse(panel, lookOf(panel, look)),
    "No text, no labels.",
  ]
    .filter(Boolean)
    .join(" ")
  const { src } = await render(
    {
      prompt,
      negative: "",
      width: 1536,
      height: 1024,
      seed,
      steps: 4,
      engine: "klein",
    },
    signal
  )
  return src
}

// The character's sheet again, in other clothes. Generating one needs an
// approved sheet: without that baseline, every outfit is a new face.
export async function renderOutfit(
  character: Character,
  outfit: Outfit,
  seed: number,
  look: Look = DEFAULT_LOOK
) {
  if (!sheetReady(character)) throw new Error("Approve the model sheet first.")
  const panel = createPanel({ x: 0, y: 0, width: 3, height: 2 })
  const prompt = [
    "Reproduce the character model sheet in the reference image exactly: the same person, face, hair, skin, body and proportions, in the same poses, views and layout, on the same plain background.",
    `Change only the clothes. Dress them in: ${words(outfit)}.`,
    lookProse(panel, lookOf(panel, look)),
    "No text, no labels.",
  ]
    .filter(Boolean)
    .join(" ")
  const { src } = await render({
    prompt,
    negative: "",
    width: 1536,
    height: 1024,
    seed,
    steps: 4,
    engine: "klein",
    refs: [character.sheet!],
  })
  return src
}

// A reference of a recurring place or object, drawn with Klein like a sheet.
export async function renderWorldItem(
  item: WorldItem,
  seed: number,
  look: Look = DEFAULT_LOOK
) {
  const location = item.kind === "location"
  const panel = createPanel({ x: 0, y: 0, width: 3, height: 2 })
  const prompt = [
    location
      ? `Wide eye-level establishing view of ${words(item)}, with nobody in it.`
      : `One object, ${words(item)}, in three-quarter view on a plain off-white background, with nobody in the image.`,
    lookProse(panel, lookOf(panel, look)),
    "No text, no labels.",
  ]
    .filter(Boolean)
    .join(" ")
  const { src } = await render({
    prompt,
    negative: "",
    width: location ? 1536 : 1024,
    height: 1024,
    seed,
    steps: 4,
    engine: "klein",
  })
  return src
}

// Klein is slower per pixel; ~0.9 MP keeps a panel near a minute.
const KLEIN_AREA = 1024 * 896

// A coverage sheet holds nine cells, so it gets a model sheet's area.
const COVERAGE_AREA = 1536 * 1024

export function kleinSize(width: number, height: number, area = KLEIN_AREA) {
  const ratio = Math.min(2.5, Math.max(0.4, width / height))
  const snap = (n: number) =>
    Math.min(1536, Math.max(256, Math.round(n / 64) * 64))
  const w = Math.sqrt(area * ratio)
  return { width: snap(w), height: snap(area / w) }
}

// Panels with reference images are drawn from them, with Klein.
export const engineOf = (panel: PanelLayer, project: RefSources): Engine =>
  refCount(panel, project) ? "klein" : "anima"

export const otherEngine = (engine: Engine): Engine =>
  engine === "klein" ? "anima" : "klein"

// As the server charges it: Klein with nothing to draw from is priced as a
// sheet, not as a reference panel.
export function engineCost(
  panel: PanelLayer,
  engine: Engine,
  project: RefSources
) {
  if (engine === "anima") return COSTS.panel
  return refCount(panel, project) ? COSTS.panel_ref : COSTS.sheet
}

// The request's share of a learned style: which one and how many pages, plus
// the same panel for Anima in case no model at the other end sees images.
function styleBody(panel: PanelLayer, project: ComicEditor["project"]) {
  const id = lookOf(panel, project.look).styleRef?.id
  const { styleSlots: slots } = panelRefs(panel, project)
  if (!id || !slots) return {}
  return {
    style: { id, slots },
    fallback: {
      ...buildPrompt(panel, project),
      ...renderSize(panel.width, panel.height),
      steps: panel.steps ?? DEFAULT_STEPS,
    },
  }
}

function renderBody(
  panel: PanelLayer,
  project: ComicEditor["project"],
  engine: Engine,
  seed: number
) {
  if (engine === "anima")
    return {
      ...buildPrompt(panel, project),
      ...renderSize(panel.width, panel.height),
      seed,
      steps: panel.steps ?? DEFAULT_STEPS,
    }
  return {
    prompt: buildKleinPrompt(panel, project),
    negative: "",
    ...kleinSize(panel.width, panel.height),
    seed,
    steps: 4,
    engine,
    refs: panelRefs(panel, project).refs.map((r) => r.src),
    ...styleBody(panel, project),
  }
}

export interface Take {
  src: string
  seed: number
  ms: number
  engine?: Engine
  model?: string
}

export interface Job {
  startedAt: number
  take: number
  of: number
}

// Versions kept on a panel, as in edit-tools.
const MAX_VERSIONS = 8

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32)

// The panel's versions with its current image among them, before it's replaced.
export function withCurrentImage(panel: PanelLayer) {
  const versions = panel.versions ?? []
  if (!panel.src || versions.some((v) => v.src === panel.src)) return versions
  const { src, engine, model, seed } = panel
  const current: PanelVersion = { src, kind: "original", engine, model, seed }
  return [current, ...versions].slice(0, MAX_VERSIONS)
}

// Every panel with something to draw, slide by slide, in the order they draw.
export const promptedPanels = (project: ComicProject) =>
  project.pages.flatMap((page) =>
    page.layers
      .filter((l): l is PanelLayer => l.type === "panel" && hasPrompt(l))
      .sort((a, b) => a.y - b.y || a.x - b.x)
  )

// A coverage sheet is a job of its own: the panel can render meanwhile.
export const coverageJob = (panelId: string) => `coverage:${panelId}`

export function useGenerator(editor: ComicEditor) {
  const [jobs, setJobs] = React.useState<Record<string, Job>>({})
  const [takes, setTakes] = React.useState<Record<string, Take[]>>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const controllers = React.useRef(new Map<string, AbortController>())

  // `count` takes in a row, each on a new seed unless the seed is locked.
  // Every take lands in the panel as it finishes; pick another from Takes.
  // `patch` lands with the image. Resolves to what went wrong, if anything did.
  const generate = React.useCallback(
    async (
      panelId: string,
      count = 1,
      patch?: Partial<PanelLayer>
    ): Promise<string | null> => {
      if (controllers.current.has(panelId)) return null
      const controller = new AbortController()
      controllers.current.set(panelId, controller)
      setErrors(({ [panelId]: _, ...rest }) => rest)
      const startedAt = Date.now()
      try {
        for (let take = 1; take <= count; take++) {
          const panel = editor.findLayer(panelId)?.layer
          if (panel?.type !== "panel" || !hasPrompt(panel)) return null
          const seed =
            panel.lockSeed && panel.seed !== undefined
              ? panel.seed + take - 1
              : randomSeed()
          setJobs((j) => ({ ...j, [panelId]: { startedAt, take, of: count } }))
          const project = editor.projectRef.current
          const result = await render(
            renderBody(panel, project, engineOf(panel, project), seed),
            controller.signal
          )
          setTakes((t) => ({
            ...t,
            [panelId]: [{ ...result, seed }, ...(t[panelId] ?? [])].slice(
              0,
              24
            ),
          }))
          editor.update(panelId, {
            src: result.src,
            seed,
            engine: result.engine,
            model: result.model,
            fit: "cover",
            imageZoom: 100,
            panX: 0,
            panY: 0,
            ...patch,
          })
        }
        return null
      } catch (e) {
        if (controller.signal.aborted) return null
        const message = e instanceof Error ? e.message : String(e)
        setErrors((err) => ({ ...err, [panelId]: message }))
        return message
      } finally {
        controllers.current.delete(panelId)
        setJobs(({ [panelId]: _, ...rest }) => rest)
      }
    },
    [editor]
  )

  // The same shot and seed through the given engine. The result joins the
  // panel's versions and leaves its image alone until it wins the compare.
  const tryEngine = React.useCallback(
    async (panelId: string, engine: Engine) => {
      if (controllers.current.has(panelId)) return null
      const panel = editor.findLayer(panelId)?.layer
      if (panel?.type !== "panel" || !hasPrompt(panel)) return null
      const controller = new AbortController()
      controllers.current.set(panelId, controller)
      setErrors(({ [panelId]: _, ...rest }) => rest)
      const seed = panel.seed ?? randomSeed()
      setJobs((j) => ({
        ...j,
        [panelId]: { startedAt: Date.now(), take: 1, of: 1 },
      }))
      try {
        const result = await render(
          renderBody(panel, editor.projectRef.current, engine, seed),
          controller.signal
        )
        setTakes((t) => ({
          ...t,
          [panelId]: [{ ...result, seed }, ...(t[panelId] ?? [])].slice(0, 24),
        }))
        const now = editor.findLayer(panelId)?.layer
        if (now?.type === "panel") {
          const versions = withCurrentImage(now)
          editor.update(panelId, {
            versions: [
              {
                src: result.src,
                kind: "engine" as const,
                engine: result.engine,
                model: result.model,
                seed,
              },
              ...versions,
            ].slice(0, MAX_VERSIONS),
          })
        }
        return result.src
      } catch (e) {
        if (!controller.signal.aborted) {
          setErrors((err) => ({
            ...err,
            [panelId]: e instanceof Error ? e.message : String(e),
          }))
        }
        return null
      } finally {
        controllers.current.delete(panelId)
        setJobs(({ [panelId]: _, ...rest }) => rest)
      }
    },
    [editor]
  )

  // One at a time, slide by slide: ComfyUI renders serially anyway,
  // and this fills the carousel in reading order.
  const generateAll = React.useCallback(async () => {
    const panels = promptedPanels(editor.projectRef.current)
    for (const { id } of panels) await generate(id)
  }, [editor, generate])

  const cancel = React.useCallback((panelId: string) => {
    controllers.current.get(panelId)?.abort()
  }, [])

  // Draws the panel's coverage sheet. Nothing on the panel changes but the
  // sheet: picked cells become guides later, in the picker.
  const drawCoverage = React.useCallback(
    async (panelId: string) => {
      const key = coverageJob(panelId)
      if (controllers.current.has(key)) return
      const panel = editor.findLayer(panelId)?.layer
      if (panel?.type !== "panel" || !hasPrompt(panel)) return
      const controller = new AbortController()
      controllers.current.set(key, controller)
      setErrors(({ [key]: _, ...rest }) => rest)
      setJobs((j) => ({
        ...j,
        [key]: { startedAt: Date.now(), take: 1, of: 1 },
      }))
      const project = editor.projectRef.current
      const seed = randomSeed()
      try {
        const { src } = await render(
          {
            prompt: buildCoveragePrompt(panel, project),
            negative: "",
            ...kleinSize(panel.width, panel.height, COVERAGE_AREA),
            seed,
            steps: 4,
            engine: "klein",
            refs: panelRefs({ ...panel, guide: undefined }, project).refs.map(
              (r) => r.src
            ),
            coverage: true,
            ...styleBody({ ...panel, guide: undefined }, project),
          },
          controller.signal
        )
        editor.update(panelId, { coverage: { src, seed } })
      } catch (e) {
        if (!controller.signal.aborted) {
          setErrors((err) => ({
            ...err,
            [key]: e instanceof Error ? e.message : String(e),
          }))
        }
      } finally {
        controllers.current.delete(key)
        setJobs(({ [key]: _, ...rest }) => rest)
      }
    },
    [editor]
  )

  return {
    jobs,
    takes,
    errors,
    generate,
    tryEngine,
    generateAll,
    cancel,
    drawCoverage,
  }
}

export type Generator = ReturnType<typeof useGenerator>
