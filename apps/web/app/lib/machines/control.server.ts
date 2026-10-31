import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { HOLD_MS } from "./gate"
import type { MachineConfig } from "./model"
import { type LineStop, calendarStop } from "./stance"

// The one switch that stops every machine, set in the database so it takes
// effect without a deploy. When the row can't be read, nothing runs: a stop
// that fails open isn't a stop.
export async function machinesHalted() {
  try {
    const { data, error } = await supabaseAdmin()
      .from("comic_machines_control")
      .select("halted")
      .eq("id", true)
      .maybeSingle()
    if (error || !data) {
      console.error("Machine control unreadable", error?.message)
      return true
    }
    return data.halted
  } catch (e) {
    console.error("Machine control unreadable", e)
    return true
  }
}

// When this machine last changed its declared line, or null if it never had one.
// A note that can't be read counts as one made just now.
export async function lastLineNote(machineId: string) {
  try {
    const { data, error } = await supabaseAdmin()
      .from("comic_machine_line_notes")
      .select("created_at")
      .eq("machine_id", machineId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? Date.parse(data.created_at) : null
  } catch (e) {
    console.error("Line notes unreadable", e)
    return Date.now()
  }
}

// Why a line machine can't publish right now, or null when it can. Checked before
// an edition starts and again in publishDraft, because a draft approved before a
// freeze can still be waiting when one begins. A calendar nobody can read counts
// as no calendar. A machine that has just dropped its line waits as long as its
// drafts can last, or saving it without one would walk them past a freeze.
export async function lineStopFor(
  machine: { id: string; public: boolean },
  config: Pick<MachineConfig, "line">,
  now: number
): Promise<LineStop | null> {
  if (!config.line) {
    const noted = await lastLineNote(machine.id)
    return noted !== null && now - noted < HOLD_MS ? "line_left" : null
  }
  if (!machine.public) return "not_public"
  try {
    const { data, error } = await supabaseAdmin()
      .from("comic_arena_calendars")
      .select("reviewed_until, windows")
      .eq("arena", config.line.arena)
      .maybeSingle()
    if (error) console.error("Arena calendar unreadable", error.message)
    return error ? "no_calendar" : calendarStop(data, now)
  } catch (e) {
    console.error("Arena calendar unreadable", e)
    return "no_calendar"
  }
}
