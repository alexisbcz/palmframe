import * as React from "react"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import {
  bumpMask,
  imageGeometry,
  localToImage,
  updateMask,
  useEditState,
  type MaskState,
} from "./edit-tools"
import { messages } from "./edit-tools.messages"
import type { Layer, PanelLayer } from "./model"
import { toLocal } from "./render"
import type { ComicEditor } from "./use-editor"

const MASK_COLOR = "#ef4444"

const box = (l: Layer, zoom: number): React.CSSProperties => ({
  left: l.x * zoom,
  top: l.y * zoom,
  width: l.width * zoom,
  height: l.height * zoom,
  transform: `rotate(${l.rotation}deg)`,
})

// Over the stage: a busy veil on panels being edited, and the inpaint
// mask of the selected panel, painted with a brush or a rectangle.
export function EditOverlay({
  editor,
  zoom,
}: {
  editor: ComicEditor
  zoom: number
}) {
  const t = useT(messages)
  const { mask, jobs } = useEditState()
  const panel = editor.selected
  return (
    <>
      {editor.doc.layers.map(
        (l) =>
          l.id in jobs &&
          !l.hidden && (
            <div
              key={`edit-${l.id}`}
              className="pointer-events-none absolute flex animate-pulse items-center justify-center bg-violet-500/15 text-violet-700 dark:text-violet-300"
              style={box(l, zoom)}
            >
              <span className="flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm">
                <Spinner className="size-3.5" />
                {t("busy")}
              </span>
            </div>
          )
      )}
      {mask?.active &&
        panel?.type === "panel" &&
        panel.id === mask.panelId &&
        panel.src === mask.src &&
        !(panel.id in jobs) && (
          <MaskPainter panel={panel} mask={mask} zoom={zoom} />
        )}
    </>
  )
}

function MaskPainter({
  panel,
  mask,
  zoom,
}: {
  panel: PanelLayer
  mask: MaskState
  zoom: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const view = React.useRef<HTMLCanvasElement>(null)
  const last = React.useRef<{ x: number; y: number } | null>(null)
  const [rect, setRect] = React.useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(
    null
  )
  const iw = mask.canvas.width
  const ih = mask.canvas.height

  // Escape puts the brush down.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") updateMask({ active: false })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // The mask drawn where the image sits, clipped to the panel.
  React.useLayoutEffect(() => {
    const c = view.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(panel.width * zoom * dpr)
    c.height = Math.round(panel.height * zoom * dpr)
    const ctx = c.getContext("2d")!
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0)
    ctx.clearRect(0, 0, panel.width, panel.height)
    ctx.translate(panel.width / 2, panel.height / 2)
    ctx.scale(panel.flipX ? -1 : 1, panel.flipY ? -1 : 1)
    const g = imageGeometry(panel, iw, ih)
    ctx.globalAlpha = 0.5
    ctx.drawImage(mask.canvas, g.x, g.y, g.w, g.h)
  }, [panel, zoom, mask.canvas, mask.rev, iw, ih])

  // Pointer → panel-local units (top-left origin) and image pixels.
  const locate = (e: React.PointerEvent) => {
    const board = (
      ref.current!.offsetParent as HTMLElement
    ).getBoundingClientRect()
    const local = toLocal(
      panel,
      (e.clientX - board.left) / zoom,
      (e.clientY - board.top) / zoom
    )
    return {
      local: { x: local.x + panel.width / 2, y: local.y + panel.height / 2 },
      image: localToImage(panel, iw, ih, local.x, local.y),
    }
  }

  // Alt paints the mask away.
  const paint = (
    e: React.PointerEvent,
    draw: (ctx: CanvasRenderingContext2D) => void
  ) => {
    const ctx = mask.canvas.getContext("2d")!
    ctx.save()
    ctx.globalCompositeOperation = e.altKey ? "destination-out" : "source-over"
    ctx.fillStyle = MASK_COLOR
    ctx.strokeStyle = MASK_COLOR
    draw(ctx)
    ctx.restore()
    bumpMask(true)
  }

  const brush = (e: React.PointerEvent, from: { x: number; y: number }) => {
    const { image } = locate(e)
    paint(e, (ctx) => {
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.lineWidth = mask.size * image.scale
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(image.x, image.y)
      ctx.stroke()
    })
    last.current = image
  }

  return (
    <div
      ref={ref}
      data-slot="comic-mask"
      className={cn(
        "absolute touch-none overflow-hidden outline-2 outline-red-500 outline-dashed",
        mask.tool === "brush" ? "cursor-none" : "cursor-crosshair"
      )}
      style={box(panel, zoom)}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const { local, image } = locate(e)
        if (mask.tool === "brush") brush(e, image)
        else setRect({ x0: local.x, y0: local.y, x1: local.x, y1: local.y })
      }}
      onPointerMove={(e) => {
        const { local } = locate(e)
        setCursor(local)
        if (mask.tool === "brush" && last.current) brush(e, last.current)
        if (mask.tool === "rect" && rect)
          setRect({ ...rect, x1: local.x, y1: local.y })
      }}
      onPointerUp={(e) => {
        last.current = null
        if (!rect) return
        setRect(null)
        const a = localToImage(
          panel,
          iw,
          ih,
          rect.x0 - panel.width / 2,
          rect.y0 - panel.height / 2
        )
        const b = localToImage(
          panel,
          iw,
          ih,
          rect.x1 - panel.width / 2,
          rect.y1 - panel.height / 2
        )
        if (Math.abs(a.x - b.x) < 2 || Math.abs(a.y - b.y) < 2) return
        paint(e, (ctx) =>
          ctx.fillRect(
            Math.min(a.x, b.x),
            Math.min(a.y, b.y),
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y)
          )
        )
      }}
      onPointerLeave={() => setCursor(null)}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <canvas
        ref={view}
        className="pointer-events-none absolute inset-0 size-full"
      />
      {rect && (
        <div
          className="pointer-events-none absolute border-2 border-red-500 bg-red-500/30"
          style={{
            left: Math.min(rect.x0, rect.x1) * zoom,
            top: Math.min(rect.y0, rect.y1) * zoom,
            width: Math.abs(rect.x1 - rect.x0) * zoom,
            height: Math.abs(rect.y1 - rect.y0) * zoom,
          }}
        />
      )}
      {cursor && mask.tool === "brush" && (
        <div
          className="pointer-events-none absolute -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{
            left: cursor.x * zoom,
            top: cursor.y * zoom,
            width: mask.size * zoom,
            height: mask.size * zoom,
          }}
        />
      )}
    </div>
  )
}
