import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  Cancel01Icon,
  ScanEyeIcon,
  Target02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { useOpenRouter } from "@/components/account/account-menu"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import {
  INSUFFICIENT_CREDITS,
  setCredits,
  useCredits,
} from "@/lib/credits-store"
import type { CheckVerdict } from "@/routes/api.check"

import { checkIssues, issueCount } from "./check"
import { messages } from "./check.messages"
import { Section } from "./controls"
import { loadImage } from "./edit-tools"
import { readingOrder } from "./layouts"
import type { Character, ComicPage, ComicProject, PanelLayer } from "./model"
import { aimedTails } from "./story"
import type { ComicEditor } from "./use-editor"

// The longest side sent to the check: enough to read faces, small to send.
const CHECK_SIDE = 1024

// Jobs live outside React so they survive the inspector remounting when
// the selection changes.
let state: {
  jobs: Record<string, AbortController>
  errors: Record<string, string>
} = { jobs: {}, errors: {} }
const listeners = new Set<() => void>()
function set(patch: Partial<typeof state>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
function useCheckState() {
  return React.useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state
  )
}

// The whole image, however the panel crops it, so the verdict holds when
// it's reframed. White behind transparency, as JPEG has no alpha.
async function panelImage(src: string) {
  const img = await loadImage(src)
  const s = Math.min(
    1,
    CHECK_SIDE / Math.max(img.naturalWidth, img.naturalHeight)
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(img.naturalWidth * s))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * s))
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return {
    image: canvas.toDataURL("image/jpeg", 0.85),
    imageWidth: img.naturalWidth,
    imageHeight: img.naturalHeight,
  }
}

export const checkError = (panelId: string) => state.errors[panelId]
export const cancelCheck = (panelId: string) => state.jobs[panelId]?.abort()

export async function runCheck(editor: ComicEditor, panelId: string) {
  if (state.jobs[panelId]) return false
  const panel = editor.findLayer(panelId)?.layer
  if (panel?.type !== "panel" || !panel.src) return false
  const controller = new AbortController()
  const { [panelId]: _, ...errors } = state.errors
  set({ jobs: { ...state.jobs, [panelId]: controller }, errors })
  try {
    const { image, imageWidth, imageHeight } = await panelImage(panel.src)
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        image,
        scene: [panel.prompt?.trim(), ...(panel.tags ?? [])]
          .filter(Boolean)
          .join(", "),
        cast: (editor.projectRef.current.cast ?? [])
          .filter((c) => panel.cast?.includes(c.id))
          .map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            tags: c.tags,
          })),
      }),
    })
    const credits = res.headers.get("x-credits")
    if (credits !== null) setCredits(Number(credits))
    const json = await res.json().catch(() => null)
    if (!res.ok)
      throw new Error(
        json?.code === INSUFFICIENT_CREDITS
          ? INSUFFICIENT_CREDITS
          : (json?.error ?? `HTTP ${res.status}`)
      )
    // A verdict on an image that has since been replaced says nothing.
    const now = editor.findLayer(panelId)?.layer
    if (now?.type !== "panel" || now.src !== panel.src) return false
    const check = json.check as CheckVerdict
    // Verdicts undo together, so a batch doesn't fill the history.
    editor.update(
      panelId,
      { check: { ...check, imageWidth, imageHeight } },
      "panel-check"
    )
    return true
  } catch (e) {
    if (!controller.signal.aborted)
      set({
        errors: {
          ...state.errors,
          [panelId]: e instanceof Error ? e.message : String(e),
        },
      })
    return false
  } finally {
    const { [panelId]: _, ...jobs } = state.jobs
    set({ jobs })
  }
}

const errorOf = (error: string | undefined) =>
  error === INSUFFICIENT_CREDITS ? "credits" : error

function pageOf(project: ComicProject, panelId: string) {
  return project.pages.find((p) => p.layers.some((l) => l.id === panelId))
}

function panelsOf(page: ComicPage) {
  return page.layers.filter(
    (l): l is PanelLayer => l.type === "panel" && !!l.src
  )
}

function CostHint({ count }: { count: number }) {
  const t = useT(messages)
  const openrouter = useOpenRouter()
  return (
    <span className="ms-auto text-xs text-muted-foreground tabular-nums">
      {openrouter ? t("openrouter") : t("cost", { count })}
    </span>
  )
}

function Finding({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

// The verdict on the selected panel, and the way to get one.
export function CheckSection({
  panel,
  editor,
}: {
  panel: PanelLayer
  editor: ComicEditor
}) {
  const t = useT(messages)
  const { jobs, errors } = useCheckState()
  const job = jobs[panel.id]
  const error = errorOf(errors[panel.id])
  const { project } = editor
  const cast = project.cast
  const layers = pageOf(project, panel.id)?.layers ?? []
  const check = panel.check
  const issues = checkIssues(panel, layers, cast)
  const tails = check ? aimedTails(panel, layers, cast) : []

  const aim = () => {
    const page = pageOf(editor.projectRef.current, panel.id)
    if (!page) return
    const next = new Map(tails.map((a) => [a.id, a]))
    editor.commitProject((p) => ({
      ...p,
      pages: p.pages.map((pg) =>
        pg.id === page.id
          ? {
              ...pg,
              layers: pg.layers.map((l) => {
                const tail = next.get(l.id)
                return tail && l.type === "bubble"
                  ? { ...l, tailX: tail.tailX, tailY: tail.tailY }
                  : l
              }),
            }
          : pg
      ),
    }))
  }

  return (
    <Section title={t("title")}>
      {job ? (
        <div className="flex gap-1.5">
          <Button variant="outline" className="flex-1" isDisabled>
            <Spinner data-icon="inline-start" />
            {t("checking")}
          </Button>
          <TooltipTrigger>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("cancel")}
              onPress={() => job.abort()}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
            <Tooltip>{t("cancel")}</Tooltip>
          </TooltipTrigger>
        </div>
      ) : (
        <Button
          variant="outline"
          className="justify-start"
          onPress={() => runCheck(editor, panel.id)}
        >
          <HugeiconsIcon
            icon={ScanEyeIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {check ? t("again") : t("check")}
          <CostHint count={COSTS.panel_check} />
        </Button>
      )}
      {check && issues && (
        <>
          <p className="text-xs text-muted-foreground">
            {t("people", { count: check.headcount })} ·{" "}
            {t("faces", { count: check.faces.length })}
          </p>
          {check.cast.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("seen", {
                names: (cast ?? [])
                  .filter((c) => check.cast.includes(c.id))
                  .map((c) => c.name)
                  .join(", "),
              })}
            </p>
          )}
          {issueCount(issues) ? (
            <ul className="flex flex-col gap-1">
              {issues.missing.length > 0 && (
                <Finding>
                  {t("missing", { names: issues.missing.join(", ") })}
                </Finding>
              )}
              {issues.unexpected > 0 && (
                <Finding>
                  {t("unexpected", { count: issues.unexpected })}
                </Finding>
              )}
              {issues.lettering && <Finding>{t("lettering")}</Finding>}
              {issues.covered > 0 && (
                <Finding>{t("covered", { count: issues.covered })}</Finding>
              )}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-xs">
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                className="size-3.5 text-emerald-600 dark:text-emerald-400"
              />
              {t("clean")}
            </p>
          )}
          {tails.length > 0 && (
            <Button variant="outline" className="justify-start" onPress={aim}>
              <HugeiconsIcon
                icon={Target02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("aim", { count: tails.length })}
            </Button>
          )}
        </>
      )}
      {error && (
        <p className="text-xs text-destructive">
          {error === "credits" ? t("errors.credits") : error}
        </p>
      )}
    </Section>
  )
}

// The slide's state in the page strip: what's flagged, or a tick once every
// panel with art has come back clean.
export function SlideCheckBadge({
  page,
  cast,
}: {
  page: ComicPage
  cast?: Character[]
}) {
  const t = useT(messages)
  const panels = panelsOf(page)
  if (!panels.some((p) => p.check)) return null
  const count = panels.reduce(
    (sum, p) => sum + issueCount(checkIssues(p, page.layers, cast)),
    0
  )
  if (!count && panels.some((p) => !p.check)) return null
  const label = count ? t("badge.issues", { count }) : t("badge.clean")
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-slot="slide-check"
      className={
        count
          ? "absolute start-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-sm bg-amber-500 px-0.5 text-[10px] font-medium text-black tabular-nums"
          : "absolute start-1.5 top-1.5 flex size-4 items-center justify-center rounded-sm bg-emerald-600 text-white"
      }
    >
      <HugeiconsIcon
        icon={count ? Alert02Icon : Tick02Icon}
        strokeWidth={2.5}
        className="size-3"
      />
      {count > 0 && count}
    </span>
  )
}

// `page` null means the whole carousel.
export type CheckScope = { page: number | null }

// Panels with art and no verdict yet, in reading order, slide by slide.
export function uncheckedPanels(project: ComicProject, page: number | null) {
  const pages =
    page === null ? project.pages : project.pages.slice(page, page + 1)
  return pages.flatMap((p) =>
    readingOrder(panelsOf(p), project.rtl)
      .filter((l) => !l.check)
      .map((l) => l.id)
  )
}

// Priced first: only panels without a verdict are read, one at a time, and
// the failed one stops the run. Nothing is redrawn; it only flags.
export function CheckDialog({
  editor,
  initial,
  onClose,
}: {
  editor: ComicEditor
  initial: CheckScope
  onClose: () => void
}) {
  const t = useT(messages)
  const balance = useCredits()
  const openrouter = useOpenRouter()
  const [wide, setWide] = React.useState(initial.page === null)
  const page = initial.page ?? editor.pageIndex
  const [progress, setProgress] = React.useState<{
    done: number
    total: number
    running: boolean
    failed?: { n: number; error: string }
  } | null>(null)
  const stopped = React.useRef(false)
  const running = !!progress?.running
  // Frozen for the run: finished panels drop out of the list as it goes.
  const [run, setRun] = React.useState<string[] | null>(null)
  const ids =
    run ?? uncheckedPanels(editor.projectRef.current, wide ? null : page)
  const cost = openrouter ? 0 : ids.length * COSTS.panel_check
  const short = balance !== null && balance < cost
  const flagged = (run ?? []).reduce((sum, id) => {
    const found = editor.findLayer(id)
    if (found?.layer.type !== "panel") return sum
    const layers = editor.project.pages[found.pageIndex]?.layers ?? []
    const n = issueCount(checkIssues(found.layer, layers, editor.project.cast))
    return sum + (n ? 1 : 0)
  }, 0)

  const start = async () => {
    stopped.current = false
    let done = 0
    setRun(ids)
    setProgress({ done, total: ids.length, running: true })
    for (const [i, id] of ids.entries()) {
      if (stopped.current) break
      if (await runCheck(editor, id)) done++
      else {
        const error = errorOf(state.errors[id])
        if (!stopped.current && error) {
          setProgress({
            done,
            total: ids.length,
            running: false,
            failed: {
              n: i + 1,
              error: error === "credits" ? t("errors.credits") : error,
            },
          })
          return
        }
      }
      setProgress({ done, total: ids.length, running: true })
    }
    setProgress({ done, total: ids.length, running: false })
  }

  const stop = () => {
    stopped.current = true
    for (const id of ids) state.jobs[id]?.abort()
  }

  return (
    <Dialog
      isOpen
      isDismissable={!running}
      onOpenChange={(open) => !open && !running && onClose()}
    >
      <DialogHeader>
        <DialogTitle>{t("dialog.title")}</DialogTitle>
        <DialogDescription>{t("dialog.description")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <ToggleGroup
          variant="outline"
          spacing={0}
          selectionMode="single"
          disallowEmptySelection
          className="w-full"
          isDisabled={!!run}
          selectedKeys={[wide ? "all" : "slide"]}
          onSelectionChange={(keys) => {
            const next = [...keys][0]
            if (next) setWide(next === "all")
          }}
        >
          <ToggleGroupItem id="slide" className="flex-1">
            {t("dialog.slide", { n: page + 1 })}
          </ToggleGroupItem>
          <ToggleGroupItem id="all" className="flex-1">
            {t("dialog.carousel")}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span>{t("dialog.panels", { count: ids.length })}</span>
          {!!ids.length && (
            <span className="text-muted-foreground tabular-nums">
              {openrouter
                ? t("openrouter")
                : t("dialog.estimate", { count: cost })}
            </span>
          )}
        </div>
        {balance !== null && !!ids.length && !openrouter && (
          <p
            className={
              short
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {short
              ? t("dialog.short")
              : t("dialog.balance", {
                  balance: t("cost", { count: balance }),
                })}
          </p>
        )}
        {progress && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {progress.running
              ? t("dialog.progress", {
                  done: Math.min(progress.done + 1, progress.total),
                  total: progress.total,
                })
              : t("dialog.done", { count: progress.done, flagged })}
          </p>
        )}
        {progress?.failed && (
          <p className="text-xs text-destructive">
            {t("dialog.failed", progress.failed)}
          </p>
        )}
      </div>
      <DialogFooter>
        {running ? (
          <Button variant="outline" onPress={stop}>
            <Spinner data-icon="inline-start" />
            {t("dialog.stop")}
          </Button>
        ) : (
          <>
            <Button variant="outline" onPress={onClose}>
              {t("dialog.close")}
            </Button>
            {!progress && (
              <Button isDisabled={!ids.length || short} onPress={start}>
                <HugeiconsIcon
                  icon={ScanEyeIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("dialog.start", { count: ids.length })}
              </Button>
            )}
          </>
        )}
      </DialogFooter>
    </Dialog>
  )
}
