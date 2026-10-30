import { readingOrder } from "./layouts"
import type { ComicProject, PanelLayer } from "./model"
import { readSetup } from "./setups"

// Runs that read as repetitive when swiped: one shot size this many panels
// in a row, or one size and angle.
export const SHOT_VARIETY = { size: 4, sizeAndAngle: 3 }

export interface Shot {
  framing: string | null
  angle: string | null
  // Slide index.
  page: number
}

export interface ShotRun {
  framing: string
  // Set when the whole run shares it too; "" is no angle, so eye level.
  angle: string | null
  count: number
  firstPage: number
  lastPage: number
}

// Runs of shots, in reading order, of one size: reported once each, with the
// angle when it never changes. A shot with no framing set ends a run, since
// nobody chose it yet.
export function repeatedShots(shots: Shot[]): ShotRun[] {
  const runs: ShotRun[] = []
  let i = 0
  while (i < shots.length) {
    const framing = shots[i]!.framing
    let j = i + 1
    while (j < shots.length && shots[j]!.framing === framing) j++
    const run = shots.slice(i, j)
    i = j
    if (!framing) continue
    const angle = run[0]!.angle ?? ""
    const same = run.every((s) => (s.angle ?? "") === angle)
    if (
      run.length >= SHOT_VARIETY.size ||
      (same && run.length >= SHOT_VARIETY.sizeAndAngle)
    )
      runs.push({
        framing,
        angle: same ? angle : null,
        count: run.length,
        firstPage: run[0]!.page,
        lastPage: run.at(-1)!.page,
      })
  }
  return runs
}

// Every visible panel of the carousel, slide by slide, as the reader meets it.
export function projectShots(project: ComicProject): Shot[] {
  return project.pages.flatMap((page, index) =>
    readingOrder(
      page.layers.filter(
        (l): l is PanelLayer => l.type === "panel" && !l.hidden
      ),
      project.rtl
    ).map((panel) => {
      const { framing, angle } = readSetup(panel)
      return { framing, angle, page: index }
    })
  )
}
