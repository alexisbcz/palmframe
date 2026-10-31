import { supabaseAdmin } from "@/lib/supabase-admin.server"

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
