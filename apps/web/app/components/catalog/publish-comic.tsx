import * as React from "react"
import { Link } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { GlobalIcon } from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@workspace/ui/components/button"
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

import { pageDoc } from "@/components/comic-canvas/model"
import { renderToBlob, type ImageCache } from "@/components/comic-canvas/render"
import type { ComicEditor } from "@/components/comic-canvas/use-editor"
import { useT } from "@/i18n/core"
import { uploadDataUrl } from "@/lib/cloud"
import { useSupabase } from "@/lib/supabase.browser"

import { messages } from "./catalog.messages"
import { catalogRequest } from "./client"
import { GENRES, type Genre } from "./model"

const PREVIEW_WIDTH = 864

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

// Puts the carousel in the public catalog, or updates what's there. Saves
// first, since the server publishes what it has stored.
export function PublishComicButton({
  editor,
  images,
  projectId,
  userId,
  title,
  save,
}: {
  editor: ComicEditor
  images: ImageCache
  projectId: string
  userId: string
  title: string
  save: () => Promise<void>
}) {
  const t = useT(messages)
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("publish.button")}
        className="shrink-0 max-md:px-1.5"
        onPress={() => setOpen(true)}
      >
        <HugeiconsIcon
          icon={GlobalIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        <span className="max-md:sr-only">{t("publish.button")}</span>
      </Button>
      {open && (
        <PublishDialog
          editor={editor}
          images={images}
          projectId={projectId}
          userId={userId}
          title={title}
          save={save}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function PublishDialog({
  editor,
  images,
  projectId,
  userId,
  title,
  save,
  onClose,
}: {
  editor: ComicEditor
  images: ImageCache
  projectId: string
  userId: string
  title: string
  save: () => Promise<void>
  onClose: () => void
}) {
  const t = useT(messages)
  const supabase = useSupabase()
  const [name, setName] = React.useState(title)
  const [description, setDescription] = React.useState("")
  const [genres, setGenres] = React.useState<Genre[]>([])
  const [agreed, setAgreed] = React.useState(false)
  // undefined until we know whether it's already in the catalog.
  const [existing, setExisting] = React.useState<
    { id: string; isPublic: boolean } | null | undefined
  >()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch(`/api/catalog?comicOf=${projectId}`)
      .then((r) => r.json())
      .then((json) => {
        setExisting(json.comic ?? null)
        if (json.comic) {
          setName(json.comic.name)
          setDescription(json.comic.description)
          setGenres(json.comic.genres)
        }
      })
      .catch(() => setExisting(null))
  }, [projectId])

  const publish = async () => {
    setError(null)
    try {
      setBusy(t("publish.saving"))
      await save()
      const project = editor.projectRef.current
      const pages: string[] = []
      for (let i = 0; i < project.pages.length; i++) {
        setBusy(
          t("publish.rendering", { n: i + 1, total: project.pages.length })
        )
        const doc = pageDoc(project, i)
        const blob = await renderToBlob(
          doc,
          images,
          "image/jpeg",
          PREVIEW_WIDTH / doc.width,
          0.85
        )
        if (!blob) throw new Error(t("publish.renderFailed"))
        pages.push(await uploadDataUrl(supabase, userId, await dataUrl(blob)))
      }
      setBusy(t("publish.saving"))
      const { id } = await catalogRequest({
        intent: "publish-comic",
        projectId,
        name,
        description,
        genres,
        pages,
      })
      setDone(id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const unpublish = async () => {
    if (!existing) return
    setError(null)
    setBusy(t("publish.saving"))
    try {
      await catalogRequest({
        intent: "publish",
        id: existing.id,
        isPublic: false,
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-lg"
    >
      <DialogHeader>
        <DialogTitle>{t(done ? "publish.done" : "publish.title")}</DialogTitle>
        <DialogDescription>
          {t(done ? "publish.doneBody" : "publish.description")}
        </DialogDescription>
      </DialogHeader>

      {done ? (
        <DialogFooter>
          <Button variant="outline" onPress={onClose}>
            {t("publish.close")}
          </Button>
          <Link to={`/catalog/${done}`} className={buttonVariants()}>
            {t("publish.view")}
          </Link>
        </DialogFooter>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("create.name")}
              </span>
              <Input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("publish.about")}
              </span>
              <Input
                value={description}
                maxLength={400}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {GENRES.map((g) => {
                const on = genres.includes(g)
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    disabled={!on && genres.length >= 4}
                    className={cn(
                      "h-7 cursor-pointer rounded-full border px-2.5 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default disabled:opacity-40",
                      on &&
                        "border-foreground bg-foreground text-background hover:bg-foreground/90"
                    )}
                    onClick={() =>
                      setGenres(
                        on ? genres.filter((x) => x !== g) : [...genres, g]
                      )
                    }
                  >
                    {t(`genres.${g}`)}
                  </button>
                )
              })}
            </div>
            <label className="flex cursor-pointer items-start justify-between gap-3 border-t pt-3">
              <span className="text-sm">{t("publish.rights")}</span>
              <Switch
                aria-label={t("publish.rights")}
                isSelected={agreed}
                onChange={setAgreed}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t("create.failed", { error })}
            </p>
          )}
          <DialogFooter>
            {existing?.isPublic && (
              <Button
                variant="ghost"
                className="sm:me-auto"
                isDisabled={!!busy}
                onPress={() => void unpublish()}
              >
                {t("publish.remove")}
              </Button>
            )}
            <Button variant="outline" onPress={onClose}>
              {t("publish.close")}
            </Button>
            <Button
              isDisabled={
                !!busy ||
                !name.trim() ||
                !agreed ||
                existing === undefined ||
                !editor.project.pages.length
              }
              onPress={() => void publish()}
            >
              {busy && <Spinner data-icon="inline-start" />}
              {busy ??
                t(existing?.isPublic ? "publish.update" : "publish.submit")}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  )
}
