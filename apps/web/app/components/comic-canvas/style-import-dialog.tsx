import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, Upload01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"
import {
  FILE_ACCEPT,
  openComic,
  pageJpeg,
  type ImportPage,
  type OpenedComic,
} from "@/lib/comic-import/client"
import { ImportError } from "@/lib/comic-import/errors"
import { MAX_STYLE_NAME, MAX_STYLE_PAGES } from "@/lib/comic-import/limits"
import type { StyleAnalysis } from "@/lib/comic-import/style"
import { COSTS } from "@/lib/credits"
import { INSUFFICIENT_CREDITS, setCredits } from "@/lib/credits-store"
import { COMIC_STYLES_BUCKET } from "@/lib/database"
import { useSupabase } from "@/lib/supabase.browser"

import { messages } from "./style-import.messages"

const THUMB_SIDE = 280

// One thumbnail decodes at a time: a tall grid shouldn't unpack a whole book.
let thumbQueue: Promise<unknown> = Promise.resolve()

function PageThumb({
  page,
  selected,
  disabled,
  onToggle,
}: {
  page: ImportPage
  selected: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const t = useT(messages)
  const ref = React.useRef<HTMLButtonElement>(null)
  const [url, setUrl] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: "200px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!visible) return
    let gone = false
    let made: string | null = null
    const run = thumbQueue.then(async () => {
      if (gone) return
      try {
        const canvas = await page.draw(THUMB_SIDE)
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.7)
        )
        if (!blob) throw new ImportError("corrupt")
        if (gone) return
        made = URL.createObjectURL(blob)
        setUrl(made)
      } catch {
        if (!gone) setFailed(true)
      }
    })
    thumbQueue = run
    return () => {
      gone = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [page, visible])

  const label = t("dialog.page", { label: page.label })
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={page.label}
      disabled={failed || (disabled && !selected)}
      onClick={onToggle}
      className={cn(
        "relative aspect-[2/3] cursor-pointer overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        selected && "ring-2 ring-foreground"
      )}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-contain" />
      ) : failed ? (
        <span className="flex size-full items-center justify-center p-1 text-center text-xs text-muted-foreground">
          {t("dialog.unreadable")}
        </span>
      ) : (
        <Skeleton className="size-full" />
      )}
      {selected && (
        <span className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3" />
        </span>
      )}
    </button>
  )
}

async function post(body: object) {
  const res = await fetch("/api/styles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const credits = res.headers.get("x-credits")
  if (credits !== null) setCredits(Number(credits))
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    if (json?.code === INSUFFICIENT_CREDITS)
      throw new Error(INSUFFICIENT_CREDITS)
    throw new Error(json?.error ?? "")
  }
  return json
}

export const analyzeStyle = async (id: string) =>
  (await post({ intent: "analyze", id })).analysis as StyleAnalysis

type Step =
  | { name: "preparing" }
  | { name: "uploading"; count: number; total: number }
  | { name: "analyzing" }

// Drop a comic, pick pages, name it: the file is read here in the browser, and
// only the picked pages travel, directly to private storage.
export function StyleImportDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT(messages)
  const supabase = useSupabase()
  const input = React.useRef<HTMLInputElement>(null)
  const [comic, setComic] = React.useState<OpenedComic | null>(null)
  const [opening, setOpening] = React.useState(false)
  const [refused, setRefused] = React.useState<
    { file?: string; code: ImportError["code"] }[]
  >([])
  const [picked, setPicked] = React.useState<string[]>([])
  const [name, setName] = React.useState("")
  const [rights, setRights] = React.useState(false)
  const rightsLabel = React.useId()
  const [step, setStep] = React.useState<Step | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // A style whose pages are up, so a retry only repeats the analysis.
  const [draftId, setDraftId] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)

  const current = React.useRef<OpenedComic | null>(null)
  React.useEffect(() => () => current.current?.close(), [])

  const open = async (files: File[]) => {
    if (!files.length) return
    current.current?.close()
    current.current = null
    setComic(null)
    setPicked([])
    setRefused([])
    setError(null)
    setOpening(true)
    try {
      const opened = await openComic(files)
      current.current = opened
      setRefused(opened.failures)
      if (opened.pages.length) setComic(opened)
    } catch (e) {
      setRefused([{ code: e instanceof ImportError ? e.code : "corrupt" }])
    } finally {
      setOpening(false)
    }
  }

  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length < MAX_STYLE_PAGES
          ? [...p, id]
          : p
    )

  const upload = async (pages: ImportPage[]) => {
    setStep({ name: "preparing" })
    const blobs = await Promise.all(pages.map(pageJpeg))
    const { id, uploads } = (await post({
      intent: "prepare",
      name: name.trim(),
      pages: pages.length,
      rights,
    })) as { id: string; uploads: { path: string; token: string }[] }
    const bucket = supabase.storage.from(COMIC_STYLES_BUCKET)
    for (const [i, target] of uploads.entries()) {
      setStep({ name: "uploading", count: i + 1, total: uploads.length })
      const { error: failed } = await bucket.uploadToSignedUrl(
        target.path,
        target.token,
        blobs[i]!,
        { contentType: "image/jpeg" }
      )
      if (failed) throw failed
    }
    setDraftId(id)
    return id
  }

  const save = async () => {
    if (!comic) return
    setError(null)
    try {
      const pages = comic.pages.filter((p) => picked.includes(p.id))
      const id = draftId ?? (await upload(pages))
      setStep({ name: "analyzing" })
      await analyzeStyle(id)
      onSaved()
      onClose()
    } catch (e) {
      // A style left as a draft shows in the library, so nothing here is lost.
      if (draftId === null) onSaved()
      const message = e instanceof Error ? e.message : ""
      setError(
        message === INSUFFICIENT_CREDITS
          ? t("dialog.noCredits")
          : message || t("dialog.failed")
      )
    } finally {
      setStep(null)
    }
  }

  const busy = step !== null
  const canSave = picked.length > 0 && !!name.trim() && rights && !busy

  return (
    <Dialog
      isOpen
      isDismissable={!busy}
      onOpenChange={(o) => !o && !busy && onClose()}
      className="sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle className="studio-title">{t("dialog.title")}</DialogTitle>
        <DialogDescription>{t("dialog.description")}</DialogDescription>
      </DialogHeader>

      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={FILE_ACCEPT}
        aria-label={t("dialog.browse")}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ""
          void open(files)
        }}
      />

      {!comic && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void open([...e.dataTransfer.files])
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors",
            dragging && "border-foreground bg-muted/50"
          )}
        >
          {opening ? (
            <>
              <Spinner />
              <p className="text-muted-foreground">{t("dialog.opening")}</p>
            </>
          ) : (
            <>
              <p className="font-medium">{t("dialog.drop")}</p>
              <p className="text-xs text-muted-foreground">
                {t("dialog.formats")}
              </p>
              <Button
                variant="outline"
                className="mt-2"
                onPress={() => input.current?.click()}
              >
                {t("dialog.browse")}
                <HugeiconsIcon
                  icon={Upload01Icon}
                  strokeWidth={2}
                  data-icon="inline-end"
                />
              </Button>
            </>
          )}
        </div>
      )}

      {refused.map((r, i) => (
        <p key={i} role="alert" className="text-xs text-destructive">
          {r.file
            ? t("dialog.skipped", {
                file: r.file,
                reason: t(`errors.${r.code}`),
              })
            : t(`errors.${r.code}`)}
        </p>
      ))}

      {comic && (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-medium">
              {t("dialog.pick", { max: MAX_STYLE_PAGES })}
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("dialog.picked", {
                count: picked.length,
                max: MAX_STYLE_PAGES,
              })}
            </span>
          </div>
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto p-0.5 sm:grid-cols-5">
            {comic.pages.map((page) => (
              <PageThumb
                key={page.id}
                page={page}
                selected={picked.includes(page.id)}
                disabled={busy || picked.length >= MAX_STYLE_PAGES}
                onToggle={() => !busy && !draftId && toggle(page.id)}
              />
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("dialog.name")}
            </span>
            <Input
              value={name}
              maxLength={MAX_STYLE_NAME}
              placeholder={t("dialog.namePlaceholder")}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="flex items-start gap-2">
            <span className="flex h-lh items-center">
              <Checkbox
                aria-labelledby={rightsLabel}
                isSelected={rights}
                isDisabled={busy || !!draftId}
                onChange={setRights}
              />
            </span>
            <span
              id={rightsLabel}
              className="cursor-pointer text-start"
              onClick={() => !busy && !draftId && setRights((r) => !r)}
            >
              {t("dialog.rights")}
            </span>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t("dialog.device")}</p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {comic && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {step && (
            <span
              className="me-auto text-xs text-muted-foreground"
              role="status"
            >
              {step.name === "uploading"
                ? t("dialog.uploading", {
                    count: step.count,
                    total: step.total,
                  })
                : t(`dialog.${step.name}`)}
            </span>
          )}
          <Button
            variant="outline"
            isDisabled={busy || !!draftId}
            onPress={() => input.current?.click()}
          >
            {t("dialog.another")}
          </Button>
          <Button variant="outline" isDisabled={!canSave} onPress={save}>
            {busy && <Spinner data-icon="inline-start" />}
            {error
              ? t("dialog.retry")
              : t("dialog.save", { credits: COSTS.style_analysis })}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
