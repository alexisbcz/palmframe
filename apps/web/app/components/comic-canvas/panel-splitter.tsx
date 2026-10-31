import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Delete02Icon,
  FloppyDiskIcon,
  ImageUploadIcon,
  LayoutTwoColumnIcon,
  LayoutTwoRowIcon,
  RefreshIcon,
  ScissorIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import { pickFile } from "./actions"
import { loadImage } from "./edit-tools"
import {
  MIN_FRAME,
  dragFrame,
  pageSource,
  placeFrames,
  splitFrame,
  type FrameHandle,
  type KnifeAxis,
} from "./knife"
import { cellsFromFrames, placePreset, readingOrder } from "./layouts"
import {
  MAX_LAYOUT_CELLS,
  MAX_LAYOUT_NAME,
  MAX_SAVED_LAYOUTS,
  uid,
  type Rect,
} from "./model"
import { messages } from "./panel-splitter.messages"
import {
  DETECT_SIDE,
  detectPanels,
  type DetectionNote,
} from "./pixel/detect-panels"
import { grayFromImage } from "./pixel/gray"
import { readImageFile } from "./render"
import type { ComicEditor } from "./use-editor"

interface Source {
  src: string
  width: number
  height: number
}

interface Drag {
  index: number
  handle: FrameHandle
  start: Rect
  x: number
  y: number
  // A panel being drawn, which a plain click shouldn't leave behind.
  drawing?: boolean
  moved?: boolean
}

const HANDLES: {
  handle: FrameHandle
  left: number
  top: number
  cursor: string
}[] = [
  { handle: "nw", left: 0, top: 0, cursor: "nwse-resize" },
  { handle: "n", left: 50, top: 0, cursor: "ns-resize" },
  { handle: "ne", left: 100, top: 0, cursor: "nesw-resize" },
  { handle: "e", left: 100, top: 50, cursor: "ew-resize" },
  { handle: "se", left: 100, top: 100, cursor: "nwse-resize" },
  { handle: "s", left: 50, top: 100, cursor: "ns-resize" },
  { handle: "sw", left: 0, top: 100, cursor: "nesw-resize" },
  { handle: "w", left: 0, top: 50, cursor: "ew-resize" },
]

const percent = (fraction: number) => `${fraction * 100}%`

// Detection's result is only ever a draft here: this dialog is the one way to
// a page, and nothing reaches the page until someone acts on what they see.
export function PanelSplitter({
  editor,
  onClose,
}: {
  editor: ComicEditor
  onClose: () => void
}) {
  const t = useT(messages)
  const { doc, project } = editor
  const rtl = !!project.rtl
  const [source, setSource] = React.useState<Source | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [detected, setDetected] = React.useState<Rect[]>([])
  const [frames, setFrames] = React.useState<Rect[]>([])
  const [notes, setNotes] = React.useState<DetectionNote[]>([])
  const [active, setActive] = React.useState<number | null>(null)
  const [name, setName] = React.useState("")
  const [saved, setSaved] = React.useState(false)
  const stage = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<Drag | null>(null)
  const reading = React.useRef(0)

  const read = React.useCallback(async (src: string) => {
    const run = ++reading.current
    setBusy(true)
    setFailed(false)
    try {
      const img = await loadImage(src)
      const found = detectPanels(grayFromImage(img, DETECT_SIDE))
      if (run !== reading.current) return
      setSource({ src, width: img.naturalWidth, height: img.naturalHeight })
      setDetected(found.frames)
      setFrames(found.frames)
      setNotes(found.notes)
      setActive(null)
      setSaved(false)
    } catch {
      if (run === reading.current) setFailed(true)
    } finally {
      if (run === reading.current) setBusy(false)
    }
  }, [])

  const choose = async () => {
    const file = await pickFile("image/*")
    if (!file) return
    try {
      const { src } = await readImageFile(file)
      await read(src)
    } catch {
      setFailed(true)
    }
  }

  const first = React.useRef(
    pageSource(editor.docRef.current.layers, editor.selected?.id)
  )
  React.useEffect(() => {
    if (first.current) void read(first.current)
  }, [read])

  const edit = (next: Rect[]) => {
    setFrames(next)
    setSaved(false)
  }
  const replaceActive = (parts: Rect[]) => {
    if (active === null) return
    edit([...frames.slice(0, active), ...parts, ...frames.slice(active + 1)])
    setActive(parts.length ? active : null)
  }
  const add = () => {
    const i = frames.length
    const shift = (i % 6) * 0.03
    edit([
      ...frames,
      { x: 0.3 + shift, y: 0.3 + shift, width: 0.3, height: 0.3 },
    ])
    setActive(i)
  }
  const split = (axis: KnifeAxis) => {
    if (active !== null) replaceActive(splitFrame(frames[active]!, axis))
  }
  const remove = () => replaceActive([])

  const startDrag = (
    e: React.PointerEvent,
    index: number,
    handle: FrameHandle
  ) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      index,
      handle,
      start: frames[index]!,
      x: e.clientX,
      y: e.clientY,
    }
    setActive(index)
  }
  const onDrag = (e: React.PointerEvent) => {
    const d = drag.current
    const box = stage.current?.getBoundingClientRect()
    if (!d || !box?.width || !box.height) return
    d.moved = true
    const next = dragFrame(
      d.start,
      d.handle,
      (e.clientX - d.x) / box.width,
      (e.clientY - d.y) / box.height
    )
    setFrames((all) => all.map((f, i) => (i === d.index ? next : f)))
    setSaved(false)
  }
  const endDrag = () => {
    const d = drag.current
    drag.current = null
    if (d?.drawing && !d.moved) {
      setFrames((all) => all.filter((_, i) => i !== d.index))
      setActive(null)
    }
  }
  // Dragging on the bare page draws a panel from where it started.
  const startDrawing = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    if (frames.length >= MAX_LAYOUT_CELLS || !box.width || !box.height) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const x = Math.min(1 - MIN_FRAME, (e.clientX - box.left) / box.width)
    const y = Math.min(1 - MIN_FRAME, (e.clientY - box.top) / box.height)
    const start = { x, y, width: MIN_FRAME, height: MIN_FRAME }
    drag.current = {
      index: frames.length,
      handle: "se",
      start,
      x: e.clientX,
      y: e.clientY,
      drawing: true,
    }
    edit([...frames, start])
    setActive(frames.length)
  }

  const onFrameKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      edit(frames.filter((_, i) => i !== index))
      setActive(null)
      return
    }
    const step = e.shiftKey ? 0.05 : 0.005
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
    if (!dx && !dy) return
    e.preventDefault()
    const next = dragFrame(frames[index]!, "move", dx, dy)
    edit(frames.map((f, i) => (i === index ? next : f)))
  }

  const scaled = frames.map((f, i) => ({
    x: f.x * doc.width,
    y: f.y * doc.height,
    width: f.width * doc.width,
    i,
  }))
  const order = readingOrder(scaled, rtl).map((f) => f.i)

  const ready = !!source && frames.length > 0
  const tooMany = frames.length > MAX_LAYOUT_CELLS
  const hasLocked = doc.layers.some((l) => l.type === "panel" && l.locked)
  const layoutsFull = (project.layouts?.length ?? 0) >= MAX_SAVED_LAYOUTS

  const applyLayout = () => {
    const cells = cellsFromFrames(frames, rtl)
    editor.commit((d) => ({
      ...d,
      layers: placePreset(d, { id: "frames", cells }, rtl),
    }))
    editor.select(null)
    onClose()
  }
  const cut = () => {
    if (!source) return
    editor.commit((d) => ({
      ...d,
      layers: placeFrames(d, frames, source.src, source, rtl),
    }))
    editor.select(null)
    onClose()
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const title = name.trim()
    if (!title || !ready || tooMany || layoutsFull) return
    const cells = cellsFromFrames(frames, rtl)
    editor.commitProject((p) => ({
      ...p,
      layouts: [...(p.layouts ?? []), { id: uid(), name: title, cells }],
    }))
    setName("")
    setSaved(true)
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-4xl"
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      {/* The editor's shortcuts listen on the window; these keys stay here.
          Tab and Escape still reach the dialog's own focus handling. */}
      <div
        className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_15rem]"
        onKeyDown={(e) => {
          if (e.key !== "Tab" && e.key !== "Escape") e.stopPropagation()
        }}
      >
        <div className="flex min-w-0 items-center justify-center rounded-lg bg-muted p-2">
          {source ? (
            <div
              ref={stage}
              dir="ltr"
              role="group"
              aria-label={t("page")}
              className="relative cursor-crosshair touch-none select-none"
              style={{
                aspectRatio: `${source.width} / ${source.height}`,
                width: `min(100%, calc((100svh - 19rem) * ${source.width / source.height}))`,
              }}
              onPointerDown={startDrawing}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <img
                src={source.src}
                alt=""
                draggable={false}
                className="pointer-events-none size-full"
              />
              {frames.map((frame, i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: percent(frame.x),
                    top: percent(frame.y),
                    width: percent(frame.width),
                    height: percent(frame.height),
                  }}
                >
                  <button
                    type="button"
                    aria-label={t("panel", { n: order.indexOf(i) + 1 })}
                    aria-pressed={active === i}
                    className={cn(
                      "absolute inset-0 cursor-move outline-none focus-visible:ring-4 focus-visible:ring-ring/60",
                      active === i
                        ? "bg-amber-500/25 ring-2 ring-amber-500"
                        : "bg-amber-500/10 ring-2 ring-amber-500/80"
                    )}
                    onPointerDown={(e) => startDrag(e, i, "move")}
                    onKeyDown={(e) => onFrameKey(e, i)}
                    onFocus={() => setActive(i)}
                  >
                    <span className="absolute start-1 top-1 rounded-sm bg-background px-1 text-xs text-foreground tabular-nums">
                      {order.indexOf(i) + 1}
                    </span>
                  </button>
                  {active === i &&
                    HANDLES.map(({ handle, left, top, cursor }) => (
                      <span
                        key={handle}
                        aria-hidden
                        className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500 ring-2 ring-background after:absolute after:-inset-2 after:content-['']"
                        style={{ left: `${left}%`, top: `${top}%`, cursor }}
                        onPointerDown={(e) => startDrag(e, i, handle)}
                      />
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
              {busy ? (
                <>
                  <Spinner />
                  <p role="status">{t("loading")}</p>
                </>
              ) : (
                <>
                  <p className="max-w-sm text-balance">
                    {t(failed ? "failed" : "empty")}
                  </p>
                  <Button variant="outline" onPress={() => void choose()}>
                    <HugeiconsIcon
                      icon={ImageUploadIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("choose")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm font-medium tabular-nums" aria-live="polite">
            {source && t("found", { count: frames.length })}
          </p>
          {source && (
            <>
              {notes.map((note) => (
                <p
                  key={note}
                  className="rounded-md bg-amber-500/15 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200"
                >
                  {t(`notes.${note}`)}
                </p>
              ))}
              {failed && (
                <p role="alert" className="text-xs text-destructive">
                  {t("failed")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("help")}</p>
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="outline"
                  className="justify-start"
                  isDisabled={frames.length >= MAX_LAYOUT_CELLS}
                  onPress={add}
                >
                  <HugeiconsIcon
                    icon={Add01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("add")}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  isDisabled={active === null}
                  onPress={() => split("x")}
                >
                  <HugeiconsIcon
                    icon={LayoutTwoColumnIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("splitX")}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  isDisabled={active === null}
                  onPress={() => split("y")}
                >
                  <HugeiconsIcon
                    icon={LayoutTwoRowIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("splitY")}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  isDisabled={active === null}
                  onPress={remove}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("remove")}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onPress={() => {
                    edit(detected)
                    setActive(null)
                  }}
                >
                  <HugeiconsIcon
                    icon={RefreshIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("reset")}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  isDisabled={busy}
                  onPress={() => void choose()}
                >
                  <HugeiconsIcon
                    icon={ImageUploadIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("another")}
                </Button>
              </div>
              <form className="flex flex-col gap-1.5" onSubmit={save}>
                <ButtonGroup className="w-full">
                  <Input
                    aria-label={t("layoutName")}
                    placeholder={t("layoutName")}
                    value={name}
                    maxLength={MAX_LAYOUT_NAME}
                    onChange={(e) => {
                      setName(e.target.value)
                      setSaved(false)
                    }}
                    className="min-w-0"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    isDisabled={
                      !name.trim() || !ready || tooMany || layoutsFull
                    }
                  >
                    {t("save")}
                    <HugeiconsIcon
                      icon={FloppyDiskIcon}
                      strokeWidth={2}
                      data-icon="inline-end"
                    />
                  </Button>
                </ButtonGroup>
                <p
                  className="text-xs text-muted-foreground empty:hidden"
                  aria-live="polite"
                >
                  {layoutsFull
                    ? t("full", { count: MAX_SAVED_LAYOUTS })
                    : saved
                      ? t("saved")
                      : ""}
                </p>
              </form>
            </>
          )}
        </div>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {t(hasLocked ? "locked" : "replaces")}
        </p>
        <div className="flex w-full shrink-0 flex-col-reverse gap-2 sm:w-auto sm:flex-row">
          <Button variant="outline" onPress={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="outline"
            isDisabled={!ready || tooMany}
            onPress={applyLayout}
          >
            {t("useLayout")}
          </Button>
          <Button
            variant="outline"
            isDisabled={!ready || tooMany || hasLocked}
            onPress={cut}
          >
            <HugeiconsIcon
              icon={ScissorIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("cut")}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  )
}
