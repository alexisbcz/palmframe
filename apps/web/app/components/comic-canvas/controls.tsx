import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import { ColorPickerPopover } from "@workspace/ui/components/color-picker"
import { Slider } from "@workspace/ui/components/slider"

import { useT } from "@/i18n/core"

import { messages } from "./controls.messages"

export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5 border-b px-4 py-4 last:border-b-0">
      <div className="flex h-6 items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  )
}

const clamp = (n: number, min = -Infinity, max = Infinity) =>
  Math.min(max, Math.max(min, n))

export function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step = 1,
  className,
  "aria-label": ariaLabel,
}: {
  value: number
  onChange: (value: number) => void
  prefix?: string
  suffix?: string
  min?: number
  max?: number
  step?: number
  className?: string
  "aria-label"?: string
}) {
  // Keep the raw text while typing so "-" or "" don't snap back to a number.
  const [draft, setDraft] = React.useState<string | null>(null)
  const round = (n: number) => Math.round(n * 100) / 100

  return (
    <InputGroup className={cn("min-w-0 flex-1", className)}>
      {prefix && (
        <InputGroupAddon>
          <InputGroupText className="text-xs">{prefix}</InputGroupText>
        </InputGroupAddon>
      )}
      <InputGroupInput
        aria-label={ariaLabel ?? prefix}
        inputMode="decimal"
        className="tabular-nums"
        value={draft ?? String(round(value))}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(clamp(n, min, max))
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
          e.preventDefault()
          const delta =
            (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1)
          setDraft(null)
          onChange(clamp(round(value + delta), min, max))
        }}
      />
      {suffix && (
        <InputGroupAddon align="inline-end">
          <InputGroupText className="text-xs">{suffix}</InputGroupText>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

// Newsprint, inks and the classic four-colour comic hues.
const COMIC_PALETTE = [
  "#ffffff",
  "#f4efe1",
  "#fff3b0",
  "#111111",
  "#3d3d3d",
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#30a46c",
  "#0090ff",
  "#8e4ec6",
  "#d6409f",
]

// Colours already used in the project, so a page can stay on palette.
export const UsedColorsContext = React.createContext<string[]>([])

export function ColorInput({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  "aria-label": string
}) {
  const t = useT(messages)
  const used = React.useContext(UsedColorsContext)
  const [draft, setDraft] = React.useState<string | null>(null)
  return (
    <InputGroup className="min-w-0 flex-1">
      <InputGroupAddon>
        <ColorPickerPopover
          aria-label={ariaLabel}
          value={value}
          onChange={onChange}
          labels={{ hex: t("hex"), hue: t("hue"), eyeDropper: t("eyeDropper") }}
          swatches={[
            { label: t("presets"), colors: COMIC_PALETTE },
            {
              label: t("used"),
              colors: used
                .filter((c) => !COMIC_PALETTE.includes(c))
                .slice(0, 12),
            },
          ]}
        />
      </InputGroupAddon>
      <InputGroupInput
        aria-label={`${ariaLabel} hex`}
        className="font-mono text-xs uppercase"
        value={draft ?? value}
        onChange={(e) => {
          const v = e.target.value.trim()
          setDraft(v)
          const hex = v.startsWith("#") ? v : `#${v}`
          if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase())
        }}
        onBlur={() => setDraft(null)}
      />
    </InputGroup>
  )
}

export function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
}) {
  return (
    <Row label={label}>
      <NumberInput
        aria-label={label}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        className="w-20 flex-none"
      />
      <Slider
        aria-label={label}
        className="flex-1 px-1.5"
        minValue={min}
        maxValue={max}
        step={step}
        value={value}
        onChange={(v) => onChange(v as number)}
      />
    </Row>
  )
}
