import { ImportError } from "./errors"
import {
  EXPANSION_FLOOR_BYTES,
  MAX_ENTRIES,
  MAX_EXPANSION,
  MAX_PAGE_BYTES,
  MAX_PAGES,
  MAX_TOTAL_BYTES,
} from "./limits"

export interface Entry {
  name: string
  // As the archive declares it, so checked again once read.
  size: number
}

const PAGE = /\.(jpe?g|png|webp|gif|tiff?|bmp|avif)$/i
// Folders and files that archivers and desktops leave behind.
const JUNK = /(^|\/)(__MACOSX|\.[^/]*|Thumbs\.db|desktop\.ini)(\/|$)/i

// The entry's name with forward slashes, or null when it could escape a
// folder. Nothing is written to disk here, but a name that climbs out or
// starts at the root is never a comic page, and this keeps it out of the
// WASM file systems too.
export function safeEntryName(name: string): string | null {
  if (!name || /[\0-\x1f]/.test(name)) return null
  const path = name.replace(/\\/g, "/")
  if (path.startsWith("/") || /^[a-z]:/i.test(path)) return null
  const parts = path.split("/").filter((p) => p !== "" && p !== ".")
  if (!parts.length || parts.includes("..")) return null
  return parts.join("/")
}

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
})

// page2 before page10, the way readers order them.
export const naturalCompare = (a: string, b: string) => collator.compare(a, b)

// The readable pages of an archive, in reading order. Refuses the whole file
// when its numbers don't add up: reading part of a bomb is still a bomb.
export function pageEntries(entries: Entry[], packedBytes: number): Entry[] {
  if (entries.length > MAX_ENTRIES) throw new ImportError("too_many_entries")
  const pages = new Map<string, Entry>()
  for (const entry of entries) {
    const name = safeEntryName(entry.name)
    if (!name || JUNK.test(name) || !PAGE.test(name)) continue
    if (!Number.isSafeInteger(entry.size) || entry.size < 0)
      throw new ImportError("corrupt")
    if (entry.size > MAX_PAGE_BYTES) throw new ImportError("page_too_large")
    pages.set(name, { name, size: entry.size })
  }
  const found = [...pages.values()]
  if (!found.length) throw new ImportError("no_pages")
  if (found.length > MAX_PAGES) throw new ImportError("too_many_pages")
  const total = found.reduce((sum, p) => sum + p.size, 0)
  if (
    total > MAX_TOTAL_BYTES ||
    (total > EXPANSION_FLOOR_BYTES && total > packedBytes * MAX_EXPANSION)
  )
    throw new ImportError("expands_too_much")
  return found.sort((a, b) => naturalCompare(a.name, b.name))
}
