import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  LibraryIcon,
  PlusSignIcon,
  ScanEyeIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { useOpenRouter } from "@/components/account/account-menu"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import {
  INSUFFICIENT_CREDITS,
  setCredits,
  useCredits,
} from "@/lib/credits-store"
import type { SeriesSummary } from "@/lib/series.server"
import type { Contradiction } from "@/routes/api.series.check"

import type { ComicProject } from "./model"
import {
  MAX_FACT,
  MAX_FACTS,
  cleanFacts,
  sharedChanges,
  type SeriesContext,
  type SharedLists,
} from "./series"
import { messages } from "./series.messages"
import { carouselText } from "./story"
import type { ComicEditor } from "./use-editor"

const MAX_CHECK_TEXT = 10_000

export async function seriesRequest(body: Record<string, unknown>) {
  const res = await fetch("/api/series", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error ?? res.statusText)
  return json
}

// The editor's series: its facts for the planner, and every edit to the cast
// or world passed on after a save. Does nothing outside a series.
export function useSeries(initial: SeriesContext | null, editor: ComicEditor) {
  const [context, setContext] = React.useState(initial)
  const [unsynced, setUnsynced] = React.useState(false)
  const id = context?.id
  // What the series last had from this carousel.
  const synced = React.useRef<SharedLists>({
    characters: editor.project.cast ?? [],
    world: editor.project.world ?? [],
  })

  const push = React.useCallback(
    async (project: ComicProject) => {
      if (!id) return
      const changes = sharedChanges(synced.current, project)
      if (!changes) return
      try {
        await seriesRequest({ intent: "sync", id, changes })
        synced.current = {
          characters: project.cast ?? [],
          world: project.world ?? [],
        }
        setUnsynced(false)
      } catch {
        // Tried again with the next save, as `synced` didn't move.
        setUnsynced(true)
      }
    },
    [id]
  )

  const update = React.useCallback(
    (patch: Partial<SeriesContext>) =>
      setContext((c) => c && { ...c, ...patch }),
    []
  )

  return { context, unsynced, push, update }
}

export type SeriesState = ReturnType<typeof useSeries>

function FactsField({
  id,
  facts,
  onSaved,
}: {
  id: string
  facts: string[]
  onSaved: (facts: string[]) => void
}) {
  const t = useT(messages)
  const [text, setText] = React.useState(facts.join("\n"))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // A fact replaced from the check lands here too.
  React.useEffect(() => setText(facts.join("\n")), [facts])
  const lines = cleanFacts(text.split("\n"))
  const dirty = lines.join("\n") !== facts.join("\n")

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const saved = await seriesRequest({ intent: "facts", id, facts: lines })
      onSaved(saved.facts)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="series-facts" className="text-sm font-medium">
          {t("facts.label")}
        </label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("facts.count", { n: lines.length, max: MAX_FACTS })}
        </span>
      </div>
      <Textarea
        id="series-facts"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("facts.placeholder")}
        className="min-h-28"
        maxLength={(MAX_FACT + 1) * MAX_FACTS}
      />
      <p className="text-xs text-muted-foreground">{t("facts.hint")}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("failed", { error })}
        </p>
      )}
      {dirty && (
        <Button
          variant="secondary"
          className="self-end"
          isDisabled={busy}
          onPress={save}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {t("facts.save")}
        </Button>
      )}
    </div>
  )
}

function TitleField({
  id,
  title,
  onSaved,
}: {
  id: string
  title: string
  onSaved: (title: string) => void
}) {
  const t = useT(messages)
  const rename = async (value: string) => {
    const next = value.trim().slice(0, 120)
    if (next === title) return
    await seriesRequest({ intent: "rename", id, title: next }).catch(() => {})
    onSaved(next)
  }
  return (
    <Input
      aria-label={t("name")}
      defaultValue={title}
      placeholder={t("untitled")}
      maxLength={120}
      onBlur={(e) => void rename(e.currentTarget.value)}
    />
  )
}

// Priced first, and it only proposes: a rewording reaches the facts when the
// person applies it, and the carousel is theirs to change.
function ContinuityCheck({
  editor,
  series,
  onFacts,
}: {
  editor: ComicEditor
  series: SeriesContext
  onFacts: (facts: string[]) => void
}) {
  const t = useT(messages)
  const balance = useCredits()
  const openrouter = useOpenRouter()
  const [running, setRunning] = React.useState(false)
  const [found, setFound] = React.useState<Contradiction[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const controller = React.useRef<AbortController>(undefined)
  React.useEffect(() => () => controller.current?.abort(), [])

  const text = carouselText(editor.project).slice(0, MAX_CHECK_TEXT)
  const cost = COSTS.continuity_check
  const short = !openrouter && balance !== null && balance < cost

  const run = async () => {
    const current = new AbortController()
    controller.current = current
    setRunning(true)
    setError(null)
    setFound(null)
    try {
      const res = await fetch("/api/series/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: current.signal,
        body: JSON.stringify({ facts: series.facts, text }),
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
      setFound(json.contradictions)
    } catch (e) {
      if (!current.signal.aborted)
        setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const apply = async (c: Contradiction) => {
    setError(null)
    try {
      const saved = await seriesRequest({
        intent: "facts",
        id: series.id,
        facts: series.facts.map((f) => (f === c.fact ? c.revised : f)),
      })
      onFacts(saved.facts)
      setFound((all) => all?.filter((x) => x !== c) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <Button
        variant="outline"
        className="justify-start"
        isDisabled={running || !series.facts.length || !text || short}
        onPress={run}
      >
        {running ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <HugeiconsIcon
            icon={ScanEyeIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
        )}
        {running ? t("check.running") : t("check.run")}
        <span className="ms-auto text-xs text-muted-foreground tabular-nums">
          {openrouter
            ? t("check.openrouter")
            : t("check.cost", { count: cost })}
        </span>
      </Button>
      {(!series.facts.length || !text) && (
        <p className="text-xs text-muted-foreground">{t("check.nothing")}</p>
      )}
      {short && <p className="text-xs text-destructive">{t("check.short")}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error === INSUFFICIENT_CREDITS
            ? t("check.short")
            : t("failed", { error })}
        </p>
      )}
      {found?.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs">
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            className="size-3.5 text-emerald-600 dark:text-emerald-400"
          />
          {t("check.clean")}
        </p>
      )}
      {!!found?.length && (
        <>
          <p className="text-xs text-muted-foreground">{t("check.proposed")}</p>
          <ul className="flex flex-col gap-2">
            {found.map((c) => (
              <li
                key={`${c.fact}:${c.quote}`}
                className="flex flex-col gap-1 rounded-lg border p-2.5 text-xs"
              >
                <p className="flex items-start gap-1.5 font-medium">
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    strokeWidth={2}
                    className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  />
                  <span className="min-w-0 break-words">{c.problem}</span>
                </p>
                <p className="break-words text-muted-foreground">{c.fact}</p>
                {c.quote && <p className="break-words italic">“{c.quote}”</p>}
                {c.revised && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="min-w-0 break-words">{c.revised}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => void apply(c)}
                    >
                      {t("check.apply")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// The way into a series, from the editor and from /projects. Without a
// `projectId` it only makes one.
export function SeriesPicker({
  projectId,
  before,
  onDone,
  onClose,
}: {
  projectId?: string
  before?: () => Promise<void>
  onDone: () => void
  onClose: () => void
}) {
  const t = useT(messages)
  const [list, setList] = React.useState<SeriesSummary[] | null>(
    projectId ? null : []
  )
  const [title, setTitle] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectId) return
    fetch("/api/series")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((json) => setList(json.series))
      .catch((e: Error) => {
        setList([])
        setError(e.message)
      })
  }, [projectId])

  const join = async (id?: string) => {
    setBusy(true)
    setError(null)
    try {
      await before?.()
      const series = id ?? (await seriesRequest({ intent: "create", title })).id
      if (projectId)
        await seriesRequest({ intent: "join", id: series, projectId })
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>
          {t(projectId ? "picker.title" : "picker.newTitle")}
        </DialogTitle>
        <DialogDescription>{t("picker.description")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        {list === null && <Skeleton className="h-8 w-full" />}
        {!!list?.length && (
          <ul className="flex flex-col gap-1">
            {list.map((s) => (
              <li key={s.id}>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  isDisabled={busy}
                  onPress={() => void join(s.id)}
                >
                  <span className="min-w-0 truncate">
                    {s.title || t("untitled")}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("carousels", { count: s.carousels.length })}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            aria-label={t("name")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("picker.name")}
            maxLength={120}
            className="min-w-0 flex-1"
          />
          <Button
            variant={list?.length ? "outline" : "default"}
            isDisabled={busy || !title.trim()}
            onPress={() => void join()}
          >
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon
                icon={PlusSignIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            {t("picker.create")}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("failed", { error })}
          </p>
        )}
      </div>
    </Dialog>
  )
}

// A series from /projects: its name, facts, and the way to delete it.
export function ManageSeries({
  series,
  onChanged,
  onClose,
}: {
  series: Pick<SeriesSummary, "id" | "title" | "facts">
  onChanged: () => void
  onClose: () => void
}) {
  const t = useT(messages)
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const remove = async () => {
    setConfirming(false)
    try {
      await seriesRequest({ intent: "delete", id: series.id })
      onChanged()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-lg"
    >
      <DialogHeader>
        <DialogTitle>{series.title || t("untitled")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <TitleField id={series.id} title={series.title} onSaved={onChanged} />
        <FactsField id={series.id} facts={series.facts} onSaved={onChanged} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("failed", { error })}
          </p>
        )}
      </div>
      <DialogFooter className="sm:justify-start">
        <Button variant="outline" onPress={() => setConfirming(true)}>
          {t("delete")}
        </Button>
      </DialogFooter>
      <AlertDialog isOpen={confirming} onOpenChange={setConfirming}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteTitle", { title: series.title || t("untitled") })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <Button variant="destructive" onPress={() => void remove()}>
            {t("delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialog>
    </Dialog>
  )
}

// The carousel's series, in the editor's top bar.
export function SeriesButton({
  editor,
  projectId,
  series,
  save,
}: {
  editor: ComicEditor
  projectId: string
  series: SeriesState
  save: () => Promise<void>
}) {
  const t = useT(messages)
  const [open, setOpen] = React.useState(false)
  const { context } = series
  const label = context
    ? `${context.title || t("untitled")} · ${context.episode}/${context.episodes}`
    : t("button")
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("open", { label })}
        className="max-w-48 shrink-0 max-md:px-1.5"
        onPress={() => setOpen(true)}
      >
        <HugeiconsIcon
          icon={LibraryIcon}
          strokeWidth={2}
          data-icon="inline-start"
          className={series.unsynced ? "text-amber-600" : undefined}
        />
        <span className="truncate max-md:sr-only">{label}</span>
      </Button>
      {open && !context && (
        <SeriesPicker
          projectId={projectId}
          before={save}
          // The server rewrote the carousel, so it opens again from there.
          onDone={() => location.reload()}
          onClose={() => setOpen(false)}
        />
      )}
      {open && context && (
        <EditorSeriesDialog
          editor={editor}
          projectId={projectId}
          series={series}
          context={context}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function EditorSeriesDialog({
  editor,
  projectId,
  series,
  context,
  onClose,
}: {
  editor: ComicEditor
  projectId: string
  series: SeriesState
  context: SeriesContext
  onClose: () => void
}) {
  const t = useT(messages)
  const [error, setError] = React.useState<string | null>(null)
  const onFacts = (facts: string[]) => series.update({ facts })

  const leave = async () => {
    try {
      await seriesRequest({ intent: "leave", projectId })
      location.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-lg"
    >
      <DialogHeader>
        <DialogTitle>
          {t("episode", {
            episode: context.episode,
            episodes: context.episodes,
          })}
        </DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <div className="-mx-4 flex max-h-[calc(100svh-15rem)] flex-col gap-3 overflow-y-auto px-4 pb-1">
        <TitleField
          id={context.id}
          title={context.title}
          onSaved={(title) => series.update({ title })}
        />
        <FactsField id={context.id} facts={context.facts} onSaved={onFacts} />
        <ContinuityCheck editor={editor} series={context} onFacts={onFacts} />
        {series.unsynced && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t("unsynced")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("failed", { error })}
          </p>
        )}
      </div>
      <DialogFooter className="sm:justify-start">
        <Button variant="outline" onPress={() => void leave()}>
          {t("leave")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
