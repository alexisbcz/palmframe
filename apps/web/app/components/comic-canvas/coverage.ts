import { guidePng, loadImage } from "./guide"
import { PRESETS, presetRects } from "./layouts"
import {
  createPanel,
  uid,
  type ComicPage,
  type ComicProject,
  type PanelLayer,
} from "./model"
import { setDimension } from "./setups"

export type CoverageCellId =
  | "wide"
  | "full"
  | "medium"
  | "close"
  | "extreme"
  | "shoulder"
  | "insert"
  | "low"
  | "high"

// The nine setups, in grid order. `prose` asks for the cell, the tags are
// what a picked cell sets on its panel. Setups follow OpenManga's.
export const COVERAGE_CELLS: {
  id: CoverageCellId
  prose: string
  framing: string
  angle: string | null
}[] = [
  {
    id: "wide",
    prose: "wide shot, the whole setting and everyone in it",
    framing: "wide shot",
    angle: null,
  },
  {
    id: "full",
    prose: "full shot, whole figures head to toe",
    framing: "full body",
    angle: null,
  },
  {
    id: "medium",
    prose: "medium shot, waist up",
    framing: "upper body",
    angle: null,
  },
  {
    id: "close",
    prose: "close-up, the main face fills the cell",
    framing: "close-up",
    angle: null,
  },
  {
    id: "extreme",
    prose: "extreme close-up of the eyes, hands or one telling detail",
    framing: "close-up",
    angle: null,
  },
  {
    id: "shoulder",
    prose: "over the shoulder, past one figure toward what they look at",
    framing: "upper body",
    angle: "from behind",
  },
  {
    id: "insert",
    prose: "insert, the key object or detail of the moment",
    framing: "close-up",
    angle: "from above",
  },
  {
    id: "low",
    prose: "low angle, the camera low and looking up",
    framing: "upper body",
    angle: "from below",
  },
  {
    id: "high",
    prose: "high angle, the camera high and looking down",
    framing: "upper body",
    angle: "from above",
  },
]

// A cell of the 3×3 sheet, trimmed so the gutters stay out of the guide.
// Ported from OpenManga's gridCell (Apache-2.0).
export function cellRect(
  width: number,
  height: number,
  index: number,
  inset = 0.03
) {
  const cw = width / 3
  const ch = height / 3
  return {
    x: Math.round((index % 3) * cw + cw * inset),
    y: Math.round(Math.floor(index / 3) * ch + ch * inset),
    width: Math.max(1, Math.round(cw * (1 - 2 * inset))),
    height: Math.max(1, Math.round(ch * (1 - 2 * inset))),
  }
}

export async function cropCell(sheet: string, index: number) {
  const img = await loadImage(sheet)
  return guidePng(img, cellRect(img.naturalWidth, img.naturalHeight, index))
}

// The tags and strict guide a picked cell gives a panel.
export function cellPatch(panel: PanelLayer, index: number, src: string) {
  const cell = COVERAGE_CELLS[index]!
  return {
    guide: { src, strength: "strict" as const },
    tags: setDimension(
      setDimension(panel.tags ?? [], "framing", cell.framing),
      "angle",
      cell.angle
    ),
  }
}

// Page layouts by panel count; a slide takes up to four picks.
const SLIDE_LAYOUTS = ["splash", "two-tiers", "three-tiers", "grid"]

// Picked cells as new slides of panels, ready to draw. Each panel keeps the
// source panel's direction and takes its cell as a strict guide.
export function coverageSlides(
  panel: PanelLayer,
  picks: { index: number; src: string }[],
  project: Pick<ComicProject, "width" | "height" | "rtl">
): ComicPage[] {
  const slides: ComicPage[] = []
  for (let i = 0; i < picks.length; i += SLIDE_LAYOUTS.length) {
    const group = picks.slice(i, i + SLIDE_LAYOUTS.length)
    const preset = PRESETS.find(
      (p) => p.id === SLIDE_LAYOUTS[group.length - 1]
    )!
    const rects = presetRects(preset, project, project.rtl)
    slides.push({
      id: uid(),
      layers: group.map((pick, n) => ({
        ...createPanel(rects[n]!),
        name: `Panel ${n + 1}`,
        borderWidth: panel.borderWidth,
        borderColor: panel.borderColor,
        radius: panel.radius,
        fill: panel.fill,
        cast: panel.cast,
        prompt: panel.prompt,
        negative: panel.negative,
        style: panel.style,
        palette: panel.palette,
        spotOn: panel.spotOn,
        steps: panel.steps,
        ...cellPatch(panel, pick.index, pick.src),
      })),
    })
  }
  return slides
}
