import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkBadge01Icon,
  KeyboardIcon,
  PencilEdit02Icon,
  SearchIcon,
  SidebarLeft01Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"

import { bookCall } from "@/lib/books/client"
import { countTerm, termsFor } from "@/lib/books/glossary"
import { stripTags } from "@/lib/books/inline"
import type {
  InlineTag,
  SegmentKind,
  SegmentStatus,
  Term,
} from "@/lib/books/model"
import {
  carryWholeLine,
  normalize,
  tagsInSource,
  tagsToPlace,
} from "@/lib/books/rich"
import type {
  BookStatusData,
  ChapterItem,
  OpenSegment,
} from "@/routes/studio.books.$id"

import {
  ErrorNote,
  FIELD_TEXT,
  InlineText,
  errorCode,
  textProps,
  useAction,
  useBookT,
} from "./shared"
import type { FieldTerm, RichFieldKeys } from "./rich-field"

// Tiptap only reaches the people who open this tab. Fetched as the panel
// appears, so the first click on a line doesn't wait for it.
const loadField = () => import("./rich-field")
const RichField = React.lazy(loadField)

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

const NO_TAGS: InlineTag[] = []

const isModified = (e: React.KeyboardEvent) => e.metaKey || e.ctrlKey

// A line at rest. The editor only exists on the line being worked on, because
// a chapter can run to thousands of them.
function RestingText({
  segment,
  value,
  lang,
  label,
  placeholder,
  dimmed,
  onOpen,
  onKeyDown,
}: {
  segment: SegmentItem
  value: string
  lang: string
  label: string
  placeholder: string
  dimmed: boolean
  onOpen: (point: { x: number; y: number } | null) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  const press = React.useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      role="textbox"
      aria-label={label}
      aria-readonly={dimmed || undefined}
      tabIndex={0}
      {...textProps(lang)}
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY }
      }}
      onFocus={() => {
        onOpen(press.current)
        press.current = null
      }}
      onKeyDown={onKeyDown}
      className={cn(
        FIELD_TEXT,
        "min-h-[calc(1lh+0.5rem)] cursor-text rounded-lg border border-transparent outline-none hover:border-input",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        dimmed && "text-foreground/80",
        !value && "text-muted-foreground"
      )}
    >
      {value ? <InlineText text={value} tags={segment.tags} /> : placeholder}
    </div>
  )
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
  terms,
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
  terms: Term[]
}) {
  const t = useBookT()
  const stored = React.useMemo(
    () => normalize(segment.target ?? "", segment.tags),
    [segment.target, segment.tags]
  )
  const [draft, setDraft] = React.useState(stored)
  const [editingSource, setEditingSource] = React.useState(false)
  const [sourceDraft, setSourceDraft] = React.useState(segment.source)
  const point = React.useRef<{ x: number; y: number } | null>(null)
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [conflict, setConflict] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const locked = segment.status === "locked"

  // Saves go one at a time, each with the version the last one returned.
  // Otherwise saving and locking in quick succession conflicts with itself.
  const latest = React.useRef(segment)
  latest.current = segment
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())
  const saved = React.useRef(stored)

  React.useEffect(() => {
    setDraft(stored)
    saved.current = stored
  }, [stored])

  const send = (edit: Record<string, unknown>) => {
    const job = queue.current.then(async () => {
      setState("saving")
      setError(null)
      try {
        const next = await bookCall<SegmentItem>("edit", {
          id: book.id,
          segment: segment.id,
          edit: { ...edit, version: latest.current.version },
        })
        latest.current = next
        onSaved(next)
        setState("saved")
        return true
      } catch (e) {
        const code = errorCode(e)
        if (code === "stale_version") setConflict(true)
        else setError(code)
        saved.current = normalize(
          latest.current.target ?? "",
          latest.current.tags
        )
        setState("idle")
        return false
      }
    })
    queue.current = job
    return job
  }

  const commit = (text: string) => {
    if (latest.current.status === "locked" || text === saved.current)
      return true
    saved.current = text
    const { source, tags } = latest.current
    return send({ target: carryWholeLine(source, text, tags) })
  }

  const reload = async () => {
    const { segments } = await bookCall<{ segments: SegmentItem[] }>(
      "segments",
      { id: book.id, chapter: segment.chapter_id }
    )
    const fresh = segments.find((s) => s.id === segment.id)
    if (fresh) {
      onSaved(fresh)
      const text = normalize(fresh.target ?? "", fresh.tags)
      setDraft(text)
      saved.current = text
    }
    setConflict(false)
  }

  const toggleLock = (text = draft) => {
    commit(text)
    return send({ status: locked ? "reviewed" : "locked" })
  }

  const review = (text = draft) => {
    commit(text)
    return send({ status: "reviewed" })
  }

  const submit = async (text: string) => {
    if (latest.current.status === "locked" || !stripTags(text).trim())
      return onAdvance(segment.id)
    const changed = text !== saved.current
    const ok = await (changed ? commit(text) : send({ status: "reviewed" }))
    if (ok) onAdvance(segment.id)
  }

  const keys: RichFieldKeys = {
    onEnter: (text) => {
      commit(text)
      onAdvance(segment.id)
    },
    onSubmit: submit,
    onLock: toggleLock,
    onEscape: (text) => {
      commit(text)
      ;(document.activeElement as HTMLElement | null)?.blur()
    },
  }

  const onRestingKey = (e: React.KeyboardEvent) => {
    if (isModified(e) && e.key === "Enter") {
      e.preventDefault()
      onAdvance(segment.id)
    } else if (isModified(e) && e.key.toLowerCase() === "l") {
      e.preventDefault()
      void toggleLock()
    }
  }

  const fieldTerms = React.useMemo<FieldTerm[]>(() => {
    if (!active) return []
    const plain = stripTags(draft)
    return termsFor(terms, [segment.source], book.source_lang).map((term) => {
      const text = term.dnt ? term.source : term.target
      return {
        source: term.source,
        text,
        used: countTerm(text, plain, book.target_lang) > 0,
      }
    })
  }, [active, terms, segment.source, draft, book.source_lang, book.target_lang])

  const noText = !segment.translatable
  const editing = active && !locked && !noText
  const openRow = (at: { x: number; y: number } | null) => {
    point.current = at
    onFocus(segment.id)
  }
  const sourceTags = active
    ? tagsInSource(segment.source, segment.tags)
    : NO_TAGS
  const resting = (
    <RestingText
      segment={segment}
      value={draft}
      lang={book.target_lang}
      label={t("editor.target")}
      placeholder={t("editor.pending")}
      dimmed={locked}
      onOpen={openRow}
      onKeyDown={onRestingKey}
    />
  )
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
          {!locked && stripTags(segment.source).trim() && (
            <button
              type="button"
              onClick={() => {
                setSourceDraft(segment.source)
                setEditingSource((v) => !v)
              }}
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
            <React.Suspense fallback={null}>
              <RichField
                value={sourceDraft}
                tags={segment.tags}
                lang={book.source_lang}
                label={t("editor.fixSource")}
                onChange={setSourceDraft}
                keys={{
                  onEnter: () => {},
                  onSubmit: async (text) => {
                    if (await send({ source: text })) setEditingSource(false)
                  },
                  onEscape: () => setEditingSource(false),
                }}
              />
            </React.Suspense>
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
                  <Button size="xs" variant="ghost" onPress={() => review()}>
                    <HugeiconsIcon
                      icon={CheckmarkBadge01Icon}
                      strokeWidth={2}
                    />
                    {t("editor.markReviewed")}
                  </Button>
                )}
                <Button size="xs" variant="ghost" onPress={() => toggleLock()}>
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
        ) : editing ? (
          <React.Suspense fallback={resting}>
            <RichField
              value={draft}
              tags={segment.tags}
              sourceTags={sourceTags}
              missingTags={tagsToPlace(segment.source, draft, segment.tags)}
              terms={fieldTerms}
              lang={book.target_lang}
              label={t("editor.target")}
              placeholder={t("editor.pending")}
              point={point.current}
              keys={keys}
              onChange={(text) => {
                setDraft(text)
                setState("idle")
              }}
              onBlur={commit}
              onLeave={commit}
            />
          </React.Suspense>
        ) : (
          resting
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

const CHAPTERS_ID = "book-chapters"
const CHAPTERS_KEY = "books.chapters.hidden"

// Remembered per browser. Read before paint, so the list doesn't flash open.
function useChaptersOpen() {
  const [open, setOpen] = React.useState(true)
  React.useLayoutEffect(() => {
    try {
      if (localStorage.getItem(CHAPTERS_KEY)) setOpen(false)
    } catch {
      // Blocked storage only costs the memory of this choice.
    }
  }, [])
  const toggle = React.useCallback(() => {
    setOpen((was) => {
      try {
        if (was) localStorage.setItem(CHAPTERS_KEY, "1")
        else localStorage.removeItem(CHAPTERS_KEY)
      } catch {
        // As above.
      }
      return !was
    })
  }, [])
  return [open, toggle] as const
}

function Navigator({
  chapters,
  chapter,
  open,
  onPick,
}: {
  chapters: ChapterItem[]
  chapter: string | null
  open: boolean
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
        inert={!open}
        id={CHAPTERS_ID}
        className="sticky top-2 max-h-[calc(100svh-6rem)] min-w-0 overflow-x-hidden overflow-y-auto @max-3xl:hidden"
      >
        <ol className="flex w-52 flex-col gap-0.5 pe-1">
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
  const [chaptersOpen, toggleChapters] = useChaptersOpen()
  const [terms, setTerms] = React.useState<Term[]>([])
  const load = useAction()
  const bulk = useAction()
  const searchBox = React.useRef<HTMLInputElement>(null)
  const list = React.useRef<HTMLOListElement>(null)

  React.useEffect(() => {
    if (!chapter && chapters.length)
      setChapter(chapters.find((c) => c.position > 0)?.id ?? chapters[0]!.id)
  }, [chapters, chapter])

  React.useEffect(() => {
    void loadField()
    // Help beside the field, so a failure here just means no suggestions.
    bookCall<{ terms: Term[] }>("glossary", { id: book.id })
      .then((r) =>
        setTerms(
          r.terms.filter(
            (term) => term.state === "approved" && (term.dnt || term.target)
          )
        )
      )
      .catch(() => {})
  }, [book.id])

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
      e.target instanceof HTMLSelectElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable)
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
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault()
        toggleChapters()
        return
      }
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
  }, [toggleChapters])

  const current = chapters.find((c) => c.id === chapter)
  if (!chapters.length)
    return <p className="text-sm text-muted-foreground">{t("editor.empty")}</p>

  return (
    <div className="@container" onKeyDown={onKeyDown}>
      <div
        className={cn(
          "grid gap-y-4 transition-[grid-template-columns,column-gap] duration-200 ease-out motion-reduce:transition-none @3xl:grid-cols-[13rem_minmax(0,1fr)] @3xl:gap-x-4",
          !chaptersOpen && "@3xl:grid-cols-[0rem_minmax(0,1fr)] @3xl:gap-x-0"
        )}
      >
        <Navigator
          chapters={chapters}
          chapter={chapter}
          open={chaptersOpen}
          onPick={(id) => {
            setSearch("")
            setQuery("")
            setChapter(id)
          }}
        />
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={
                chaptersOpen
                  ? t("editor.hideChapters")
                  : t("editor.showChapters")
              }
              aria-expanded={chaptersOpen}
              aria-controls={CHAPTERS_ID}
              onPress={toggleChapters}
              className="@max-3xl:hidden"
            >
              <HugeiconsIcon
                icon={SidebarLeft01Icon}
                strokeWidth={2}
                className="rtl:-scale-x-100"
              />
            </Button>
            <form
              className="min-w-40 flex-1"
              onSubmit={(e) => {
                e.preventDefault()
                setSearch(query.trim())
              }}
            >
              <ButtonGroup className="w-full">
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
                  className="min-w-0 flex-1"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="outline"
                  aria-label={t("editor.search")}
                >
                  <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
                </Button>
              </ButtonGroup>
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
                  ["line", "↵"],
                  ["lock", "⌘ L"],
                  ["format", "⌘ I"],
                  ["lineBreak", "⇧ ↵"],
                  ["chapters", "⌘ \\"],
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
                    terms={terms}
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
