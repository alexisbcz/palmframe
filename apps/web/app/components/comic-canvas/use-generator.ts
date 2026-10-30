import * as React from "react"

import { TAG_GROUPS, sortTags } from "./anima-tags"
import {
  DEFAULT_LOOK,
  createPanel,
  type Character,
  type Engine,
  type Look,
  type PaletteId,
  type PanelLayer,
  type PanelVersion,
  type StyleId,
} from "./model"
import { COSTS } from "@/lib/credits"
import { INSUFFICIENT_CREDITS, setCredits } from "@/lib/credits-store"

import { readImageFile } from "./render"
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
  }
}

function lookTags(panel: PanelLayer, look: Look) {
  const style = STYLES[look.style]
  const tags: string[] = [style.tags]
  const negative: string[] = [style.negative]
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
function lookProse(panel: PanelLayer, look: Look) {
  const style = STYLES[look.style]
  const parts = [style.prose]
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

// The cast members of a panel who have a model sheet, in reference order.
export function sheetCast(panel: PanelLayer, cast: Character[] = []) {
  return (panel.cast ?? [])
    .map((id) => cast.find((c) => c.id === id))
    .filter((c): c is Character => !!c?.sheet)
}

// For Klein: the shot in sentences, each sheet-backed character pointed at
// their reference image, and the look spelled out.
export function buildKleinPrompt(
  panel: PanelLayer,
  { cast = [], look }: { cast?: Character[]; look?: Look } = {}
) {
  const effective = lookOf(panel, look)
  const drawn = sheetCast(panel, cast)
  const others = (panel.cast ?? [])
    .map((id) => cast.find((c) => c.id === id))
    .filter((c): c is Character => !!c && !c.sheet)
  const tags = (panel.tags ?? []).filter((t) => !COUNT_TAGS.has(t))
  const many = drawn.length > 1
  const characters = [
    ...drawn.map(
      (c, i) =>
        `${c.name.trim() || KIND[c.kind]} is the person in ${many ? `reference image ${i + 1}` : "the reference image"}: keep the same face, hair, skin and outfit${c.tags.length ? ` (${c.tags.join(", ")})` : ""}.`
    ),
    ...others.map(
      (c) =>
        `${c.name.trim() || KIND[c.kind]}: ${KIND[c.kind]}, ${c.tags.join(", ")}.`
    ),
  ]
  return [
    "Comic book panel.",
    panel.prompt?.trim(),
    tags.length ? `Details: ${tags.join(", ")}.` : "",
    ...characters,
    drawn.length ? "Keep the art style of the reference images." : "",
    lookProse(panel, effective),
    panel.negative?.trim() ? `Avoid: ${panel.negative.trim()}.` : "",
    KLEIN_NO_TEXT,
  ]
    .filter(Boolean)
    .join(" ")
}

const QUALITY = "masterpiece, best quality, score_7, safe"
// Lettering is done in the canvas, never generated.
const BASE_NEGATIVE =
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
  !!panel.tags?.length || !!panel.prompt?.trim() || !!panel.cast?.length

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
  { cast = [], look }: { cast?: Character[]; look?: Look } = {}
) {
  const effective = lookOf(panel, look)
  const raw = effective.style === "raw"
  const styled = lookTags(panel, effective)
  const members = (panel.cast ?? [])
    .map((id) => cast.find((c) => c.id === id))
    .filter((c): c is Character => !!c)
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
  const people = members.map((m) =>
    [m.name.trim(), ...m.tags].filter(Boolean).join(", ")
  )
  return {
    prompt: [
      raw ? "" : QUALITY,
      ...counts,
      ...people,
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

async function render(
  body: {
    prompt: string
    negative: string
    width: number
    height: number
    seed: number
    steps: number
    engine?: Engine
    refs?: string[]
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
    throw new Error(json?.error ?? `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const img = await readImageFile(
    new File([blob], "panel.png", { type: blob.type })
  )
  return {
    src: img.src,
    ms: Number(res.headers.get("x-render-ms")) || 0,
    // A connected OpenRouter account draws with its own model.
    engine:
      res.headers.get("x-billed") === "openrouter"
        ? undefined
        : (body.engine ?? "anima"),
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
  look: Look = DEFAULT_LOOK
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
  const { src } = await render({
    prompt,
    negative: "",
    width: 1536,
    height: 1024,
    seed,
    steps: 4,
    engine: "klein",
  })
  return src
}

// Klein is slower per pixel; ~0.9 MP keeps a panel near a minute.
const KLEIN_AREA = 1024 * 896

export function kleinSize(width: number, height: number) {
  const ratio = Math.min(2.5, Math.max(0.4, width / height))
  const snap = (n: number) =>
    Math.min(1536, Math.max(256, Math.round(n / 64) * 64))
  const w = Math.sqrt(KLEIN_AREA * ratio)
  return { width: snap(w), height: snap(KLEIN_AREA / w) }
}

// Characters with a model sheet are drawn from it, with Klein.
export const engineOf = (panel: PanelLayer, cast?: Character[]): Engine =>
  sheetCast(panel, cast).length ? "klein" : "anima"

export const otherEngine = (engine: Engine): Engine =>
  engine === "klein" ? "anima" : "klein"

// As the server charges it: Klein with nothing to draw from is priced as a
// sheet, not as a reference panel.
export function engineCost(
  panel: PanelLayer,
  engine: Engine,
  cast?: Character[]
) {
  if (engine === "anima") return COSTS.panel
  return sheetCast(panel, cast).length ? COSTS.panel_ref : COSTS.sheet
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
    refs: sheetCast(panel, project.cast).map((c) => c.sheet!),
  }
}

export interface Take {
  src: string
  seed: number
  ms: number
  engine?: Engine
}

export interface Job {
  startedAt: number
  take: number
  of: number
}

// Versions kept on a panel, as in edit-tools.
const MAX_VERSIONS = 8

const randomSeed = () => Math.floor(Math.random() * 2 ** 32)

export function useGenerator(editor: ComicEditor) {
  const [jobs, setJobs] = React.useState<Record<string, Job>>({})
  const [takes, setTakes] = React.useState<Record<string, Take[]>>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const controllers = React.useRef(new Map<string, AbortController>())

  // `count` takes in a row, each on a new seed unless the seed is locked.
  // Every take lands in the panel as it finishes; pick another from Takes.
  const generate = React.useCallback(
    async (panelId: string, count = 1) => {
      if (controllers.current.has(panelId)) return
      const controller = new AbortController()
      controllers.current.set(panelId, controller)
      setErrors(({ [panelId]: _, ...rest }) => rest)
      const startedAt = Date.now()
      try {
        for (let take = 1; take <= count; take++) {
          const panel = editor.findLayer(panelId)?.layer
          if (panel?.type !== "panel" || !hasPrompt(panel)) return
          const seed =
            panel.lockSeed && panel.seed !== undefined
              ? panel.seed + take - 1
              : randomSeed()
          setJobs((j) => ({ ...j, [panelId]: { startedAt, take, of: count } }))
          const project = editor.projectRef.current
          const result = await render(
            renderBody(panel, project, engineOf(panel, project.cast), seed),
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
            fit: "cover",
            imageZoom: 100,
            panX: 0,
            panY: 0,
          })
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setErrors((err) => ({
            ...err,
            [panelId]: e instanceof Error ? e.message : String(e),
          }))
        }
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
          let versions: PanelVersion[] = now.versions ?? []
          if (now.src && !versions.some((v) => v.src === now.src))
            versions = [
              {
                src: now.src,
                kind: "original",
                engine: now.engine,
                seed: now.seed,
              },
              ...versions,
            ]
          editor.update(panelId, {
            versions: [
              {
                src: result.src,
                kind: "engine" as const,
                engine: result.engine,
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
    const ids = editor.projectRef.current.pages.flatMap((page) =>
      page.layers
        .filter((l): l is PanelLayer => l.type === "panel" && hasPrompt(l))
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((l) => l.id)
    )
    for (const id of ids) await generate(id)
  }, [editor, generate])

  const cancel = React.useCallback((panelId: string) => {
    controllers.current.get(panelId)?.abort()
  }, [])

  return { jobs, takes, errors, generate, tryEngine, generateAll, cancel }
}

export type Generator = ReturnType<typeof useGenerator>
