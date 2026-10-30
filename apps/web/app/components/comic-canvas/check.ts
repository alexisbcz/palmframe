import { imageGeometry } from "./edit-tools"
import type { Character, FaceBox, Layer, PanelLayer, Rect } from "./model"

// Reading a panel check: where its faces land on the page, and what is worth
// a look. All of it is worked out live, so moving a bubble clears a warning.

// Lettering may hide this much of a face before it's flagged.
const COVERED_SHARE = 0.3
// The rectangle with an ellipse's area, to compare balloons with faces.
const ELLIPSE = Math.sqrt(Math.PI) / 2

export type PageFace = Rect & Pick<FaceBox, "who">

// The checked faces in page coordinates: through the panel's framing and
// flips, cut to its frame, around its rotation. Faces cropped out are gone.
export function pageFaces(panel: PanelLayer): PageFace[] {
  const check = panel.check
  if (!check) return []
  const g = imageGeometry(panel, check.imageWidth, check.imageHeight)
  const hw = panel.width / 2
  const hh = panel.height / 2
  const cos = Math.cos((panel.rotation * Math.PI) / 180)
  const sin = Math.sin((panel.rotation * Math.PI) / 180)
  return check.faces.flatMap((f) => {
    let x0 = g.x + f.x * g.w
    let x1 = x0 + f.width * g.w
    let y0 = g.y + f.y * g.h
    let y1 = y0 + f.height * g.h
    if (panel.flipX) [x0, x1] = [-x1, -x0]
    if (panel.flipY) [y0, y1] = [-y1, -y0]
    x0 = Math.max(x0, -hw)
    x1 = Math.min(x1, hw)
    y0 = Math.max(y0, -hh)
    y1 = Math.min(y1, hh)
    if (x1 <= x0 || y1 <= y0) return []
    const corners = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as const
    const xs = corners.map(([x, y]) => x * cos - y * sin)
    const ys = corners.map(([x, y]) => x * sin + y * cos)
    const left = Math.min(...xs)
    const top = Math.min(...ys)
    return [
      {
        x: panel.x + hw + left,
        y: panel.y + hh + top,
        width: Math.max(...xs) - left,
        height: Math.max(...ys) - top,
        who: f.who,
      },
    ]
  })
}

function overlap(a: Rect, b: Rect) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  )
}

// The faces that some box hides by more than `share` of their area.
export function coveredFaces<T extends Rect>(
  faces: T[],
  boxes: Rect[],
  share = COVERED_SHARE
) {
  return faces.filter((f) =>
    boxes.some((b) => overlap(f, b) > share * f.width * f.height)
  )
}

// Balloons and SFX drawn over the panel, as boxes. Ellipses are narrowed to
// their area; rotation is ignored.
function letteringOver(panel: PanelLayer, layers: Layer[]): Rect[] {
  return layers.slice(layers.indexOf(panel) + 1).flatMap((l) => {
    if (l.hidden || l.type === "panel") return []
    const round =
      l.type === "bubble" && l.shape !== "caption" && l.shape !== "message"
    const k = round ? ELLIPSE : 1
    return [
      {
        x: l.x + (l.width * (1 - k)) / 2,
        y: l.y + (l.height * (1 - k)) / 2,
        width: l.width * k,
        height: l.height * k,
      },
    ]
  })
}

export interface CheckIssues {
  // Names of cast members the check didn't see.
  missing: string[]
  unexpected: number
  lettering: boolean
  covered: number
}

// What the verdict flags against the panel as it stands. A panel with no
// cast has nobody to miss and nobody to be surprised by.
export function checkIssues(
  panel: PanelLayer,
  layers: Layer[],
  cast: Character[] = []
): CheckIssues | null {
  const check = panel.check
  if (!check) return null
  const casted = cast.filter((c) => panel.cast?.includes(c.id))
  return {
    missing: casted
      .filter((c) => !check.cast.includes(c.id))
      .map((c) => c.name),
    unexpected: casted.length ? check.unexpected : 0,
    lettering: check.lettering,
    covered: coveredFaces(pageFaces(panel), letteringOver(panel, layers))
      .length,
  }
}

export const issueCount = (i: CheckIssues | null) =>
  i ? i.missing.length + i.unexpected + (i.lettering ? 1 : 0) + i.covered : 0
