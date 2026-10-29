import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { pageDoc, type ComicDoc } from "./model"
import { drawDoc, loadImages, type ImageCache } from "./render"
import { roving } from "./roving"
import type { ComicEditor } from "./use-editor"
import { useT } from "@/i18n/core"
import { messages } from "./page-strip.messages"

const THUMB_HEIGHT = 84
// Instagram caps a carousel at 20 slides.
export const MAX_SLIDES = 20

function Thumbnail({
  doc,
  images,
  width,
}: {
  doc: ComicDoc
  images: ImageCache
  width: number
}) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = React.useState(0)

  React.useEffect(() => {
    loadImages(doc, images, () => setLoaded((n) => n + 1))
  }, [doc, images])

  React.useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const scale =
      (width / doc.width) * Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(doc.width * scale)
    canvas.height = Math.round(doc.height * scale)
    drawDoc(canvas.getContext("2d")!, doc, { scale, images })
  }, [doc, images, width, loaded])

  return <canvas ref={ref} className="size-full" />
}

export function PageStrip({
  editor,
  images,
  generating,
}: {
  editor: ComicEditor
  images: ImageCache
  generating: Record<string, unknown>
}) {
  const t = useT(messages)
  const { project, pageIndex } = editor
  const count = project.pages.length
  const width = Math.round((THUMB_HEIGHT * project.width) / project.height)
  const [dragFrom, setDragFrom] = React.useState<number | null>(null)
  const [dropAt, setDropAt] = React.useState<number | null>(null)
  const activeRef = React.useRef<HTMLLIElement>(null)

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [pageIndex])

  const endDrag = () => {
    setDragFrom(null)
    setDropAt(null)
  }

  return (
    <div
      data-slot="comic-pages"
      className="flex shrink-0 items-center gap-3 border-b bg-background px-3 py-2.5"
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="text-xs font-medium tabular-nums">
          {pageIndex + 1} / {count}
        </span>
        <div className="flex">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("previous")}
            isDisabled={pageIndex === 0}
            onPress={() => editor.goToPage(pageIndex - 1)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("next")}
            isDisabled={pageIndex === count - 1}
            onPress={() => editor.goToPage(pageIndex + 1)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>

      <ol
        aria-label={t("slides")}
        data-roving-group
        onKeyDown={roving({ axis: "x", select: true })}
        className="flex min-w-0 flex-1 [scrollbar-width:thin] items-center gap-2 overflow-x-auto py-1"
      >
        {project.pages.map((page, i) => {
          const active = i === pageIndex
          const busy = page.layers.some((l) => l.id in generating)
          return (
            <li
              key={page.id}
              ref={active ? activeRef : undefined}
              draggable
              onDragStart={(e) => {
                setDragFrom(i)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return
                e.preventDefault()
                const rect = e.currentTarget.getBoundingClientRect()
                setDropAt(e.clientX < rect.left + rect.width / 2 ? i : i + 1)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragFrom !== null && dropAt !== null) {
                  editor.movePage(
                    dragFrom,
                    dropAt > dragFrom ? dropAt - 1 : dropAt
                  )
                }
                endDrag()
              }}
              onDragEnd={endDrag}
              className={cn(
                "group/slide relative shrink-0 rounded-md p-0.5",
                dragFrom === i && "opacity-40",
                dropAt === i &&
                  "before:absolute before:inset-y-0 before:-start-1.5 before:w-0.5 before:rounded-full before:bg-amber-500",
                dropAt === i + 1 &&
                  i === count - 1 &&
                  "after:absolute after:inset-y-0 after:-end-1.5 after:w-0.5 after:rounded-full after:bg-amber-500"
              )}
            >
              <button
                type="button"
                aria-label={t("slide", { n: i + 1 })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block cursor-pointer overflow-hidden rounded-sm ring-1 ring-foreground/15 transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
                  active && "ring-2 ring-amber-500 hover:ring-amber-500"
                )}
                style={{ width, height: THUMB_HEIGHT }}
                data-roving
                onClick={() => editor.goToPage(i)}
                // Option+arrows move the slide itself.
                onKeyDown={(e) => {
                  if (!e.altKey) return
                  const by =
                    e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
                  if (!by) return
                  e.preventDefault()
                  editor.movePage(i, i + by)
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLElement>(
                        `[data-slot="comic-pages"] [aria-current="page"]`
                      )
                      ?.focus()
                  )
                }}
              >
                <Thumbnail
                  doc={pageDoc(project, i)}
                  images={images}
                  width={width}
                />
                {busy && (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/50">
                    <Spinner className="size-4" />
                  </span>
                )}
              </button>
              <span className="pointer-events-none absolute start-1.5 bottom-1.5 rounded-sm bg-foreground/80 px-1 text-[10px] leading-4 font-medium text-background tabular-nums">
                {i + 1}
              </span>
              <div className="absolute end-1 top-1 opacity-0 transition-opacity group-focus-within/slide:opacity-100 group-hover/slide:opacity-100 pointer-coarse:opacity-100">
                <DropdownMenuTrigger>
                  <Button
                    variant="secondary"
                    size="icon-xs"
                    aria-label={t("actions", { n: i + 1 })}
                    className="shadow-sm"
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                  </Button>
                  <DropdownMenu
                    placement="bottom start"
                    className="w-max max-w-[calc(100vw-2rem)] min-w-44"
                    disabledKeys={[
                      ...(i === 0 ? ["left"] : []),
                      ...(i === count - 1 ? ["right"] : []),
                      ...(count === 1 ? ["delete"] : []),
                      ...(count >= MAX_SLIDES ? ["duplicate"] : []),
                    ]}
                    onAction={(key) => {
                      if (key === "duplicate") editor.duplicatePage(i)
                      if (key === "left") editor.movePage(i, i - 1)
                      if (key === "right") editor.movePage(i, i + 1)
                      if (key === "delete") editor.removePage(i)
                    }}
                  >
                    <DropdownMenuItem id="duplicate">
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                      {t("duplicate")}
                    </DropdownMenuItem>
                    <DropdownMenuItem id="left">
                      <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                      {t("moveLeft")}
                    </DropdownMenuItem>
                    <DropdownMenuItem id="right">
                      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                      {t("moveRight")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem id="delete" variant="destructive">
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenu>
                </DropdownMenuTrigger>
              </div>
            </li>
          )
        })}
        <li className="shrink-0 p-0.5">
          <button
            type="button"
            disabled={count >= MAX_SLIDES}
            title={
              count >= MAX_SLIDES
                ? t("limit", { max: MAX_SLIDES })
                : t("addAfter")
            }
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed text-xs text-muted-foreground transition-colors outline-none hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            style={{ width, height: THUMB_HEIGHT }}
            onClick={editor.addPage}
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              className="size-4"
            />
            {t("add")}
          </button>
        </li>
      </ol>
    </div>
  )
}
