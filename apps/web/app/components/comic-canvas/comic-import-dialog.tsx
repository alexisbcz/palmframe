import * as React from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Upload01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"

import { LabeledCheckbox } from "@/components/labeled-checkbox"
import { useT } from "@/i18n/core"
import {
  FILE_ACCEPT,
  openComic,
  type ImportPage,
} from "@/lib/comic-import/client"
import { ImportError } from "@/lib/comic-import/errors"
import {
  bookTitle,
  importedProject,
  partTitle,
  slideSize,
  splitPages,
} from "@/lib/comic-import/project"
import { uploadImageBlob } from "@/lib/cloud"
import { COMICS_BUCKET } from "@/lib/database"
import { useSupabase } from "@/lib/supabase.browser"

import { messages } from "./comic-import.messages"
import { messages as errors } from "./style-import.messages"

// Sharp enough to read and letter over, and well under the bucket's 10 MB.
const PAGE_SIDE = 2000
const PAGE_QUALITY = 0.86
const COVER_SIDE = 480

function jpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new ImportError("corrupt"))),
      "image/jpeg",
      quality
    )
  )
}

type Status =
  | { name: "opening"; book: string; done: number; total: number }
  | { name: "pages"; book: string; count: number; total: number }

// Drop comics and each one becomes a project. Files are unpacked here in the
// browser, a book at a time, and only finished pages travel.
export function ComicImportDialog({
  userId,
  onClose,
  onDone,
}: {
  userId: string
  onClose: () => void
  onDone: () => void
}) {
  const t = useT(messages)
  const te = useT(errors)
  const supabase = useSupabase()
  const navigate = useNavigate()
  const input = React.useRef<HTMLInputElement>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const [rights, setRights] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [progress, setProgress] = React.useState<Status | null>(null)
  const [notes, setNotes] = React.useState<string[]>([])
  const [finished, setFinished] = React.useState<number | null>(null)
  const abort = React.useRef<AbortController>(null)
  React.useEffect(() => () => abort.current?.abort(), [])
  const busy = progress !== null

  const noted = React.useRef(0)
  const note = (line: string) => {
    noted.current++
    setNotes((n) => [...n, line])
  }

  // One project, then its cover. Made last, so a stopped import leaves no
  // half a book in the list.
  const saveProject = async (
    title: string,
    pages: ImportPage[],
    file: string,
    signal: AbortSignal
  ) => {
    const urls: string[] = []
    let size = slideSize(0, 0)
    let cover: Blob | null = null
    let bad = 0
    for (const [i, page] of pages.entries()) {
      signal.throwIfAborted()
      setProgress({
        name: "pages",
        book: title,
        count: i + 1,
        total: pages.length,
      })
      try {
        const canvas = await page.draw(PAGE_SIDE)
        if (!urls.length) size = slideSize(canvas.width, canvas.height)
        const blob = await jpeg(canvas, PAGE_QUALITY)
        urls.push(await uploadImageBlob(supabase, userId, blob))
        cover ??= await jpeg(await page.draw(COVER_SIDE), 0.8)
      } catch (e) {
        // One bad scan shouldn't cost the book, but a lost connection should
        // stop the run rather than empty it page by page.
        if (e instanceof ImportError) bad++
        else throw e
      }
    }
    if (bad) note(t("badPages", { file, count: bad }))
    if (!urls.length) throw new ImportError("no_pages")
    const { data: row, error } = await supabase
      .from("comic_projects")
      .insert({ title, data: importedProject(urls, size) })
      .select("id")
      .single()
    if (error) throw error
    if (cover) {
      const path = `${userId}/covers/${row.id}.jpg`
      const bucket = supabase.storage.from(COMICS_BUCKET)
      const stored = await bucket.upload(path, cover, {
        contentType: "image/jpeg",
        upsert: true,
      })
      // A missing cover is only a blank card, so the project still counts.
      if (!stored.error)
        await supabase
          .from("comic_projects")
          .update({
            cover: `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`,
          })
          .eq("id", row.id)
    }
    return row.id
  }

  const start = async () => {
    const controller = new AbortController()
    abort.current = controller
    const { signal } = controller
    const made: string[] = []
    setNotes([])
    noted.current = 0
    try {
      for (const [i, file] of files.entries()) {
        const title = bookTitle(file.name)
        setProgress({
          name: "opening",
          book: title,
          done: i + 1,
          total: files.length,
        })
        // Opened and closed one at a time: a series won't fit in memory at once.
        const comic = await openComic([file], { signal }).catch((e) => {
          if (signal.aborted) throw e
          note(
            t("skipped", {
              file: file.name,
              reason: te(
                `errors.${e instanceof ImportError ? e.code : "corrupt"}`
              ),
            })
          )
          return null
        })
        if (!comic) continue
        try {
          for (const f of comic.failures)
            note(t("skipped", { file: f.file, reason: te(`errors.${f.code}`) }))
          const parts = splitPages(comic.pages)
          for (const [p, pages] of parts.entries())
            made.push(
              await saveProject(
                partTitle(title, p + 1, parts.length),
                pages,
                file.name,
                signal
              )
            )
        } catch (e) {
          if (e instanceof ImportError)
            note(
              t("skipped", {
                file: file.name,
                reason: te(`errors.${e.code}`),
              })
            )
          else throw e
        } finally {
          comic.close()
        }
      }
      if (made.length === 1 && !noted.current) {
        navigate(`/p/${made[0]}`)
        return
      }
      setFinished(made.length)
      setFiles([])
    } catch {
      if (!signal.aborted) note(t("failed"))
      setFinished(made.length)
      setFiles([])
    } finally {
      setProgress(null)
      if (made.length) onDone()
    }
  }

  const add = (list: File[]) => {
    if (!list.length) return
    setFinished(null)
    setNotes([])
    setFiles((now) => {
      const names = new Set(now.map((f) => f.name))
      return [...now, ...list.filter((f) => !names.has(f.name))]
    })
  }

  const share = progress
    ? progress.name === "pages"
      ? (progress.count / progress.total) * 100
      : 0
    : 0

  return (
    <Dialog
      isOpen
      isDismissable={!busy}
      onOpenChange={(o) => !o && !busy && onClose()}
      className="sm:max-w-lg"
    >
      <DialogHeader>
        <DialogTitle className="studio-title">{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={FILE_ACCEPT}
        aria-label={t("browse")}
        onChange={(e) => {
          const list = [...(e.target.files ?? [])]
          e.target.value = ""
          add(list)
        }}
      />

      {busy ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="truncate text-sm">
            {progress.name === "pages"
              ? t("pages", {
                  book: progress.book,
                  count: progress.count,
                  total: progress.total,
                })
              : t("opening", {
                  book: progress.book,
                  done: progress.done,
                  total: progress.total,
                })}
          </p>
          <Progress aria-label={t("title")} value={share} />
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            add([...e.dataTransfer.files])
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors",
            dragging && "border-foreground bg-muted/50"
          )}
        >
          <p className="font-medium">
            {files.length ? t("selected", { count: files.length }) : t("drop")}
          </p>
          <p className="text-xs text-muted-foreground">{t("formats")}</p>
          <Button
            variant="outline"
            className="mt-2"
            onPress={() => input.current?.click()}
          >
            {t("browse")}
            <HugeiconsIcon
              icon={Upload01Icon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
        </div>
      )}

      {finished !== null && (
        <p role="status" className="text-sm">
          {t("done", { count: finished })}
        </p>
      )}
      {notes.map((line, i) => (
        <p key={i} role="alert" className="text-xs text-destructive">
          {line}
        </p>
      ))}

      {files.length > 0 && !busy && (
        <LabeledCheckbox isSelected={rights} onChange={setRights}>
          {t("rights")}
        </LabeledCheckbox>
      )}
      <p className="text-xs text-muted-foreground">{t("storage")}</p>

      <div className="flex justify-end gap-2">
        {busy ? (
          <Button variant="outline" onPress={() => abort.current?.abort()}>
            {t("cancel")}
          </Button>
        ) : (
          <>
            <Button variant="outline" onPress={onClose}>
              {t("close")}
            </Button>
            <Button
              isDisabled={!files.length || !rights}
              onPress={() => void start()}
            >
              {t("start")}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
