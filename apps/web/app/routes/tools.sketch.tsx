import * as React from "react"
import { data } from "react-router"

import { Button } from "@workspace/ui/components/button"

import {
  TaskStatus,
  ToolPage,
  downloadBlob,
  useTask,
} from "@/components/tools/shared"
import { messages } from "@/components/tools/tools.messages"
import { useT } from "@/i18n/core"
import { requireTool } from "@/lib/tools.server"
import { strokePath, toSvg, type Point, type Stroke } from "@/lib/tools/sketch"

import type { Route } from "./+types/tools.sketch"

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireTool(request, "sketch")
  return data(null, { headers })
}

const WIDTH = 960
const HEIGHT = 600
const OPEN_SHAPES = new Set(["line", "curve", "arrow"])

export default function Sketch() {
  const t = useT(messages)
  const task = useTask()
  const [strokes, setStrokes] = React.useState<Stroke[]>([])
  const [ink, setInk] = React.useState<Point[] | null>(null)

  const at = (e: React.PointerEvent<SVGSVGElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - box.left) / box.width) * WIDTH,
      y: ((e.clientY - box.top) / box.height) * HEIGHT,
    }
  }

  // Keep the ink at once, then swap in the clean shape when it's recognized.
  const finish = (points: Point[]) => {
    const raw: Stroke = { points, closed: false, kind: null }
    setStrokes((all) => [...all, raw])
    void task.run(async () => {
      const { loadShapes } = await import("@/lib/tools/models.client")
      const { shapes, arrowheads } = await loadShapes(task.download)
      task.work()
      const shape = await shapes.recognize(points)
      if (!shape || shape.kind === "scribble") return
      const clean: Stroke = {
        points: shape.outline,
        closed: !OPEN_SHAPES.has(shape.kind),
        kind: shape.kind,
      }
      const heads: Stroke[] = arrowheads(shape, 16).map((head) => ({
        points: head,
        closed: false,
        kind: "arrowhead",
      }))
      setStrokes((all) =>
        all.flatMap((s) => (s === raw ? [clean, ...heads] : [s]))
      )
    })
  }

  return (
    <ToolPage id="sketch">
      <svg
        role="img"
        aria-label={t("sketch.canvas")}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none rounded-lg border bg-white"
        fill="none"
        stroke="#111"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setInk([at(e)])
        }}
        onPointerMove={(e) => {
          if (!ink) return
          const point = at(e)
          setInk((line) => line && [...line, point])
        }}
        onPointerUp={() => {
          if (ink && ink.length > 2) finish(ink)
          setInk(null)
        }}
        onPointerCancel={() => setInk(null)}
      >
        {strokes.map((stroke, i) => (
          <path key={i} d={strokePath(stroke)} />
        ))}
        {ink && (
          <path d={strokePath({ points: ink, closed: false, kind: null })} />
        )}
      </svg>
      <p className="text-sm text-muted-foreground">{t("sketch.prompt")}</p>
      <TaskStatus task={task} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          isDisabled={!strokes.length}
          onPress={() =>
            setStrokes((all) => {
              // An arrow and its heads come off together.
              let end = all.length - 1
              while (end > 0 && all[end]!.kind === "arrowhead") end--
              return all.slice(0, end)
            })
          }
        >
          {t("sketch.undo")}
        </Button>
        <Button
          variant="outline"
          isDisabled={!strokes.length}
          onPress={() => setStrokes([])}
        >
          {t("sketch.clear")}
        </Button>
        <Button
          variant="outline"
          isDisabled={!strokes.length}
          onPress={() =>
            downloadBlob(
              new Blob([toSvg(strokes, WIDTH, HEIGHT)], {
                type: "image/svg+xml",
              }),
              "sketch.svg"
            )
          }
        >
          {t("sketch.download")}
        </Button>
      </div>
    </ToolPage>
  )
}
