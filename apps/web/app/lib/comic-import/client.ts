import { owned } from "./archives"
import { naturalCompare } from "./entries"
import { ImportError } from "./errors"
import type { WorkerRequest, WorkerResponse } from "./import.worker"
import {
  DECODE_TIMEOUT_MS,
  MAX_DROP_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_PAGES,
  MOBILE_MAX_DROP_BYTES,
  MOBILE_MAX_FILE_BYTES,
  OPEN_TIMEOUT_MS,
  READ_TIMEOUT_MS,
  STYLE_PAGE_SIDE,
} from "./limits"
import {
  assertPage,
  assertPixels,
  isImageKind,
  sniffKind,
  type BookKind,
} from "./sniff"
import type { TiffRequest, TiffResponse } from "./tiff.worker"

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

// Settles with `work`, or fails as timed out. `onTimeout` is the chance to end
// whatever is stuck, since the promise itself can't be cancelled.
export function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  onTimeout?: () => void
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.()
      reject(new ImportError("timed_out"))
    }, ms)
    work.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

type Spawn = () => Worker

const spawnTiffWorker: Spawn = () =>
  new Worker(new URL("./tiff.worker.ts", import.meta.url), { type: "module" })

// A worker per page, ended either way: a hostile file can hang the decoder, and
// this is what keeps that off the page and out of the thumbnail queue.
export async function decodeTiffPage(
  bytes: Uint8Array,
  side: number,
  spawn: Spawn = spawnTiffWorker,
  deadline = DECODE_TIMEOUT_MS
) {
  const worker = spawn()
  const data = owned(bytes)
  try {
    return await withDeadline(
      new Promise<ImageBitmap>((resolve, reject) => {
        worker.onmessage = ({ data: reply }: MessageEvent<TiffResponse>) =>
          reply.ok ? resolve(reply.bitmap) : reject(new ImportError(reply.code))
        worker.onerror = () => reject(new ImportError("corrupt"))
        worker.onmessageerror = () => reject(new ImportError("corrupt"))
        worker.postMessage({ bytes: data, side } satisfies TiffRequest, [
          data.buffer,
        ])
      }),
      deadline
    )
  } finally {
    worker.terminate()
  }
}

// Decodes, checks what actually came out, and shrinks it. A header can lie, so
// the size that counts is the decoder's: anything past the limit is released
// on the spot, and only a page-sized bitmap outlives this call.
export async function decodeChecked(
  blob: Blob,
  side: number,
  decode: typeof createImageBitmap = createImageBitmap
) {
  const full = await decode(blob).catch(() => {
    throw new ImportError("corrupt")
  })
  try {
    assertPixels(full.width, full.height)
  } catch (e) {
    full.close()
    throw e
  }
  const scale = side / Math.max(full.width, full.height)
  if (scale >= 1) return full
  try {
    const small = await decode(full, {
      resizeWidth: Math.max(1, Math.round(full.width * scale)),
      resizeHeight: Math.max(1, Math.round(full.height * scale)),
      resizeQuality: "high",
    })
    full.close()
    return small
  } catch {
    // Too old for resize options: the canvas still scales it.
    return full
  }
}

// Decodes checked bytes onto a canvas, which is also what strips metadata and
// anything hiding after the image data before a page leaves the device.
async function drawBytes(bytes: Uint8Array, side: number) {
  const kind = assertPage(bytes)
  const bitmap =
    kind === "tiff"
      ? await decodeTiffPage(bytes, side)
      : await withDeadline(
          decodeChecked(
            new Blob([bytes.slice()], { type: `image/${kind}` }),
            side
          ),
          DECODE_TIMEOUT_MS
        )
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

const spawnArchiveWorker: Spawn = () =>
  new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" })

class ArchiveWorker {
  private worker: Worker | null = null
  private closed = false
  private calls = new Map<
    number,
    { resolve(r: WorkerResponse): void; reject(e: Error): void }
  >()
  private nextId = 1

  constructor(private spawn: Spawn) {}

  private get port() {
    if (!this.worker) {
      const worker = this.spawn()
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        const call = this.calls.get(data.id)
        this.calls.delete(data.id)
        if (!call) return
        if (data.ok) call.resolve(data)
        else call.reject(new ImportError(data.code))
      }
      worker.onerror = () => this.stop("corrupt")
      worker.onmessageerror = () => this.stop("corrupt")
      this.worker = worker
    }
    return this.worker
  }

  call(request: WorkerCall, deadline: number) {
    if (this.closed) return Promise.reject(new ImportError("corrupt"))
    const id = this.nextId++
    const reply = new Promise<WorkerResponse & { ok: true }>(
      (resolve, reject) => {
        this.calls.set(id, {
          resolve: (r) => resolve(r as WorkerResponse & { ok: true }),
          reject,
        })
        this.port.postMessage({ ...request, id })
      }
    )
    // A stuck worker can't answer anything else either, so it goes.
    return withDeadline(reply, deadline, () => this.stop("timed_out"))
  }

  // Ends the thread and every call waiting on it. The next call starts a new
  // one, where books opened earlier no longer exist and read as corrupt.
  stop(code: ImportError["code"]) {
    this.worker?.terminate()
    this.worker = null
    const waiting = [...this.calls.values()]
    this.calls.clear()
    for (const call of waiting) call.reject(new ImportError(code))
  }

  close() {
    this.closed = true
    this.stop("corrupt")
  }
}

async function openArchive(
  worker: ArchiveWorker,
  file: File,
  kind: BookKind
): Promise<ImportPage[]> {
  const { book, pages } = await worker.call(
    { type: "open", file, kind },
    OPEN_TIMEOUT_MS
  )
  return pages!.map((page) => ({
    id: `${file.name}/${page.name}`,
    label: page.name.split("/").pop()!,
    async draw(side) {
      const { bytes } = await worker.call(
        { type: "read", book: book!, name: page.name },
        READ_TIMEOUT_MS
      )
      return drawBytes(bytes!, side)
    },
  }))
}

// Copied out of `pdfjs-dist` at build time by `scripts/pdfjs-assets.ts`. They
// are what lets scanned books (JPEG 2000, JBIG2), unembedded fonts and CJK
// lettering render, and pdf.js fetches them from its worker, so absolute URLs.
export const PDF_ASSETS_PATH = "/pdfjs"

export function pdfAssetOptions(origin: string) {
  const url = (folder: string) => `${origin}${PDF_ASSETS_PATH}/${folder}/`
  return {
    wasmUrl: url("wasm"),
    iccUrl: url("iccs"),
    standardFontDataUrl: url("standard_fonts"),
    cMapUrl: url("cmaps"),
    cMapPacked: true,
  }
}

async function openPdf(file: File, onClose: (run: () => void) => void) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    enableXfa: false,
    ...pdfAssetOptions(location.origin),
  })
  onClose(() => void task.destroy())
  const doc = await withDeadline(task.promise, OPEN_TIMEOUT_MS, () => {
    void task.destroy()
  }).catch((e: { name?: string }) => {
    if (e instanceof ImportError) throw e
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
        const render = page.render({ canvas, viewport })
        await withDeadline(render.promise, DECODE_TIMEOUT_MS, () =>
          render.cancel()
        )
        page.cleanup()
        return canvas
      },
    }
  })
}

export interface ByteLimits {
  file: number
  drop: number
}

type DeviceHints = Pick<Navigator, "userAgent" | "maxTouchPoints"> & {
  userAgentData?: { mobile?: boolean }
}

// iPadOS calls itself a Mac, and only its touch screen gives it away.
export function isMobileDevice(device: DeviceHints = navigator) {
  if (typeof device.userAgentData?.mobile === "boolean")
    return device.userAgentData.mobile
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent) ||
    (/Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1)
  )
}

export const byteLimits = (mobile: boolean): ByteLimits =>
  mobile
    ? { file: MOBILE_MAX_FILE_BYTES, drop: MOBILE_MAX_DROP_BYTES }
    : { file: MAX_FILE_BYTES, drop: MAX_DROP_BYTES }

// What's decided from the sizes alone, before a byte of any file is read.
export function assertDrop(files: Pick<File, "size">[], limits: ByteLimits) {
  if (files.length > MAX_FILES) throw new ImportError("too_many_files")
  const total = files.reduce((sum, f) => sum + f.size, 0)
  if (total > limits.drop && files.length > 1)
    throw new ImportError("drop_too_large")
  if (total > limits.drop) throw new ImportError("file_too_large")
}

export interface OpenOptions {
  // Stops the open: whatever is running ends now, and the call rejects.
  signal?: AbortSignal
  limits?: ByteLimits
  spawn?: Spawn
}

// Opens everything dropped at once: loose pages sort among themselves, books
// keep their own order after them.
export async function openComic(
  files: File[],
  options: OpenOptions = {}
): Promise<OpenedComic> {
  const {
    signal,
    limits = byteLimits(isMobileDevice()),
    spawn = spawnArchiveWorker,
  } = options
  assertDrop(files, limits)
  signal?.throwIfAborted()

  const worker = new ArchiveWorker(spawn)
  const closers: (() => void)[] = []
  let closed = false
  // Work that finishes after a close still gets cleaned up.
  const onClose = (run: () => void) => (closed ? run() : closers.push(run))
  const close = () => {
    closed = true
    closers.splice(0).forEach((run) => run())
    worker.close()
  }
  // Rejects the moment the signal fires, whatever a file is in the middle of.
  const aborted = new Promise<never>((_, reject) =>
    signal?.addEventListener(
      "abort",
      () => {
        close()
        reject(signal.reason)
      },
      { once: true }
    )
  )
  aborted.catch(() => {})

  const loose: ImportPage[] = []
  const books: ImportPage[] = []
  const failures: OpenedComic["failures"] = []

  const openFile = async (file: File) => {
    if (file.size > limits.file) throw new ImportError("file_too_large")
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
    else if (kind === "pdf") books.push(...(await openPdf(file, onClose)))
    else books.push(...(await openArchive(worker, file, kind)))
  }

  const sorted = [...files].sort((a, b) => naturalCompare(a.name, b.name))
  for (const file of sorted) {
    signal?.throwIfAborted()
    try {
      await Promise.race([openFile(file), aborted])
    } catch (e) {
      signal?.throwIfAborted()
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

// One open at a time, for a dialog that can be closed or dropped on again at
// any moment. A second open while one runs is ignored, and a result that
// arrives after a cancel is closed rather than kept.
export function comicOpener(open: typeof openComic = openComic) {
  let active: AbortController | null = null
  let current: OpenedComic | null = null
  const cancel = () => {
    active?.abort()
    active = null
  }
  return {
    get busy() {
      return active !== null
    },
    cancel,
    close() {
      cancel()
      current?.close()
      current = null
    },
    // Null when ignored or cancelled.
    async open(files: File[]) {
      if (active) return null
      const controller = new AbortController()
      active = controller
      current?.close()
      current = null
      try {
        const opened = await open(files, { signal: controller.signal })
        if (controller.signal.aborted) {
          opened.close()
          return null
        }
        current = opened
        return opened
      } catch (e) {
        if (controller.signal.aborted) return null
        throw e
      } finally {
        if (active === controller) active = null
      }
    },
  }
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
