import { ImportError } from "./errors"
import type { WorkerRequest, WorkerResponse } from "./import.worker"
import { MAX_FILE_BYTES, MAX_FILES, MAX_PAGES, STYLE_PAGE_SIDE } from "./limits"
import { naturalCompare } from "./entries"
import {
  assertPage,
  assertPixels,
  isImageKind,
  sniffKind,
  type BookKind,
} from "./sniff"

// One page of whatever was dropped, in reading order. Nothing is decoded until
// `draw` is called, so a thousand-page book only costs its listing.
export interface ImportPage {
  id: string
  label: string
  // A canvas at most `side` pixels on its longest edge.
  draw(side: number): Promise<HTMLCanvasElement>
}

export interface OpenedComic {
  pages: ImportPage[]
  // Files that were skipped, with why. The rest still open.
  failures: { file: string; code: ImportError["code"] }[]
  close(): void
}

const canvasFor = (width: number, height: number, side: number) => {
  const scale = Math.min(1, side / Math.max(width, height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new ImportError("corrupt")
  // Transparent scans become white paper, not black, as JPEG.
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

async function drawTiff(bytes: Uint8Array, side: number) {
  const { default: UTIF } = await import("utif2")
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
  const ifd = UTIF.decode(buffer)[0]
  if (!ifd) throw new ImportError("corrupt")
  // `t256` and `t257` are the width and height tags, there before decoding.
  const tag = (t: unknown) => Number((t as number[] | undefined)?.[0])
  assertPixels(tag(ifd.t256), tag(ifd.t257))
  UTIF.decodeImage(buffer, ifd)
  const rgba = new Uint8ClampedArray(UTIF.toRGBA8(ifd))
  const full = new OffscreenCanvas(ifd.width, ifd.height)
  full
    .getContext("2d")!
    .putImageData(new ImageData(rgba, ifd.width, ifd.height), 0, 0)
  const { canvas, ctx } = canvasFor(ifd.width, ifd.height, side)
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height)
  return canvas
}

// Decodes checked bytes onto a canvas, which is also what strips metadata and
// anything hiding after the image data before a page leaves the device.
async function drawBytes(bytes: Uint8Array, side: number) {
  const kind = assertPage(bytes)
  if (kind === "tiff") return drawTiff(bytes, side)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(
      new Blob([bytes.slice()], { type: `image/${kind}` })
    )
  } catch {
    throw new ImportError("corrupt")
  }
  const { canvas, ctx } = canvasFor(bitmap.width, bitmap.height, side)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

type WorkerCall = WorkerRequest extends infer R
  ? R extends WorkerRequest
    ? Omit<R, "id">
    : never
  : never

class ArchiveWorker {
  private worker: Worker | null = null
  private calls = new Map<
    number,
    { resolve(r: WorkerResponse): void; reject(e: Error): void }
  >()
  private nextId = 1

  private get port() {
    if (!this.worker) {
      this.worker = new Worker(new URL("./import.worker.ts", import.meta.url), {
        type: "module",
      })
      this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        const call = this.calls.get(data.id)
        this.calls.delete(data.id)
        if (!call) return
        if (data.ok) call.resolve(data)
        else call.reject(new ImportError(data.code))
      }
      this.worker.onerror = () => this.failAll()
    }
    return this.worker
  }

  private failAll() {
    for (const call of this.calls.values())
      call.reject(new ImportError("corrupt"))
    this.calls.clear()
  }

  call(request: WorkerCall) {
    const id = this.nextId++
    return new Promise<WorkerResponse & { ok: true }>((resolve, reject) => {
      this.calls.set(id, {
        resolve: (r) => resolve(r as WorkerResponse & { ok: true }),
        reject,
      })
      this.port.postMessage({ ...request, id })
    })
  }

  stop() {
    this.worker?.terminate()
    this.worker = null
    this.failAll()
  }
}

async function openArchive(
  worker: ArchiveWorker,
  file: File,
  kind: BookKind
): Promise<ImportPage[]> {
  const { book, pages } = await worker.call({ type: "open", file, kind })
  return pages!.map((page) => ({
    id: `${file.name}/${page.name}`,
    label: page.name.split("/").pop()!,
    async draw(side) {
      const { bytes } = await worker.call({
        type: "read",
        book: book!,
        name: page.name,
      })
      return drawBytes(bytes!, side)
    },
  }))
}

async function openPdf(file: File, closers: (() => void)[]) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    enableXfa: false,
  })
  closers.push(() => void task.destroy())
  const doc = await task.promise.catch((e: { name?: string }) => {
    throw new ImportError(
      e?.name === "PasswordException" ? "encrypted" : "corrupt"
    )
  })
  if (doc.numPages > MAX_PAGES) throw new ImportError("too_many_pages")
  return Array.from({ length: doc.numPages }, (_, i): ImportPage => {
    const number = i + 1
    return {
      id: `${file.name}#${number}`,
      label: String(number),
      async draw(side) {
        const page = await doc.getPage(number)
        const base = page.getViewport({ scale: 1 })
        assertPixels(base.width, base.height)
        const viewport = page.getViewport({
          scale: side / Math.max(base.width, base.height),
        })
        const { canvas } = canvasFor(viewport.width, viewport.height, side)
        await page.render({ canvas, viewport }).promise
        page.cleanup()
        return canvas
      },
    }
  })
}

// Opens everything dropped at once: loose pages sort among themselves, books
// keep their own order after them.
export async function openComic(files: File[]): Promise<OpenedComic> {
  if (files.length > MAX_FILES) throw new ImportError("too_many_files")
  const worker = new ArchiveWorker()
  const closers = [() => worker.stop()]
  const close = () => closers.forEach((c) => c())
  const loose: ImportPage[] = []
  const books: ImportPage[] = []
  const failures: OpenedComic["failures"] = []

  const sorted = [...files].sort((a, b) => naturalCompare(a.name, b.name))
  for (const file of sorted) {
    try {
      if (file.size > MAX_FILE_BYTES) throw new ImportError("file_too_large")
      const head = new Uint8Array(await file.slice(0, 2048).arrayBuffer())
      const kind = sniffKind(head)
      if (!kind) throw new ImportError("unsupported")
      if (isImageKind(kind))
        loose.push({
          id: file.name,
          label: file.name,
          draw: async (side) =>
            drawBytes(new Uint8Array(await file.arrayBuffer()), side),
        })
      else if (kind === "pdf") books.push(...(await openPdf(file, closers)))
      else books.push(...(await openArchive(worker, file, kind)))
    } catch (e) {
      failures.push({
        file: file.name,
        code: e instanceof ImportError ? e.code : "corrupt",
      })
    }
  }
  const pages = [...loose, ...books]
  if (pages.length > MAX_PAGES) {
    close()
    throw new ImportError("too_many_pages")
  }
  return { pages, failures, close }
}

export const FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/tiff,image/bmp,image/avif,application/pdf,application/zip,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,.bmp,.avif,.pdf,.zip,.cbz,.cbr,.rar,.cb7,.7z,.cbt,.tar"

// What's stored: a re-encoded JPEG small enough to be useless as a copy of
// the book, and the size vision and image models read anyway.
export async function pageJpeg(page: ImportPage) {
  const canvas = await page.draw(STYLE_PAGE_SIDE)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  )
  if (!blob) throw new ImportError("corrupt")
  return blob
}
