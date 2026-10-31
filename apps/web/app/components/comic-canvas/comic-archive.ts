import { Zip, ZipDeflate, strToU8 } from "fflate"

// Comic archives (.cbz): numbered page images and a ComicInfo.xml in a ZIP.
// .cbr is the same idea in a RAR, which only licensed software may create, so
// a .cbz is what we write. Renaming it .cbr would only mislabel it.

export const CBZ_MIME = "application/vnd.comicbook+zip"

// Past this a ZIP needs ZIP64, which fflate can't write.
const MAX_ARCHIVE_BYTES = 0xffffffff
const MAX_ENTRIES = 0xffff

export class ArchiveTooLargeError extends Error {}

export interface ComicInfo {
  title?: string
  series?: string
  // The comic's place in its series, from 1.
  number?: number
  writer?: string
  pageCount: number
  // ISO language code of the lettering. Omitted when it isn't known.
  language?: string
  rtl?: boolean
}

// XML 1.0 can't carry these at all, even escaped.
const INVALID_XML =
  /[\u{0}-\u{8}\u{B}\u{C}\u{E}-\u{1F}\u{FFFE}\u{FFFF}]|\p{Surrogate}/gu

export function escapeXml(text: string) {
  return text
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// The schema is a sequence, so strict readers need the elements in this order.
export function comicInfoXml(info: ComicInfo) {
  const fields: [string, string | number | undefined][] = [
    ["Title", info.title],
    ["Series", info.series],
    ["Number", info.number],
    ["Writer", info.writer],
    ["PageCount", info.pageCount],
    ["LanguageISO", info.language],
    ["Manga", info.rtl ? "YesAndRightToLeft" : "No"],
  ]
  const lines = fields.flatMap(([tag, value]) => {
    const text = escapeXml(String(value ?? "").trim())
    return text ? [`  <${tag}>${text}</${tag}>`] : []
  })
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">`,
    ...lines,
    `</ComicInfo>`,
    ``,
  ].join("\n")
}

// Readers sort names, so numbers follow archive order and never leave a gap
// when pages are left out. ASCII, whatever the comic is called.
export function pageFileName(position: number, total: number, ext: string) {
  const width = Math.max(3, String(total).length)
  return `${String(position + 1).padStart(width, "0")}.${ext}`
}

// Asks for one page at a time and hands its bytes to a Blob straight away,
// which browsers can keep on disk: a long comic holds about one page in the
// heap, however many it has.
export async function writeCbz({
  info,
  ext,
  readPage,
  maxBytes = MAX_ARCHIVE_BYTES,
}: {
  info: ComicInfo
  ext: string
  // `position` counts archive pages from 0.
  readPage: (position: number) => Promise<Blob>
  maxBytes?: number
}) {
  const total = info.pageCount
  // The pages and ComicInfo.xml, plus the entry ZIP keeps for its own use.
  if (total + 1 >= MAX_ENTRIES) throw new ArchiveTooLargeError()

  const parts: Blob[] = []
  let pending: Uint8Array[] = []
  let size = 0
  let failure: Error | null = null
  const archive = new Zip((error, chunk) => {
    if (error) failure ??= error
    else {
      pending.push(chunk)
      size += chunk.length
    }
  })
  const flush = () => {
    if (failure) throw failure
    if (size > maxBytes) throw new ArchiveTooLargeError()
    parts.push(new Blob(pending as BlobPart[]))
    pending = []
  }
  const add = (name: string, data: Uint8Array) => {
    // Deflate at level 0: images don't shrink, but a stored entry from a
    // streaming writer has no sizes up front, and stream readers reject that.
    const entry = new ZipDeflate(name, { level: 0 })
    archive.add(entry)
    entry.push(data, true)
    flush()
  }

  add("ComicInfo.xml", strToU8(comicInfoXml(info)))
  for (let position = 0; position < total; position++) {
    const page = await readPage(position)
    add(
      pageFileName(position, total, ext),
      new Uint8Array(await page.arrayBuffer())
    )
  }
  archive.end()
  flush()
  return new Blob(parts, { type: CBZ_MIME })
}
