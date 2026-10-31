import { BookParseError } from "../errors"
import { MAX_PDF_PAGES, MIN_PAGE_CHARS, SCAN_SIDE } from "../limits"
import { encodeGrayPng, shrinkGray } from "../png"
import {
  bodySize,
  layoutPage,
  repeatedLines,
  type LaidOutPage,
  type OutlineEntry,
  type PdfItem,
  type PdfPage,
} from "./layout"

// pdf.js on the server, with its legacy build and no canvas. A scan's page
// image comes from the PDF's own embedded picture, decoded by pdf.js, so OCR
// works from the API too, with no browser in the loop.
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs")

let loaded: Promise<PdfJs> | null = null

function pdfjs() {
  loaded ??= (async () => {
    // Named here so the bundler traces it: pdf.js would otherwise import its
    // worker by a path it computes at run time.
    // @ts-expect-error pdf.js ships no types for its worker.
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs")
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
    return import("pdfjs-dist/legacy/build/pdf.mjs")
  })()
  return loaded
}

async function open(bytes: Uint8Array) {
  const lib = await pdfjs()
  const task = lib.getDocument({
    // pdf.js detaches what it's given, and the caller may read the file again.
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    enableXfa: false,
    verbosity: 0,
    stopAtErrors: false,
  })
  try {
    return { lib, task, doc: await task.promise }
  } catch (e) {
    await task.destroy().catch(() => {})
    throw (e as { name?: string }).name === "PasswordException"
      ? new BookParseError("encrypted")
      : new BookParseError("corrupt", "Not a readable PDF.")
  }
}

type Doc = Awaited<ReturnType<typeof open>>["doc"]

async function outlineOf(doc: Doc): Promise<OutlineEntry[]> {
  const items = await doc.getOutline().catch(() => null)
  if (!items) return []
  const out: OutlineEntry[] = []
  for (const item of items.slice(0, 500)) {
    try {
      const dest =
        typeof item.dest === "string"
          ? await doc.getDestination(item.dest)
          : item.dest
      const ref = dest?.[0]
      if (!ref || typeof ref !== "object") continue
      const index = await doc.getPageIndex(ref as never)
      if (item.title?.trim())
        out.push({ title: item.title.trim(), page: index + 1 })
    } catch {
      // A broken outline entry doesn't cost the book its chapters.
    }
  }
  return out
}

export interface ReadPdf {
  meta: { title: string; author: string; language: string | null }
  pages: LaidOutPage[]
  outline: OutlineEntry[]
  scans: number[]
  warnings: string[]
  pageCount: number
}

export async function readPdf(bytes: Uint8Array): Promise<ReadPdf> {
  const { lib, task, doc } = await open(bytes)
  try {
    if (doc.numPages > MAX_PDF_PAGES) throw new BookParseError("too_many_pages")
    const pages: PdfPage[] = []
    const scans: number[] = []
    const warnings: string[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      try {
        const page = await doc.getPage(number)
        const view = page.getViewport({ scale: 1 })
        const content = await page.getTextContent()
        const items: PdfItem[] = []
        let chars = 0
        for (const item of content.items) {
          if (!("str" in item)) continue
          chars += item.str.trim().length
          const [a, b, , d, e, f] = item.transform as number[]
          const size = Math.hypot(a!, b!) || Math.abs(d!) || item.height
          items.push({
            str: item.str,
            x: e!,
            y: f!,
            width: item.width,
            size,
            bold: /bold|black|heavy/i.test(
              content.styles[item.fontName]?.fontFamily ?? ""
            ),
          })
        }
        if (chars < MIN_PAGE_CHARS) {
          const ops = await page.getOperatorList()
          const picture = ops.fnArray.some(
            (fn) =>
              fn === lib.OPS.paintImageXObject ||
              fn === lib.OPS.paintInlineImageXObject ||
              fn === lib.OPS.paintImageMaskXObject
          )
          if (picture) {
            scans.push(number)
            items.length = 0
          }
        }
        pages.push({ number, width: view.width, height: view.height, items })
        page.cleanup()
      } catch (e) {
        if (e instanceof BookParseError) throw e
        warnings.push(`Page ${number} could not be read.`)
      }
    }
    const repeated = repeatedLines(pages)
    const body = bodySize(pages)
    const info = (await doc.getMetadata().catch(() => null))?.info as
      { Title?: string; Author?: string; Language?: string } | undefined
    return {
      meta: {
        title: info?.Title?.trim() ?? "",
        author: info?.Author?.trim() ?? "",
        language: info?.Language?.trim() || null,
      },
      pages: pages
        .filter((p) => p.items.length)
        .map((p) => layoutPage(p, body, repeated)),
      outline: await outlineOf(doc),
      scans,
      warnings,
      pageCount: doc.numPages,
    }
  } finally {
    await task.destroy().catch(() => {})
  }
}

interface Decoded {
  width: number
  height: number
  kind?: number
  data?: Uint8ClampedArray | Uint8Array
}

function toGray(image: Decoded) {
  const { width, height, data, kind } = image
  if (!data || width * height > 100_000_000) return null
  const out = new Uint8Array(width * height)
  if (kind === 2 || kind === 3) {
    const step = kind === 2 ? 3 : 4
    for (let i = 0; i < out.length; i++)
      out[i] =
        (data[i * step]! * 77 +
          data[i * step + 1]! * 150 +
          data[i * step + 2]! * 29) >>
        8
    return out
  }
  // One bit per pixel, padded to whole bytes on each row.
  const row = (width + 7) >> 3
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      out[y * width + x] =
        data[y * row + (x >> 3)]! & (0x80 >> (x & 7)) ? 255 : 0
  return out
}

const decoded = (page: Awaited<ReturnType<Doc["getPage"]>>, name: string) =>
  new Promise<Decoded | null>((resolve) => {
    const objs = name.startsWith("g_") ? page.commonObjs : page.objs
    const timer = setTimeout(() => resolve(null), 20_000)
    objs.get(name, (image: unknown) => {
      clearTimeout(timer)
      resolve(image as Decoded)
    })
  })

export interface ScanImage {
  number: number
  png: Uint8Array
  width: number
  height: number
}

// The largest picture on each page, as grey PNG. Returns null for a page whose
// scan is cut into strips or drawn as vector shapes: there's no one image to
// take, and such a page is reported rather than guessed at.
export async function extractScans(bytes: Uint8Array, numbers: number[]) {
  const { lib, task, doc } = await open(bytes)
  const out: (ScanImage | { number: number; png: null })[] = []
  try {
    for (const number of numbers) {
      const page = await doc.getPage(number)
      const ops = await page.getOperatorList()
      let best: Decoded | null = null
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]
        if (
          fn === lib.OPS.paintImageXObject ||
          fn === lib.OPS.paintImageMaskXObject
        ) {
          const name = (ops.argsArray[i] as unknown[])?.[0]
          if (typeof name !== "string") continue
          const image = await decoded(page, name)
          if (
            image?.data &&
            (!best || image.width * image.height > best.width * best.height)
          )
            best = image
        } else if (fn === lib.OPS.paintInlineImageXObject) {
          const image = (ops.argsArray[i] as Decoded[])?.[0]
          if (
            image?.data &&
            (!best || image.width * image.height > best.width * best.height)
          )
            best = image
        }
      }
      const view = page.getViewport({ scale: 1 })
      const usable =
        best &&
        best.width >= view.width * 0.6 &&
        best.height >= view.height * 0.6
      const gray = usable ? toGray(best!) : null
      if (!gray) out.push({ number, png: null })
      else {
        const small = shrinkGray(gray, best!.width, best!.height, SCAN_SIDE)
        out.push({
          number,
          png: encodeGrayPng(small.gray, small.width, small.height),
          width: small.width,
          height: small.height,
        })
      }
      page.cleanup()
    }
    return out
  } finally {
    await task.destroy().catch(() => {})
  }
}
