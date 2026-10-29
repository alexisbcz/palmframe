import * as React from "react"

import { TAG_GROUPS, sortTags } from "./anima-tags"
import {
  DEFAULT_LOOK,
  createPanel,
  type Character,
  type Look,
  type PaletteId,
  type PanelLayer,
  type StyleId,
} from "./model"
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
    // Whether the palette and saturation controls mean anything for it.
    palette: boolean
    saturation: boolean
  }
> = {
  graphic: {
    tags: `limited palette, (flat color:1.2), ${COMIC}, black outline`,
    negative: "gradient, photo, realistic, 3d",
    palette: true,
    saturation: true,
  },
  color: {
    tags: "comic, western comics (style), flat color, bold lines, black outline, heavy black shadows, spot blacks",
    negative: "gradient, soft shading, photo, realistic, 3d",
    palette: true,
    saturation: true,
  },
  retro: {
    tags: "retro artstyle, 1990s (style), halftone, comic, western comics (style), flat color, limited palette, bold lines, black outline",
    negative: "gradient, photo, realistic, 3d",
    palette: true,
    saturation: true,
  },
  // Greyscale with one colour. Anima only colours what is named, so the
  // panel says what carries it (spotOn), e.g. "red hoodie".
  spot: {
    tags: "(monochrome:1.2), greyscale, (spot color:1.5), comic, western comics (style), (high contrast:1.3), heavy black shadows, bold lines",
    negative: "photo, realistic, 3d",
    palette: true,
    saturation: false,
  },
  noir: {
    tags: `monochrome, greyscale, traditional media, ${COMIC}`,
    negative: "color, colorful, gradient, soft shading, photo, realistic, 3d",
    palette: false,
    saturation: false,
  },
  anime: {
    tags: "anime screencap, anime coloring",
    negative: "photo, realistic, 3d, sketch",
    palette: true,
    saturation: true,
  },
  raw: {
    tags: "",
    negative: "",
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
  },
  signal?: AbortSignal
) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error ?? `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const img = await readImageFile(
    new File([blob], "panel.png", { type: blob.type })
  )
  return { src: img.src, ms: Number(res.headers.get("x-render-ms")) || 0 }
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

export interface Take {
  src: string
  seed: number
  ms: number
}

export interface Job {
  startedAt: number
  take: number
  of: number
}

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
          const result = await render(
            {
              ...buildPrompt(panel, editor.projectRef.current),
              ...renderSize(panel.width, panel.height),
              seed,
              steps: panel.steps ?? DEFAULT_STEPS,
            },
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

  return { jobs, takes, errors, generate, generateAll, cancel }
}

export type Generator = ReturnType<typeof useGenerator>
