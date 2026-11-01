import * as React from "react"
import { cn } from "cn"

import { useT } from "@/i18n/core"
import { mediaUrl } from "@/lib/dub/booth.client"
import { lineState, timecode, type Patch, type Project } from "@/lib/dub/model"

import { messages } from "./dub.messages"
import { useFrame } from "./use-booth"
import type { Player } from "./use-player"

// The rythmo band of a French dubbing stage: a strip of film that slides under
// the picture with each line written out along its own duration, so an actor
// speaks a word exactly as it crosses the bar. The strip moves on the
// compositor; React only hears about it every few seconds, to change which
// lines are mounted.
const WINDOW = 6

export function Band({
  project,
  player,
  selected,
  onSelect,
  patch,
  zoom,
}: {
  project: Project
  player: Player
  selected: string | null
  onSelect: (id: string) => void
  patch: (change: Patch) => void
  zoom: number
}) {
  const t = useT(messages)
  const shell = React.useRef<HTMLDivElement>(null)
  const strip = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const code = React.useRef<HTMLOutputElement>(null)
  const [width, setWidth] = React.useState(800)
  const [anchor, setAnchor] = React.useState(0)
  const peaks = React.useRef<number[]>([])
  const drag = React.useRef<{ x: number; time: number; moved: boolean } | null>(
    null
  )
  const [edge, setEdge] = React.useState<{
    id: string
    side: "start" | "end"
    value: number
  } | null>(null)
  const cue = width / 3

  React.useEffect(() => {
    const el = shell.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    let live = true
    void fetch(mediaUrl(project.id, "peaks.json"))
      .then((r) => (r.ok ? r.json() : []))
      .then((data: number[]) => {
        if (live) peaks.current = data
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [project.id])

  useFrame(() => {
    const time = player.time()
    if (strip.current)
      strip.current.style.transform = `translate3d(${cue - time * zoom}px,0,0)`
    if (code.current) code.current.textContent = timecode(time, true)
    if (Math.abs(time - anchor) > WINDOW / 2) setAnchor(time)
    const c = canvas.current
    const g = c?.getContext("2d")
    if (!c || !g) return
    const ratio = window.devicePixelRatio || 1
    const w = Math.floor(width * ratio)
    const h = Math.floor(c.clientHeight * ratio)
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
    g.clearRect(0, 0, w, h)
    g.fillStyle = "rgba(255, 182, 72, 0.26)"
    const mid = h / 2
    const start = time - cue / zoom
    for (let x = 0; x < w; x += 2 * ratio) {
      const at = start + x / ratio / zoom
      const value = peaks.current[Math.floor(at * 40)] ?? 0
      const bar = (value / 99) * h * 0.46
      g.fillRect(x, mid - bar, ratio, bar * 2)
    }
  })

  const span = width / zoom + WINDOW
  const shown = project.lines.filter(
    (l) => l.end > anchor - span && l.start < anchor + span
  )
  const speakers = new Map(project.speakers.map((s) => [s.id, s]))

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-handle]")) return
    drag.current = { x: e.clientX, time: player.time(), moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    player.pause()
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const delta = e.clientX - d.x
    if (Math.abs(delta) > 3) d.moved = true
    if (d.moved) player.seek(d.time - delta / zoom)
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) {
      const at =
        player.time() +
        (e.clientX - e.currentTarget.getBoundingClientRect().left - cue) / zoom
      const hit = project.lines.find((l) => l.start <= at && at <= l.end)
      if (hit) onSelect(hit.id)
    }
  }

  const finishEdge = () => {
    if (edge) {
      patch({ lines: { [edge.id]: { [edge.side]: edge.value } } })
      setEdge(null)
    }
  }

  const nudge = (id: string, side: "start" | "end", value: number) =>
    patch({
      lines: { [id]: { [side]: Math.max(0, Number(value.toFixed(2))) } },
    })

  return (
    <div
      ref={shell}
      className="dub-band"
      dir="ltr"
      role="group"
      aria-label={t("band.label")}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <i aria-hidden className="dub-sprockets" />
      <canvas ref={canvas} aria-hidden className="dub-band-wave" />
      <div ref={strip} className="dub-strip">
        {shown.map((line) => {
          const speaker = speakers.get(line.speaker)
          const held = edge?.id === line.id ? edge : null
          const start = held?.side === "start" ? held.value : line.start
          const end = held?.side === "end" ? held.value : line.end
          const w = Math.max(24, (end - start) * zoom)
          const words = (line.text || line.source).trim()
          const state = lineState(line, speaker)
          const isSelected = selected === line.id
          return (
            <div
              key={line.id}
              className={cn("dub-cue", isSelected && "is-selected")}
              data-state={state}
              style={
                {
                  left: start * zoom,
                  width: w,
                  "--c": speaker?.color ?? "#ece4d4",
                } as React.CSSProperties
              }
            >
              <svg
                aria-hidden
                width={w}
                height="44"
                viewBox={`0 0 ${w} 44`}
                className="dub-cue-ink"
                data-draft={!line.text.trim()}
              >
                <text
                  x="0"
                  y="32"
                  textLength={w - 2}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {words}
                </text>
              </svg>
              <span className="dub-cue-name">{speaker?.name}</span>
              {isSelected &&
                (["start", "end"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    data-handle
                    role="slider"
                    aria-label={t(
                      side === "start" ? "script.start" : "script.end"
                    )}
                    aria-valuenow={Number(
                      (side === "start" ? start : end).toFixed(2)
                    )}
                    aria-valuemin={0}
                    aria-valuemax={Math.ceil(project.source.duration)}
                    className="dub-handle"
                    data-side={side}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      e.currentTarget.setPointerCapture(e.pointerId)
                      setEdge({
                        id: line.id,
                        side,
                        value: side === "start" ? start : end,
                      })
                    }}
                    onPointerMove={(e) => {
                      if (!edge) return
                      const box = strip.current!.getBoundingClientRect()
                      const value = (e.clientX - box.left) / zoom
                      setEdge({
                        ...edge,
                        value:
                          side === "start"
                            ? Math.min(value, line.end - 0.2)
                            : Math.max(value, line.start + 0.2),
                      })
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation()
                      finishEdge()
                    }}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.5 : 0.05
                      const now = side === "start" ? line.start : line.end
                      if (e.key === "ArrowLeft")
                        nudge(line.id, side, now - step)
                      else if (e.key === "ArrowRight")
                        nudge(line.id, side, now + step)
                      else return
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                  />
                ))}
            </div>
          )
        })}
      </div>
      {!project.lines.length && (
        <p className="dub-band-empty">{t("band.empty")}</p>
      )}
      <i aria-hidden className="dub-bar" style={{ left: cue }} />
      <output ref={code} className="dub-band-code" />
    </div>
  )
}
