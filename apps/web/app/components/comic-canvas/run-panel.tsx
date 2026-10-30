import * as React from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

import { useOpenRouter } from "@/components/account/account-menu"
import { openSettings } from "@/components/settings/settings-dialog"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import {
  INSUFFICIENT_CREDITS,
  getCredits,
  useCredits,
} from "@/lib/credits-store"
import { INSTAGRAM_LIMITS } from "@/lib/instagram-limits"

import {
  cancelCheck,
  checkError,
  runCheck,
  uncheckedPanels,
} from "./check-tools"
import type { Character } from "./model"
import {
  MAX_REROLLS,
  RUN_STEPS,
  flaggedPanels,
  pagesToPlan,
  panelsToDraw,
  panelsToReroll,
  quoteRun,
  sheetsToApprove,
  sheetsToDraw,
  unplannedPanels,
  withLettering,
  withPlan,
  withSlides,
  type RunStep,
} from "./run"
import { messages } from "./run.messages"
import { panelCost, requestPlan } from "./story"
import type { SeriesContext } from "./series"
import { useStoryInfo } from "./story-panel"
import type { ComicEditor } from "./use-editor"
import {
  randomSeed,
  renderSheet,
  withCurrentImage,
  type Generator,
} from "./use-generator"

type PauseAfter = "plan" | "panels" | "letter"

type RunState =
  | { phase: "idle" | "stopped" | "short" | "done" }
  | { phase: "running"; step: RunStep | "reroll"; done: number; total: number }
  // `price`: the plan came back dearer than the price the run started on.
  | { phase: "paused"; reason: PauseAfter | "sheets" | "price" }
  | { phase: "failed"; error: string }

export interface RunOptions {
  story: string
  // Re-rolls per flagged panel, so 0 is off.
  rerolls: number
  // For this run only: it's deliberately not kept with the project.
  autoApprove: boolean
  pauses: Record<PauseAfter, boolean>
  openrouter: boolean
}

// Runs in the tab, on top of the same calls the buttons make. There is no
// server-side job: closing the tab ends the run, and a rerun reads what's left
// off the project. A pause only follows a step that did work this time, so it
// doesn't come back on resuming. The review pause, and approving drafts when no
// review was asked for, follow OpenManga's production run (lib/production.ts).
function useRun(
  editor: ComicEditor,
  generator: Generator,
  series: SeriesContext | null
) {
  const [state, setState] = React.useState<RunState>({ phase: "idle" })
  const options = React.useRef<RunOptions | null>(null)
  const controller = React.useRef<AbortController | null>(null)
  // The credits the person last agreed to.
  const agreed = React.useRef(0)
  const latest = React.useRef(generator)
  latest.current = generator
  const seriesRef = React.useRef(series)
  seriesRef.current = series

  const drive = React.useCallback(async () => {
    const o = options.current
    if (!o) return
    const run = new AbortController()
    controller.current = run
    const { signal } = run
    const project = () => editor.projectRef.current
    const step = (step: RunStep | "reroll", done: number, total: number) =>
      setState({ phase: "running", step, done, total })
    // Checked before each charge, so a run never starts what it can't pay for.
    const afford = (cost: number) => {
      const balance = getCredits()
      if (!o.openrouter && balance !== null && balance < cost)
        throw new Error(INSUFFICIENT_CREDITS)
    }
    const stoppable = <T,>(cancel: () => void, work: Promise<T>) => {
      signal.addEventListener("abort", cancel, { once: true })
      return work.finally(() => signal.removeEventListener("abort", cancel))
    }
    const draw = async (
      id: string,
      patch: Parameters<Generator["generate"]>[2]
    ) => {
      const { generate, cancel } = latest.current
      const error = await stoppable(() => cancel(id), generate(id, 1, patch))
      if (error) throw new Error(error)
    }
    const check = async (id: string) => {
      const ok = await stoppable(() => cancelCheck(id), runCheck(editor, id))
      const error = !ok && !signal.aborted && checkError(id)
      if (error) throw new Error(error)
    }

    step("plan", 0, 1)
    try {
      agreed.current = quoteRun(project(), o).total
      afford(agreed.current)

      const pages = o.story ? pagesToPlan(project()) : []
      for (const [i, { id }] of pages.entries()) {
        step("plan", i, pages.length)
        const now = project()
        const index = now.pages.findIndex((p) => p.id === id)
        const panels = index < 0 ? [] : unplannedPanels(now, now.pages[index]!)
        if (!panels.length) continue
        afford(COSTS.story_plan)
        const drafts = await requestPlan(
          now,
          index,
          panels,
          o.story,
          signal,
          { slide: index + 1, slides: now.pages.length },
          seriesRef.current
        )
        editor.commitProject((p) => withPlan(p, id, drafts))
      }
      if (pages.length) {
        // Now the plan is known, the price is too.
        const { total } = quoteRun(project(), o)
        afford(total)
        const left = agreed.current - pages.length * COSTS.story_plan
        agreed.current = total
        if (total > left && !o.openrouter)
          return setState({ phase: "paused", reason: "price" })
        if (o.pauses.plan) return setState({ phase: "paused", reason: "plan" })
      }

      const sheets = sheetsToDraw(project())
      for (const [i, character] of sheets.entries()) {
        signal.throwIfAborted()
        step("sheets", i, sheets.length)
        afford(COSTS.sheet)
        const seed = character.seed ?? randomSeed()
        const sheet = await renderSheet(character, seed, project().look, signal)
        const now = project().cast?.find((c) => c.id === character.id)
        if (now) editor.saveCharacter({ ...now, sheet, seed, status: "draft" })
      }
      signal.throwIfAborted()

      // Panels only draw from approved sheets, so nothing goes on without them.
      const waiting = sheetsToApprove(project())
      if (waiting.length && !o.autoApprove)
        return setState({ phase: "paused", reason: "sheets" })
      for (const c of waiting)
        editor.saveCharacter({ ...c, status: "approved" }, "run-approve")

      const panels = panelsToDraw(project())
      for (const [i, { id }] of panels.entries()) {
        signal.throwIfAborted()
        const panel = editor.findLayer(id)?.layer
        if (panel?.type !== "panel" || panel.src) continue
        step("panels", i, panels.length)
        afford(panelCost(panel, project()))
        await draw(id, { rerolls: panel.rerolls ?? 0 })
      }
      signal.throwIfAborted()
      if (panels.length && o.pauses.panels)
        return setState({ phase: "paused", reason: "panels" })

      const lettered = project()
      editor.commitProject(withLettering)
      if (project() !== lettered && o.pauses.letter)
        return setState({ phase: "paused", reason: "letter" })

      const unchecked = uncheckedPanels(project(), null)
      for (const [i, id] of unchecked.entries()) {
        signal.throwIfAborted()
        step("check", i, unchecked.length)
        afford(COSTS.panel_check)
        await check(id)
      }
      signal.throwIfAborted()

      // Bounded per panel by what it has been re-rolled before, on any run.
      const flagged = panelsToReroll(project(), o.rerolls)
      for (const [i, { id }] of flagged.entries()) {
        for (;;) {
          signal.throwIfAborted()
          const panel = panelsToReroll(project(), o.rerolls).find(
            (p) => p.id === id
          )
          if (!panel) break
          step("reroll", i, flagged.length)
          afford(panelCost(panel, project()) + COSTS.panel_check)
          await draw(id, {
            rerolls: panel.rerolls! + 1,
            versions: withCurrentImage(panel),
          })
          signal.throwIfAborted()
          await check(id)
        }
      }
      setState({ phase: "done" })
    } catch (e) {
      if (signal.aborted) return setState({ phase: "stopped" })
      const error = e instanceof Error ? e.message : String(e)
      setState(
        error === INSUFFICIENT_CREDITS
          ? { phase: "short" }
          : { phase: "failed", error }
      )
    }
  }, [editor])

  const start = React.useCallback(
    (next: RunOptions, slides: number) => {
      options.current = next
      editor.commitProject((p) => ({
        ...withSlides(p, slides),
        story: next.story || p.story,
      }))
      void drive()
    },
    [editor, drive]
  )

  const stop = React.useCallback(() => {
    controller.current?.abort()
    setState((s) => (s.phase === "paused" ? { phase: "stopped" } : s))
  }, [])

  const running = state.phase === "running"

  // A render still in flight dies with the tab, so say so before it closes.
  React.useEffect(() => {
    if (!running) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [running])

  React.useEffect(() => () => controller.current?.abort(), [])

  return { state, start, resume: drive, stop }
}

type Run = ReturnType<typeof useRun>

export function RunButton({
  editor,
  generator,
  series = null,
}: {
  editor: ComicEditor
  generator: Generator
  series?: SeriesContext | null
}) {
  const t = useT(messages)
  const run = useRun(editor, generator, series)
  const [open, setOpen] = React.useState(false)
  const { phase } = run.state
  // Whatever it stops on needs the person, even if they closed the dialog.
  React.useEffect(() => {
    if (phase !== "idle" && phase !== "running") setOpen(true)
  }, [phase])
  return (
    <>
      <Button
        variant="outline"
        className="max-sm:px-2"
        onPress={() => setOpen(true)}
      >
        {phase === "running" ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <HugeiconsIcon
            icon={PlayIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
        )}
        <span className="max-sm:sr-only">{t("button")}</span>
      </Button>
      {open && (
        <RunDialog
          editor={editor}
          generator={generator}
          run={run}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function RunDialog({
  editor,
  generator,
  run,
  onClose,
}: {
  editor: ComicEditor
  generator: Generator
  run: Run
  onClose: () => void
}) {
  const t = useT(messages)
  const balance = useCredits()
  const openrouter = useOpenRouter()
  const info = useStoryInfo()
  const { project } = editor
  const { state } = run
  const running = state.phase === "running"
  const paused = state.phase === "paused"
  const locked = running || paused

  const [story, setStory] = React.useState(project.story ?? "")
  const [slides, setSlides] = React.useState(project.pages.length)
  const [rerolls, setRerolls] = React.useState(0)
  const [autoApprove, setAutoApprove] = React.useState(false)
  const [pauses, setPauses] = React.useState({
    plan: false,
    panels: false,
    letter: false,
  })
  const pauseRow = (id: PauseAfter) => (
    <Option
      label={t(`options.${id}`)}
      isSelected={pauses[id]}
      onChange={(on) => setPauses((p) => ({ ...p, [id]: on }))}
    />
  )

  const available = !!info?.available
  const planFrom = available ? story.trim() : ""
  const target = Math.max(project.pages.length, slides)
  const quote = React.useMemo(
    () =>
      quoteRun(locked ? project : withSlides(project, target), {
        story: planFrom,
        rerolls,
      }),
    [project, target, planFrom, rerolls, locked]
  )
  const short = !openrouter && balance !== null && balance < quote.total
  const busy = Object.keys(generator.jobs).length > 0
  const flagged = flaggedPanels(project)
  const waiting = paused ? sheetsToApprove(project) : []
  const review = state.phase === "paused" && state.reason === "sheets"

  const approve = (ids: Character[]) => {
    for (const c of ids)
      editor.saveCharacter({ ...c, status: "approved" }, "run-approve")
  }

  const getMore = (
    <Link
      to="/pricing"
      className="font-medium underline underline-offset-2"
      onClick={(e) => {
        e.preventDefault()
        openSettings("billing")
      }}
    >
      {t("getMore")}
    </Link>
  )

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-xl"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={PlayIcon} strokeWidth={2} />
          {t("title")}
        </DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="-mx-4 flex max-h-[calc(100svh-25rem)] min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-1 sm:max-h-[calc(100svh-15rem)]">
        <div className="flex flex-col gap-1.5">
          <Textarea
            aria-label={t("story")}
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder={t("storyPlaceholder")}
            disabled={locked || !available}
            className="min-h-24"
            maxLength={6000}
          />
          {info && !available && (
            <p className="text-xs text-muted-foreground">{t("noPlanner")}</p>
          )}
        </div>

        <ol className="flex flex-col gap-1.5" aria-label={t("stepsLabel")}>
          {RUN_STEPS.map((id) => {
            const active =
              state.phase === "running" &&
              (state.step === id || (id === "check" && state.step === "reroll"))
            const count = quote.counts[id]
            return (
              <li
                key={id}
                data-step={id}
                className="flex items-center gap-2 text-sm"
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {active ? (
                    <Spinner className="size-3.5" />
                  ) : !count ? (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="size-3.5 text-emerald-600 dark:text-emerald-400"
                    />
                  ) : (
                    <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    !count && !active && "text-muted-foreground"
                  )}
                >
                  {t(`steps.${id}`, { count })}
                </span>
                {!!count && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {openrouter
                      ? null
                      : quote.costs[id]
                        ? t("credits", {
                            count: quote.costs[id],
                            n: quote.costs[id],
                          })
                        : t("free")}
                  </span>
                )}
              </li>
            )
          })}
        </ol>

        {(!!quote.counts.approve && !review) ||
        !!quote.lookless.length ||
        (!planFrom && !!quote.empty) ? (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {!!quote.counts.approve && !review && (
              <li>
                {t("approveNote", {
                  count: quote.counts.approve,
                  n: quote.counts.approve,
                })}
              </li>
            )}
            {!!quote.lookless.length && (
              <li>
                {t("looklessNote", {
                  names: quote.lookless.map((c) => c.name).join(", "),
                })}
              </li>
            )}
            {!planFrom && !!quote.empty && (
              <li>{t("emptyNote", { count: quote.empty, n: quote.empty })}</li>
            )}
          </ul>
        ) : null}

        {review && (
          <SheetReview
            editor={editor}
            sheets={waiting}
            onApprove={(c) => approve([c])}
          />
        )}

        {!locked && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <label className="flex items-center justify-between gap-3 text-xs">
              {t("options.slides")}
              <Input
                type="number"
                className="w-20 tabular-nums"
                min={project.pages.length}
                max={Math.max(project.pages.length, INSTAGRAM_LIMITS.slides)}
                value={target}
                onChange={(e) =>
                  setSlides(
                    Math.min(
                      Math.max(project.pages.length, INSTAGRAM_LIMITS.slides),
                      Number(e.target.value) || 0
                    )
                  )
                }
              />
            </label>
            {pauseRow("plan")}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs">{t("options.sheets")}</span>
              <ToggleGroup
                size="sm"
                variant="outline"
                spacing={0}
                selectionMode="single"
                disallowEmptySelection
                className="w-full"
                aria-label={t("options.sheets")}
                selectedKeys={[autoApprove ? "auto" : "pause"]}
                onSelectionChange={(keys) => {
                  const next = [...keys][0]
                  if (next) setAutoApprove(next === "auto")
                }}
              >
                <ToggleGroupItem id="pause" className="flex-1">
                  {t("options.sheetsPause")}
                </ToggleGroupItem>
                <ToggleGroupItem id="auto" className="flex-1">
                  {t("options.sheetsAuto")}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {pauseRow("panels")}
            {pauseRow("letter")}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs">{t("options.rerolls")}</span>
              <ToggleGroup
                size="sm"
                variant="outline"
                spacing={0}
                selectionMode="single"
                disallowEmptySelection
                className="w-full"
                aria-label={t("options.rerolls")}
                selectedKeys={[String(rerolls)]}
                onSelectionChange={(keys) => {
                  const next = [...keys][0]
                  if (next !== undefined) setRerolls(Number(next))
                }}
              >
                {Array.from({ length: MAX_REROLLS + 1 }, (_, n) => (
                  <ToggleGroupItem key={n} id={String(n)} className="flex-1">
                    {n ? n : t("options.rerollsOff")}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-[11px] text-muted-foreground">
                {t("options.rerollsHelp")}
              </p>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <div className="flex flex-col text-xs text-muted-foreground">
          <p aria-live="polite" data-slot="run-status">
            {state.phase === "running" && (
              <span className="text-foreground tabular-nums">
                {t(`progress.${state.step}`, {
                  done: Math.min(state.done + 1, state.total),
                  total: state.total,
                })}
              </span>
            )}
            {state.phase === "paused" &&
              (state.reason === "price"
                ? t("paused.price", { credits: quote.total })
                : t(`paused.${state.reason}`))}
            {state.phase === "stopped" && t("stopped")}
            {state.phase === "done" &&
              (quote.work
                ? t("incomplete")
                : t("done", { count: flagged, n: flagged }))}
            {state.phase === "failed" && (
              <span className="text-destructive">
                {t("failed", { error: state.error })}
              </span>
            )}
            {state.phase === "short" && (
              <span className="text-destructive">
                {t("short")} {getMore}
              </span>
            )}
          </p>
          {openrouter ? (
            <span>{t("openrouter")}</span>
          ) : (
            <span className="tabular-nums" data-slot="run-total">
              {t(quote.estimated ? "totalCeiling" : "total", {
                count: quote.total,
                n: quote.total,
              })}
            </span>
          )}
          {!!quote.rerolls && !openrouter && (
            <span className="tabular-nums">
              {t("rerollExtra", { count: quote.rerolls, n: quote.rerolls })}
            </span>
          )}
          {balance !== null && !openrouter && (
            <span className={cn(short && "text-destructive")}>
              {short && state.phase !== "short" ? (
                <>
                  {t("short")} {getMore}
                </>
              ) : (
                t("balance", { count: balance, n: balance })
              )}
            </span>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {running ? (
            <Button variant="outline" onPress={run.stop}>
              <Spinner data-icon="inline-start" />
              {t("stop")}
            </Button>
          ) : paused ? (
            <>
              <Button variant="outline" onPress={run.stop}>
                {t("stop")}
              </Button>
              {review && waiting.length ? (
                <Button
                  onPress={() => {
                    approve(waiting)
                    void run.resume()
                  }}
                >
                  {t("approveAll", {
                    count: waiting.length,
                    n: waiting.length,
                  })}
                </Button>
              ) : (
                <Button isDisabled={short} onPress={() => void run.resume()}>
                  {t("continue")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onPress={onClose}>
                {t("close")}
              </Button>
              <Button
                isDisabled={!quote.work || short || busy}
                onPress={() =>
                  run.start(
                    {
                      story: planFrom,
                      rerolls,
                      autoApprove,
                      pauses,
                      openrouter,
                    },
                    target
                  )
                }
              >
                <HugeiconsIcon
                  icon={SparklesIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t(state.phase === "idle" ? "start" : "rerun")}
              </Button>
            </>
          )}
        </div>
      </DialogFooter>
    </Dialog>
  )
}

function Option({
  label,
  isSelected,
  onChange,
}: {
  label: string
  isSelected: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      {label}
      <Switch
        size="sm"
        aria-label={label}
        isSelected={isSelected}
        onChange={onChange}
      />
    </div>
  )
}

// The drafts a run stopped for, to approve or redraw before panels use them.
function SheetReview({
  editor,
  sheets,
  onApprove,
}: {
  editor: ComicEditor
  sheets: Character[]
  onApprove: (c: Character) => void
}) {
  const t = useT(messages)
  const [redrawing, setRedrawing] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const redraw = async (character: Character) => {
    const seed = randomSeed()
    setRedrawing(character.id)
    setError(null)
    try {
      const sheet = await renderSheet(character, seed, editor.project.look)
      const now = editor.projectRef.current.cast?.find(
        (c) => c.id === character.id
      )
      if (now) editor.saveCharacter({ ...now, sheet, seed, status: "draft" })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRedrawing(null)
    }
  }

  return (
    <div className="flex flex-col gap-2" data-slot="run-review">
      {sheets.map((c) => (
        <div
          key={c.id}
          className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 rounded-lg p-2 ring-1 ring-foreground/10"
        >
          <div className="relative aspect-[3/2] overflow-hidden rounded bg-muted">
            <img
              src={c.sheet}
              alt={t("review.sheetOf", { name: c.name })}
              className="size-full object-contain"
            />
            {redrawing === c.id && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Spinner />
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="truncate text-sm font-medium">{c.name}</span>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                isDisabled={!!redrawing}
                onPress={() => onApprove(c)}
              >
                {t("review.approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                isDisabled={!!redrawing}
                onPress={() => void redraw(c)}
              >
                {t("review.redraw", { credits: COSTS.sheet })}
              </Button>
            </div>
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error === INSUFFICIENT_CREDITS ? t("short") : t("failed", { error })}
        </p>
      )}
    </div>
  )
}
