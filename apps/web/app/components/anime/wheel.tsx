import * as React from "react"
import { cn } from "cn"

export interface WheelOption<T extends string> {
  id: T
  label: string
  art: React.ReactNode
}

const ITEM = 120

// A dial of capsules. The choice sits in the middle and its neighbours fall
// away; scrolling, a click or the arrow keys all turn it.
export function Wheel<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: WheelOption<T>[]
  value: T
  onChange: (id: T) => void
}) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const settle = React.useRef<number>(undefined)
  const index = Math.max(
    0,
    options.findIndex((o) => o.id === value)
  )
  const turning = React.useRef(false)

  const turnTo = React.useCallback((i: number, smooth: boolean) => {
    const el = scroller.current
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    turning.current = true
    el.scrollTo({
      top: i * ITEM,
      behavior: smooth && !reduce ? "smooth" : "auto",
    })
    window.setTimeout(() => (turning.current = false), 320)
  }, [])

  React.useLayoutEffect(() => {
    if (!scroller.current) return
    if (Math.round(scroller.current.scrollTop / ITEM) !== index)
      turnTo(index, false)
  }, [index, turnTo])

  const onScroll = () => {
    if (turning.current) return
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const el = scroller.current
      if (!el) return
      const next = options[Math.round(el.scrollTop / ITEM)]
      if (next && next.id !== value) onChange(next.id)
    }, 110)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next =
      options[Math.min(options.length - 1, Math.max(0, index + step))]
    if (next) {
      onChange(next.id)
      turnTo(options.indexOf(next), true)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <p className="mb-3 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <div
        ref={scroller}
        role="radiogroup"
        aria-label={label}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="h-90 w-full snap-y snap-mandatory [scrollbar-width:none] overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_16%,black_84%,transparent)] py-30 [&::-webkit-scrollbar]:hidden"
      >
        {options.map((o, i) => {
          const on = o.id === value
          return (
            <div
              key={o.id}
              className="flex h-30 snap-center items-center justify-center"
            >
              <button
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  onChange(o.id)
                  turnTo(i, true)
                }}
                className={cn(
                  "flex h-27 w-full max-w-42 flex-col items-center justify-center gap-1 rounded-full bg-white/[0.06] px-5 text-center ring-1 ring-white/10 transition-[background-color,box-shadow,opacity] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--anime-accent)]",
                  on
                    ? "bg-white/10 ring-2 ring-white"
                    : "opacity-60 hover:opacity-100"
                )}
              >
                <span className="flex h-11 w-16 items-center justify-center">
                  {o.art}
                </span>
                <span
                  className={cn(
                    "line-clamp-2 text-xs leading-tight font-medium",
                    on ? "text-white" : "text-white/70"
                  )}
                >
                  {o.label}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
