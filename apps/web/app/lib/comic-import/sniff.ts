import { ImportError } from "./errors"
import { MAX_PIXELS } from "./limits"

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

function jpegSize(b: Uint8Array, v: DataView) {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]!
    if (marker === 0xff) {
      i++
      continue
    }
    if (SOF.has(marker))
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) }
    i += 2 + v.getUint16(i + 2)
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

// Dimensions from the header alone, to refuse a decompression bomb before the
// browser decodes it. Null when the format doesn't say up front.
export function imageSize(b: Uint8Array) {
  const kind = sniffKind(b)
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (kind === "png" && b.length >= 24)
    return { width: v.getUint32(16), height: v.getUint32(20) }
  if (kind === "gif" && b.length >= 10)
    return { width: v.getUint16(6, true), height: v.getUint16(8, true) }
  if (kind === "jpeg") return jpegSize(b, v)
  if (kind === "webp") return webpSize(b, v)
  if (kind === "bmp" && b.length >= 26)
    return {
      width: Math.abs(v.getInt32(18, true)),
      height: Math.abs(v.getInt32(22, true)),
    }
  return null
}

export function assertPixels(width: number, height: number) {
  if (!width || !height || width * height > MAX_PIXELS)
    throw new ImportError("page_too_large")
}

// The check every page passes before anything decodes it: entries named
// `.jpg` can hold anything.
export function assertPage(b: Uint8Array): ImageKind {
  const kind = sniffKind(b)
  if (!isImageKind(kind)) throw new ImportError("unsupported")
  const size = imageSize(b)
  if (size) assertPixels(size.width, size.height)
  return kind
}
