import * as React from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Upload01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { useViewer } from "@/components/account/account-menu"
import { useT } from "@/i18n/core"
import type { ComicStyle, StyleAnalysis } from "@/lib/comic-import/style"

import { DEFAULT_LOOK } from "./model"
import { messages } from "./style-import.messages"
import { StyleImportDialog, analyzeStyle } from "./style-import-dialog"
import type { ComicEditor } from "./use-editor"

// A learned style drives the whole carousel: "raw" leaves only its own
// direction, and the palette controls have nothing to add to it.
function applyStyle(
  editor: ComicEditor,
  style: Pick<ComicStyle, "id" | "name" | "pages">,
  analysis: StyleAnalysis
) {
  editor.setLook({
    style: "raw",
    palette: null,
    styleRef: { id: style.id, pages: style.pages },
    recipe: {
      name: style.name,
      prose: analysis.prose,
      tags: analysis.tags.join(", "),
      negative: analysis.negative.join(", "),
    },
  })
}

// The styles learned from uploaded comics, under the Style wheel. Picking one
// copies its analysis into the carousel; the pages stay behind in private
// storage, found by id at render time.
export function StyleLibrary({
  editor,
  onCover,
}: {
  editor: ComicEditor
  onCover: (url: string | undefined) => void
}) {
  const t = useT(messages)
  const viewer = useViewer()
  const [styles, setStyles] = React.useState<ComicStyle[] | null>(null)
  const [references, setReferences] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [finishing, setFinishing] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)

  const signedIn = !!viewer
  const load = React.useCallback(async () => {
    if (!signedIn) return
    try {
      const res = await fetch("/api/styles")
      if (!res.ok) throw new Error()
      const body = (await res.json()) as {
        styles: ComicStyle[]
        references: boolean
      }
      setStyles(body.styles)
      setReferences(body.references)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [signedIn])

  React.useEffect(() => void load(), [load])

  const active = editor.project.look?.styleRef
  const selected = styles?.find((s) => s.id === active?.id)
  const missing = !!active && !!styles && !selected

  React.useEffect(() => {
    onCover(selected?.cover ?? undefined)
  }, [selected?.cover, onCover])

  React.useEffect(() => setConfirming(false), [active?.id])

  const choose = async (style: ComicStyle) => {
    setError(null)
    if (style.status === "ready" && style.analysis)
      return applyStyle(editor, style, style.analysis)
    setFinishing(style.id)
    try {
      applyStyle(editor, style, await analyzeStyle(style.id))
      await load()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("dialog.failed"))
    } finally {
      setFinishing(null)
    }
  }

  const stop = () => editor.setLook({ style: DEFAULT_LOOK.style })

  const remove = async () => {
    if (!selected) return
    stop()
    await fetch("/api/styles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "delete", id: selected.id }),
    })
    await load()
  }

  if (!viewer)
    return (
      <p className="mb-3 text-xs text-muted-foreground">
        <Link to="/login" className="underline underline-offset-2">
          {t("library.signIn")}
        </Link>
      </p>
    )

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">
          {t("library.title")}
        </h4>
        <Button variant="outline" size="sm" onPress={() => setImporting(true)}>
          {t("library.import")}
          <HugeiconsIcon
            icon={Upload01Icon}
            strokeWidth={2}
            data-icon="inline-end"
          />
        </Button>
      </div>

      {failed && (
        <p className="text-xs text-destructive">{t("library.loadFailed")}</p>
      )}
      {styles?.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("library.empty")}</p>
      )}

      {!!styles?.length && (
        <div className="flex gap-2 overflow-x-auto p-0.5">
          {styles.map((style) => {
            const on = style.id === active?.id
            const ready = style.status === "ready"
            return (
              <button
                key={style.id}
                type="button"
                aria-pressed={on}
                disabled={finishing !== null}
                onClick={() => void choose(style)}
                className={cn(
                  "flex w-20 shrink-0 cursor-pointer flex-col gap-1 rounded-lg p-1 text-start text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on && "ring-2 ring-foreground"
                )}
                aria-label={t(ready ? "library.use" : "library.finish", {
                  name: style.name,
                })}
              >
                <span className="relative aspect-[2/3] overflow-hidden rounded bg-muted">
                  {style.cover && (
                    <img
                      src={style.cover}
                      alt=""
                      className={cn(
                        "size-full object-cover",
                        !ready && "opacity-50"
                      )}
                    />
                  )}
                  {finishing === style.id && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Spinner />
                    </span>
                  )}
                </span>
                <span className="truncate">{style.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {missing && (
        <p role="alert" className="text-xs text-destructive">
          {t("library.unavailable")}
        </p>
      )}
      {active && !missing && !references && (
        <p className="text-xs text-muted-foreground">{t("library.textOnly")}</p>
      )}

      {active && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onPress={stop}>
            {t("library.stop")}
          </Button>
          {selected && (
            <Button
              variant="outline"
              size="sm"
              onPress={() => (confirming ? void remove() : setConfirming(true))}
            >
              {t(confirming ? "library.confirmDelete" : "library.delete")}
            </Button>
          )}
        </div>
      )}

      {importing && (
        <StyleImportDialog
          onClose={() => setImporting(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}
