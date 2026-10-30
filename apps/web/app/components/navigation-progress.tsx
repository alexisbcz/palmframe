import * as React from "react"
import { useNavigation } from "react-router"

// Quick navigations finish before the bar appears, so they never flash.
const DELAY = 200
const FINISH = 300

type Phase = "idle" | "start" | "loading" | "done"

const STYLES: Record<Exclude<Phase, "idle">, React.CSSProperties> = {
  start: { transform: "scaleX(0.08)" },
  // It slows as it nears the end, and only the page arriving can finish it.
  loading: {
    transform: "scaleX(0.9)",
    transition: "transform 10s cubic-bezier(0.1, 0.7, 0.2, 1)",
  },
  done: {
    transform: "scaleX(1)",
    opacity: 0,
    transition: "transform 150ms ease-out, opacity 150ms ease-out 150ms",
  },
}

export function NavigationProgress() {
  const busy = useNavigation().state !== "idle"
  const [phase, setPhase] = React.useState<Phase>("idle")

  React.useEffect(() => {
    if (busy) {
      const timer = setTimeout(() => setPhase("start"), DELAY)
      return () => clearTimeout(timer)
    }
    setPhase((current) => (current === "idle" ? current : "done"))
    const timer = setTimeout(() => setPhase("idle"), FINISH)
    return () => clearTimeout(timer)
  }, [busy])

  // One frame at the start width, so the move to "loading" transitions.
  React.useEffect(() => {
    if (phase !== "start") return
    const frame = requestAnimationFrame(() => setPhase("loading"))
    return () => cancelAnimationFrame(frame)
  }, [phase])

  if (phase === "idle") return null
  return (
    <div
      aria-hidden
      data-slot="navigation-progress"
      data-phase={phase}
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 origin-left bg-brand"
      style={STYLES[phase]}
    />
  )
}
