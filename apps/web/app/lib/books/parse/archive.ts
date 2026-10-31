import {
  bytesSource,
  zipEntries,
  zipEntryBytes,
  type ZipEntry,
} from "@/lib/comic-import/archives"
import { safeEntryName } from "@/lib/comic-import/entries"
import { ImportError } from "@/lib/comic-import/errors"

import { BookParseError } from "../errors"
import {
  EXPANSION_FLOOR_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_EXPANSION,
  MAX_PART_BYTES,
  MAX_TEXT_BYTES,
} from "../limits"
import { decodeText } from "../xml"

// EPUB and DOCX are both ZIPs. This reuses the comic importer's reader, whose
// inflate can't outgrow an entry's declared size, and adds the checks a text
// format needs: its numbers have to add up before anything is decompressed.
export interface Archive {
  names: string[]
  has(name: string): boolean
  read(name: string): Promise<Uint8Array>
  text(name: string): Promise<string>
}

export async function openArchive(bytes: Uint8Array): Promise<Archive> {
  const source = bytesSource(bytes)
  let entries: ZipEntry[]
  try {
    entries = await zipEntries(source)
  } catch (e) {
    throw e instanceof ImportError && e.code === "too_many_entries"
      ? new BookParseError("too_many_entries")
      : new BookParseError("corrupt", "Not a readable ZIP.")
  }
  if (entries.length > MAX_ARCHIVE_ENTRIES)
    throw new BookParseError("too_many_entries")
  const byName = new Map<string, ZipEntry>()
  let total = 0
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.size) || entry.size < 0)
      throw new BookParseError("corrupt")
    total += entry.size
    const name = safeEntryName(entry.name)
    if (name && !name.endsWith("/")) byName.set(name, entry)
  }
  if (
    total > MAX_TEXT_BYTES * 4 ||
    (total > EXPANSION_FLOOR_BYTES && total > bytes.length * MAX_EXPANSION)
  )
    throw new BookParseError("expands_too_much")

  let spent = 0
  const read = async (name: string) => {
    const entry = byName.get(name)
    if (!entry) throw new BookParseError("corrupt", `Missing part: ${name}`)
    if (entry.encrypted) throw new BookParseError("encrypted")
    try {
      return await zipEntryBytes(source, entry)
    } catch {
      throw new BookParseError("corrupt", `Unreadable part: ${name}`)
    }
  }
  return {
    names: [...byName.keys()],
    has: (name) => byName.has(name),
    read,
    async text(name) {
      const entry = byName.get(name)
      if (entry && entry.size > MAX_PART_BYTES)
        throw new BookParseError("too_large", `Part too large: ${name}`)
      spent += entry?.size ?? 0
      if (spent > MAX_TEXT_BYTES) throw new BookParseError("expands_too_much")
      return decodeText(await read(name))
    },
  }
}

// A path inside the archive, from a reference relative to `base`. Null when it
// climbs out, leaves the archive, or isn't a plain path.
export function resolvePath(base: string, href: string) {
  const clean = href.split("#")[0]!.split("?")[0]!
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null
  let decoded = clean
  try {
    decoded = decodeURIComponent(clean)
  } catch {
    return null
  }
  const parts = base.split("/").slice(0, -1)
  for (const part of decoded.split("/")) {
    if (part === "..") {
      if (!parts.length) return null
      parts.pop()
    } else if (part && part !== ".") parts.push(part)
  }
  return safeEntryName(parts.join("/"))
}
