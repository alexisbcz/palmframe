import * as React from "react"

import { useT } from "@/i18n/core"
import { streak, type Light, type Manuscript } from "@/lib/desk/model"

import { messages } from "./desk.messages"
import type { Tools } from "./editor"

// Instruments are real inputs and live regions; the brass goes on top.

function Tally({
  value,
  digits,
  label,
}: {
  value: number
  digits: number
  label: string
}) {
  const text = String(Math.max(0, Math.round(value)))
    .padStart(digits, "0")
    .slice(-digits)
  return (
    <div className="dk-tally" role="status" aria-label={`${label}: ${value}`}>
      <div className="dk-tally-window" aria-hidden>
        {[...text].map((d, i) => (
          <span key={i} className="dk-wheel">
            <span style={{ transform: `translateY(${-Number(d) * 10}%)` }}>
              {"0123456789".split("").map((n) => (
                <b key={n}>{n}</b>
              ))}
            </span>
          </span>
        ))}
      </div>
      <span className="dk-etch">{label}</span>
    </div>
  )
}

function Gauge({
  value,
  min,
  max,
  label,
  reading,
  ticks,
}: {
  value: number | null
  min: number
  max: number
  label: string
  reading: string
  ticks: number[]
}) {
  const clamp = Math.min(max, Math.max(min, value ?? min))
  const angle = -50 + ((clamp - min) / (max - min)) * 100
  return (
    <div
      className="dk-gauge"
      role="meter"
      aria-label={label}
      aria-valuenow={value ?? undefined}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={reading}
    >
      <svg viewBox="0 0 120 68" aria-hidden>
        <path
          d="M14 60 A 46 46 0 0 1 106 60"
          fill="none"
          stroke="#3a2a18"
          strokeWidth=".8"
        />
        {ticks.map((v) => {
          const a = ((-50 + ((v - min) / (max - min)) * 100) * Math.PI) / 180
          const s = Math.sin(a)
          const c = Math.cos(a)
          return (
            <g key={v}>
              <line
                x1={60 + s * 42}
                y1={62 - c * 42}
                x2={60 + s * 47}
                y2={62 - c * 47}
                stroke="#2a1d10"
                strokeWidth=".9"
              />
              <text
                x={60 + s * 34}
                y={62 - c * 34 + 2}
                fontSize="6.5"
                textAnchor="middle"
                fill="#3a2a18"
              >
                {v}
              </text>
            </g>
          )
        })}
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: "60px 62px",
            transition: "transform .7s cubic-bezier(.3,1.4,.5,1)",
          }}
        >
          <line
            x1="60"
            y1="62"
            x2="60"
            y2="16"
            stroke="#a2281e"
            strokeWidth="1"
          />
        </g>
        <circle cx="60" cy="62" r="4" fill="#2a2018" />
      </svg>
      <span className="dk-etch">{label}</span>
    </div>
  )
}

function GoalRing({
  value,
  goal,
  label,
}: {
  value: number
  goal: number
  label: string
}) {
  const f = Math.min(1, goal ? value / goal : 0)
  const c = 2 * Math.PI * 21
  return (
    <div
      className="dk-ring"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemax={goal}
    >
      <svg viewBox="0 0 56 56" aria-hidden>
        <circle
          cx="28"
          cy="28"
          r="21"
          fill="none"
          stroke="rgb(0 0 0 / .4)"
          strokeWidth="4"
        />
        <circle
          cx="28"
          cy="28"
          r="21"
          fill="none"
          stroke="#e6c070"
          strokeWidth="4"
          strokeDasharray={`${c * f} ${c}`}
          transform="rotate(-90 28 28)"
          style={{ transition: "stroke-dasharray .5s" }}
        />
      </svg>
      <span className="dk-ring-value">{Math.round(f * 100)}%</span>
      <span className="dk-etch">{label}</span>
    </div>
  )
}

function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean
  label: string
  onChange(on: boolean): void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="dk-toggle"
      onClick={() => onChange(!on)}
    >
      <i aria-hidden data-on={on} />
      <span className="dk-etch">{label}</span>
    </button>
  )
}

function Sprint({
  sprint,
  onSprint,
  today,
}: {
  sprint: { ends: number; start: number } | null
  onSprint(s: { ends: number; start: number } | null): void
  today: number
}) {
  const t = useT(messages)
  const [now, setNow] = React.useState(0)
  React.useEffect(() => {
    if (!sprint) return
    setNow(Date.now())
    const i = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(i)
  }, [sprint])
  const left = sprint ? Math.max(0, sprint.ends - now) : 0
  const mm = Math.floor(left / 60000)
  const ss = Math.floor(left / 1000) % 60
  const done = sprint && now > 0 && left === 0
  return (
    <button
      type="button"
      className="dk-sprint"
      onClick={() =>
        onSprint(
          sprint ? null : { ends: Date.now() + 25 * 60000, start: today }
        )
      }
      aria-label={sprint ? t("rail.sprintStop") : t("rail.sprintStart")}
    >
      <span className="dk-sprint-face">
        {sprint
          ? `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
          : "25:00"}
      </span>
      <span className="dk-etch">
        {done
          ? t("rail.sprintDone", { count: today - sprint.start })
          : sprint
            ? t("rail.sprintWords", { count: today - sprint.start })
            : t("rail.sprint")}
      </span>
    </button>
  )
}

export function Rail({
  manuscript: m,
  words,
  pages,
  today,
  grade,
  light,
  status,
  statusKind,
  tools,
  sprint,
  onSprint,
  onLight,
  onTools,
  onBind,
  onMark,
  onFind,
}: {
  manuscript: Manuscript
  words: number
  pages: number
  today: number
  grade: number | null
  light: Light
  status: string
  statusKind: string
  tools: Tools
  sprint: { ends: number; start: number } | null
  onSprint(s: { ends: number; start: number } | null): void
  onLight(l: Light): void
  onTools(p: Partial<Tools>): void
  onBind(): void
  onMark(mark: string): void
  onFind(): void
}) {
  const t = useT(messages)
  const days = streak(m.log, m.dailyGoal)
  const lights: Light[] = ["lamp", "morning", "dusk"]
  return (
    <div className="dk-rail" role="toolbar" aria-label={t("rail.label")}>
      <Tally value={words} digits={6} label={t("rail.words")} />
      {m.kind === "screenplay" ? (
        <Tally value={pages} digits={3} label={t("rail.pages")} />
      ) : (
        <GoalRing
          value={today}
          goal={m.dailyGoal}
          label={t("rail.today", { count: days })}
        />
      )}
      {m.kind === "novel" ? (
        <Gauge
          value={grade}
          min={0}
          max={16}
          ticks={[0, 4, 8, 12, 16]}
          label={t("rail.grade")}
          reading={grade === null ? t("rail.gradeEmpty") : grade.toFixed(1)}
        />
      ) : null}
      {m.kind === "screenplay" ? (
        <GoalRing
          value={today}
          goal={m.dailyGoal}
          label={t("rail.today", { count: days })}
        />
      ) : null}
      <Sprint sprint={sprint} onSprint={onSprint} today={today} />

      <span className="dk-rail-gap" />

      {m.kind === "novel" ? (
        <div className="flex gap-1">
          <button
            type="button"
            className="dk-keycap"
            aria-label={t("rail.italic")}
            onMouseDown={(e) => {
              e.preventDefault()
              onMark("*")
            }}
          >
            <i>I</i>
          </button>
          <button
            type="button"
            className="dk-keycap"
            aria-label={t("rail.bold")}
            onMouseDown={(e) => {
              e.preventDefault()
              onMark("**")
            }}
          >
            <b>B</b>
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="dk-keycap dk-keycap-wide"
        onClick={onFind}
      >
        {t("rail.find")}
      </button>
      <Toggle
        on={tools.focus}
        label={t("rail.focus")}
        onChange={(focus) => onTools({ focus })}
      />
      <Toggle
        on={tools.typewriter}
        label={t("rail.typewriter")}
        onChange={(typewriter) => onTools({ typewriter })}
      />
      {m.kind === "novel" ? (
        <Toggle
          on={tools.marks}
          label={t("rail.marks")}
          onChange={(marks) => onTools({ marks })}
        />
      ) : null}
      <Toggle
        on={tools.sound}
        label={t("rail.sound")}
        onChange={(sound) => onTools({ sound })}
      />

      <div className="dk-light" role="radiogroup" aria-label={t("rail.light")}>
        {lights.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={light === l}
            data-on={light === l}
            onClick={() => onLight(l)}
          >
            {t(`light.${l}`)}
          </button>
        ))}
      </div>

      <span className="dk-stamp-status" data-kind={statusKind} role="status">
        {status}
      </span>
      <button type="button" className="dk-bind" onClick={onBind}>
        {t("rail.bind")}
      </button>
    </div>
  )
}
