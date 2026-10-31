import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkBadge01Icon,
  KeyboardIcon,
  PencilEdit02Icon,
  SearchIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { bookCall } from "@/lib/books/client"
import { stripTags } from "@/lib/books/inline"
import type { InlineTag, SegmentKind, SegmentStatus } from "@/lib/books/model"
import type {
  BookStatusData,
  ChapterItem,
  OpenSegment,
} from "@/routes/studio.books.$id"

import {
  ErrorNote,
  InlineText,
  errorCode,
  textProps,
  useAction,
  useBookT,
} from "./shared"

export interface SegmentItem {
  id: string
  chapter_id: string
  position: number
  kind: SegmentKind
  level: number | null
  page: number | null
  ocr: number | null
  source: string
  target: string | null
  tags: InlineTag[]
  status: SegmentStatus
  from_memory: boolean
  translatable: boolean
  version: number
}

type Book = BookStatusData["book"]

const STATUS_TONE: Record<SegmentStatus, string> = {
  pending: "bg-foreground/25",
  machine: "bg-sky-400",
  reviewed: "bg-emerald-400",
  locked: "bg-brand",
  fixed: "bg-foreground/15",
  failed: "bg-pink-500",
}

function StatusMark({ status }: { status: SegmentStatus }) {
  const t = useBookT()
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", STATUS_TONE[status])}
      />
      {t(`editor.statuses.${status}`)}
    </span>
  )
}

// Shared by the field and the mirror behind it, so every glyph lines up.
const FIELD = "px-2 py-1 font-serif text-[15px] leading-relaxed"
const TAG = /<\/?[gx]\d+\/?>/

function splitTags(text: string) {
  return text
    .split(/(<\/?[gx]\d+\/?>)/)
    .map((part, i) => ({ text: part, tag: i % 2 === 1 }))
}

const Row = React.memo(function Row({
  book,
  segment,
  number,
  active,
  selected,
  onFocus,
  onSelect,
  onSaved,
  onAdvance,
}: {
  book: Book
  segment: SegmentItem
  number: number
  active: boolean
  selected: boolean
  onFocus: (id: string) => void
  onSelect: (id: string, on: boolean) => void
  onSaved: (segment: SegmentItem) => void
  onAdvance: (id: string) => void
}) {
  const t = useBookT()
  const [draft, setDraft] = React.useState(segment.target ?? "")
  const [editingSource, setEditingSource] = React.useState(false)
  const [sourceDraft, setSourceDraft] = React.useState(segment.source)
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [conflict, setConflict] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const area = React.useRef<HTMLTextAreaElement>(null)
  const dirty = draft !== (segment.target ?? "")
  const locked = segment.status === "locked"

  React.useEffect(() => {
    setDraft(segment.target ?? "")
  }, [segment.target])

  React.useEffect(() => {
    if (active && document.activeElement !== area.current)
      area.current?.focus({ preventScroll: false })
  }, [active])

  const send = async (edit: Record<string, unknown>) => {
    setState("saving")
    setError(null)
    try {
      const next = await bookCall<SegmentItem>("edit", {
        id: book.id,
        segment: segment.id,
        edit: { ...edit, version: segment.version },
      })
      onSaved(next)
      setState("saved")
      return true
    } catch (e) {
      const code = errorCode(e)
      if (code === "stale_version") setConflict(true)
      else setError(code)
      setState("idle")
      return false
    }
  }

  const reload = async () => {
    const { segments } = await bookCall<{ segments: SegmentItem[] }>(
      "segments",
      { id: book.id, chapter: segment.chapter_id }
    )
    const fresh = segments.find((s) => s.id === segment.id)
    if (fresh) {
      onSaved(fresh)
      setDraft(fresh.target ?? "")
    }
    setConflict(false)
  }

  const toggleLock = () => send({ status: locked ? "reviewed" : "locked" })

  const onKeyDown = async (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === "Enter") {
      e.preventDefault()
      if (locked) return onAdvance(segment.id)
      const ok = await send(dirty ? { target: draft } : { status: "reviewed" })
      if (ok) onAdvance(segment.id)
    } else if (mod && e.key.toLowerCase() === "l") {
      e.preventDefault()
      void toggleLock()
    } else if (e.key === "Escape") area.current?.blur()
  }

  const noText = !segment.translatable
  const hasTags = TAG.test(draft)
  return (
    <li
      data-segment={segment.id}
      className={cn(
        "group/row grid scroll-mt-24 gap-x-4 gap-y-2 rounded-xl p-3 transition-colors duration-150 [contain-intrinsic-size:auto_120px] [content-visibility:auto] @3xl:grid-cols-2",
        active ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.025]",
        selected && "ring-1 ring-brand/50"
      )}
    >
      <div className="min-w-0">
        <div className="mb-1 flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
          {segment.translatable && (
            <Checkbox
              aria-label={t("editor.select", { number })}
              isSelected={selected}
              onChange={(on) => onSelect(segment.id, on)}
            />
          )}
          <span className="tabular-nums">{number}</span>
          {segment.ocr !== null && (
            <span
              className={cn(
                "rounded px-1 tabular-nums",
                segment.ocr < 0.8
                  ? "bg-pink-600/20 text-pink-300"
                  : "bg-foreground/5"
              )}
            >
              {t("editor.ocr", { percent: Math.round(segment.ocr * 100) })}
            </span>
          )}
          {!locked && (
            <button
              type="button"
              onClick={() => setEditingSource((v) => !v)}
              aria-label={t("editor.fixSource")}
              title={t("editor.fixSource")}
              className="relative ms-auto rounded opacity-0 outline-none group-hover/row:opacity-100 after:absolute after:-inset-2 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:opacity-100"
            >
              <HugeiconsIcon
                icon={PencilEdit02Icon}
                strokeWidth={2}
                className="size-3.5"
              />
            </button>
          )}
        </div>
        {editingSource ? (
          <div className="flex flex-col gap-2">
            <Textarea
              {...textProps(book.source_lang)}
              aria-label={t("editor.fixSource")}
              value={sourceDraft}
              onChange={(e) => setSourceDraft(e.target.value)}
              className="font-serif"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onPress={() => setEditingSource(false)}
              >
                {t("editor.cancel")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onPress={async () => {
                  if (await send({ source: sourceDraft }))
                    setEditingSource(false)
                }}
              >
                {t("editor.saveSource")}
              </Button>
            </div>
          </div>
        ) : (
          <p
            {...textProps(book.source_lang)}
            className={cn(
              "font-serif text-[15px] leading-relaxed [overflow-wrap:anywhere] text-foreground/75",
              segment.kind === "heading" && "font-semibold text-foreground",
              segment.kind === "footnote" && "text-sm"
            )}
          >
            <InlineText text={segment.source} tags={segment.tags} />
          </p>
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex min-h-5 items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <StatusMark status={segment.status} />
            {segment.from_memory && (
              <span className="text-xs text-muted-foreground">
                · {t("editor.memory")}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <span
              aria-live="polite"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {state === "saving" ? t("editor.saving") : ""}
            </span>
            {segment.translatable && segment.target && (
              <span
                className={cn(
                  "flex items-center gap-0.5 transition-opacity duration-150",
                  active
                    ? "opacity-100"
                    : "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
                )}
              >
                {segment.status !== "reviewed" && !locked && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onPress={() => send({ status: "reviewed" })}
                  >
                    <HugeiconsIcon
                      icon={CheckmarkBadge01Icon}
                      strokeWidth={2}
                    />
                    {t("editor.markReviewed")}
                  </Button>
                )}
                <Button size="xs" variant="ghost" onPress={toggleLock}>
                  <HugeiconsIcon
                    icon={locked ? SquareUnlock02Icon : SquareLock02Icon}
                    strokeWidth={2}
                  />
                  {locked ? t("editor.unlock") : t("editor.lock")}
                </Button>
              </span>
            )}
          </span>
        </div>
        {noText ? (
          <p className="font-serif text-[15px] text-muted-foreground">
            {stripTags(segment.source) || "—"}
          </p>
        ) : (
          <div className="grid [&>*]:[grid-area:1/1]">
            {hasTags && (
              <div
                aria-hidden
                {...textProps(book.target_lang)}
                className={cn(
                  FIELD,
                  "pointer-events-none border border-transparent break-words whitespace-pre-wrap"
                )}
              >
                {splitTags(draft).map((part, i) =>
                  part.tag ? (
                    <span key={i} className="text-foreground/25">
                      {part.text}
                    </span>
                  ) : (
                    part.text
                  )
                )}
                {"\u200b"}
              </div>
            )}
            <Textarea
              ref={area}
              {...textProps(book.target_lang)}
              aria-label={t("editor.target")}
              rows={1}
              value={draft}
              readOnly={locked}
              placeholder={t("editor.pending")}
              onChange={(e) => {
                setDraft(e.target.value)
                setState("idle")
              }}
              onFocus={() => onFocus(segment.id)}
              onBlur={() => {
                if (dirty && !locked) void send({ target: draft })
              }}
              onKeyDown={onKeyDown}
              className={cn(
                FIELD,
                "min-h-0 resize-none border-transparent bg-transparent md:text-[15px] dark:bg-transparent",
                "hover:border-input focus-visible:bg-input/20",
                hasTags &&
                  "text-transparent caret-foreground selection:text-foreground",
                locked && !hasTags && "text-foreground/80"
              )}
            />
          </div>
        )}
        {conflict && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-pink-300">
            {t("editor.conflict")}
            <Button size="xs" variant="outline" onPress={reload}>
              {t("editor.reload")}
            </Button>
          </p>
        )}
        <ErrorNote code={error} />
      </div>
    </li>
  )
})

const FILTERS = [
  "",
  "pending",
  "machine",
  "reviewed",
  "locked",
  "failed",
] as const

function chapterLabel(c: ChapterItem, t: ReturnType<typeof useBookT>) {
  return (
    c.title ||
    (c.position === 0
      ? t("editor.frontMatter")
      : t("editor.untitled", { number: c.position }))
  )
}

function Navigator({
  chapters,
  chapter,
  onPick,
}: {
  chapters: ChapterItem[]
  chapter: string | null
  onPick: (id: string) => void
}) {
  const t = useBookT()
  return (
    <>
      <NativeSelect
        aria-label={t("editor.chapters")}
        className="w-full @3xl:hidden"
        value={chapter ?? ""}
        onChange={(e) => onPick(e.target.value)}
      >
        {chapters.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {chapterLabel(c, t)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <nav
        aria-label={t("editor.chapters")}
        className="max-@3xl:hidden sticky top-2 max-h-[calc(100svh-6rem)] overflow-y-auto pe-1"
      >
        <ol className="flex flex-col gap-0.5">
          {chapters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-current={c.id === chapter ? "true" : undefined}
                onClick={() => onPick(c.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  c.id === chapter
                    ? "bg-foreground/10 font-medium"
                    : "text-muted-foreground hover:bg-foreground/5"
                )}
              >
                <span className="truncate">{chapterLabel(c, t)}</span>
                {c.score !== null && (
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      c.score < 80 ? "text-pink-300" : "text-muted-foreground"
                    )}
                  >
                    {c.score}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}

export function EditorPanel({
  book,
  chapters,
  open,
  selection,
  setSelection,
  askAssistant,
}: {
  book: Book
  chapters: ChapterItem[]
  open: OpenSegment | null
  selection: string[]
  setSelection: React.Dispatch<React.SetStateAction<string[]>>
  askAssistant: () => void
}) {
  const t = useBookT()
  const [chapter, setChapter] = React.useState<string | null>(
    chapters.find((c) => c.position > 0)?.id ?? chapters[0]?.id ?? null
  )
  const [filter, setFilter] = React.useState<string>("")
  const [query, setQuery] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [segments, setSegments] = React.useState<SegmentItem[] | null>(null)
  const [next, setNext] = React.useState<number | null>(null)
  const [active, setActive] = React.useState<string | null>(null)
  const [showKeys, setShowKeys] = React.useState(false)
  const load = useAction()
  const bulk = useAction()
  const searchBox = React.useRef<HTMLInputElement>(null)
  const list = React.useRef<HTMLOListElement>(null)

  React.useEffect(() => {
    if (!chapter && chapters.length)
      setChapter(chapters.find((c) => c.position > 0)?.id ?? chapters[0]!.id)
  }, [chapters, chapter])

  const fetchPage = React.useCallback(
    async (cursor: number) => {
      const r = await bookCall<{
        segments: SegmentItem[]
        next: number | null
      }>("segments", {
        id: book.id,
        ...(search ? {} : { chapter }),
        status: filter || undefined,
        search: search || undefined,
        cursor,
      })
      setSegments((old) =>
        cursor ? [...(old ?? []), ...r.segments] : r.segments
      )
      setNext(r.next)
    },
    [book.id, chapter, filter, search]
  )

  React.useEffect(() => {
    if (!chapter) return
    setSegments(null)
    void load.run(() => fetchPage(0))
  }, [chapter, fetchPage, load.run])

  React.useEffect(() => {
    if (!open) return
    setSearch("")
    setQuery("")
    setFilter("")
    setChapter(open.chapter)
    setActive(open.segment)
  }, [open])

  React.useEffect(() => {
    if (!active) return
    list.current
      ?.querySelector(`[data-segment="${active}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [active, segments])

  const onSaved = React.useCallback((s: SegmentItem) => {
    setSegments((old) => old?.map((o) => (o.id === s.id ? s : o)) ?? old)
  }, [])

  const editable = React.useMemo(
    () => (segments ?? []).filter((s) => s.translatable),
    [segments]
  )
  const move = React.useCallback(
    (id: string | null, by: number) => {
      const at = editable.findIndex((s) => s.id === id)
      const target = editable[Math.max(0, at + by)]
      if (target) setActive(target.id)
    },
    [editable]
  )
  const onAdvance = React.useCallback((id: string) => move(id, 1), [move])
  const onSelect = React.useCallback(
    (id: string, on: boolean) =>
      setSelection((old) => (on ? [...old, id] : old.filter((s) => s !== id))),
    [setSelection]
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    const inField =
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement
    const alt = e.altKey
    if (alt && e.key === "ArrowDown") {
      e.preventDefault()
      move(active, 1)
    } else if (alt && e.key === "ArrowUp") {
      e.preventDefault()
      move(active, -1)
    } else if (!inField && e.key === "j") move(active, active ? 1 : 0)
    else if (!inField && e.key === "k") move(active, -1)
  }

  // On the window, because focus is often nowhere in particular.
  React.useEffect(() => {
    const onSlash = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        e.key !== "/" ||
        e.metaKey ||
        e.ctrlKey ||
        target?.closest("input, textarea, select, [contenteditable]")
      )
        return
      e.preventDefault()
      searchBox.current?.focus()
    }
    window.addEventListener("keydown", onSlash)
    return () => window.removeEventListener("keydown", onSlash)
  }, [])

  const current = chapters.find((c) => c.id === chapter)
  if (!chapters.length)
    return <p className="text-sm text-muted-foreground">{t("editor.empty")}</p>

  return (
    <div className="@container" onKeyDown={onKeyDown}>
      <div className="grid gap-4 @3xl:grid-cols-[13rem_minmax(0,1fr)]">
        <Navigator
          chapters={chapters}
          chapter={chapter}
          onPick={(id) => {
            setSearch("")
            setQuery("")
            setChapter(id)
          }}
        />
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="relative min-w-40 flex-1"
              onSubmit={(e) => {
                e.preventDefault()
                setSearch(query.trim())
              }}
            >
              <HugeiconsIcon
                icon={SearchIcon}
                strokeWidth={2}
                className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchBox}
                type="search"
                value={query}
                aria-label={t("editor.search")}
                placeholder={t("editor.search")}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (!e.target.value) setSearch("")
                }}
                className="ps-8"
              />
            </form>
            <NativeSelect
              aria-label={t("editor.filter")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {FILTERS.map((f) => (
                <NativeSelectOption key={f} value={f}>
                  {f ? t(`editor.statuses.${f}`) : t("editor.all")}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("editor.keysTitle")}
              aria-expanded={showKeys}
              onPress={() => setShowKeys((v) => !v)}
            >
              <HugeiconsIcon icon={KeyboardIcon} strokeWidth={2} />
            </Button>
          </div>
          {showKeys && (
            <dl className="grid gap-x-6 gap-y-1 rounded-xl bg-card p-3 text-sm @lg:grid-cols-2">
              {(
                [
                  ["next", "Alt ↓"],
                  ["previous", "Alt ↑"],
                  ["review", "⌘ ↵"],
                  ["lock", "⌘ L"],
                  ["search", "/"],
                ] as const
              ).map(([key, combo]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3"
                >
                  <dt className="text-muted-foreground">
                    {t(`editor.keys.${key}`)}
                  </dt>
                  <dd>
                    <Kbd>{combo}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="studio-title min-w-0 text-xl [overflow-wrap:anywhere]">
              {search ? search : current ? chapterLabel(current, t) : ""}
            </h2>
            <div className="flex flex-wrap items-center gap-1">
              {selection.length > 0 && (
                <Button size="sm" variant="outline" onPress={askAssistant}>
                  {t("editor.ask")} ·{" "}
                  {t("editor.selected", { count: selection.length })}
                </Button>
              )}
              {!search && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={bulk.busy}
                    onPress={() =>
                      bulk
                        .run(() =>
                          bookCall("chapterStatus", {
                            id: book.id,
                            chapter,
                            status: "reviewed",
                          })
                        )
                        .then(() => fetchPage(0))
                    }
                  >
                    {t("editor.reviewChapter")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={bulk.busy}
                    onPress={() =>
                      bulk
                        .run(() =>
                          bookCall("chapterStatus", {
                            id: book.id,
                            chapter,
                            status: "locked",
                          })
                        )
                        .then(() => fetchPage(0))
                    }
                  >
                    {t("editor.lockChapter")}
                  </Button>
                </>
              )}
            </div>
          </div>
          <ErrorNote code={load.error ?? bulk.error} />
          {!segments ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Spinner />
            </div>
          ) : segments.length ? (
            <>
              <div
                aria-hidden
                className="hidden grid-cols-2 gap-4 px-3 text-xs text-muted-foreground @3xl:grid"
              >
                <span>{t("editor.source")}</span>
                <span>{t("editor.target")}</span>
              </div>
              <ol ref={list} className="flex flex-col gap-1">
                {segments.map((segment, i) => (
                  <Row
                    key={segment.id}
                    book={book}
                    segment={segment}
                    number={i + 1}
                    active={active === segment.id}
                    selected={selection.includes(segment.id)}
                    onFocus={setActive}
                    onSelect={onSelect}
                    onSaved={onSaved}
                    onAdvance={onAdvance}
                  />
                ))}
              </ol>
              {next !== null && (
                <Button
                  variant="outline"
                  className="self-center"
                  onPress={() => fetchPage(next)}
                >
                  {t("editor.more")}
                </Button>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search || filter ? t("editor.noMatch") : t("editor.empty")}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
