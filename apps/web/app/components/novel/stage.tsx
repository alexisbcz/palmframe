import * as React from "react"
import { cn } from "cn"

import type { Actor, StageState } from "@/lib/novel/engine"
import {
  RATIOS,
  type Ease,
  type Grade,
  type Novel,
  type Transition,
  type Weather,
} from "@/lib/novel/model"
import { assetUrl } from "@/lib/novel/paper"

// Draws a stage state. The editor's monitor and the reader's player are the same
// component, so what an author sets up is what a reader sees.

const EASING: Record<Ease, string> = {
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  linear: "linear",
  snap: "cubic-bezier(0.2, 0.9, 0.2, 1)",
  drift: "cubic-bezier(0.45, 0, 0.55, 1)",
}

const reduced = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches

function enter(el: HTMLElement, trans: Transition, dur: number) {
  const duration = dur * 1000
  if (trans === "cut" || !duration) return null
  const frames: Record<Exclude<Transition, "cut">, Keyframe[]> = {
    dissolve: [{ opacity: 0 }, { opacity: 1 }],
    fade: [
      { opacity: 0, filter: "brightness(0)" },
      { opacity: 1, filter: "brightness(0)", offset: 0.5 },
      { opacity: 1, filter: "brightness(1)" },
    ],
    wipe: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }],
    iris: [
      { clipPath: "circle(0% at 50% 50%)" },
      { clipPath: "circle(75% at 50% 50%)" },
    ],
    push: [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }],
    blinds: [
      { maskPosition: "0 0", maskSize: "100% 0%" },
      { maskPosition: "0 0", maskSize: "100% 12.5%" },
    ],
  }
  if (reduced())
    return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 })
  if (trans === "blinds") {
    el.style.maskImage = "linear-gradient(#000, #000)"
    el.style.maskRepeat = "repeat-y"
    const run = el.animate(frames.blinds, { duration, easing: "ease-in-out" })
    run.finished
      .then(() => {
        el.style.maskImage = ""
        el.style.maskRepeat = ""
      })
      .catch(() => {})
    return run
  }
  return el.animate(frames[trans], { duration, easing: "ease-in-out" })
}

// Holds the old picture under the new one until the transition ends.
function Picture({
  src,
  trans,
  dur,
  className,
}: {
  src: string
  trans: Transition
  dur: number
  className?: string
}) {
  const [layers, setLayers] = React.useState(() =>
    src ? [{ key: 0, src }] : []
  )
  const nextKey = React.useRef(1)
  const top = React.useRef<HTMLImageElement>(null)
  const pending = React.useRef<{ trans: Transition; dur: number } | null>(null)

  React.useEffect(() => {
    setLayers((now) => {
      if ((now.at(-1)?.src ?? "") === src) return now
      pending.current = { trans, dur }
      return [...now.slice(-1), { key: nextKey.current++, src }]
    })
  }, [src, trans, dur])

  React.useLayoutEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    const clear = () => setLayers((now) => now.slice(-1))
    const anim = top.current ? enter(top.current, p.trans, p.dur) : null
    if (anim) anim.finished.then(clear).catch(() => {})
    else clear()
  })

  return (
    <>
      {layers.map((l, i) =>
        l.src ? (
          <img
            key={l.key}
            ref={i === layers.length - 1 ? top : undefined}
            src={l.src}
            alt=""
            draggable={false}
            className={cn(
              "absolute inset-0 size-full object-cover select-none",
              className
            )}
          />
        ) : null
      )}
    </>
  )
}

const FILTERS: Record<Grade, (a: number) => string> = {
  none: () => "none",
  sepia: (a) => `sepia(${a}) contrast(${1 - a * 0.05})`,
  mono: (a) => `grayscale(${a}) contrast(${1 + a * 0.08})`,
  night: (a) =>
    `brightness(${1 - a * 0.5}) saturate(${1 - a * 0.35}) hue-rotate(${a * 12}deg)`,
  dusk: (a) =>
    `saturate(${1 + a * 0.25}) sepia(${a * 0.3}) brightness(${1 - a * 0.12})`,
  dream: (a) =>
    `brightness(${1 + a * 0.12}) saturate(${1 + a * 0.3}) blur(${a * 0.8}px)`,
  noir: (a) =>
    `grayscale(${a}) contrast(${1 + a * 0.5}) brightness(${1 - a * 0.1})`,
  cold: (a) =>
    `saturate(${1 - a * 0.25}) hue-rotate(${-a * 14}deg) brightness(${1 - a * 0.06})`,
  memory: (a) =>
    `sepia(${a * 0.6}) blur(${a * 0.6}px) brightness(${1 + a * 0.06})`,
}

const TINTS: Partial<Record<Grade, string>> = {
  night: "rgb(20 34 90 / .55)",
  dusk: "rgb(240 110 40 / .28)",
  cold: "rgb(70 130 190 / .22)",
  dream: "rgb(255 190 225 / .16)",
  memory: "rgb(250 220 170 / .18)",
}

type Particle = {
  x: number
  y: number
  z: number
  r: number
  s: number
  a: number
}

function Particles({ kind, amount }: { kind: Weather; amount: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const canvas = ref.current
    if (!canvas || kind === "none" || !amount) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let w = 0
    let h = 0
    const size = () => {
      w = canvas.width = canvas.clientWidth
      h = canvas.height = canvas.clientHeight
    }
    size()
    const observer = new ResizeObserver(size)
    observer.observe(canvas)
    const counts: Record<Weather, number> = {
      none: 0,
      rain: 320,
      storm: 520,
      snow: 180,
      petals: 70,
      embers: 80,
      fog: 12,
      dust: 90,
      fireflies: 34,
    }
    const count = Math.round(counts[kind] * amount)
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.3 + Math.random() * 0.7,
      r: Math.random(),
      s: Math.random(),
      a: Math.random() * Math.PI * 2,
    }))
    let raf = 0
    let last = performance.now()
    let lightning = 0
    const draw = (now: number) => {
      const dt = Math.min(50, now - last) / 16.7
      last = now
      ctx.clearRect(0, 0, w, h)
      const unit = w / 1000
      for (const p of particles) {
        p.a += 0.02 * dt
        switch (kind) {
          case "rain":
          case "storm": {
            const speed = (kind === "storm" ? 30 : 22) * p.z * dt
            p.y += (speed * unit) / h
            p.x -= ((kind === "storm" ? 8 : 2.6) * p.z * dt * unit) / w
            const len = (kind === "storm" ? 26 : 18) * p.z * unit
            ctx.strokeStyle = `rgba(200,220,255,${0.14 + p.z * 0.28})`
            ctx.lineWidth = p.z * unit
            ctx.beginPath()
            ctx.moveTo(p.x * w, p.y * h)
            ctx.lineTo(
              p.x * w - (kind === "storm" ? len * 0.35 : len * 0.12),
              p.y * h + len
            )
            ctx.stroke()
            break
          }
          case "snow":
            p.y += (1.1 * p.z * dt * unit) / h
            p.x += (Math.sin(p.a) * 0.6 * dt * unit) / w
            ctx.fillStyle = `rgba(255,255,255,${0.35 + p.z * 0.6})`
            ctx.beginPath()
            ctx.arc(p.x * w, p.y * h, (1 + p.r * 2.6) * unit, 0, 7)
            ctx.fill()
            break
          case "petals":
            p.y += (1.3 * p.z * dt * unit) / h
            p.x += ((Math.sin(p.a) * 1.3 - 0.7) * dt * unit) / w
            ctx.save()
            ctx.translate(p.x * w, p.y * h)
            ctx.rotate(p.a * 1.7)
            ctx.scale(1, 0.45 + Math.sin(p.a * 2) * 0.4)
            ctx.fillStyle = `rgba(255,${170 + p.r * 40},${195 + p.r * 30},${0.55 + p.z * 0.4})`
            ctx.beginPath()
            ctx.ellipse(0, 0, 6 * unit * p.z, 3.5 * unit * p.z, 0, 0, 7)
            ctx.fill()
            ctx.restore()
            break
          case "embers": {
            p.y -= (1.4 * p.z * dt * unit) / h
            p.x += (Math.sin(p.a * 1.6) * 0.9 * dt * unit) / w
            const glow = 0.45 + Math.sin(p.a * 4) * 0.4
            ctx.fillStyle = `rgba(255,${130 + p.r * 80},50,${glow})`
            ctx.beginPath()
            ctx.arc(p.x * w, p.y * h, (0.8 + p.r * 1.8) * unit, 0, 7)
            ctx.fill()
            break
          }
          case "fog": {
            p.x += (0.16 * p.z * dt * unit) / w
            const gx = p.x * w
            const gy = (0.35 + p.y * 0.65) * h
            const radius = (200 + p.r * 260) * unit
            const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius)
            g.addColorStop(0, `rgba(225,230,235,${0.2 * amount})`)
            g.addColorStop(1, "rgba(225,230,235,0)")
            ctx.fillStyle = g
            ctx.fillRect(gx - radius, gy - radius, radius * 2, radius * 2)
            break
          }
          case "dust":
            p.x += ((Math.sin(p.a) * 0.2 + 0.1) * dt * unit) / w
            p.y += (Math.cos(p.a * 0.7) * 0.15 * dt * unit) / h
            ctx.fillStyle = `rgba(255,240,205,${0.1 + p.r * 0.32})`
            ctx.beginPath()
            ctx.arc(p.x * w, p.y * h, (0.6 + p.r * 1.4) * unit, 0, 7)
            ctx.fill()
            break
          case "fireflies": {
            p.x += (Math.sin(p.a) * 0.5 * dt * unit) / w
            p.y += (Math.cos(p.a * 1.3) * 0.45 * dt * unit) / h
            const on = Math.max(0, Math.sin(p.a * 2 + p.s * 6))
            const gx = p.x * w
            const gy = p.y * h
            const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 12 * unit)
            g.addColorStop(0, `rgba(235,255,150,${on})`)
            g.addColorStop(1, "rgba(235,255,150,0)")
            ctx.fillStyle = g
            ctx.fillRect(gx - 12 * unit, gy - 12 * unit, 24 * unit, 24 * unit)
            break
          }
        }
        if (p.y > 1.04) p.y = -0.04
        if (p.y < -0.05) p.y = 1.04
        if (p.x < -0.1) p.x = 1.1
        if (p.x > 1.1) p.x = -0.1
      }
      if (kind === "storm") {
        lightning = Math.max(0, lightning - 0.05 * dt)
        if (Math.random() < 0.003 * dt * amount) lightning = 0.7
        if (lightning > 0) {
          ctx.fillStyle = `rgba(230,235,255,${lightning * 0.5})`
          ctx.fillRect(0, 0, w, h)
        }
      }
      if (!reduced()) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [kind, amount])
  if (kind === "none" || !amount) return null
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    />
  )
}

interface Shown extends Actor {
  leaving?: boolean
}

// Actors that have just left stay on screen for their exit.
function useShownActors(actors: Actor[]) {
  const [leavers, setLeavers] = React.useState<Shown[]>([])
  const previous = React.useRef(actors)
  React.useEffect(() => {
    const gone = previous.current.filter(
      (a) => !actors.some((b) => b.who === a.who)
    )
    previous.current = actors
    if (!gone.length) return
    setLeavers((now) => [...now, ...gone.map((a) => ({ ...a, leaving: true }))])
    const t = setTimeout(
      () =>
        setLeavers((now) =>
          now.filter((a) => !gone.some((g) => g.who === a.who))
        ),
      500
    )
    return () => clearTimeout(t)
  }, [actors])
  return [
    ...actors,
    ...leavers.filter((l) => !actors.some((a) => a.who === l.who)),
  ] as Shown[]
}

function ActorImage({
  actor,
  novel,
  dim,
  draggable,
  selected,
  onGrab,
}: {
  actor: Shown
  novel: Novel
  dim: boolean
  draggable: boolean
  selected?: boolean
  onGrab?: (e: React.PointerEvent) => void
}) {
  const c = novel.characters.find((x) => x.id === actor.who)
  const sprite =
    c?.sprites.find((s) => s.id === actor.pose) ??
    c?.sprites.find((s) => s.url) ??
    c?.sprites[0]
  const url = assetUrl(sprite?.url)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    if (ref.current)
      enter(
        ref.current,
        actor.trans === "push" ? "dissolve" : actor.trans,
        actor.dur
      )
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      className={cn(
        "absolute bottom-0 h-[94%]",
        draggable && "cursor-grab touch-none active:cursor-grabbing"
      )}
      style={{
        left: `${actor.x * 100}%`,
        transform: `translateX(-50%) translateY(${-actor.y * 100}%) scale(${actor.scale})`,
        transformOrigin: "50% 100%",
        transition: `left ${actor.dur}s ${EASING[actor.ease]}, transform ${actor.dur}s ${EASING[actor.ease]}, filter .25s, opacity .4s`,
        filter: dim ? "brightness(.62) saturate(.8)" : undefined,
        opacity: actor.leaving ? 0 : 1,
        aspectRatio: "3 / 5",
      }}
      onPointerDown={onGrab}
      data-actor={actor.who}
    >
      <div ref={ref} className="size-full">
        {url ? (
          <img
            src={url}
            alt={c?.name ?? ""}
            draggable={false}
            className="size-full object-contain object-bottom select-none"
            style={{ transform: actor.flip ? "scaleX(-1)" : undefined }}
          />
        ) : (
          <div className="grid size-full place-items-center rounded-t-[40%] border-2 border-dashed border-white/35 bg-white/5 px-2 text-center text-[1.3cqw] text-white/75">
            {c?.name ?? "?"}
          </div>
        )}
        {selected ? (
          <div className="absolute inset-0 rounded outline-2 outline-(--amber,#ffb648) outline-dashed" />
        ) : null}
      </div>
    </div>
  )
}

export interface StageHandle {
  shake: (power: number, dur: number) => void
  flash: (color: string, dur: number) => void
}

export const Stage = React.forwardRef<
  StageHandle,
  {
    novel: Novel
    state: StageState
    speaker?: string | null
    spotlight?: boolean
    className?: string
    // The monitor: actors can be picked up and put down.
    selectedActor?: string | null
    onActorDrag?: (who: string, x: number, done: boolean) => void
    children?: React.ReactNode
  }
>(function Stage(
  {
    novel,
    state,
    speaker,
    spotlight,
    className,
    selectedActor,
    onActorDrag,
    children,
  },
  ref
) {
  const shaker = React.useRef<HTMLDivElement>(null)
  const flasher = React.useRef<HTMLDivElement>(null)
  const box = React.useRef<HTMLDivElement>(null)
  React.useImperativeHandle(ref, () => ({
    shake(power, dur) {
      if (reduced()) return
      const a = 1.6 * power
      shaker.current?.animate(
        Array.from({ length: 9 }, (_, i) => ({
          transform:
            i === 8
              ? "none"
              : `translate(${(i % 2 ? 1 : -1) * a * (1 - i / 9)}%, ${(i % 3 === 1 ? 1 : -1) * a * 0.6 * (1 - i / 9)}%)`,
        })),
        { duration: dur * 1000 }
      )
    },
    flash(color, dur) {
      const el = flasher.current
      if (!el) return
      el.style.background = color
      el.animate([{ opacity: reduced() ? 0.3 : 1 }, { opacity: 0 }], {
        duration: dur * 1000,
        easing: "ease-out",
      })
    },
  }))
  const back = novel.backdrops.find((b) => b.id === state.bg)
  const cg = novel.backdrops.find((b) => b.id === state.cg)
  const actors = useShownActors(state.actors)
  const { camera, grade, fade } = state
  const pan = ((camera.zoom - 1) / (2 * camera.zoom)) * 100
  const worldTransform = `scale(${camera.zoom}) translate(${-camera.x * pan}%, ${-camera.y * pan}%)`
  const grab = (who: string) => (e: React.PointerEvent) => {
    if (!onActorDrag || !box.current) return
    e.preventDefault()
    e.stopPropagation()
    const rect = box.current.getBoundingClientRect()
    const toX = (ev: PointerEvent) =>
      Math.min(
        1,
        Math.max(0, Number(((ev.clientX - rect.left) / rect.width).toFixed(3)))
      )
    // On the window: the actor moves under the pointer and re-renders as it goes.
    const move = (ev: PointerEvent) => onActorDrag(who, toX(ev), false)
    const up = (ev: PointerEvent) => {
      onActorDrag(who, toX(ev), true)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  return (
    <div
      ref={box}
      className={cn(
        "[container-type:inline-size] absolute inset-0 overflow-hidden bg-black",
        className
      )}
    >
      <div ref={shaker} className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            transform: worldTransform,
            transition: `transform ${camera.dur}s ${EASING[camera.ease]}, filter ${grade.dur}s`,
            filter: FILTERS[grade.look](grade.amount),
          }}
        >
          <Picture
            src={assetUrl(back?.url)}
            trans={state.bgTrans}
            dur={state.bgDur}
          />
          {actors.map((a) => (
            <ActorImage
              key={a.who}
              actor={a}
              novel={novel}
              dim={!!spotlight && !!speaker && speaker !== a.who}
              draggable={!!onActorDrag}
              selected={selectedActor === a.who}
              onGrab={onActorDrag ? grab(a.who) : undefined}
            />
          ))}
          <Picture
            src={assetUrl(cg?.url)}
            trans={state.cgTrans}
            dur={state.cgDur}
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: TINTS[grade.look] ?? "transparent",
            mixBlendMode: grade.look === "night" ? "multiply" : "soft-light",
            opacity: grade.amount,
            transition: `opacity ${grade.dur}s, background ${grade.dur}s`,
          }}
        />
        <Particles kind={state.weather.kind} amount={state.weather.amount} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: fade.color,
          opacity: fade.on ? 1 : 0,
          transition: `opacity ${fade.dur}s ease-in-out`,
        }}
      />
      <div
        ref={flasher}
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0"
      />
      {children}
    </div>
  )
})

export const ratioOf = (novel: Novel) => RATIOS[novel.ratio]
