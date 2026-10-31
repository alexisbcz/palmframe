import { zlibSync } from "fflate"

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc(bytes: Uint8Array) {
  let c = ~0
  for (const b of bytes) c = TABLE[(c ^ b) & 255]! ^ (c >>> 8)
  return ~c >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
  return out
}

// A scan is mostly paper and ink, so 8-bit grey keeps the words and a page
// stays well under the 5 MB a vision model accepts.
export function encodeGrayPng(gray: Uint8Array, width: number, height: number) {
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++)
    raw.set(gray.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlibSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

// Box filter: every source pixel counts, which is what keeps thin print legible.
export function shrinkGray(
  gray: Uint8Array,
  width: number,
  height: number,
  side: number
) {
  const scale = Math.min(1, side / Math.max(width, height))
  if (scale === 1) return { gray, width, height }
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const sum = new Uint32Array(w * h)
  const count = new Uint32Array(w * h)
  for (let y = 0; y < height; y++) {
    const ty = Math.min(h - 1, Math.floor(y * scale))
    for (let x = 0; x < width; x++) {
      const at = ty * w + Math.min(w - 1, Math.floor(x * scale))
      sum[at]! += gray[y * width + x]!
      count[at]!++
    }
  }
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++)
    out[i] = count[i] ? sum[i]! / count[i]! : 255
  return { gray: out, width: w, height: h }
}
