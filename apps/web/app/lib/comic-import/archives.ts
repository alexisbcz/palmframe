import { ImportError } from "./errors"
import { pageEntries, safeEntryName, type Entry } from "./entries"
import { MAX_ENTRIES, MAX_PAGE_BYTES } from "./limits"
import { assertPage } from "./sniff"

// An opened archive: its pages in reading order, each read only when asked
// for, so a page count of a thousand stays cheap.
export interface Book {
  pages: Entry[]
  read(name: string): Promise<Uint8Array>
  close?(): void
}

// What reads the WASM builds, which the browser and the tests find differently.
export interface Wasm {
  unrar?: () => Promise<ArrayBuffer>
  sevenZip?: { locateFile?: (name: string) => string }
}

// Every page that leaves an archive went through here.
function checked(bytes: Uint8Array, declared: number) {
  if (bytes.length > MAX_PAGE_BYTES || bytes.length > declared)
    throw new ImportError("page_too_large")
  assertPage(bytes)
  return bytes
}

export async function openZip(data: Uint8Array): Promise<Book> {
  const { unzipSync } = await import("fflate")
  const entries: Entry[] = []
  const raw = new Map<string, string>()
  try {
    // A filter that keeps nothing lists the central directory without
    // inflating a byte.
    unzipSync(data, {
      filter: ({ name, originalSize }) => {
        if (entries.length > MAX_ENTRIES)
          throw new ImportError("too_many_entries")
        entries.push({ name, size: originalSize })
        const safe = safeEntryName(name)
        if (safe) raw.set(safe, name)
        return false
      },
    })
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError("corrupt")
  }
  const pages = pageEntries(entries, data.length)
  const sizes = new Map(pages.map((p) => [p.name, p.size]))
  return {
    pages,
    async read(name) {
      const original = raw.get(name)
      const declared = sizes.get(name)
      if (original === undefined || declared === undefined)
        throw new ImportError("corrupt")
      let out: Uint8Array | undefined
      try {
        // fflate writes into a buffer of the declared size, so an entry that
        // lies about its size can't grow past what was checked.
        out = unzipSync(data, {
          filter: (f) => f.name === original,
        })[original]
      } catch {
        // Encrypted entries come back as an unknown compression method.
        throw new ImportError("corrupt")
      }
      if (!out) throw new ImportError("corrupt")
      return checked(out, declared)
    },
  }
}

const text = (b: Uint8Array) => {
  const end = b.indexOf(0)
  return new TextDecoder().decode(end < 0 ? b : b.subarray(0, end))
}

function tarSize(field: Uint8Array) {
  // GNU tar writes sizes past 8 GB in base 256, high bit set.
  if (field[0]! & 0x80) {
    let n = field[0]! & 0x7f
    for (let i = 1; i < field.length; i++) {
      n = n * 256 + field[i]!
      if (!Number.isSafeInteger(n)) return -1
    }
    return n
  }
  const n = parseInt(text(field).trim() || "0", 8)
  return Number.isFinite(n) ? n : -1
}

const padded = (size: number) => Math.ceil(size / 512) * 512

function paxPath(records: Uint8Array) {
  const body = new TextDecoder().decode(records)
  let i = 0
  while (i < body.length) {
    const space = body.indexOf(" ", i)
    const length = Number(body.slice(i, space))
    if (space < 0 || !length) return null
    const record = body.slice(space + 1, i + length - 1)
    if (record.startsWith("path=")) return record.slice(5)
    i += length
  }
  return null
}

// Regular files only: links in a tar can point anywhere.
export function tarEntries(data: Uint8Array) {
  const files: (Entry & { offset: number })[] = []
  let offset = 0
  let longName: string | null = null
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    if (files.length > MAX_ENTRIES) throw new ImportError("too_many_entries")
    const size = tarSize(header.subarray(124, 136))
    const start = offset + 512
    if (size < 0 || start + size > data.length) throw new ImportError("corrupt")
    const type = String.fromCharCode(header[156]!)
    if (type === "L") longName = text(data.subarray(start, start + size))
    else if (type === "x")
      longName = paxPath(data.subarray(start, start + size))
    else {
      if (type === "0" || type === "\0" || type === "7") {
        const prefix =
          text(header.subarray(257, 262)) === "ustar"
            ? text(header.subarray(345, 500))
            : ""
        const short = text(header.subarray(0, 100))
        files.push({
          name: longName ?? (prefix ? `${prefix}/${short}` : short),
          size,
          offset: start,
        })
      }
      longName = null
    }
    offset = start + padded(size)
  }
  return files
}

export async function openTar(data: Uint8Array): Promise<Book> {
  const files = tarEntries(data)
  const pages = pageEntries(files, data.length)
  const where = new Map(
    files.map((f) => [safeEntryName(f.name) ?? "", f] as const)
  )
  return {
    pages,
    async read(name) {
      const file = where.get(name)
      if (!file) throw new ImportError("corrupt")
      return checked(
        data.subarray(file.offset, file.offset + file.size),
        file.size
      )
    },
  }
}

export async function openRar(
  data: Uint8Array,
  wasm: Wasm = {}
): Promise<Book> {
  const { createExtractorFromData, UnrarError } = await import("node-unrar-js")
  const wasmBinary = await wasm.unrar?.()
  const source = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer
  const fail = (e: unknown): never => {
    if (e instanceof ImportError) throw e
    if (e instanceof UnrarError && /PASSWORD/.test(e.reason))
      throw new ImportError("encrypted")
    throw new ImportError("corrupt")
  }
  const extractor = async () =>
    createExtractorFromData({ data: source, ...(wasmBinary && { wasmBinary }) })

  const entries: Entry[] = []
  const raw = new Map<string, string>()
  try {
    const { arcHeader, fileHeaders } = (await extractor()).getFileList()
    if (arcHeader.flags.headerEncrypted) throw new ImportError("encrypted")
    if (arcHeader.flags.volume) throw new ImportError("multi_volume")
    for (const header of fileHeaders) {
      if (entries.length > MAX_ENTRIES)
        throw new ImportError("too_many_entries")
      if (header.flags.directory) continue
      if (header.flags.encrypted) throw new ImportError("encrypted")
      entries.push({ name: header.name, size: header.unpSize })
      const safe = safeEntryName(header.name)
      if (safe) raw.set(safe, header.name)
    }
  } catch (e) {
    fail(e)
  }
  const pages = pageEntries(entries, data.length)
  const sizes = new Map(pages.map((p) => [p.name, p.size]))
  return {
    pages,
    async read(name) {
      const original = raw.get(name)
      const declared = sizes.get(name)
      if (original === undefined || declared === undefined)
        throw new ImportError("corrupt")
      try {
        const { files } = (await extractor()).extract({ files: [original] })
        // The generator has to run out, or the archive stays open in WASM.
        let bytes: Uint8Array | undefined
        for (const file of files) bytes ??= file.extraction
        if (!bytes) throw new ImportError("corrupt")
        return checked(bytes, declared)
      } catch (e) {
        return fail(e)
      }
    },
  }
}

// 7-Zip's listing, as `-slt` prints it: blocks of `Key = value`.
export function parseSevenZipList(output: string) {
  const files: (Entry & { encrypted: boolean })[] = []
  for (const block of output.split(/\r?\n\r?\n/)) {
    const field = (key: string) =>
      block.match(new RegExp(`^${key} = (.*)$`, "m"))?.[1]
    const path = field("Path")
    const size = field("Size")
    if (!path || field("Folder") === "+" || size === undefined) continue
    if (field("Attributes")?.startsWith("D")) continue
    files.push({
      name: path,
      size: Number(size || 0),
      encrypted: field("Encrypted") === "+",
    })
  }
  return files
}

export async function openSevenZip(
  data: Uint8Array,
  wasm: Wasm = {}
): Promise<Book> {
  const { default: SevenZip } = await import("7z-wasm")
  const out: string[] = []
  const seven = await SevenZip({
    print: (line: string) => out.push(line),
    printErr: (line: string) => out.push(line),
    ...(wasm.sevenZip?.locateFile && { locateFile: wasm.sevenZip.locateFile }),
  })
  const stream = seven.FS.open("/book.7z", "w+")
  seven.FS.write(stream, data, 0, data.length)
  seven.FS.close(stream)
  seven.FS.mkdir("/out")
  // `-p-` answers any password prompt, which would otherwise wait for a
  // keyboard that isn't there.
  const run = (...args: string[]) => {
    out.length = 0
    let failed = false
    try {
      seven.callMain(args)
    } catch {
      failed = true
    }
    if (/password/i.test(out.join("\n"))) throw new ImportError("encrypted")
    if (failed) throw new ImportError("corrupt")
  }
  run("l", "-slt", "-p-", "/book.7z")
  const listing = out.join("\n")
  const files = parseSevenZipList(listing.slice(listing.indexOf("----------")))
  if (files.some((f) => f.encrypted)) throw new ImportError("encrypted")
  // 7-Zip reads these as wildcards, and there's no way to ask for an entry
  // by position.
  const pages = pageEntries(
    files.filter((f) => !/[*?!@]/.test(f.name)),
    data.length
  )
  const raw = new Map(
    files.map((f) => [safeEntryName(f.name) ?? "", f.name] as const)
  )
  const sizes = new Map(pages.map((p) => [p.name, p.size]))
  return {
    pages,
    async read(name) {
      const original = raw.get(name)
      const declared = sizes.get(name)
      if (original === undefined || declared === undefined)
        throw new ImportError("corrupt")
      // `e` flattens paths, so whatever the archive says lands in /out.
      run("e", "-y", "-p-", "-o/out", "/book.7z", "--", original)
      const file = `/out/${original.split(/[\\/]/).pop()}`
      let bytes: Uint8Array
      try {
        bytes = seven.FS.readFile(file)
        seven.FS.unlink(file)
      } catch {
        throw new ImportError("corrupt")
      }
      return checked(bytes, declared)
    },
  }
}
