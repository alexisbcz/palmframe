import { ImportError } from "./errors"
import { MAX_PIXELS, MAX_TIFF_IFDS } from "./limits"

export type ImageKind =
  "jpeg" | "png" | "webp" | "gif" | "tiff" | "bmp" | "avif"
export type BookKind = "pdf" | "zip" | "rar" | "7z" | "tar"
export type FileKind = ImageKind | BookKind

const IMAGE_KINDS = new Set<FileKind>([
  "jpeg",
  "png",
  "webp",
  "gif",
  "tiff",
  "bmp",
  "avif",
])

export const isImageKind = (kind: FileKind | null): kind is ImageKind =>
  !!kind && IMAGE_KINDS.has(kind)

const starts = (b: Uint8Array, bytes: number[], at = 0) =>
  bytes.every((v, i) => b[at + i] === v)

const ascii = (b: Uint8Array, text: string, at = 0) =>
  starts(
    b,
    [...text].map((c) => c.charCodeAt(0)),
    at
  )

function isTar(b: Uint8Array) {
  if (b.length < 512) return false
  if (ascii(b, "ustar", 257)) return true
  // Pre-POSIX tar has no magic: its header checksum is the only tell.
  const stored = parseInt(
    String.fromCharCode(...b.subarray(148, 156))
      .replace(/\0.*$/, "")
      .trim(),
    8
  )
  if (!Number.isFinite(stored)) return false
  let sum = 0
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : b[i]!
  return sum === stored
}

// By content, never by extension: comic files are renamed all the time, and
// plenty of `.cbr` files are really ZIPs.
export function sniffKind(b: Uint8Array): FileKind | null {
  if (starts(b, [0xff, 0xd8, 0xff])) return "jpeg"
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png"
  if (ascii(b, "RIFF") && ascii(b, "WEBP", 8)) return "webp"
  if (ascii(b, "GIF87a") || ascii(b, "GIF89a")) return "gif"
  if (
    starts(b, [0x49, 0x49, 0x2a, 0x00]) ||
    starts(b, [0x4d, 0x4d, 0x00, 0x2a])
  )
    return "tiff"
  if (ascii(b, "BM") && b.length > 26) return "bmp"
  if (ascii(b, "ftyp", 4) && (ascii(b, "avif", 8) || ascii(b, "avis", 8)))
    return "avif"
  // The PDF spec lets junk come before the header.
  for (let i = 0; i < Math.min(b.length, 1024); i++)
    if (b[i] === 0x25 && ascii(b, "%PDF-", i)) return "pdf"
  if (
    starts(b, [0x50, 0x4b, 0x03, 0x04]) ||
    starts(b, [0x50, 0x4b, 0x05, 0x06])
  )
    return "zip"
  if (starts(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return "rar"
  if (starts(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "7z"
  if (isTar(b)) return "tar"
  return null
}

const SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

const SOS = 0xda

// Walks the segments to the frame header. Decoders skip junk between segments
// to find the next marker, so this does too: otherwise a stray byte would hide
// the real size from the check.
function jpegSize(b: Uint8Array, v: DataView) {
  let i = 2
  while (i + 8 < b.length) {
    if (b[i] !== 0xff || b[i + 1] === 0xff || b[i + 1] === 0) {
      i++
      continue
    }
    const marker = b[i + 1]!
    if (SOF.has(marker))
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) }
    if (marker === SOS) return null
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    i += 2 + Math.max(v.getUint16(i + 2), 2)
  }
  return null
}

function webpSize(b: Uint8Array, v: DataView) {
  if (b.length < 30) return null
  if (ascii(b, "VP8X", 12))
    return {
      width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
      height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
    }
  if (ascii(b, "VP8 ", 12))
    return {
      width: v.getUint16(26, true) & 0x3fff,
      height: v.getUint16(28, true) & 0x3fff,
    }
  if (ascii(b, "VP8L", 12)) {
    const bits = v.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  return null
}

// Bytes per value of each TIFF field type, by type number.
const TIFF_UNIT = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4]

// The first image's size, after walking the whole chain of directories. Null
// for a chain that loops, runs long or points outside the file: the decoder
// follows those pointers without looking.
function tiffSize(b: Uint8Array, v: DataView) {
  if (b.length < 8) return null
  const little = b[0] === 0x49
  const seen = new Set<number>()
  let first: { width: number; height: number } | null = null
  let offset = v.getUint32(4, little)
  while (offset) {
    if (seen.has(offset) || seen.size >= MAX_TIFF_IFDS) return null
    seen.add(offset)
    if (offset + 2 > b.length) return null
    const count = v.getUint16(offset, little)
    const end = offset + 2 + count * 12
    if (end > b.length) return null
    const size = { width: 0, height: 0 }
    for (let at = offset + 2; at < end; at += 12) {
      const tag = v.getUint16(at, little)
      const type = v.getUint16(at + 2, little)
      const values = v.getUint32(at + 4, little)
      const bytes = (TIFF_UNIT[type] ?? 0) * values
      if (bytes > 4 && v.getUint32(at + 8, little) + bytes > b.length)
        return null
      if (tag !== 256 && tag !== 257) continue
      const value =
        type === 3
          ? v.getUint16(at + 8, little)
          : type === 4
            ? v.getUint32(at + 8, little)
            : 0
      size[tag === 256 ? "width" : "height"] = value
    }
    first ??= size
    offset = end + 4 <= b.length ? v.getUint32(end, little) : 0
  }
  return first
}

// AVIF boxes nest: meta > iprp > ipco > ispe. A file can hold several images
// (a thumbnail, grid tiles), so the largest one counts.
function avifSize(b: Uint8Array, v: DataView) {
  let best: { width: number; height: number } | null = null
  const walk = (start: number, end: number, path: string, depth: number) => {
    let at = start
    while (at + 8 <= end) {
      let size = v.getUint32(at)
      let body = at + 8
      if (size === 1) {
        if (at + 16 > end || v.getUint32(at + 8) !== 0) return
        size = v.getUint32(at + 12)
        body = at + 16
      } else if (size === 0) size = end - at
      const stop = at + size
      if (size < body - at || stop > end) return
      const type = String.fromCharCode(...b.subarray(at + 4, at + 8))
      if (path === "ipco" && type === "ispe" && body + 12 <= stop) {
        const width = v.getUint32(body + 4)
        const height = v.getUint32(body + 8)
        if (!best || width * height > best.width * best.height)
          best = { width, height }
      } else if (depth < 3 && ["meta", "iprp", "ipco"].includes(type))
        // `meta` is a full box: four bytes of version and flags come first.
        walk(type === "meta" ? body + 4 : body, stop, type, depth + 1)
      at = stop
    }
  }
  walk(0, b.length, "", 0)
  return best as { width: number; height: number } | null
}

// Dimensions from the header alone, to refuse a decompression bomb before the
// browser decodes it. Null when they can't be read, which counts as a refusal.
export function imageSize(b: Uint8Array) {
  const kind = sniffKind(b)
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (kind === "png" && b.length >= 24)
    return { width: v.getUint32(16), height: v.getUint32(20) }
  if (kind === "gif" && b.length >= 10)
    return { width: v.getUint16(6, true), height: v.getUint16(8, true) }
  if (kind === "jpeg") return jpegSize(b, v)
  if (kind === "webp") return webpSize(b, v)
  if (kind === "tiff") return tiffSize(b, v)
  if (kind === "avif") return avifSize(b, v)
  if (kind === "bmp" && b.length >= 26)
    return {
      width: Math.abs(v.getInt32(18, true)),
      height: Math.abs(v.getInt32(22, true)),
    }
  return null
}

export function assertPixels(width: number, height: number) {
  if (!(width > 0) || !(height > 0) || width * height > MAX_PIXELS)
    throw new ImportError("page_too_large")
}

// The check every page passes before anything decodes it: entries named
// `.jpg` can hold anything.
export function assertPage(b: Uint8Array): ImageKind {
  const kind = sniffKind(b)
  if (!isImageKind(kind)) throw new ImportError("unsupported")
  const size = imageSize(b)
  if (!size) throw new ImportError("corrupt")
  assertPixels(size.width, size.height)
  return kind
}
