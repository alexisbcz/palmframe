import { PAGE_MARGIN, createPanel } from "./model"
import { hitTest, readImageFile } from "./render"
import type { ComicEditor } from "./use-editor"

// Drops an image into the panel under `at` (or the selected panel),
// otherwise adds a new panel sized to fit the page margins.
export async function insertImageFile(
  editor: ComicEditor,
  file: File,
  at?: { x: number; y: number }
) {
  if (!file.type.startsWith("image/")) return
  const img = await readImageFile(file)
  const doc = editor.docRef.current
  const target = at ? hitTest(doc, at.x, at.y) : editor.selected
  if (target?.type === "panel" && !target.locked) {
    editor.update(target.id, { src: img.src })
    editor.select(target.id)
    return
  }
  const s = Math.min(
    (doc.width - PAGE_MARGIN * 2) / img.width,
    (doc.height - PAGE_MARGIN * 2) / img.height
  )
  const width = Math.round(img.width * s)
  const height = Math.round(img.height * s)
  const cx = at?.x ?? doc.width / 2
  const cy = at?.y ?? doc.height / 2
  const x = Math.round(Math.max(0, Math.min(doc.width - width, cx - width / 2)))
  const y = Math.round(
    Math.max(0, Math.min(doc.height - height, cy - height / 2))
  )
  editor.add({
    ...createPanel({ x, y, width, height }, img.src),
    name: file.name.replace(/\.[^.]+$/, "") || "Image",
  })
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Minimal store-only ZIP: PNGs are already compressed, so deflate buys nothing.
export async function zip(files: { name: string; blob: Blob }[]) {
  const parts: BlobPart[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  const now = new Date()
  const time =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date =
    ((now.getFullYear() - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate()

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer())
    const name = new TextEncoder().encode(file.name)
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(local.buffer, name, data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(12, time, true)
    entry.setUint16(14, date, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)

    offset += 30 + name.length + data.length
  }

  const size = central.reduce((n, c) => n + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer], {
    type: "application/zip",
  })
}

// Minimal PDF: one JPEG per page, drawn full bleed. Page sizes use the
// CSS 96 dpi convention, so a 1080 px slide is 810 pt (11.25 in) wide.
export async function pdf(
  pages: {
    jpeg: Blob
    width: number
    height: number
    pixelWidth: number
    pixelHeight: number
  }[]
) {
  const encoder = new TextEncoder()
  const parts: Uint8Array<ArrayBuffer>[] = []
  const offsets: number[] = []
  let length = 0
  const write = (chunk: string | Uint8Array<ArrayBuffer>) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk
    parts.push(bytes)
    length += bytes.length
  }
  const object = (
    id: number,
    body: string,
    stream?: Uint8Array<ArrayBuffer>
  ) => {
    offsets[id] = length
    write(`${id} 0 obj\n${body}\n`)
    if (stream) {
      write("stream\n")
      write(stream)
      write("\nendstream\n")
    }
    write("endobj\n")
  }

  // Objects: 1 catalog, 2 page tree, then page, content, image per slide.
  const pageId = (i: number) => 3 + i * 3
  write("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
  object(1, "<< /Type /Catalog /Pages 2 0 R >>")
  object(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`
  )
  for (const [i, page] of pages.entries()) {
    const id = pageId(i)
    const w = +(page.width * 0.75).toFixed(2)
    const h = +(page.height * 0.75).toFixed(2)
    const draw = encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`)
    const jpeg = new Uint8Array(await page.jpeg.arrayBuffer())
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`
    )
    object(id + 1, `<< /Length ${draw.length} >>`, draw)
    object(
      id + 2,
      `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
      jpeg
    )
  }

  const xref = length
  const count = pageId(pages.length)
  write(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id++)
    write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  write(
    `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  )
  return new Blob(parts, { type: "application/pdf" })
}

// Stamps print resolution into a PNG (pHYs chunk) or JPEG (JFIF density),
// so layout apps place the image at its physical size. Other types pass.
export async function withDpi(blob: Blob, dpi: number) {
  const data = new Uint8Array(await blob.arrayBuffer())
  if (blob.type === "image/png") {
    const ppm = Math.round(dpi / 0.0254)
    const chunk = new Uint8Array(21)
    const view = new DataView(chunk.buffer)
    view.setUint32(0, 9)
    chunk.set(new TextEncoder().encode("pHYs"), 4)
    view.setUint32(8, ppm)
    view.setUint32(12, ppm)
    chunk[16] = 1
    view.setUint32(17, crc32(chunk.subarray(4, 17)))
    // Right after the signature (8 bytes) and IHDR (25 bytes).
    return new Blob([data.subarray(0, 33), chunk, data.subarray(33)], {
      type: blob.type,
    })
  }
  if (blob.type === "image/jpeg") {
    const view = new DataView(data.buffer)
    const jfif =
      view.getUint16(2) === 0xffe0 && view.getUint32(6) === 0x4a464946
    if (jfif) {
      data[13] = 1
      view.setUint16(14, dpi)
      view.setUint16(16, dpi)
      return new Blob([data], { type: blob.type })
    }
    const app0 = new Uint8Array(18)
    const head = new DataView(app0.buffer)
    head.setUint16(0, 0xffe0)
    head.setUint16(2, 16)
    app0.set([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1], 4)
    head.setUint16(12, dpi)
    head.setUint16(14, dpi)
    return new Blob([data.subarray(0, 2), app0, data.subarray(2)], {
      type: blob.type,
    })
  }
  return blob
}
