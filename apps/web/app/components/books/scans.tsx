import * as React from "react"
import { cn } from "cn"

import { Dialog, DialogTitle } from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { bookCall } from "@/lib/books/client"
import type { BookStatusData } from "@/routes/studio.books.$id"

import type { SegmentItem } from "./editor"
import { EmptyState, ErrorNote, textProps, useAction, useBookT } from "./shared"

type Book = BookStatusData["book"]

interface PageItem {
  id: string
  number: number
  status: "pending" | "done" | "failed" | "unreadable"
  confidence: number | null
  image: string | null
}

function PageDialog({
  book,
  page,
  onClose,
}: {
  book: Book
  page: PageItem
  onClose: () => void
}) {
  const t = useBookT()
  const [segments, setSegments] = React.useState<SegmentItem[] | null>(null)
  const save = useAction()

  React.useEffect(() => {
    void bookCall<{ segments: SegmentItem[] }>("segments", {
      id: book.id,
      page: page.number,
    })
      .then((r) => setSegments(r.segments))
      .catch(() => setSegments([]))
  }, [book.id, page.number])

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="dark w-full bg-card text-foreground sm:max-w-5xl"
    >
      <DialogTitle>{t("scans.page", { number: page.number })}</DialogTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {page.image && (
          <img
            src={page.image}
            alt={t("scans.page", { number: page.number })}
            className="max-h-[70svh] w-full rounded-lg bg-white object-contain"
          />
        )}
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm font-medium">{t("scans.correct")}</p>
          {!segments ? (
            <Spinner />
          ) : segments.length ? (
            segments.map((s) => (
              <SourceField
                key={s.id}
                book={book}
                segment={s}
                onError={save.setError}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("scans.none")}</p>
          )}
          <ErrorNote code={save.error} />
        </div>
      </div>
    </Dialog>
  )
}

function SourceField({
  book,
  segment,
  onError,
}: {
  book: Book
  segment: SegmentItem
  onError: (code: string | null) => void
}) {
  const t = useBookT()
  const [value, setValue] = React.useState(segment.source)
  const [current, setCurrent] = React.useState(segment)
  return (
    <Textarea
      {...textProps(book.source_lang)}
      aria-label={t("editor.fixSource")}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        if (value === current.source) return
        try {
          setCurrent(
            await bookCall<SegmentItem>("edit", {
              id: book.id,
              segment: current.id,
              edit: { source: value, version: current.version },
            })
          )
        } catch {
          onError("failed")
        }
      }}
      className="font-serif"
    />
  )
}

export function ScansPanel({ book }: { book: Book }) {
  const t = useBookT()
  const [pages, setPages] = React.useState<PageItem[] | null>(null)
  const [open, setOpen] = React.useState<PageItem | null>(null)
  const load = useAction()

  React.useEffect(() => {
    void load.run(async () => {
      const r = await bookCall<{ pages: PageItem[] }>("pages", { id: book.id })
      setPages(
        [...r.pages].sort((a, b) => (a.confidence ?? 2) - (b.confidence ?? 2))
      )
    })
  }, [book.id, load.run])

  if (!pages)
    return load.error ? (
      <ErrorNote code={load.error} />
    ) : (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Spinner />
      </div>
    )
  if (!pages.length) return <EmptyState title={t("scans.empty")} />
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("scans.intro")}
      </p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {pages.map((page) => {
          const percent =
            page.confidence === null ? null : Math.round(page.confidence * 100)
          return (
            <li key={page.id}>
              <Button
                variant="ghost"
                aria-label={t("scans.open", { number: page.number })}
                onPress={() => setOpen(page)}
                isDisabled={!page.image}
                className="h-auto w-full flex-col items-stretch gap-2 rounded-xl bg-card p-2 whitespace-normal"
              >
                <span className="block aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                  {page.image && (
                    <img
                      src={page.image}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                </span>
                <span className="flex items-center justify-between gap-1 text-xs">
                  <span className="tabular-nums">
                    {t("scans.page", { number: page.number })}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      percent !== null && percent < 80
                        ? "text-pink-300"
                        : "text-muted-foreground"
                    )}
                  >
                    {page.status === "unreadable"
                      ? t("scans.unreadable")
                      : percent === null
                        ? t("scans.unknown")
                        : t("scans.confidence", { percent })}
                  </span>
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
      {open && (
        <PageDialog book={book} page={open} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
