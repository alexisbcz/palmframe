import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date"
import { I18nProvider as AriaI18nProvider } from "react-aria-components"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Popover, PopoverTrigger } from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useLocale, useT } from "@/i18n/core"

import { messages } from "./publish.messages"

const pad = (n: number) => String(n).padStart(2, "0")
const HOURS = Array.from({ length: 24 }, (_, h) => ({ id: pad(h) }))
const MINUTES = Array.from({ length: 12 }, (_, i) => ({ id: pad(i * 5) }))

// `value` is a datetime-local string ("2026-10-29T17:45"), local time.
function split(value: string) {
  const [date = "", time = "00:00"] = value.split("T")
  const [y, m, d] = date.split("-").map(Number)
  const [hh = "00", mm = "00"] = time.split(":")
  return { date: new CalendarDate(y!, m!, d!), hh, mm }
}

const join = (date: CalendarDate, hh: string, mm: string) =>
  `${date.year}-${pad(date.month)}-${pad(date.day)}T${hh}:${mm}`

function at(days: number, hh: number, mm = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hh, mm, 0, 0)
  return d
}

const local = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

// A date and time to publish at: a calendar for the day, hour and minute
// menus, and a few common choices. Days before today can't be picked.
export function SchedulePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const { date, hh, mm } = split(value)
  // A minute off the 5-minute grid (e.g. typed elsewhere) still shows.
  const minutes = MINUTES.some((m) => m.id === mm)
    ? MINUTES
    : [...MINUTES, { id: mm }].sort((a, b) => a.id.localeCompare(b.id))

  const label = new Date(
    date.year,
    date.month - 1,
    date.day,
    Number(hh),
    Number(mm)
  ).toLocaleString(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })

  const inHour = new Date(Date.now() + 60 * 60 * 1000)
  inHour.setMinutes(Math.ceil(inHour.getMinutes() / 5) * 5, 0, 0)
  // "Tonight" only while there's still an afternoon left.
  const presets = (
    [
      ["inHour", local(inHour)],
      ["tonight", new Date().getHours() < 17 ? local(at(0, 18)) : null],
      ["tomorrowMorning", local(at(1, 9))],
      ["tomorrowEvening", local(at(1, 18))],
    ] as const
  ).filter((p) => p[1] !== null)

  return (
    <AriaI18nProvider locale={locale}>
      <PopoverTrigger>
        <Button
          variant="outline"
          aria-label={t("scheduleAt")}
          className="w-full justify-start font-normal"
        >
          <HugeiconsIcon
            icon={Calendar03Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          <span className="first-letter:uppercase">{label}</span>
        </Button>
        <Popover placement="bottom start" className="w-auto p-0">
          <div className="flex flex-col sm:flex-row">
            <Calendar
              aria-label={t("scheduleAt")}
              value={date}
              minValue={today(getLocalTimeZone())}
              onChange={(d) => onChange(join(d, hh, mm))}
            />
            <div className="flex flex-col gap-1 border-t p-2 sm:w-40 sm:border-s sm:border-t-0">
              {presets.map(([id, preset]) => (
                <Button
                  key={id}
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal"
                  onPress={() => onChange(preset!)}
                >
                  {t(`presets.${id}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t p-2">
            <span className="text-xs text-muted-foreground">{t("time")}</span>
            <Select
              aria-label={t("hour")}
              value={hh}
              onChange={(key) => onChange(join(date, String(key), mm))}
            >
              <SelectTrigger size="sm" className="w-18 tabular-nums">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {HOURS.map((h) => (
                  <SelectItem key={h.id} id={h.id} className="tabular-nums">
                    {h.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span aria-hidden>:</span>
            <Select
              aria-label={t("minute")}
              value={mm}
              onChange={(key) => onChange(join(date, hh, String(key)))}
            >
              <SelectTrigger size="sm" className="w-18 tabular-nums">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {minutes.map((m) => (
                  <SelectItem key={m.id} id={m.id} className="tabular-nums">
                    {m.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Popover>
      </PopoverTrigger>
    </AriaI18nProvider>
  )
}
