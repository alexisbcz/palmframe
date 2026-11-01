import * as React from "react"
import { cn } from "cn"

// The controls of the Stage. Each is a real control underneath: it takes focus,
// answers to the keyboard and reports to screen readers as a slider, switch or
// radio. The feel comes on top of that.

const CLICKS_KEY = "palmframe-novel-clicks"
let audio: AudioContext | null = null

function clicksOn() {
  try {
    return localStorage.getItem(CLICKS_KEY) !== "off"
  } catch {
    return true
  }
}

export function setClicks(on: boolean) {
  try {
    localStorage.setItem(CLICKS_KEY, on ? "on" : "off")
  } catch {
    // Private windows: the clicks just stay as they are.
  }
}

export const clicksEnabled = clicksOn

// A short filtered tick, made once per detent. Never starts an AudioContext
// before the person has touched something.
export function tick(strength = 1) {
  if (typeof window === "undefined" || !clicksOn()) return
  try {
    audio ??= new AudioContext()
    if (audio.state === "suspended") void audio.resume()
    const at = audio.currentTime
    const length = Math.floor(audio.sampleRate * 0.012)
    const buffer = audio.createBuffer(1, length, audio.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
    const src = audio.createBufferSource()
    src.buffer = buffer
    const filter = audio.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.value = 2200 + strength * 1400
    filter.Q.value = 1.2
    const gain = audio.createGain()
    gain.gain.value = 0.05 * strength
    src.connect(filter).connect(gain).connect(audio.destination)
    src.start(at)
  } catch {
    // No audio here; the control still works.
  }
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

// Server and browser round floats differently, so markup carries two places.
const fixed = (v: number) => Number(v.toFixed(2))

const snap = (v: number, min: number, step: number) =>
  Number((Math.round((v - min) / step) * step + min).toFixed(4))

function useNonPassiveWheel(
  ref: React.RefObject<HTMLElement | null>,
  handler: (e: WheelEvent) => void
) {
  const latest = React.useRef(handler)
  latest.current = handler
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const on = (e: WheelEvent) => latest.current(e)
    el.addEventListener("wheel", on, { passive: false })
    return () => el.removeEventListener("wheel", on)
  }, [ref])
}

export function Screws() {
  const at = (s: React.CSSProperties, r: number) => (
    <i
      aria-hidden
      className="nv-screw"
      style={{ ...s, ["--r" as string]: `${r}deg` }}
    />
  )
  return (
    <>
      {at({ top: 6, insetInlineStart: 6 }, 30)}
      {at({ top: 6, insetInlineEnd: 6 }, 110)}
      {at({ bottom: 6, insetInlineStart: 6 }, 70)}
      {at({ bottom: 6, insetInlineEnd: 6 }, 160)}
    </>
  )
}

export function Plate({
  title,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("nv-plate flex min-h-0 flex-col", className)}>
      {title ? (
        <header className="nv-plate-title flex-none">
          <h2 className="nv-engraved min-w-0 flex-1 truncate ps-2">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  )
}

export const Led = ({ on, color }: { on: boolean; color?: string }) => (
  <i
    aria-hidden
    className="nv-led"
    data-on={on}
    style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
  />
)

export const Key = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    tone?: "fire" | "danger"
    size?: "icon"
    pressed?: boolean
    led?: boolean
  }
>(function Key(
  { tone, size, pressed, led, onClick, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn("nv-key", className)}
      data-tone={tone}
      data-size={size}
      aria-pressed={pressed}
      onClick={(e) => {
        tick(0.8)
        onClick?.(e)
      }}
      {...rest}
    >
      {led !== undefined ? <Led on={led} /> : null}
      {children}
    </button>
  )
})

export function Readout({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <output className={cn("nv-readout", className)}>{children}</output>
}

interface RangeProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: string
  format?: (value: number) => string
}

const SWEEP = 270

// Dragging in any direction turns it: up or right is clockwise. The cursor is
// free, so the hand never has to trace a circle.
function useTurn({ value, min, max, step = 0.01, onChange }: RangeProps) {
  const start = React.useRef<{ x: number; y: number; v: number } | null>(null)
  const last = React.useRef(value)
  const set = React.useCallback(
    (raw: number) => {
      const next = clamp(snap(raw, min, step), min, max)
      if (next !== last.current) {
        const detents = (max - min) / step
        if (detents <= 64 || Math.abs(next - last.current) >= (max - min) / 48)
          tick(0.6)
        last.current = next
        onChange(next)
      }
    },
    [min, max, step, onChange]
  )
  last.current = value
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      start.current = { x: e.clientX, y: e.clientY, v: value }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current
      if (!s) return
      const travel = e.clientX - s.x - (e.clientY - s.y)
      const speed = e.shiftKey ? 600 : 180
      set(s.v + (travel / speed) * (max - min))
    },
    onPointerUp: () => {
      start.current = null
    },
    onPointerCancel: () => {
      start.current = null
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      const big = (max - min) / 10
      const moves: Record<string, number> = {
        ArrowUp: step,
        ArrowRight: step,
        ArrowDown: -step,
        ArrowLeft: -step,
        PageUp: big,
        PageDown: -big,
      }
      if (e.key === "Home") set(min)
      else if (e.key === "End") set(max)
      else if (moves[e.key]) set(value + moves[e.key]!)
      else return
      e.preventDefault()
    },
  }
  return { handlers, set }
}

function Scale({ ticks = 11 }: { ticks?: number }) {
  return (
    <svg className="nv-knob-scale" viewBox="0 0 100 100" aria-hidden>
      {Array.from({ length: ticks }, (_, i) => {
        const a =
          ((-SWEEP / 2 + (i / (ticks - 1)) * SWEEP - 90) * Math.PI) / 180
        const major = i % 5 === 0
        return (
          <line
            key={i}
            x1={fixed(50 + Math.cos(a) * 44)}
            y1={fixed(50 + Math.sin(a) * 44)}
            x2={fixed(50 + Math.cos(a) * (major ? 49.5 : 47.5))}
            y2={fixed(50 + Math.sin(a) * (major ? 49.5 : 47.5))}
            stroke="#b5a994"
            strokeWidth={major ? 1.6 : 1}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

export function Knob({
  size = 64,
  hideValue,
  className,
  ...range
}: RangeProps & { size?: number; hideValue?: boolean; className?: string }) {
  const { value, min, max, label, format } = range
  const ref = React.useRef<HTMLDivElement>(null)
  const { handlers, set } = useTurn(range)
  useNonPassiveWheel(ref, (e) => {
    e.preventDefault()
    set(value - Math.sign(e.deltaY) * (range.step ?? 0.01))
  })
  const angle = ((value - min) / (max - min) - 0.5) * SWEEP
  const text = format ? format(value) : String(value)
  return (
    <div className={cn("nv-knob", className)}>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        className="nv-knob-body"
        style={
          {
            "--s": `${size}px`,
            "--a": `${angle}deg`,
          } as React.CSSProperties
        }
        {...handlers}
      >
        <Scale />
        <div className="nv-knob-skirt" />
        <div className="nv-knob-cap" />
      </div>
      <span className="nv-engraved max-w-full truncate text-center">
        {label}
      </span>
      {hideValue ? null : <Readout>{text}</Readout>}
    </div>
  )
}

// A mode dial with every position engraved around it.
export function Dial<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 156,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
  size?: number
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  )
  const count = options.length
  const ref = React.useRef<HTMLDivElement>(null)
  const angleOf = (i: number) =>
    count === 1 ? 0 : (i / (count - 1) - 0.5) * 280
  const pick = (i: number) => {
    const next = options[clamp(i, 0, count - 1)]!
    if (next.value !== value) {
      tick(1)
      onChange(next.value)
    }
  }
  const start = React.useRef<{ x: number; y: number; i: number } | null>(null)
  useNonPassiveWheel(ref, (e) => {
    e.preventDefault()
    pick(index - Math.sign(e.deltaY))
  })
  return (
    <div
      className="nv-dial"
      role="radiogroup"
      aria-label={label}
      style={{ "--dial": `${size}px` } as React.CSSProperties}
    >
      {options.map((o, i) => {
        const a = ((angleOf(i) - 90) * Math.PI) / 180
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className="nv-dial-label"
            tabIndex={-1}
            style={{
              left: `${fixed(50 + Math.cos(a) * 46)}%`,
              top: `${fixed(50 + Math.sin(a) * 46)}%`,
            }}
            onClick={() => pick(i)}
          >
            {o.label}
          </button>
        )
      })}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={index}
        aria-valuetext={options[index]?.label}
        className="nv-knob-body"
        style={{ "--a": `${angleOf(index)}deg` } as React.CSSProperties}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = { x: e.clientX, y: e.clientY, i: index }
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (!s) return
          const travel = e.clientX - s.x - (e.clientY - s.y)
          pick(s.i + Math.round(travel / 26))
        }}
        onPointerUp={() => (start.current = null)}
        onPointerCancel={() => (start.current = null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") pick(index + 1)
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
            pick(index - 1)
          else return
          e.preventDefault()
        }}
      >
        <div className="nv-knob-skirt" style={{ inset: 0 }} />
        <div className="nv-knob-cap" style={{ inset: "9%" }} />
      </div>
    </div>
  )
}

export function Fader({
  height = 150,
  hideValue,
  ...range
}: RangeProps & { height?: number; hideValue?: boolean }) {
  const { value, min, max, label, format, step = 0.01, onChange } = range
  const ref = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)
  const lastTick = React.useRef(value)
  const set = (raw: number) => {
    const next = clamp(snap(raw, min, step), min, max)
    if (next === value) return
    if (Math.abs(next - lastTick.current) >= (max - min) / 20) {
      lastTick.current = next
      tick(0.45)
    }
    onChange(next)
  }
  const fromPointer = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    set(min + (1 - (e.clientY - box.top) / box.height) * (max - min))
  }
  useNonPassiveWheel(ref, (e) => {
    e.preventDefault()
    set(value - Math.sign(e.deltaY) * step * 2)
  })
  const at = ((value - min) / (max - min)) * 100
  const text = format ? format(value) : String(value)
  return (
    <div className="nv-fader">
      {hideValue ? null : <Readout>{text}</Readout>}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        className="nv-fader-track"
        style={{ "--h": `${height}px` } as React.CSSProperties}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          fromPointer(e)
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const moves: Record<string, number> = {
            ArrowUp: step,
            ArrowRight: step,
            ArrowDown: -step,
            ArrowLeft: -step,
            PageUp: (max - min) / 10,
            PageDown: -(max - min) / 10,
          }
          if (!moves[e.key]) return
          e.preventDefault()
          set(value + moves[e.key]!)
        }}
      >
        <div className="nv-fader-fill" style={{ height: `${at}%` }} />
        <div className="nv-fader-cap" style={{ bottom: `${at}%` }} />
      </div>
      <span className="nv-engraved max-w-full truncate text-center">
        {label}
      </span>
    </div>
  )
}

// A lens barrel with its marks printed on it. Flick it and it keeps spinning,
// slowing down until it settles on a mark.
export function FocusRing<T extends string | number>({
  value,
  options,
  onChange,
  label,
  mark = 96,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
  mark?: number
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  )
  const [offset, setOffset] = React.useState(index * mark)
  const pos = React.useRef(offset)
  const raf = React.useRef(0)
  const drag = React.useRef<{
    x: number
    pos: number
    t: number
    v: number
  } | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  const max = (options.length - 1) * mark
  const lastIndex = React.useRef(index)

  const write = (p: number) => {
    pos.current = p
    setOffset(p)
    const i = clamp(Math.round(p / mark), 0, options.length - 1)
    if (i !== lastIndex.current) {
      lastIndex.current = i
      tick(0.7)
    }
  }
  const commit = (i: number) => {
    const next = options[clamp(i, 0, options.length - 1)]!
    if (next.value !== value) onChange(next.value)
  }
  const settle = (velocity: number) => {
    cancelAnimationFrame(raf.current)
    let v = velocity
    let p = pos.current
    const step = () => {
      if (Math.abs(v) > 0.35) {
        p = clamp(p + v, 0, max)
        v *= 0.93
        write(p)
        raf.current = requestAnimationFrame(step)
        return
      }
      const target = clamp(Math.round(p / mark), 0, options.length - 1)
      const to = target * mark
      if (Math.abs(to - p) < 0.5) {
        write(to)
        commit(target)
        return
      }
      p += (to - p) * 0.3
      write(p)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }
  React.useEffect(() => {
    if (drag.current) return
    cancelAnimationFrame(raf.current)
    lastIndex.current = index
    pos.current = index * mark
    setOffset(index * mark)
  }, [index, mark])
  React.useEffect(() => () => cancelAnimationFrame(raf.current), [])
  useNonPassiveWheel(ref, (e) => {
    e.preventDefault()
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    commit(index + Math.sign(d))
    tick(0.7)
  })

  const centerIndex = Math.round(offset / mark)
  return (
    <div
      ref={ref}
      className="nv-ring"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={options.length - 1}
      aria-valuenow={index}
      aria-valuetext={options[index]?.label}
      style={{ "--ring": `${-offset}px` } as React.CSSProperties}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        cancelAnimationFrame(raf.current)
        drag.current = { x: e.clientX, pos: pos.current, t: e.timeStamp, v: 0 }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const p = clamp(d.pos - (e.clientX - d.x), 0, max)
        const dt = Math.max(1, e.timeStamp - d.t)
        d.v = ((p - pos.current) / dt) * 16
        d.t = e.timeStamp
        write(p)
      }}
      onPointerUp={() => {
        const v = drag.current?.v ?? 0
        drag.current = null
        settle(v)
      }}
      onPointerCancel={() => {
        drag.current = null
        settle(0)
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") commit(index + 1)
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
          commit(index - 1)
        else return
        e.preventDefault()
        tick(0.7)
      }}
    >
      <div className="nv-ring-band" />
      <div
        className="nv-ring-track"
        style={{ transform: `translateX(${-offset - mark / 2}px)` }}
      >
        {options.map((o, i) => (
          <span
            key={String(o.value)}
            className="nv-ring-mark"
            data-on={i === centerIndex}
            style={{ "--mark": `${mark}px` } as React.CSSProperties}
          >
            {o.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className="nv-toggle"
      onClick={() => {
        tick(1.2)
        onChange(!value)
      }}
    >
      <span className="nv-toggle-well">
        <span className="nv-toggle-bat" />
      </span>
      <span className="nv-engraved">{label}</span>
    </button>
  )
}

// `read` is polled every frame, so the needle moves without a React render.
export function VuMeter({
  read,
  width = 120,
  label,
}: {
  read: () => number
  width?: number
  label: string
}) {
  const needle = React.useRef<SVGLineElement>(null)
  React.useEffect(() => {
    let raf = 0
    let shown = 0
    const frame = () => {
      const target = clamp(read(), 0, 1)
      shown += (target - shown) * (target > shown ? 0.35 : 0.1)
      needle.current?.style.setProperty("--n", `${-42 + shown * 84}deg`)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [read])
  return (
    <div
      className="nv-vu"
      role="img"
      aria-label={label}
      style={{ "--w": `${width}px` } as React.CSSProperties}
    >
      <svg viewBox="0 0 120 69" aria-hidden>
        <path
          d="M18 40 A52 52 0 0 1 102 40"
          fill="none"
          stroke="#3a2a10"
          strokeWidth="1.4"
        />
        <path
          d="M78 26 A52 52 0 0 1 102 40"
          fill="none"
          stroke="#b5301f"
          strokeWidth="3"
        />
        {Array.from({ length: 11 }, (_, i) => {
          const a = ((-42 + i * 8.4 - 90) * Math.PI) / 180
          return (
            <line
              key={i}
              x1={fixed(60 + Math.cos(a) * 50)}
              y1={fixed(74 + Math.sin(a) * 50)}
              x2={fixed(60 + Math.cos(a) * 56)}
              y2={fixed(74 + Math.sin(a) * 56)}
              stroke={i > 7 ? "#b5301f" : "#3a2a10"}
              strokeWidth="1"
            />
          )
        })}
        <text
          x="60"
          y="58"
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fill="#3a2a10"
        >
          VU
        </text>
        <line
          ref={needle}
          className="nv-vu-needle"
          x1="60"
          y1="74"
          x2="60"
          y2="14"
          stroke="#1a1208"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  )
}

export function Swatches({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c.toLowerCase() === value.toLowerCase()}
          aria-label={c}
          className="nv-swatch"
          style={{ background: c }}
          onClick={() => {
            tick(0.8)
            onChange(c)
          }}
        />
      ))}
    </div>
  )
}
