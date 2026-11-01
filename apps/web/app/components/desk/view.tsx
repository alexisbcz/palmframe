import * as React from "react"

import { LIGHTS, type Light } from "@/lib/desk/model"

import { createScene, type SceneState } from "./scene"

export interface Sheet {
  x: number
  y: number
  w: number
  h: number
  z: number
}

const LIGHT_KEY = "palmframe-desk-light"

export function useLight() {
  const [light, set] = React.useState<Light>("lamp")
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(LIGHT_KEY) as Light | null
      if (stored && LIGHTS.includes(stored)) set(stored)
    } catch {
      // Private window: the lamp stays on.
    }
  }, [])
  const choose = React.useCallback((l: Light) => {
    set(l)
    try {
      localStorage.setItem(LIGHT_KEY, l)
    } catch {
      // As above.
    }
  }, [])
  return [light, choose] as const
}

// The render behind everything, with objects set down wherever there's room.
export function DeskScene({
  light,
  sheets,
  layout,
  tick,
}: {
  light: Light
  sheets: () => Sheet[]
  layout: "work" | "shelf"
  tick?: string
}) {
  const beauty = React.useRef<HTMLCanvasElement>(null)
  const glow = React.useRef<HTMLCanvasElement>(null)
  const scene = React.useRef<ReturnType<typeof createScene>>(null)
  const [failed, setFailed] = React.useState(false)

  const draw = React.useCallback(() => {
    const s = scene.current
    if (!s) return
    const W = window.innerWidth
    const H = window.innerHeight
    const rects = sheets()
    const wide = W >= 1280
    const state: SceneState =
      layout === "work"
        ? {
            light,
            rects,
            blotter: null,
            leather: [0.05, 0.12, 0.09],
            pen: wide ? { x: W - 190, y: H - 420, a: 1.3 } : null,
            ink: null,
            cup: null,
            specs: null,
            ruler: null,
          }
        : {
            light,
            rects,
            blotter: wide
              ? { x: W / 2 - 530, y: -40, w: 1060, h: H + 80 }
              : null,
            leather: [0.05, 0.12, 0.09],
            pen: W >= 1400 ? { x: W - 92, y: H - 300, a: 1.46 } : null,
            ink: W >= 1400 ? { x: W - 92, y: 110 } : null,
            cup: W >= 1400 ? { x: 106, y: H - 140 } : null,
            specs: W >= 1500 ? { x: 104, y: 200, a: 1.2 } : null,
            ruler: null,
          }
    if (layout === "work" && wide) {
      const paper = rects[0]
      if (paper) {
        state.blotter = {
          x: paper.x - 40,
          y: -40,
          w: paper.w + 80,
          h: H + 80,
        }
      }
      // A cup, if the cards leave a clearing for it.
      const cards = rects[1]
      if (paper && paper.x > 300 && cards && cards.y + cards.h < H - 440)
        state.cup = { x: 142, y: H - 300 }
    }
    s.render(state)
  }, [light, sheets, layout])

  React.useEffect(() => {
    if (!beauty.current) return
    scene.current = createScene(beauty.current, glow.current)
    if (!scene.current) setFailed(true)
    return () => {
      scene.current?.destroy()
      scene.current = null
    }
  }, [])

  React.useEffect(() => {
    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    later()
    window.addEventListener("resize", later)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", later)
    }
  }, [draw, tick])

  return (
    <>
      <div
        className="dk-fallback"
        data-failed={failed || undefined}
        aria-hidden
      />
      <canvas
        ref={beauty}
        className="dk-canvas"
        aria-hidden
        data-testid="desk-scene"
      />
      <canvas ref={glow} className="dk-canvas dk-glow" aria-hidden />
    </>
  )
}
