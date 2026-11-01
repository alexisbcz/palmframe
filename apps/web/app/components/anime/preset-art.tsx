import type { ApertureId, LensId, LightId, MovementId } from "@/lib/anime/model"

// Small drawings for the dials, built from the setting they stand for, so an
// aperture really is that open and a lens really is that long.
const GRADIENT = (
  <defs>
    <linearGradient id="anime-metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#8a8a8e" />
      <stop offset="0.5" stopColor="#3a3a3e" />
      <stop offset="1" stopColor="#1c1c1f" />
    </linearGradient>
  </defs>
)

const OPEN: Record<ApertureId, number> = {
  auto: 0.55,
  f14: 0.92,
  f28: 0.68,
  f56: 0.45,
  f11: 0.24,
}

export function ApertureArt({ id }: { id: ApertureId }) {
  const blades = 7
  const r = 26 * OPEN[id]
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
      {GRADIENT}
      <circle cx="32" cy="32" r="30" fill="url(#anime-metal)" />
      <circle cx="32" cy="32" r="26" fill="#121214" />
      {Array.from({ length: blades }, (_, i) => {
        const a = (i / blades) * Math.PI * 2
        const b = ((i + 1) / blades) * Math.PI * 2
        const p = (t: number, d: number) =>
          `${32 + Math.cos(t) * d} ${32 + Math.sin(t) * d}`
        return (
          <path
            key={i}
            d={`M${p(a, r)} L${p(a + 0.9, 26)} L${p(b + 0.9, 26)} L${p(b, r)}Z`}
            fill={i % 2 ? "#2c2c30" : "#37373c"}
            stroke="#0c0c0e"
            strokeWidth=".5"
          />
        )
      })}
      <circle cx="26" cy="24" r="2" fill="#fff" opacity=".25" />
    </svg>
  )
}

const LENS: Record<LensId, { length: number; front: number }> = {
  auto: { length: 30, front: 20 },
  wide: { length: 18, front: 26 },
  normal: { length: 28, front: 20 },
  tele: { length: 46, front: 22 },
  anamorphic: { length: 34, front: 28 },
  vintage: { length: 24, front: 17 },
}

export function LensArt({ id }: { id: LensId }) {
  const { length, front } = LENS[id]
  const x = 40 - length / 2
  return (
    <svg viewBox="0 0 80 48" className="size-full" aria-hidden>
      {GRADIENT}
      <path
        d={`M${x} ${24 - 14} H${x + length} L${x + length + 6} ${24 - front / 1.1} V${24 + front / 1.1} L${x + length} ${24 + 14} H${x}Z`}
        fill="url(#anime-metal)"
      />
      {[0.2, 0.45, 0.7].map((t) => (
        <rect
          key={t}
          x={x + length * t}
          y={10}
          width="3"
          height="28"
          fill="#0d0d0f"
          opacity=".7"
        />
      ))}
      <ellipse
        cx={x + length + 6}
        cy="24"
        rx="3.5"
        ry={front / 1.1}
        fill="#1a2030"
        stroke="#5c5c62"
      />
    </svg>
  )
}

export function CameraArt({ size = 1 }: { size?: number }) {
  return (
    <svg viewBox="0 0 80 48" className="size-full" aria-hidden>
      {GRADIENT}
      <rect
        x={40 - 22 * size}
        y={24 - 13 * size}
        width={34 * size}
        height={26 * size}
        rx="3"
        fill="url(#anime-metal)"
      />
      <rect
        x={40 + 12 * size}
        y={24 - 8 * size}
        width={14 * size}
        height={16 * size}
        rx="2"
        fill="url(#anime-metal)"
      />
      <circle
        cx={40 + 28 * size}
        cy="24"
        r={7 * size}
        fill="#1a2030"
        stroke="#5c5c62"
      />
      <circle
        cx={40 - 14 * size}
        cy={24 - 16 * size}
        r={5 * size}
        fill="#3a3a3e"
      />
      <circle
        cx={40 + 2 * size}
        cy={24 - 16 * size}
        r={5 * size}
        fill="#3a3a3e"
      />
    </svg>
  )
}

const PATHS: Record<MovementId, string> = {
  auto: "M16 24h32M40 16l8 8-8 8",
  still: "M22 14v20M42 14v20",
  push: "M12 12l14 9M52 12L38 21M12 36l14-9M52 36l-14-9",
  pull: "M26 21L12 12M38 21l14-9M26 27l-14 9M38 27l14 9",
  pan: "M10 24h44M18 16l-8 8 8 8M46 16l8 8-8 8",
  tilt: "M32 6v36M24 14l8-8 8 8M24 34l8 8 8-8",
  orbit:
    "M12 24c0-7 9-12 20-12s20 5 20 12-9 12-20 12c-6 0-11-1-15-4M12 26l5 7 6-5",
  crane: "M14 40C30 40 44 28 48 10M40 16l8-7 4 10",
  handheld: "M8 24l8-8 8 16 8-16 8 16 8-16 8 8",
  whip: "M8 16h30M14 24h40M8 32h30M46 16l8 8-8 8",
  parallax: "M10 14h44M18 24h28M26 34h12",
}

export function MovementArt({ id }: { id: MovementId }) {
  return (
    <svg
      viewBox="0 0 64 48"
      className="size-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[id]} className="text-white/80" />
    </svg>
  )
}

const SKIES: Record<LightId, [string, string]> = {
  auto: ["#55555a", "#222226"],
  day: ["#a9d2ef", "#e8dfc8"],
  golden: ["#f0a64a", "#6d3a2c"],
  night: ["#1d2c55", "#0a0d1c"],
  neon: ["#e0359a", "#2a1a6e"],
  rain: ["#6f7c87", "#2b3238"],
  backlit: ["#fff2c8", "#26211b"],
}

export function LightArt({ id }: { id: LightId }) {
  const [top, bottom] = SKIES[id]
  return (
    <span
      className="size-11 rounded-full ring-1 ring-white/20"
      style={{ background: `linear-gradient(${top}, ${bottom})` }}
    />
  )
}
