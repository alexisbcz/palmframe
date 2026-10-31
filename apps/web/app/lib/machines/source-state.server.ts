import type { MachineFeedStateRow, MachineRow } from "@/lib/database"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { StateChange } from "./source-state"

// Null when the states can't be read. A dataset can't tell its first read from
// its next one without them, so the caller doesn't read it this time.
export async function loadFeedStates(machineId: string) {
  const { data, error } = await supabaseAdmin()
    .from("comic_machine_feed_state")
    .select("*")
    .eq("machine_id", machineId)
  if (error) {
    console.error("Machine feed states not read", machineId, error.message)
    return null
  }
  return new Map<string, MachineFeedStateRow>(
    (data ?? []).map((row) => [row.feed_key, row])
  )
}

// Written after every read, whatever it found. A lost write costs a run's health
// and at worst repeats a row, which the inbox's own key still stops.
export async function saveFeedState(
  machine: Pick<MachineRow, "id" | "user_id">,
  feedKey: string,
  change: StateChange
) {
  const { error } = await supabaseAdmin()
    .from("comic_machine_feed_state")
    .upsert(
      {
        machine_id: machine.id,
        user_id: machine.user_id,
        feed_key: feedKey,
        ...change,
      },
      { onConflict: "machine_id,feed_key" }
    )
  if (error)
    console.error("Machine feed state not saved", machine.id, error.message)
}
