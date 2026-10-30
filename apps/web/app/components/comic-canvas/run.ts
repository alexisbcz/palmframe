import { COSTS } from "@/lib/credits"

import { checkIssues, issueCount } from "./check"
import { uncheckedPanels } from "./check-tools"
import { readingOrder } from "./layouts"
import {
  createPage,
  sheetReady,
  type Character,
  type ComicPage,
  type ComicProject,
  type Layer,
  type PanelLayer,
} from "./model"
import {
  bubblesFor,
  namedIn,
  panelCost,
  panelPatch,
  parseLines,
  renderCost,
  speakerFaces,
  type PanelDraft,
} from "./story"
import { hasPrompt, promptedPanels } from "./use-generator"

// What a carousel run still has to do. Nothing here remembers a run: every
// answer is read off the project, so a rerun, or a reload, finds the work
// that's left and can't pay for what is already there.

export const MAX_REROLLS = 3

export type RunStep = "plan" | "sheets" | "panels" | "letter" | "check"

export const RUN_STEPS: RunStep[] = [
  "plan",
  "sheets",
  "panels",
  "letter",
  "check",
]

// A frame with neither a shot nor art. Anything else keeps what it has.
export function unplannedPanels(project: ComicProject, page: ComicPage) {
  return readingOrder(
    page.layers.filter(
      (l): l is PanelLayer => l.type === "panel" && !l.src && !hasPrompt(l)
    ),
    project.rtl
  )
}

export const pagesToPlan = (project: ComicProject) =>
  project.pages.filter((p) => unplannedPanels(project, p).length)

export const panelsToDraw = (project: ComicProject) =>
  promptedPanels(project).filter((p) => !p.src)

function castToDraw(project: ComicProject) {
  const ids = new Set(panelsToDraw(project).flatMap((p) => p.cast ?? []))
  return (project.cast ?? []).filter((c) => ids.has(c.id))
}

// A sheet needs a look to draw from; the character dialog asks for one too.
export const sheetsToDraw = (project: ComicProject) =>
  castToDraw(project).filter((c) => !c.sheet && c.tags.length)

export const sheetsToApprove = (project: ComicProject) =>
  castToDraw(project).filter((c) => c.sheet && !sheetReady(c))

export const panelsToLetter = (project: ComicProject) =>
  project.pages.flatMap((page) =>
    page.layers.filter(
      (l): l is PanelLayer => l.type === "panel" && !!l.script?.trim()
    )
  )

// Faults a redraw can cure. Lettering over a face is the bubble's fault.
function artFlagged(panel: PanelLayer, page: ComicPage, cast?: Character[]) {
  const issues = checkIssues(panel, page.layers, cast)
  return (
    !!issues &&
    (!!issues.missing.length || !!issues.unexpected || issues.lettering)
  )
}

// Panels a run drew itself that came back flagged, with re-rolls left. A
// locked seed would only draw the same image again.
export function panelsToReroll(project: ComicProject, limit: number) {
  return project.pages.flatMap((page) =>
    page.layers.filter(
      (l): l is PanelLayer =>
        l.type === "panel" &&
        !!l.src &&
        !l.lockSeed &&
        l.rerolls !== undefined &&
        l.rerolls < limit &&
        artFlagged(l, page, project.cast)
    )
  )
}

export function flaggedPanels(project: ComicProject) {
  return project.pages.flatMap((page) =>
    page.layers.filter(
      (l) =>
        l.type === "panel" &&
        issueCount(checkIssues(l, page.layers, project.cast)) > 0
    )
  ).length
}

// The carousel with at least `slides` slides, new ones repeating the last grid.
export function withSlides(project: ComicProject, slides: number) {
  const pages = [...project.pages]
  while (pages.length < slides) pages.push(createPage(pages.at(-1)))
  return pages.length === project.pages.length ? project : { ...project, pages }
}

// The planner's shots on the frames still empty, whatever happened meanwhile.
// Lettering waits on the panel until its art is drawn.
export function withPlan(
  project: ComicProject,
  pageId: string,
  drafts: Record<string, PanelDraft>
): ComicProject {
  return {
    ...project,
    pages: project.pages.map((page) =>
      page.id !== pageId
        ? page
        : {
            ...page,
            layers: page.layers.map((l) => {
              const draft = drafts[l.id]
              if (!draft || l.type !== "panel" || l.src || hasPrompt(l))
                return l
              return {
                ...l,
                ...panelPatch(draft, project.cast),
                script: draft.lines.trim() || undefined,
              }
            }),
          }
    ),
  }
}

// Places all waiting lettering, as one undo step.
export function withLettering(project: ComicProject): ComicProject {
  return {
    ...project,
    pages: project.pages.map((page) => {
      const waiting = page.layers.filter(
        (l): l is PanelLayer => l.type === "panel" && !!l.script?.trim()
      )
      if (!waiting.length) return page
      const ids = new Set(waiting.map((p) => p.id))
      return {
        ...page,
        layers: [
          ...page.layers.map((l) =>
            ids.has(l.id) ? ({ ...l, script: undefined } as Layer) : l
          ),
          ...waiting.flatMap((p) =>
            bubblesFor(
              p,
              parseLines(p.script!, project.cast),
              !!project.rtl,
              speakerFaces(p, project.cast)
            )
          ),
        ],
      }
    }),
  }
}

// The project as the planner should leave it: each empty frame holds the
// story and everyone it names. That's the dearest it can be, as a panel drawn
// from a sheet costs more than one drawn from words.
function planned(project: ComicProject, story: string): ComicProject {
  if (!story) return project
  const cast = namedIn(story, project.cast)
  return {
    ...project,
    pages: project.pages.map((page) => {
      const open = new Set(unplannedPanels(project, page).map((p) => p.id))
      return {
        ...page,
        layers: page.layers.map((l) =>
          open.has(l.id) ? ({ ...l, prompt: story, cast } as Layer) : l
        ),
      }
    }),
  }
}

export interface RunQuote {
  // Slides to plan, sheets to draw and to approve, panels to draw, letter, check.
  counts: Record<RunStep, number> & { approve: number }
  costs: Record<RunStep, number>
  total: number
  // Whether a plan is still to come, so that `total` is a ceiling.
  estimated: boolean
  // What the re-rolls could add, on top of `total`.
  rerolls: number
  // Frames that stay empty, as there's no story for them.
  empty: number
  // Who gets drawn from words: they're in the shot but have no look to sheet.
  lookless: Character[]
  work: boolean
}

// What a run with these settings would still do and cost, before it spends
// anything. It follows the same rules as the run. The idea of pricing a run
// from the steps it would take is OpenManga's costPlan (lib/cost-plan.ts).
export function quoteRun(
  project: ComicProject,
  { story, rerolls }: { story: string; rerolls: number }
): RunQuote {
  const after = planned(project, story)
  const plans = story ? pagesToPlan(project).length : 0
  const sheets = sheetsToDraw(after)
  const approve = sheetsToApprove(after)
  // Sheets count as drawn and approved here: panels will be drawn from them.
  const ready = new Set([...sheets, ...approve].map((c) => c.id))
  const priced = {
    ...after,
    cast: after.cast?.map((c): Character =>
      ready.has(c.id)
        ? { ...c, sheet: c.sheet ?? "pending", status: "approved" }
        : c
    ),
  }
  const draw = panelsToDraw(priced)
  const checks = uncheckedPanels(project, null).length + draw.length
  const costs: RunQuote["costs"] = {
    plan: plans * COSTS.story_plan,
    sheets: sheets.length * COSTS.sheet,
    panels: renderCost(draw, priced),
    letter: 0,
    check: checks * COSTS.panel_check,
  }
  const counts = {
    plan: plans,
    sheets: sheets.length,
    approve: approve.length,
    panels: draw.length,
    letter: panelsToLetter(project).length,
    check: checks,
  }
  const open = priced.pages.flatMap((page) =>
    page.layers.filter(
      (l): l is PanelLayer =>
        l.type === "panel" &&
        hasPrompt(l) &&
        !l.lockSeed &&
        (!l.src ||
          (l.rerolls !== undefined &&
            (!l.check || artFlagged(l, page, project.cast))))
    )
  )
  return {
    counts,
    costs,
    total: Object.values(costs).reduce((sum, n) => sum + n, 0),
    estimated: plans > 0,
    rerolls: open.reduce(
      (sum, p) =>
        sum +
        Math.max(0, rerolls - (p.rerolls ?? 0)) *
          (panelCost(p, priced) + COSTS.panel_check),
      0
    ),
    empty: project.pages.reduce(
      (sum, p) => sum + unplannedPanels(project, p).length,
      0
    ),
    lookless: castToDraw(after).filter((c) => !c.sheet && !c.tags.length),
    work: Object.values(counts).some(Boolean),
  }
}
