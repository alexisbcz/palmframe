import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Eraser01Icon,
  MinusSignIcon,
  Pen01Icon,
  PersonStandingIcon,
  Redo02Icon,
  Undo02Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import { guidePng, loadImage } from "./guide"
import {
  JOINTS,
  bones,
  canvasSize,
  commit,
  containRect,
  headRadius,
  history,
  hitHandle,
  isEmpty,
  moveHandle,
  redo,
  standingFigure,
  torso,
  undo,
  type Drawing,
  type Figure,
  type Joint,
  type Mark,
  type Pt,
} from "./guide-draw"
import { messages } from "./guide.messages"
import type { PanelLayer } from "./model"

type Tool = "pen" | "line" | "eraser" | "pose"

const TOOLS: { id: Tool; icon: typeof Pen01Icon }[] = [
  { id: "pen", icon: Pen01Icon },
  { id: "line", icon: MinusSignIcon },
  { id: "eraser", icon: Eraser01Icon },
  { id: "pose", icon: PersonStandingIcon },
]
const WIDTHS = [
  { id: "fine", width: 4 },
  { id: "medium", width: 10 },
  { id: "bold", width: 22 },
] as const
const INK = "#111111"
const FIGURE_SLOTS = [0.5, 0.3, 0.7]

function IconButton({
  label,
  icon,
  onPress,
  isDisabled,
}: {
  label: string
  icon: typeof Pen01Icon
  onPress: () => void
  isDisabled?: boolean
}) {
  return (
    <TooltipTrigger>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        isDisabled={isDisabled}
        onPress={onPress}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} />
      </Button>
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  )
}

// Draws a panel's layout guide, black on white at the panel's shape: pen,
// straight lines, eraser and posable stick figures. The panel's art can
// show faintly underneath for tracing, and is never part of the saved PNG.
// Re-implements OpenManga's GuideDrawer (Apache-2.0) on our dialog.
export function GuideDrawer({
  panel,
  onSave,
  onClose,
}: {
  panel: PanelLayer
  onSave: (src: string) => void
  onClose: () => void
}) {
  const t = useT(messages)
  const { width: W, height: H } = canvasSize(panel.width / panel.height)
  const guideSrc = panel.guide?.src
  // Tracing shows the art; without any, the guide being redrawn.
  const traceSrc = panel.src ?? guideSrc ?? null

  const view = React.useRef<HTMLCanvasElement>(null)
  const ink = React.useRef<HTMLCanvasElement | null>(null)
  const base = React.useRef<HTMLImageElement | null>(null)
  const trace = React.useRef<HTMLImageElement | null>(null)
  const live = React.useRef<{
    mark?: Mark
    drag?: { figure: number; joint: Joint | "torso" }
    figures?: Figure[]
  } | null>(null)
  const [loading, setLoading] = React.useState(!!guideSrc)
  const [failed, setFailed] = React.useState(false)
  const [hist, setHist] = React.useState(() =>
    history({ marks: [], figures: [], base: !!guideSrc })
  )
  const [tool, setTool] = React.useState<Tool>("pen")
  const [width, setWidth] = React.useState<number>(WIDTHS[1].width)
  const [showTrace, setShowTrace] = React.useState(!!traceSrc)
  const [traceLoaded, setTraceLoaded] = React.useState(false)
  const doc = hist.stack[hist.at]!

  if (!ink.current) {
    ink.current = document.createElement("canvas")
    ink.current.width = W
    ink.current.height = H
  }

  React.useEffect(() => {
    if (!guideSrc) return
    let alive = true
    loadImage(guideSrc)
      .then((img) => {
        if (alive) base.current = img
      })
      .catch(() => {
        if (!alive) return
        setFailed(true)
        setHist(history({ marks: [], figures: [], base: false }))
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [guideSrc])

  React.useEffect(() => {
    if (!traceSrc) return
    let alive = true
    loadImage(traceSrc)
      .then((img) => {
        if (!alive) return
        trace.current = img
        setTraceLoaded(true)
      })
      // Tracing is a convenience: the page stays white without it.
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [traceSrc])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return
      e.preventDefault()
      setHist(e.shiftKey ? redo : undo)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // The base guide and strokes, with the eraser cutting through both.
  const paintInk = (d: Drawing, extra?: Mark) => {
    const c = ink.current!
    const g = c.getContext("2d")!
    g.globalCompositeOperation = "source-over"
    g.clearRect(0, 0, W, H)
    const b = base.current
    if (d.base && b) {
      const r = containRect(b.naturalWidth, b.naturalHeight, W, H)
      g.drawImage(b, r.x, r.y, r.width, r.height)
    }
    g.lineCap = "round"
    g.lineJoin = "round"
    for (const m of extra ? [...d.marks, extra] : d.marks) {
      g.globalCompositeOperation =
        m.tool === "eraser" ? "destination-out" : "source-over"
      g.strokeStyle = INK
      g.lineWidth = m.tool === "eraser" ? m.width * 3 : m.width
      const pts =
        m.tool === "line" ? [m.points[0]!, m.points.at(-1)!] : m.points
      g.beginPath()
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      if (pts.length === 1) g.lineTo(pts[0]![0] + 0.1, pts[0]![1])
      g.stroke()
    }
    g.globalCompositeOperation = "source-over"
    return c
  }

  const paintFigures = (
    g: CanvasRenderingContext2D,
    figures: Figure[],
    handles: boolean
  ) => {
    g.strokeStyle = INK
    g.lineWidth = 8
    g.lineCap = "round"
    for (const f of figures) {
      g.beginPath()
      for (const [a, b] of bones(f)) {
        g.moveTo(a[0], a[1])
        g.lineTo(b[0], b[1])
      }
      g.stroke()
      g.beginPath()
      g.arc(f.head[0], f.head[1], headRadius(f), 0, Math.PI * 2)
      g.stroke()
      if (!handles) continue
      g.fillStyle = "#f59e0b"
      for (const p of [...JOINTS.map((j) => f[j]), torso(f)]) {
        g.beginPath()
        g.arc(p[0], p[1], 9, 0, Math.PI * 2)
        g.fill()
      }
    }
  }

  // White page, faint art, and the ink multiplied over it, so a loaded
  // guide's white stays see-through.
  const paint = (d: Drawing = doc) => {
    const v = view.current
    if (!v) return
    const g = v.getContext("2d")!
    g.globalAlpha = 1
    g.globalCompositeOperation = "source-over"
    g.fillStyle = "#ffffff"
    g.fillRect(0, 0, W, H)
    const art = trace.current
    if (showTrace && art) {
      const r = containRect(art.naturalWidth, art.naturalHeight, W, H)
      g.globalAlpha = 0.25
      g.drawImage(art, r.x, r.y, r.width, r.height)
      g.globalAlpha = 1
    }
    g.globalCompositeOperation = "multiply"
    g.drawImage(paintInk(d, live.current?.mark), 0, 0)
    g.globalCompositeOperation = "source-over"
    paintFigures(g, live.current?.figures ?? d.figures, tool === "pose")
  }
  // `paint` reads the latest state; these are what change the picture.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(paint, [hist, tool, showTrace, loading, traceLoaded])

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect()
    const within = (n: number) => Math.min(1, Math.max(0, n))
    return [
      within((e.clientX - r.left) / r.width) * W,
      within((e.clientY - r.top) / r.height) * H,
    ]
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = point(e)
    if (tool === "pose") {
      // ~24 screen px whatever the canvas scale: a finger is wider than a mouse.
      const scale = W / e.currentTarget.getBoundingClientRect().width
      const hit = hitHandle(doc.figures, p, 24 * scale)
      live.current = hit ? { drag: hit, figures: doc.figures } : null
      return
    }
    live.current = { mark: { tool, width, points: [p, p] } }
    paint()
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current
    if (!l) return
    const p = point(e)
    if (l.drag && l.figures) {
      const { figure, joint } = l.drag
      l.figures = l.figures.map((f, i) =>
        i === figure ? moveHandle(f, joint, p) : f
      )
    } else if (l.mark) {
      if (l.mark.tool === "line") l.mark.points[1] = p
      else l.mark.points.push(p)
    }
    paint()
  }

  const up = () => {
    const l = live.current
    live.current = null
    const { mark, figures } = l ?? {}
    if (mark) setHist((h) => commit(h, { ...doc, marks: [...doc.marks, mark] }))
    else if (figures && figures !== doc.figures)
      setHist((h) => commit(h, { ...doc, figures }))
    else paint()
  }

  const save = () => {
    const out = document.createElement("canvas")
    out.width = W
    out.height = H
    const g = out.getContext("2d")!
    g.drawImage(paintInk(doc), 0, 0)
    paintFigures(g, doc.figures, false)
    onSave(guidePng(out, { x: 0, y: 0, width: W, height: H }))
    onClose()
  }

  return (
    <Dialog
      isOpen
      // A stray click or Escape shouldn't throw a drawing away.
      isDismissable={false}
      isKeyboardDismissDisabled
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-4xl"
    >
      <DialogHeader>
        <DialogTitle>
          {panel.guide ? t("drawer.editTitle") : t("drawer.newTitle")}
        </DialogTitle>
        <DialogDescription>{t("drawer.description")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[tool]}
          onSelectionChange={(keys) => {
            const next = [...keys][0] as Tool | undefined
            if (next) setTool(next)
          }}
        >
          {TOOLS.map((x) => (
            <ToggleGroupItem key={x.id} id={x.id}>
              <HugeiconsIcon icon={x.icon} strokeWidth={2} />
              {t(`drawer.tools.${x.id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <NativeSelect
          size="sm"
          aria-label={t("drawer.lineWidth")}
          value={String(width)}
          onChange={(e) => setWidth(Number(e.target.value))}
        >
          {WIDTHS.map((w) => (
            <NativeSelectOption key={w.id} value={String(w.width)}>
              {t(`drawer.widths.${w.id}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            const slot = FIGURE_SLOTS[doc.figures.length % FIGURE_SLOTS.length]!
            setHist((h) =>
              commit(h, {
                ...doc,
                figures: [...doc.figures, standingFigure(W * slot, H)],
              })
            )
            setTool("pose")
          }}
        >
          <HugeiconsIcon
            icon={UserAdd01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("drawer.addFigure")}
        </Button>
        <span className="ms-auto flex gap-0.5">
          <IconButton
            label={t("drawer.undo")}
            icon={Undo02Icon}
            isDisabled={hist.at === 0}
            onPress={() => setHist(undo)}
          />
          <IconButton
            label={t("drawer.redo")}
            icon={Redo02Icon}
            isDisabled={hist.at === hist.stack.length - 1}
            onPress={() => setHist(redo)}
          />
          <IconButton
            label={t("drawer.clear")}
            icon={Delete02Icon}
            isDisabled={isEmpty(doc)}
            onPress={() =>
              setHist((h) => commit(h, { marks: [], figures: [], base: false }))
            }
          />
        </span>
      </div>

      <div className="flex min-h-40 items-center justify-center">
        {loading && <Spinner />}
        <canvas
          ref={view}
          width={W}
          height={H}
          hidden={loading}
          aria-label={t("drawer.canvas")}
          className={cn(
            "max-h-[58svh] max-w-full touch-none rounded-md bg-white ring-1 ring-foreground/10",
            tool === "pose" ? "cursor-grab" : "cursor-crosshair"
          )}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onLostPointerCapture={up}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {failed
          ? t("drawer.loadFailed")
          : tool === "pose"
            ? t("drawer.poseHint")
            : t("drawer.hint")}
      </p>

      <DialogFooter className="items-center">
        {traceSrc && (
          <span className="flex items-center gap-2 text-xs sm:me-auto">
            <Switch
              aria-label={t("drawer.trace")}
              isSelected={showTrace}
              onChange={setShowTrace}
            />
            {t("drawer.trace")}
          </span>
        )}
        <Button variant="outline" onPress={onClose}>
          {t("cancel")}
        </Button>
        <Button isDisabled={loading || isEmpty(doc)} onPress={save}>
          {t("drawer.save")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
