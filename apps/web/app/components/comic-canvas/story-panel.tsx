import * as React from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BookOpen01Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import { useOpenRouter } from "@/components/account/account-menu"
import { openSettings } from "@/components/settings/settings-dialog"
import { useT } from "@/i18n/core"
import {
  INSUFFICIENT_CREDITS,
  setCredits,
  useCredits,
} from "@/lib/credits-store"
import type { PlannedPanel } from "@/routes/api.story"

import { Avatar } from "./cast"
import { LayoutPicker } from "./layout-picker"
import { readingOrder } from "./layouts"
import type { Character, ComicProject, Layer, PanelLayer } from "./model"
import {
  bubblesFor,
  draftFromPlan,
  draftOf,
  panelPatch,
  parseLines,
  recapOf,
  renderCost,
  speakerFaces,
  type PanelDraft,
} from "./story"
import type { SeriesContext } from "./series"
import { messages } from "./story.messages"
import { TagField } from "./tag-field"
import type { ComicEditor } from "./use-editor"
import { hasPrompt, type Generator } from "./use-generator"

// Everything the dialog holds for one slide. Keyed by page id, so a plan or
// a render that finishes after a slide change lands on its own slide only.
interface PageStory {
  story: string
  drafts: Record<string, PanelDraft>
  // Bubbles the planner placed, by panel, so applying again replaces them.
  bubbles: Record<string, string[]>
  // Bumped when a plan arrives, to reset the panel cards' fields.
  version: number
  planning: boolean
  error: string | null
  applied: boolean
}

const EMPTY: PageStory = {
  story: "",
  drafts: {},
  bubbles: {},
  version: 0,
  planning: false,
  error: null,
  applied: false,
}

const linkClass = "font-medium underline underline-offset-2"

function panelsOf(project: ComicProject, pageId: string) {
  const page = project.pages.find((p) => p.id === pageId)
  if (!page) return null
  return readingOrder(
    page.layers.filter((l): l is PanelLayer => l.type === "panel"),
    project.rtl
  )
}

function useStory(
  editor: ComicEditor,
  generator: Generator,
  series: SeriesContext | null
) {
  const [pages, setPages] = React.useState<Record<string, PageStory>>({})
  const [info, setInfo] = React.useState<{
    available: boolean
    cost: number
  } | null>(null)
  const [rendering, setRendering] = React.useState<{
    pageId: string
    ids: string[]
    done: number
  } | null>(null)
  const stopped = React.useRef(false)
  const controllers = React.useRef(new Map<string, AbortController>())

  React.useEffect(() => {
    fetch("/api/story")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json && setInfo(json))
      .catch(() => {})
    const running = controllers.current
    return () => running.forEach((c) => c.abort())
  }, [])

  const patch = React.useCallback(
    (pageId: string, fn: (s: PageStory) => Partial<PageStory>) =>
      setPages((all) => {
        const s = all[pageId] ?? EMPTY
        return { ...all, [pageId]: { ...s, ...fn(s) } }
      }),
    []
  )

  const plan = React.useCallback(
    async (pageId: string, story: string) => {
      const project = editor.projectRef.current
      const pageIndex = project.pages.findIndex((p) => p.id === pageId)
      const panels = panelsOf(project, pageId)
      if (!panels?.length || controllers.current.has(pageId)) return
      // The frames this plan is for; if they change meanwhile, it's dropped.
      const frames = panels.map((p) => p.id).join(",")
      const controller = new AbortController()
      controllers.current.set(pageId, controller)
      patch(pageId, () => ({ planning: true, error: null, applied: false }))
      try {
        const res = await fetch("/api/story", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            story,
            panels: panels.map((p) => ({
              id: p.id,
              width: p.width,
              height: p.height,
            })),
            cast: (project.cast ?? []).map((c) => ({
              name: c.name,
              kind: c.kind,
              tags: c.tags,
            })),
            style: project.look?.style ?? "graphic",
            rtl: !!project.rtl,
            recap: recapOf(project, pageIndex),
            ...(series && {
              previous: series.previous,
              facts: series.facts,
            }),
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
        const now = panelsOf(editor.projectRef.current, pageId)
        if (!now || now.map((p) => p.id).join(",") !== frames)
          throw new Error("changed")
        const cast = editor.projectRef.current.cast
        const drafts = Object.fromEntries(
          (json.panels as PlannedPanel[]).map((p) => [
            p.panel_id,
            draftFromPlan(p, cast, json.prompt),
          ])
        )
        patch(pageId, (s) => ({
          drafts: { ...s.drafts, ...drafts },
          version: s.version + 1,
        }))
      } catch (e) {
        if (!controller.signal.aborted)
          patch(pageId, () => ({
            error: e instanceof Error ? e.message : String(e),
          }))
      } finally {
        controllers.current.delete(pageId)
        patch(pageId, () => ({ planning: false }))
      }
    },
    [editor, patch, series]
  )

  // Writes the drafts into their own slide, as one undo step: shots into the
  // panels, lettering as bubbles. Returns the panels that now have a prompt.
  const apply = React.useCallback(
    (pageId: string, state: PageStory) => {
      const project = editor.projectRef.current
      const cast = project.cast ?? []
      const panels = panelsOf(project, pageId)
      if (!panels) return []
      const placed: Record<string, string[]> = {}
      const stale = new Set(Object.values(state.bubbles).flat())
      const patched = new Map<string, PanelLayer>()
      const added: Layer[] = []
      for (const panel of panels) {
        const draft = state.drafts[panel.id]
        if (!draft) continue
        const next = { ...panel, ...panelPatch(draft, cast) }
        patched.set(panel.id, next)
        const bubbles = bubblesFor(
          next,
          parseLines(draft.lines, cast),
          !!project.rtl,
          speakerFaces(next, cast)
        )
        placed[panel.id] = bubbles.map((b) => b.id)
        added.push(...bubbles)
      }
      editor.commitProject((p) => ({
        ...p,
        pages: p.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                layers: [
                  ...page.layers
                    .filter((l) => !stale.has(l.id))
                    .map((l) => patched.get(l.id) ?? l),
                  ...added,
                ],
              }
            : page
        ),
      }))
      patch(pageId, (s) => ({
        bubbles: { ...s.bubbles, ...placed },
        applied: true,
      }))
      return [...patched.values()].filter(hasPrompt)
    },
    [editor, patch]
  )

  // One panel at a time, in reading order. Renders are bound to panel ids,
  // so they land in their own slide whichever slide is showing.
  const render = React.useCallback(
    async (pageId: string, panels: PanelLayer[]) => {
      if (!panels.length) return
      stopped.current = false
      const ids = panels.map((p) => p.id)
      setRendering({ pageId, ids, done: 0 })
      for (const [i, id] of ids.entries()) {
        if (stopped.current) break
        await generator.generate(id)
        setRendering((r) => r && { ...r, done: i + 1 })
      }
      setRendering(null)
    },
    [generator]
  )

  const stop = React.useCallback(() => {
    stopped.current = true
    for (const id of rendering?.ids ?? []) generator.cancel(id)
  }, [generator, rendering])

  return { pages, patch, plan, apply, render, stop, rendering, info }
}

type Story = ReturnType<typeof useStory>

export function StoryButton({
  editor,
  generator,
  series = null,
}: {
  editor: ComicEditor
  generator: Generator
  series?: SeriesContext | null
}) {
  const t = useT(messages)
  const story = useStory(editor, generator, series)
  const [open, setOpen] = React.useState(false)
  const busy =
    !!story.rendering || Object.values(story.pages).some((p) => p.planning)
  return (
    <>
      <Button
        variant="outline"
        className="max-sm:px-2"
        onPress={() => setOpen(true)}
      >
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <HugeiconsIcon
            icon={BookOpen01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
        )}
        <span className="max-sm:sr-only">{t("button")}</span>
      </Button>
      {open && (
        <StoryDialog
          editor={editor}
          generator={generator}
          story={story}
          series={series}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function StoryDialog({
  editor,
  generator,
  story,
  series,
  onClose,
}: {
  editor: ComicEditor
  generator: Generator
  story: Story
  series: SeriesContext | null
  onClose: () => void
}) {
  const t = useT(messages)
  const balance = useCredits()
  const { project, pageIndex } = editor
  const page = project.pages[pageIndex]!
  const pageId = page.id
  const state = story.pages[pageId] ?? EMPTY
  const cast = project.cast ?? []
  const panels = panelsOf(project, pageId) ?? []
  const [tab, setTab] = React.useState<"story" | "script">(
    story.info?.available === false ? "script" : "story"
  )
  const available = !!story.info?.available
  const elsewhere = project.pages.findIndex(
    (p) => p.id !== pageId && story.pages[p.id]?.planning
  )
  const rendering = story.rendering

  const draft = (panel: PanelLayer) => state.drafts[panel.id] ?? draftOf(panel)
  const setDraft = (panel: PanelLayer, next: Partial<PanelDraft>) =>
    story.patch(pageId, (s) => ({
      drafts: {
        ...s.drafts,
        [panel.id]: { ...(s.drafts[panel.id] ?? draftOf(panel)), ...next },
      },
      applied: false,
    }))

  // What a render would cost once the drafts are applied.
  const toRender = panels
    .map((p) => ({ ...p, ...panelPatch(draft(p), cast) }))
    .filter(hasPrompt)
  const cost = renderCost(toRender, project)
  const openrouter = useOpenRouter()
  const short = !openrouter && balance !== null && balance < cost
  const nothing = !toRender.length && !panels.some((p) => draft(p).lines.trim())

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-3xl"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} />
          {t("title")}
        </DialogTitle>
        <DialogDescription>
          {t("description", { slide: pageIndex + 1, count: panels.length })}
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-4 flex max-h-[calc(100svh-19rem)] min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-1 sm:max-h-[calc(100svh-15rem)]">
        {!panels.length ? (
          <div className="flex flex-col gap-4">
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{t("noPanels.title")}</EmptyTitle>
                <EmptyDescription>{t("noPanels.description")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
            <LayoutPicker editor={editor} columns={5} />
          </div>
        ) : (
          <>
            <Tabs
              selectedKey={tab}
              onSelectionChange={(key) => setTab(key as "story" | "script")}
              className="gap-3"
            >
              <TabsList className="w-full">
                <TabsTrigger id="story">{t("tabs.story")}</TabsTrigger>
                <TabsTrigger id="script">{t("tabs.script")}</TabsTrigger>
              </TabsList>
              <TabsContent id="story" className="flex flex-col gap-2">
                {story.info && !available && (
                  <Alert>
                    <AlertTitle>{t("story.unavailableTitle")}</AlertTitle>
                    <AlertDescription>
                      {t("story.unavailable")}
                    </AlertDescription>
                  </Alert>
                )}
                <Textarea
                  aria-label={t("story.label")}
                  value={state.story}
                  onChange={(e) =>
                    story.patch(pageId, () => ({ story: e.target.value }))
                  }
                  placeholder={t("story.placeholder")}
                  disabled={!available}
                  className="min-h-28"
                  maxLength={6000}
                />
                <p className="text-xs text-muted-foreground">
                  {t("story.hint")}
                  {cast.length > 0 &&
                    ` (${cast.map((c) => c.name).join(", ")})`}
                </p>
                {series && (series.facts.length > 0 || series.previous) && (
                  <p className="text-xs text-muted-foreground">
                    {t("story.series", {
                      title: series.title || t("story.seriesUntitled"),
                      count: series.facts.length,
                    })}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {story.info && available && (
                    <span className="text-xs text-muted-foreground">
                      {openrouter
                        ? t("openrouterPlan")
                        : t("story.cost", {
                            count: story.info.cost,
                            n: story.info.cost,
                          })}
                    </span>
                  )}
                  <Button
                    variant="secondary"
                    isDisabled={
                      !available || !state.story.trim() || state.planning
                    }
                    onPress={() => story.plan(pageId, state.story)}
                  >
                    {state.planning ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <HugeiconsIcon
                        icon={SparklesIcon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                    )}
                    {state.planning
                      ? t("story.planning")
                      : t("story.plan", { count: panels.length })}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent id="script">
                <p className="text-xs text-muted-foreground">
                  {t("script.hint")}
                </p>
              </TabsContent>
            </Tabs>

            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error === INSUFFICIENT_CREDITS ? (
                  <>
                    {t("errors.insufficient")}{" "}
                    <Link
                      to="/pricing"
                      className={linkClass}
                      onClick={(e) => {
                        e.preventDefault()
                        openSettings("billing")
                      }}
                    >
                      {t("getMore")}
                    </Link>
                  </>
                ) : state.error === "changed" ? (
                  t("errors.changed")
                ) : (
                  t("errors.failed", { error: state.error })
                )}
              </p>
            )}
            {elsewhere >= 0 && (
              <p className="text-xs text-muted-foreground">
                {t("otherPage", { slide: elsewhere + 1 })}
              </p>
            )}

            <div className="flex gap-4">
              <PageMap project={project} panels={panels} />
              <ol className="flex min-w-0 flex-1 flex-col gap-3">
                {panels.map((panel, i) => (
                  <PanelCard
                    key={`${panel.id}:${state.version}`}
                    n={i + 1}
                    panel={panel}
                    draft={draft(panel)}
                    cast={cast}
                    busy={!!generator.jobs[panel.id]}
                    disabled={state.planning}
                    onChange={(next) => setDraft(panel, next)}
                  />
                ))}
              </ol>
            </div>
          </>
        )}
      </div>

      {panels.length > 0 && (
        <DialogFooter className="items-center sm:justify-between">
          <div className="flex flex-col text-xs text-muted-foreground">
            {rendering ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3" />
                {t("rendering", {
                  done: Math.min(rendering.done + 1, rendering.ids.length),
                  total: rendering.ids.length,
                })}
              </span>
            ) : state.applied ? (
              <span className="flex items-center gap-1.5 text-foreground">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                {t("applied", { slide: pageIndex + 1 })}
              </span>
            ) : (
              <span className="tabular-nums">
                {openrouter
                  ? t("openrouter", { count: toRender.length })
                  : t("estimate", { count: toRender.length, credits: cost })}
              </span>
            )}
            {balance !== null && !rendering && !openrouter && (
              <span className={cn(short && "text-destructive")}>
                {short ? (
                  <>
                    {t("insufficient")}{" "}
                    <Link
                      to="/pricing"
                      className={linkClass}
                      onClick={(e) => {
                        e.preventDefault()
                        openSettings("billing")
                      }}
                    >
                      {t("getMore")}
                    </Link>
                  </>
                ) : (
                  t("balance", { count: balance, n: balance })
                )}
              </span>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {rendering ? (
              <Button variant="outline" onPress={story.stop}>
                {t("stop")}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  isDisabled={nothing || state.planning}
                  onPress={() => story.apply(pageId, state)}
                >
                  {t("apply")}
                </Button>
                <Button
                  isDisabled={!toRender.length || state.planning || short}
                  onPress={() => {
                    const ready = story.apply(pageId, state)
                    story.render(pageId, ready)
                  }}
                >
                  <HugeiconsIcon
                    icon={SparklesIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("applyRender")}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      )}
    </Dialog>
  )
}

// The slide in miniature, panels numbered in reading order.
function PageMap({
  project,
  panels,
}: {
  project: ComicProject
  panels: PanelLayer[]
}) {
  return (
    <div
      aria-hidden
      className="sticky top-0 hidden w-28 shrink-0 self-start rounded-sm ring-1 ring-border sm:block"
      style={{
        aspectRatio: `${project.width} / ${project.height}`,
        background: project.background,
      }}
    >
      {panels.map((p, i) => (
        <div
          key={p.id}
          className="absolute flex items-center justify-center overflow-hidden rounded-[1px] bg-muted text-[10px] font-medium text-foreground/70 ring-1 ring-foreground/40"
          style={{
            left: `${(p.x / project.width) * 100}%`,
            top: `${(p.y / project.height) * 100}%`,
            width: `${(p.width / project.width) * 100}%`,
            height: `${(p.height / project.height) * 100}%`,
          }}
        >
          {p.src && (
            <img
              src={p.src}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-60"
            />
          )}
          <span className="relative">{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

function PanelCard({
  n,
  panel,
  draft,
  cast,
  busy,
  disabled,
  onChange,
}: {
  n: number
  panel: PanelLayer
  draft: PanelDraft
  cast: Character[]
  busy: boolean
  disabled: boolean
  onChange: (next: Partial<PanelDraft>) => void
}) {
  const t = useT(messages)
  const lines = parseLines(draft.lines, cast).length
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">{t("panel.title", { n })}</h4>
        {busy && <Spinner className="size-3.5" />}
        {cast.length > 0 && (
          <div
            role="group"
            aria-label={t("panel.cast")}
            className="ms-auto flex flex-wrap justify-end gap-1"
          >
            {cast.map((c) => {
              const on = draft.cast.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={t("panel.castMember", { name: c.name })}
                  title={c.name}
                  className={cn(
                    "flex h-7 cursor-pointer items-center gap-1.5 rounded-full py-0.5 ps-0.5 pe-2.5 text-xs ring-1 ring-border transition outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "bg-amber-500/15 font-medium ring-amber-500"
                      : "text-muted-foreground"
                  )}
                  onClick={() =>
                    onChange({
                      cast: on
                        ? draft.cast.filter((id) => id !== c.id)
                        : [...draft.cast, c.id],
                    })
                  }
                >
                  {c.portrait ? (
                    <Avatar character={c} className="size-6" />
                  ) : (
                    <span className="w-1.5" />
                  )}
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <Textarea
        aria-label={t("panel.scene")}
        placeholder={t("panel.scenePlaceholder")}
        value={draft.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        className="min-h-14"
      />
      <TagField
        tags={draft.tags}
        onChange={(tags) => onChange({ tags })}
        placeholder={t("panel.tags")}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("panel.lines")}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("panel.bubbles", { count: lines })}
          </span>
        </div>
        <Textarea
          aria-label={t("panel.lines")}
          placeholder={t("panel.linesPlaceholder")}
          value={draft.lines}
          onChange={(e) => onChange({ lines: e.target.value })}
          className="min-h-14 font-mono text-xs md:text-xs"
        />
      </div>
    </li>
  )
}
