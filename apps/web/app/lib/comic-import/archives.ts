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

// Where an archive's bytes come from. ZIP and tar are read a slice at a time
// from the file on disk, so a big book doesn't sit in memory while it's open.
export interface ByteSource {
  size: number
  bytes(start: number, end: number): Promise<Uint8Array>
}

export const fileSource = (file: Blob): ByteSource => ({
  size: file.size,
  bytes: async (start, end) =>
    new Uint8Array(await file.slice(start, end).arrayBuffer()),
})

export const bytesSource = (data: Uint8Array): ByteSource => ({
  size: data.length,
  bytes: async (start, end) => data.subarray(start, end),
})

// The bytes alone in their buffer, ready to transfer to another thread.
export const owned = (b: Uint8Array) =>
  b.byteLength === b.buffer.byteLength ? b : b.slice()

// Every page that leaves an archive went through here.
function checked(bytes: Uint8Array, declared: number) {
  if (bytes.length > MAX_PAGE_BYTES || bytes.length > declared)
    throw new ImportError("page_too_large")
  assertPage(bytes)
  return bytes
}

const EOCD = 0x06054b50
const EOCD64 = 0x06064b50
const EOCD64_LOCATOR = 0x07064b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const U16_MAX = 0xffff
const U32_MAX = 0xffffffff
// The end record, its longest comment, and the ZIP64 locator before it.
const ZIP_TAIL = 22 + U16_MAX + 20
// Generous for MAX_ENTRIES: filenames are short.
const MAX_ZIP_DIRECTORY = 64 * 1024 * 1024

interface ZipEntry extends Entry {
  packed: number
  method: number
  offset: number
  encrypted: boolean
}

const view = (b: Uint8Array) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength)

const u64 = (v: DataView, at: number) => {
  const n = v.getUint32(at + 4, true) * 2 ** 32 + v.getUint32(at, true)
  if (!Number.isSafeInteger(n)) throw new ImportError("corrupt")
  return n
}

// Where the central directory sits and how many entries it says it has.
async function zipEnd(source: ByteSource) {
  const from = Math.max(0, source.size - ZIP_TAIL)
  const tail = await source.bytes(from, source.size)
  const v = view(tail)
  let at = tail.length - 22
  while (
    at >= 0 &&
    !(
      v.getUint32(at, true) === EOCD &&
      at + 22 + v.getUint16(at + 20, true) <= tail.length
    )
  )
    at--
  if (at < 0) throw new ImportError("corrupt")
  const count = v.getUint16(at + 10, true)
  const length = v.getUint32(at + 12, true)
  const start = v.getUint32(at + 16, true)
  if (count !== U16_MAX && length !== U32_MAX && start !== U32_MAX)
    return { count, length, start }
  if (at < 20 || v.getUint32(at - 20, true) !== EOCD64_LOCATOR)
    throw new ImportError("corrupt")
  const record = u64(v, at - 12)
  const big = view(await source.bytes(record, record + 56))
  if (big.byteLength < 56 || big.getUint32(0, true) !== EOCD64)
    throw new ImportError("corrupt")
  return {
    count: u64(big, 32),
    length: u64(big, 40),
    start: u64(big, 48),
  }
}

// Sizes past 4 GB live in an extra field, each only when its 32-bit slot is
// full, in this order.
function zip64Sizes(
  v: DataView,
  from: number,
  to: number,
  entry: Pick<ZipEntry, "size" | "packed" | "offset">
) {
  for (let at = from; at + 4 <= to; at += 4 + v.getUint16(at + 2, true)) {
    if (v.getUint16(at, true) !== 1) continue
    let field = at + 4
    for (const key of ["size", "packed", "offset"] as const) {
      if (entry[key] !== U32_MAX) continue
      if (field + 8 > to) throw new ImportError("corrupt")
      entry[key] = u64(v, field)
      field += 8
    }
    return
  }
}

// Plenty of tools write UTF-8 without setting the flag that says so, macOS
// `zip` among them, so the bytes decide.
function zipName(name: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(name)
  } catch {
    return new TextDecoder("latin1").decode(name)
  }
}

export async function zipEntries(source: ByteSource) {
  const { count, length, start } = await zipEnd(source)
  if (count > MAX_ENTRIES) throw new ImportError("too_many_entries")
  if (length > MAX_ZIP_DIRECTORY || start + length > source.size)
    throw new ImportError("corrupt")
  const directory = await source.bytes(start, start + length)
  const v = view(directory)
  const entries: ZipEntry[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    if (at + 46 > directory.length || v.getUint32(at, true) !== CENTRAL)
      throw new ImportError("corrupt")
    const flags = v.getUint16(at + 8, true)
    const nameEnd = at + 46 + v.getUint16(at + 28, true)
    const extraEnd = nameEnd + v.getUint16(at + 30, true)
    const next = extraEnd + v.getUint16(at + 32, true)
    if (next > directory.length) throw new ImportError("corrupt")
    const entry: ZipEntry = {
      name: zipName(directory.subarray(at + 46, nameEnd)),
      packed: v.getUint32(at + 20, true),
      size: v.getUint32(at + 24, true),
      offset: v.getUint32(at + 42, true),
      method: v.getUint16(at + 10, true),
      encrypted: !!(flags & 1),
    }
    zip64Sizes(v, nameEnd, extraEnd, entry)
    entries.push(entry)
    at = next
  }
  return entries
}

async function zipEntryBytes(source: ByteSource, entry: ZipEntry) {
  const local = await source.bytes(entry.offset, entry.offset + 30)
  if (local.length < 30 || view(local).getUint32(0, true) !== LOCAL)
    throw new ImportError("corrupt")
  const v = view(local)
  const start =
    entry.offset + 30 + v.getUint16(26, true) + v.getUint16(28, true)
  const packed = await source.bytes(start, start + entry.packed)
  if (packed.length !== entry.packed) throw new ImportError("corrupt")
  if (entry.method === 0) return packed
  if (entry.method !== 8) throw new ImportError("corrupt")
  const { inflateSync } = await import("fflate")
  try {
    // The output buffer has the declared size, so an entry that lies about
    // its size can't grow past what was checked.
    return inflateSync(packed, { out: new Uint8Array(entry.size) })
  } catch {
    throw new ImportError("corrupt")
  }
}

export async function openZip(source: ByteSource): Promise<Book> {
  const entries = await zipEntries(source)
  const pages = pageEntries(entries, source.size)
  const where = new Map(
    entries.map((e) => [safeEntryName(e.name) ?? "", e] as const)
  )
  if (pages.some((p) => where.get(p.name)?.encrypted))
    throw new ImportError("encrypted")
  const sizes = new Map(pages.map((p) => [p.name, p.size]))
  return {
    pages,
    async read(name) {
      const entry = where.get(name)
      const declared = sizes.get(name)
      if (!entry || declared === undefined) throw new ImportError("corrupt")
      return checked(await zipEntryBytes(source, entry), declared)
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

const SPACE = 0x20
const EQUALS = 0x3d
// Extended headers hold a path and a few numbers.
const MAX_TAR_META = 1024 * 1024

// A PAX header's records, each "<length> <key>=<value>\n". The length counts
// bytes, so this works on bytes: a non-ASCII path is shorter as a string.
export function paxRecords(records: Uint8Array) {
  const found: { path?: string; size?: number } = {}
  let i = 0
  while (i < records.length) {
    const space = records.indexOf(SPACE, i)
    if (space < 0) break
    const length = Number(new TextDecoder().decode(records.subarray(i, space)))
    if (!Number.isSafeInteger(length) || length <= space - i) break
    const end = i + length
    if (end > records.length) break
    const record = records.subarray(space + 1, end - 1)
    const equals = record.indexOf(EQUALS)
    if (equals > 0) {
      const key = new TextDecoder().decode(record.subarray(0, equals))
      const value = new TextDecoder().decode(record.subarray(equals + 1))
      if (key === "path") found.path = value
      if (key === "size") {
        const size = /^\d+$/.test(value) ? Number(value) : -1
        if (!Number.isSafeInteger(size) || size < 0)
          throw new ImportError("corrupt")
        found.size = size
      }
    }
    i = end
  }
  return found
}

// Regular files only: links in a tar can point anywhere. Headers are read one
// at a time, so the file's contents stay on disk.
export async function tarEntries(source: ByteSource) {
  const files: (Entry & { offset: number })[] = []
  let offset = 0
  let blocks = 0
  let pending: { path?: string | null; size?: number } = {}
  const meta = async (start: number, size: number) => {
    if (size > MAX_TAR_META) throw new ImportError("corrupt")
    return source.bytes(start, start + size)
  }
  while (offset + 512 <= source.size) {
    const header = await source.bytes(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    // Headers of every kind, so a tar of empty folders ends early too.
    if (++blocks > MAX_ENTRIES * 3) throw new ImportError("too_many_entries")
    const type = String.fromCharCode(header[156]!)
    const regular = type === "0" || type === "\0" || type === "7"
    const size = regular
      ? (pending.size ?? tarSize(header.subarray(124, 136)))
      : tarSize(header.subarray(124, 136))
    const start = offset + 512
    if (size < 0 || start + size > source.size) throw new ImportError("corrupt")
    if (type === "L") pending.path = text(await meta(start, size))
    else if (type === "x") pending = paxRecords(await meta(start, size))
    else if (type !== "K" && type !== "g") {
      if (regular) {
        if (files.length >= MAX_ENTRIES)
          throw new ImportError("too_many_entries")
        const prefix =
          text(header.subarray(257, 262)) === "ustar"
            ? text(header.subarray(345, 500))
            : ""
        const short = text(header.subarray(0, 100))
        files.push({
          name: pending.path ?? (prefix ? `${prefix}/${short}` : short),
          size,
          offset: start,
        })
      }
      pending = {}
    }
    offset = start + padded(size)
  }
  return files
}

export async function openTar(source: ByteSource): Promise<Book> {
  const files = await tarEntries(source)
  const pages = pageEntries(files, source.size)
  const where = new Map(
    files.map((f) => [safeEntryName(f.name) ?? "", f] as const)
  )
  return {
    pages,
    async read(name) {
      const file = where.get(name)
      if (!file) throw new ImportError("corrupt")
      return checked(
        await source.bytes(file.offset, file.offset + file.size),
        file.size
      )
    },
  }
}

export async function openRar(
  file: ByteSource,
  wasm: Wasm = {}
): Promise<Book> {
  const { createExtractorFromData, UnrarError } = await import("node-unrar-js")
  const wasmBinary = await wasm.unrar?.()
  // unrar wants the whole archive. It wraps this buffer without copying it, so
  // one buffer serves every extractor below, however many pages get read.
  const source = owned(await file.bytes(0, file.size)).buffer as ArrayBuffer
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
  const pages = pageEntries(entries, source.byteLength)
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

// Whether 7-Zip's error output means a password. Its message comes first on
// the line and the file name last, so a page called "Wrong password.png" in a
// damaged archive doesn't count.
export const sevenZipWantsPassword = (errors: string[]) =>
  errors.some((line) =>
    /^ERROR: (Data Error in encrypted file|Wrong password|Can ?not open encrypted archive)/i.test(
      line.trim()
    )
  )

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
  file: ByteSource,
  wasm: Wasm = {}
): Promise<Book> {
  const { default: SevenZip } = await import("7z-wasm")
  const data = await file.bytes(0, file.size)
  const out: string[] = []
  const errors: string[] = []
  const seven = await SevenZip({
    print: (line: string) => out.push(line),
    printErr: (line: string) => errors.push(line),
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
    errors.length = 0
    let failed = false
    try {
      seven.callMain(args)
    } catch {
      failed = true
    }
    if (sevenZipWantsPassword(errors)) throw new ImportError("encrypted")
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
    file.size
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
