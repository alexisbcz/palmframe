import type { MachineLineNoteRow } from "@/lib/database"

// Which sentence one stance note reads as, on the page and in the feed.
export const LINE_NOTE = (
  note: Pick<MachineLineNoteRow, "from_stance" | "to_stance">
) => {
  if (!note.to_stance) return "removed" as const
  return note.from_stance ? ("changed" as const) : ("declared" as const)
}
