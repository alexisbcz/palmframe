// When a beat is due next, in its own time zone. Pure, so it's tested.
import type { Cadence } from "./database"

export interface Schedule {
  cadence: Cadence
  // 0 is Sunday.
  weekday: number
  minuteOfDay: number
  timezone: string
}

export const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// The wall-clock parts of an instant in a zone.
function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0"
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get("weekday")
    ),
  }
}

// The instant when it's y-m-d h:m on the wall clock in the zone. Two passes
// settle the offset, which can change at a daylight-saving switch.
function instantIn(
  y: number,
  m: number,
  d: number,
  minuteOfDay: number,
  timeZone: string
) {
  const wanted = Date.UTC(
    y,
    m - 1,
    d,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60
  )
  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), timeZone)
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    guess += wanted - seen
  }
  return new Date(guess)
}

const runsOn = (s: Schedule, weekday: number) =>
  s.cadence === "daily" ||
  (s.cadence === "weekdays" && weekday >= 1 && weekday <= 5) ||
  (s.cadence === "weekly" && weekday === s.weekday)

export function nextRun(s: Schedule, after: Date): Date {
  const tz = validTimezone(s.timezone) ? s.timezone : "UTC"
  const today = partsIn(after, tz)
  for (let i = 0; i < 9; i++) {
    // Noon UTC of the wall-clock date plus i days names a date safely.
    const day = new Date(
      Date.UTC(today.year, today.month - 1, today.day + i, 12)
    )
    const y = day.getUTCFullYear()
    const m = day.getUTCMonth() + 1
    const d = day.getUTCDate()
    if (!runsOn(s, day.getUTCDay())) continue
    const at = instantIn(y, m, d, s.minuteOfDay, tz)
    if (at.getTime() > after.getTime()) return at
  }
  // Unreachable for valid schedules; a week out keeps a broken one quiet.
  return new Date(after.getTime() + 7 * 86_400_000)
}

export const timeLabel = (minuteOfDay: number) =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`
