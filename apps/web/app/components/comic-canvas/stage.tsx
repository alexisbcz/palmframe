import * as React from "react"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { insertImageFile } from "./actions"
import type { CanvasMenuRequest } from "./canvas-menu"
import { PAGE_MARGIN, type ComicDoc, type Layer } from "./model"
import {
  drawDoc,
  fontsReady,
  hitTest,
  loadImages,
  toLocal,
  type ImageCache,
} from "./render"
import type { ComicEditor } from "./use-editor"
import { useT } from "@/i18n/core"
import { messages } from "./stage.messages"
import { EditOverlay } from "./mask-overlay"

const MIN_SIZE = 24
const HANDLES = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
] as const
const RESIZE_CURSORS = ["nwse", "ns", "nesw", "ew"]

type Drag =
  | { kind: "move"; start: Layer; px: number; py: number; key: string }
  | {
      kind: "resize"
      start: Layer
      hx: number
      hy: number
      px: number
      py: number
      key: string
    }
  | { kind: "rotate"; start: Layer; key: string }
  | { kind: "tail"; start: Layer; key: string }

type Guides = { x: number[]; y: number[] }

// Cursor for a handle, accounting for the layer's rotation.
function handleCursor(hx: number, hy: number, rotation: number) {
  const angle = (Math.atan2(hy, hx) * 180) / Math.PI + rotation
  const index = Math.round((((angle % 180) + 180) % 180) / 45) % 4
  return `${RESIZE_CURSORS[[3, 0, 1, 2][index]!]}-resize`
}

function snapMove(
  doc: ComicDoc,
  layer: Layer,
  x: number,
  y: number,
  threshold: number
) {
  const targetsX = [
    0,
    doc.width / 2,
    doc.width,
    PAGE_MARGIN,
    doc.width - PAGE_MARGIN,
  ]
  const targetsY = [
    0,
    doc.height / 2,
    doc.height,
    PAGE_MARGIN,
    doc.height - PAGE_MARGIN,
  ]
  for (const l of doc.layers) {
    if (l.id === layer.id || l.hidden) continue
    targetsX.push(l.x, l.x + l.width / 2, l.x + l.width)
    targetsY.push(l.y, l.y + l.height / 2, l.y + l.height)
  }
  const snap = (pos: number, size: number, targets: number[]) => {
    let best: { delta: number; at: number } | null = null
    for (const edge of [pos, pos + size / 2, pos + size]) {
      for (const t of targets) {
        const delta = t - edge
        if (
          Math.abs(delta) <= threshold &&
          (!best || Math.abs(delta) < Math.abs(best.delta))
        ) {
          best = { delta, at: t }
        }
      }
    }
    return best
  }
  const sx = snap(x, layer.width, targetsX)
  const sy = snap(y, layer.height, targetsY)
  return {
    x: x + (sx?.delta ?? 0),
    y: y + (sy?.delta ?? 0),
    guides: { x: sx ? [sx.at] : [], y: sy ? [sy.at] : [] },
  }
}

function resize(
  start: Layer,
  hx: number,
  hy: number,
  dx: number,
  dy: number,
  e: PointerEvent
): Partial<Layer> {
  const a = (start.rotation * Math.PI) / 180
  const lx = dx * Math.cos(-a) - dy * Math.sin(-a)
  const ly = dx * Math.sin(-a) + dy * Math.cos(-a)
  const fromCenter = e.altKey
  const k = fromCenter ? 2 : 1
  let w = start.width + lx * hx * k
  let h = start.height + ly * hy * k
  const corner = hx !== 0 && hy !== 0
  // Text scales with its box from the corners, like a placed graphic.
  const keepRatio = corner && (e.shiftKey || start.type === "text")
  if (keepRatio) {
    const s = Math.max(w / start.width, h / start.height)
    w = start.width * s
    h = start.height * s
  }
  w = Math.max(MIN_SIZE, w)
  h = Math.max(MIN_SIZE, h)
  const dw = w - start.width
  const dh = h - start.height
  const cxl = fromCenter ? 0 : (hx * dw) / 2
  const cyl = fromCenter ? 0 : (hy * dh) / 2
  const cx = start.x + start.width / 2 + cxl * Math.cos(a) - cyl * Math.sin(a)
  const cy = start.y + start.height / 2 + cxl * Math.sin(a) + cyl * Math.cos(a)
  const patch: Partial<Layer> = {
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    width: Math.round(w),
    height: Math.round(h),
  }
  if (start.type === "bubble") {
    Object.assign(patch, {
      tailX: Math.round(start.tailX * (w / start.width)),
      tailY: Math.round(start.tailY * (h / start.height)),
    })
  }
  if (start.type === "text" && keepRatio) {
    const s = w / start.width
    Object.assign(patch, {
      fontSize: Math.max(8, Math.round(start.fontSize * s)),
      strokeWidth: Math.round(start.strokeWidth * s * 10) / 10,
    })
  }
  return patch
}

export function Stage({
  editor,
  images,
  zoom,
  fit,
  onZoom,
  generating,
  onContextMenu,
}: {
  editor: ComicEditor
  images: ImageCache
  zoom: number
  fit: boolean
  onZoom: (zoom: number, fit?: boolean) => void
  generating: Record<string, unknown>
  onContextMenu: (request: CanvasMenuRequest) => void
}) {
  const t = useT(messages)
  const { doc, selected } = editor
  const emptyLabel = t("placeholder.empty")
  const loadingLabel = t("placeholder.loading")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const boardRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const dragRef = React.useRef<Drag | null>(null)
  const zoomRef = React.useRef(zoom)
  zoomRef.current = zoom
  const [hoverId, setHoverId] = React.useState<string | null>(null)
  const [guides, setGuides] = React.useState<Guides>({ x: [], y: [] })
  const [dragging, setDragging] = React.useState(false)
  const [redraw, setRedraw] = React.useState(0)
  const bump = React.useCallback(() => setRedraw((n) => n + 1), [])

  React.useEffect(() => {
    fontsReady().then(bump)
    document.fonts.addEventListener("loadingdone", bump)
    return () => document.fonts.removeEventListener("loadingdone", bump)
  }, [bump])

  React.useEffect(() => {
    loadImages(doc, images, bump)
  }, [doc, images, bump])

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scale = zoom * Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(doc.width * scale)
    canvas.height = Math.round(doc.height * scale)
    drawDoc(canvas.getContext("2d")!, doc, {
      scale,
      images,
      editor: true,
      labels: { empty: emptyLabel, loading: loadingLabel },
    })
  }, [doc, zoom, images, redraw, emptyLabel, loadingLabel])

  // Fit the page to the viewport, leaving room for the floating toolbar.
  React.useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || !fit) return
    const measure = () => {
      const z = Math.min(
        (el.clientWidth - 96) / doc.width,
        (el.clientHeight - 176) / doc.height
      )
      onZoom(Math.max(0.05, Math.floor(z * 100) / 100), true)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit, doc.width, doc.height, onZoom])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const next = zoomRef.current * Math.exp(-e.deltaY * 0.01)
      onZoom(Math.min(4, Math.max(0.05, next)), false)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [onZoom])

  const toPagePoint = (e: { clientX: number; clientY: number }) => {
    const rect = boardRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / zoomRef.current,
      y: (e.clientY - rect.top) / zoomRef.current,
    }
  }

  const startDrag = (drag: Drag) => {
    dragRef.current = drag
    setDragging(true)
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const p = toPagePoint(e)
      const s = d.start
      if (d.kind === "move") {
        const nx = s.x + p.x - d.px
        const ny = s.y + p.y - d.py
        const snapped = e.altKey
          ? { x: nx, y: ny, guides: { x: [], y: [] } }
          : snapMove(editor.docRef.current, s, nx, ny, 6 / zoomRef.current)
        setGuides(snapped.guides)
        editor.update(
          s.id,
          { x: Math.round(snapped.x), y: Math.round(snapped.y) },
          d.key
        )
      } else if (d.kind === "resize") {
        editor.update(
          s.id,
          resize(s, d.hx, d.hy, p.x - d.px, p.y - d.py, e),
          d.key
        )
      } else if (d.kind === "rotate") {
        const cx = s.x + s.width / 2
        const cy = s.y + s.height / 2
        let angle = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90
        if (e.shiftKey) angle = Math.round(angle / 15) * 15
        else if (Math.abs(angle - Math.round(angle / 90) * 90) < 2)
          angle = Math.round(angle / 90) * 90
        angle = ((((angle + 180) % 360) + 360) % 360) - 180
        editor.update(s.id, { rotation: Math.round(angle) }, d.key)
      } else {
        const local = toLocal(s, p.x, p.y)
        editor.update(
          s.id,
          { tailX: Math.round(local.x), tailY: Math.round(local.y) },
          d.key
        )
      }
    }
    const onUp = () => {
      dragRef.current = null
      setDragging(false)
      setGuides({ x: [], y: [] })
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  // Clicking inside the current selection keeps it, even under other layers.
  const pickTarget = (p: { x: number; y: number }) => {
    const keep =
      selected &&
      !selected.hidden &&
      (() => {
        const l = toLocal(selected, p.x, p.y)
        return (
          Math.abs(l.x) <= selected.width / 2 &&
          Math.abs(l.y) <= selected.height / 2
        )
      })()
    return keep ? selected : hitTest(doc, p.x, p.y)
  }

  const onBoardPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const p = toPagePoint(e)
    const target = pickTarget(p)
    editor.select(target?.id ?? null)
    if (target && !target.locked) {
      startDrag({
        kind: "move",
        start: target,
        px: p.x,
        py: p.y,
        key: `move-${Date.now()}`,
      })
    }
  }

  const onBoardPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) return
    const p = toPagePoint(e)
    setHoverId(hitTest(doc, p.x, p.y)?.id ?? null)
  }

  const onDoubleClick = () => {
    if (selected?.type === "bubble" || selected?.type === "text") {
      const input =
        document.querySelector<HTMLTextAreaElement>("[data-layer-text]")
      input?.focus()
      input?.select()
    }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = [...e.dataTransfer.files].filter((f) =>
      f.type.startsWith("image/")
    )
    const rect = boardRef.current!.getBoundingClientRect()
    const over =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    for (const file of files)
      await insertImageFile(editor, file, over ? toPagePoint(e) : undefined)
  }

  const hover =
    !dragging && hoverId !== selected?.id
      ? doc.layers.find((l) => l.id === hoverId)
      : undefined

  const box = (l: Layer) => ({
    left: l.x * zoom,
    top: l.y * zoom,
    width: l.width * zoom,
    height: l.height * zoom,
    transform: `rotate(${l.rotation}deg)`,
  })

  return (
    <div
      ref={containerRef}
      data-slot="comic-stage"
      className="relative min-h-0 min-w-0 flex-1 [scrollbar-width:thin] overflow-auto bg-muted/60 dark:bg-muted/30"
      onPointerDown={() => editor.select(null)}
      onContextMenu={(e) => {
        e.preventDefault()
        editor.select(null)
        onContextMenu({
          clientX: e.clientX,
          clientY: e.clientY,
          point: null,
          layerId: null,
        })
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex h-max min-h-full w-max min-w-full items-center justify-center px-12 pt-12 pb-32">
        <div
          ref={boardRef}
          className="relative shrink-0 shadow-xl ring-1 ring-foreground/10 select-none"
          style={{ width: doc.width * zoom, height: doc.height * zoom }}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerLeave={() => setHoverId(null)}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const point = toPagePoint(e)
            // Right-click acts on what's visibly under the cursor.
            const target = hitTest(doc, point.x, point.y)
            editor.select(target?.id ?? null)
            onContextMenu({
              clientX: e.clientX,
              clientY: e.clientY,
              point,
              layerId: target?.id ?? null,
            })
          }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 size-full" />

          {hover && !hover.hidden && (
            <div
              className="pointer-events-none absolute outline-2 outline-amber-500/70"
              style={box(hover)}
            />
          )}

          {doc.layers.map(
            (l) =>
              l.id in generating &&
              !l.hidden && (
                <div
                  key={`gen-${l.id}`}
                  className="pointer-events-none absolute flex animate-pulse items-center justify-center bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  style={box(l)}
                >
                  <span className="flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm">
                    <Spinner className="size-3.5" />
                    {t("generating")}
                  </span>
                </div>
              )
          )}

          <EditOverlay editor={editor} zoom={zoom} />

          {guides.x.map((x) => (
            <div
              key={`x${x}`}
              className="pointer-events-none absolute inset-y-0 w-px bg-fuchsia-500"
              style={{ left: x * zoom }}
            />
          ))}
          {guides.y.map((y) => (
            <div
              key={`y${y}`}
              className="pointer-events-none absolute inset-x-0 h-px bg-fuchsia-500"
              style={{ top: y * zoom }}
            />
          ))}

          {selected && !selected.hidden && (
            <SelectionBox
              layer={selected}
              zoom={zoom}
              dragging={dragging}
              style={box(selected)}
              onHandle={(e, drag) => {
                e.stopPropagation()
                if (e.button !== 0) return
                const p = toPagePoint(e)
                const key = `${drag.kind}-${Date.now()}`
                if (drag.kind === "resize") {
                  startDrag({
                    kind: "resize",
                    start: selected,
                    hx: drag.hx,
                    hy: drag.hy,
                    px: p.x,
                    py: p.y,
                    key,
                  })
                } else {
                  startDrag({ kind: drag.kind, start: selected, key })
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SelectionBox({
  layer,
  zoom,
  dragging,
  style,
  onHandle,
}: {
  layer: Layer
  zoom: number
  dragging: boolean
  style: React.CSSProperties
  onHandle: (
    e: React.PointerEvent,
    drag:
      { kind: "resize"; hx: number; hy: number } | { kind: "rotate" | "tail" }
  ) => void
}) {
  const t = useT(messages)
  const w = layer.width * zoom
  const h = layer.height * zoom
  const small = Math.min(w, h) < 48
  const handle =
    "pointer-events-auto absolute size-2.5 -translate-1/2 rounded-full border-[1.5px] border-amber-500 bg-white shadow-sm"

  return (
    <div
      data-slot="comic-selection"
      className={cn(
        "pointer-events-none absolute outline-[1.5px] outline-amber-500",
        layer.locked && "outline-dashed"
      )}
      style={style}
    >
      {!layer.locked && (
        <>
          <div className="absolute start-1/2 -top-7 h-7 w-px bg-amber-500" />
          <div
            role="presentation"
            className={cn(
              handle,
              "start-1/2 -top-7 size-3 cursor-grab active:cursor-grabbing"
            )}
            onPointerDown={(e) => onHandle(e, { kind: "rotate" })}
          />
          {HANDLES.map(([hx, hy]) =>
            small && (hx === 0 || hy === 0) ? null : (
              <div
                key={`${hx}${hy}`}
                role="presentation"
                className={handle}
                style={{
                  left: `${((hx + 1) / 2) * 100}%`,
                  top: `${((hy + 1) / 2) * 100}%`,
                  cursor: handleCursor(hx, hy, layer.rotation),
                }}
                onPointerDown={(e) => onHandle(e, { kind: "resize", hx, hy })}
              />
            )
          )}
          {layer.type === "bubble" &&
            layer.tail &&
            layer.shape !== "caption" && (
              <div
                role="presentation"
                title={t("tailHint")}
                className="pointer-events-auto absolute size-3.5 -translate-1/2 cursor-crosshair rounded-full border-2 border-white bg-amber-500 shadow-md"
                style={{
                  left: w / 2 + layer.tailX * zoom,
                  top: h / 2 + layer.tailY * zoom,
                }}
                onPointerDown={(e) => onHandle(e, { kind: "tail" })}
              />
            )}
        </>
      )}
      <div
        className={cn(
          "absolute start-1/2 top-full mt-3 -translate-x-1/2 rounded-md bg-amber-500 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-950 tabular-nums shadow-sm transition-opacity",
          !dragging && small && "opacity-0"
        )}
      >
        {layer.width} × {layer.height}
      </div>
    </div>
  )
}
