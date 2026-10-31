import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, mock, test } from "bun:test"
import { strToU8, zipSync } from "fflate"

import {
  errorKey,
  messages,
  styleErrorText,
} from "@/components/comic-canvas/style-import.messages"
import { LOCALES } from "@/i18n/core"
import { COMIC_STYLES_BUCKET } from "@/lib/database"
import {
  deleteStyle,
  listStyles,
  prepareStyle,
  readPages,
  StyleError,
} from "@/lib/styles.server"

import { copyPdfjsAssets } from "../../../scripts/pdfjs-assets"

import {
  bytesSource,
  openRar,
  openSevenZip,
  openTar,
  openZip,
  paxRecords,
  sevenZipWantsPassword,
  tarEntries,
  zipEntries,
  type ByteSource,
} from "./archives"
import {
  assertDrop,
  byteLimits,
  comicOpener,
  decodeChecked,
  decodeTiffPage,
  isMobileDevice,
  openComic,
  pdfAssetOptions,
  withDeadline,
  type OpenedComic,
} from "./client"
import { IMPORT_ERROR_CODES, ImportError } from "./errors"
import {
  MAX_DROP_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TIFF_IFDS,
  MOBILE_MAX_DROP_BYTES,
  MOBILE_MAX_FILE_BYTES,
  STYLE_PAGE_SIDE,
} from "./limits"
import { assertPage, imageSize } from "./sniff"
import { STYLE_ERROR_CODES, StyleRequestError } from "./style"
import { decodeTiff } from "./tiff"
import { alreadyStored, sendPages, uploadFinished } from "./upload"

const require = createRequire(import.meta.url)

const code = async (run: () => unknown) => {
  try {
    await run()
  } catch (e) {
    if (e instanceof ImportError) return e.code
    throw e
  }
  return "no error"
}

const png = () =>
  Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64"
    )
  )

// A little-endian grayscale TIFF of one uncompressed strip.
function tiff(width = 2, height = 2) {
  const tags: [number, number, number][] = [
    [256, 3, width],
    [257, 3, height],
    [258, 3, 8],
    [259, 3, 1],
    [262, 3, 1],
    [273, 4, 0], // filled in below
    [277, 3, 1],
    [278, 3, height],
    [279, 4, width * height],
  ]
  const ifd = 8
  const pixels = ifd + 2 + tags.length * 12 + 4
  const b = new Uint8Array(pixels + width * height).fill(128, pixels)
  const v = new DataView(b.buffer)
  b.set([0x49, 0x49, 0x2a, 0])
  v.setUint32(4, ifd, true)
  v.setUint16(ifd, tags.length, true)
  tags.forEach(([tag, type, value], i) => {
    const at = ifd + 2 + i * 12
    v.setUint16(at, tag, true)
    v.setUint16(at + 2, type, true)
    v.setUint32(at + 4, 1, true)
    v.setUint32(at + 8, tag === 273 ? pixels : value, true)
  })
  return { bytes: b, v, next: ifd + 2 + tags.length * 12 }
}

// SOI, an empty APP0, one junk byte, then a frame header of `side` by `side`.
function jpegWithJunk(side: number) {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    2,
    0x00,
    0xff,
    0xc0,
    0,
    11,
    8,
    side >> 8,
    side & 0xff,
    side >> 8,
    side & 0xff,
    1,
    1,
    0x11,
    0,
    0xff,
    0xd9,
  ])
}

function box(type: string, ...body: Uint8Array[]) {
  const size = 8 + body.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(size)
  new DataView(out.buffer).setUint32(0, size)
  out.set(strToU8(type), 4)
  let at = 8
  for (const b of body) {
    out.set(b, at)
    at += b.length
  }
  return out
}

function avif(...sizes: [number, number][]) {
  const u32 = (...values: number[]) => {
    const b = new Uint8Array(values.length * 4)
    values.forEach((n, i) => new DataView(b.buffer).setUint32(i * 4, n))
    return b
  }
  const ipco = box("ipco", ...sizes.map(([w, h]) => box("ispe", u32(0, w, h))))
  return Uint8Array.from(
    Buffer.concat([
      box("ftyp", strToU8("avif"), u32(0), strToU8("avifmif1")),
      box("meta", u32(0), box("hdlr", u32(0, 0)), box("iprp", ipco)),
    ])
  )
}

class FakeWorker {
  static made: FakeWorker[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false
  sent: unknown[] = []
  constructor(private reply?: (message: never) => unknown) {
    FakeWorker.made.push(this)
  }
  postMessage(message: never) {
    this.sent.push(message)
    const data = this.reply?.(message)
    if (data) queueMicrotask(() => this.onmessage?.({ data }))
  }
  terminate() {
    this.terminated = true
  }
}

const spawner = (reply?: (message: never) => unknown) => {
  const made: FakeWorker[] = []
  return {
    made,
    spawn: () => {
      const worker = new FakeWorker(reply)
      made.push(worker)
      return worker as unknown as Worker
    },
  }
}

// fflate always writes UTF-8, so the name is patched in place: 0xe9 followed by
// an ASCII letter can't be UTF-8, and the name keeps its length.
function latin1Zip() {
  const zip = zipSync({ "caf\u00e9.png": png() })
  let at = zip.length - 22
  while (!(zip[at] === 0xc3 && zip[at + 1] === 0xa9)) at--
  zip.set([0xe9, 0x41], at)
  return zip
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

const zipFile = (name = "book.cbz") =>
  new File([zipSync({ "p1.png": png() })], name)

describe("a hostile TIFF", () => {
  test("a directory pointing at itself is refused before the decoder", async () => {
    const { bytes, v, next } = tiff()
    v.setUint32(next, 8, true)
    expect(await code(() => assertPage(bytes))).toBe("corrupt")
    expect(await code(() => decodeTiff(bytes))).toBe("corrupt")
  })

  test("a loop further down the chain is refused too", async () => {
    const { bytes, v, next } = tiff()
    // A second directory after the first, which points back at it.
    const second = bytes.length
    v.setUint32(next, second, true)
    const longer = Uint8Array.from([...bytes, 0, 0, 8, 0, 0, 0])
    expect(await code(() => assertPage(longer))).toBe("corrupt")
  })

  test("a chain past the cap is refused", async () => {
    const { bytes, v, next } = tiff()
    const start = bytes.length
    v.setUint32(next, start, true)
    const chain = new Uint8Array(start + (MAX_TIFF_IFDS + 2) * 6)
    chain.set(bytes)
    const c = new DataView(chain.buffer)
    for (let i = 0; i <= MAX_TIFF_IFDS; i++)
      c.setUint32(start + i * 6 + 2, start + (i + 1) * 6, true)
    expect(await code(() => assertPage(chain))).toBe("corrupt")
  })

  test("a field that claims more values than the file holds is refused", async () => {
    const { bytes, v } = tiff()
    // Billions of shorts, the loop inside the decoder that nothing bounds.
    v.setUint32(8 + 2 + 4, 0xffffffff, true)
    expect(await code(() => assertPage(bytes))).toBe("corrupt")
  })

  test("a small file that declares huge dimensions is refused", async () => {
    expect(await code(() => assertPage(tiff(60000, 60000).bytes))).toBe(
      "page_too_large"
    )
  })

  test("an honest TIFF still decodes", async () => {
    const { width, height, rgba } = await decodeTiff(tiff(2, 3).bytes)
    expect([width, height, rgba.length]).toEqual([2, 3, 24])
    expect(imageSize(tiff(2, 3).bytes)).toEqual({ width: 2, height: 3 })
  })

  test("a decoder that never answers is killed, and the page goes on", async () => {
    const { made, spawn } = spawner()
    expect(await code(() => decodeTiffPage(tiff().bytes, 100, spawn, 5))).toBe(
      "timed_out"
    )
    expect(made[0]!.terminated).toBe(true)
  })

  test("the worker gets the page and is ended after it answers", async () => {
    const bitmap = { width: 1 }
    const { made, spawn } = spawner(() => ({ ok: true, bitmap }))
    const out = await decodeTiffPage(tiff().bytes, 100, spawn, 1000)
    expect(out as unknown).toBe(bitmap)
    expect(made[0]!.terminated).toBe(true)
  })
})

describe("pixel checks fail closed", () => {
  test("junk before a huge frame header can't hide its size", async () => {
    expect(await code(() => assertPage(jpegWithJunk(65535)))).toBe(
      "page_too_large"
    )
    expect(imageSize(jpegWithJunk(100))).toEqual({ width: 100, height: 100 })
  })

  test("fill bytes before a marker are tolerated", () => {
    const b = jpegWithJunk(100)
    expect(
      imageSize(Uint8Array.from([...b.subarray(0, 6), 0xff, ...b.subarray(7)]))
    ).toEqual({ width: 100, height: 100 })
  })

  test("a JPEG with no frame header is refused", async () => {
    const noFrame = [0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(await code(() => assertPage(Uint8Array.from(noFrame)))).toBe(
      "corrupt"
    )
  })

  test("formats whose size can't be read are refused, not waved through", async () => {
    expect(await code(() => assertPage(png().subarray(0, 12)))).toBe("corrupt")
    expect(await code(() => assertPage(avif()))).toBe("corrupt")
    expect(
      await code(() =>
        assertPage(Uint8Array.from([...strToU8("RIFF0000WEBPVP8Z"), 0, 0]))
      )
    ).toBe("corrupt")
  })

  test("AVIF is measured, by its largest image", async () => {
    expect(imageSize(avif([64, 64], [800, 1200]))).toEqual({
      width: 800,
      height: 1200,
    })
    expect(await code(() => assertPage(avif([20000, 20000])))).toBe(
      "page_too_large"
    )
  })

  const bitmap = (width: number, height: number) => ({
    width,
    height,
    close: mock(() => {}),
  })
  const decoder = (...results: ReturnType<typeof bitmap>[]) =>
    mock(async () => results.shift()!) as unknown as typeof createImageBitmap

  test("what the decoder really produced is checked, and released", async () => {
    // Its header would have said otherwise.
    const huge = bitmap(20000, 20000)
    expect(
      await code(() => decodeChecked(new Blob(), 100, decoder(huge)))
    ).toBe("page_too_large")
    expect(huge.close).toHaveBeenCalled()
  })

  test("only a page-sized bitmap is kept", async () => {
    const full = bitmap(4000, 2000)
    const small = bitmap(100, 50)
    const decode = decoder(full, small)
    expect((await decodeChecked(new Blob(), 100, decode)) as unknown).toBe(
      small
    )
    expect(full.close).toHaveBeenCalled()
    expect(
      (decode as unknown as ReturnType<typeof mock>).mock.calls[1]![1]
    ).toEqual({
      resizeWidth: 100,
      resizeHeight: 50,
      resizeQuality: "high",
    })
  })

  test("a broken image reads as corrupt", async () => {
    const decode = (async () => {
      throw new Error("bad")
    }) as unknown as typeof createImageBitmap
    expect(await code(() => decodeChecked(new Blob(), 100, decode))).toBe(
      "corrupt"
    )
  })
})

describe("pdf.js assets", () => {
  test("every folder is a URL pdf.js accepts", () => {
    const options = pdfAssetOptions("https://palmframe.test")
    expect(options.wasmUrl).toBe("https://palmframe.test/pdfjs/wasm/")
    expect(options.cMapUrl).toBe("https://palmframe.test/pdfjs/cmaps/")
    expect(options.standardFontDataUrl).toBe(
      "https://palmframe.test/pdfjs/standard_fonts/"
    )
    expect(options.iccUrl).toBe("https://palmframe.test/pdfjs/iccs/")
    expect(options.cMapPacked).toBe(true)
  })

  test("the build ships the decoders, fonts and CJK cmaps", () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfjs-"))
    try {
      const to = copyPdfjsAssets(dir)
      for (const file of [
        "wasm/openjpeg.wasm",
        "wasm/jbig2.wasm",
        "wasm/openjpeg_nowasm_fallback.js",
        "wasm/jbig2_nowasm_fallback.js",
        "wasm/qcms_bg.wasm",
        "standard_fonts/LiberationSans-Regular.ttf",
        "cmaps/UniJIS-UTF16-H.bcmap",
      ])
        expect(existsSync(join(to, file))).toBe(true)
      expect(existsSync(join(to, "wasm/quickjs-eval.wasm"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("the byte budget", () => {
  const sized = (...sizes: number[]) => sizes.map((size) => ({ size }))

  test("counts everything dropped, before anything is read", async () => {
    const limits = byteLimits(false)
    const each = MAX_FILE_BYTES
    const drop = sized(...Array(5).fill(each))
    expect(await code(() => assertDrop(drop, limits))).toBe("drop_too_large")
    expect(await code(() => assertDrop(sized(MAX_DROP_BYTES), limits))).toBe(
      "no error"
    )
    expect(
      await code(() =>
        assertDrop(sized(...Array(MAX_FILES + 1).fill(1)), limits)
      )
    ).toBe("too_many_files")
  })

  test("a phone gets a lower cap", async () => {
    expect(byteLimits(true)).toEqual({
      file: MOBILE_MAX_FILE_BYTES,
      drop: MOBILE_MAX_DROP_BYTES,
    })
    expect(MOBILE_MAX_FILE_BYTES).toBeLessThan(MAX_FILE_BYTES)
    expect(MOBILE_MAX_DROP_BYTES).toBeLessThan(MAX_DROP_BYTES)
    const fine = sized(MOBILE_MAX_DROP_BYTES + 1)
    expect(await code(() => assertDrop(fine, byteLimits(false)))).toBe(
      "no error"
    )
    expect(await code(() => assertDrop(fine, byteLimits(true)))).toBe(
      "file_too_large"
    )
  })

  test("a file over the per-file cap is skipped, with why", async () => {
    const { spawn } = spawner()
    const opened = await openComic([zipFile()], {
      spawn,
      limits: { file: 1, drop: 1000 },
    })
    expect(opened.failures).toEqual([
      { file: "book.cbz", code: "file_too_large" },
    ])
    opened.close()
  })

  test("nothing starts once the drop is over budget", async () => {
    const { made, spawn } = spawner()
    expect(
      await code(() =>
        openComic([zipFile("a.cbz"), zipFile("b.cbz")], {
          spawn,
          limits: { file: 1000, drop: 10 },
        })
      )
    ).toBe("drop_too_large")
    expect(made).toEqual([])
  })

  test("recognises phones and tablets", () => {
    const desktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    const device = (userAgent: string, maxTouchPoints = 0) => ({
      userAgent,
      maxTouchPoints,
    })
    expect(isMobileDevice(device("Mozilla/5.0 (iPhone)"))).toBe(true)
    expect(isMobileDevice(device("Mozilla/5.0 (Linux; Android 15)"))).toBe(true)
    expect(isMobileDevice(device(desktop, 5))).toBe(true)
    expect(isMobileDevice(device(desktop))).toBe(false)
    expect(
      isMobileDevice({
        ...device("Mozilla/5.0 (Linux)"),
        userAgentData: { mobile: true },
      })
    ).toBe(true)
  })

  const counting = (data: Uint8Array) => {
    const source = bytesSource(data)
    let read = 0
    const counted: ByteSource = {
      size: source.size,
      bytes: async (start, end) => {
        const out = await source.bytes(start, end)
        read += out.length
        return out
      },
    }
    return { counted, read: () => read }
  }

  test("a ZIP stays on disk: opening reads its directory, not its pages", async () => {
    const pages: Record<string, Uint8Array> = {}
    const noise = crypto.getRandomValues(new Uint8Array(32 * 1024))
    for (let i = 0; i < 20; i++) {
      const page = new Uint8Array(png().length + noise.length)
      page.set(png())
      page.set(noise, png().length)
      pages[`p${i}.png`] = page
    }
    const zip = zipSync(pages, { level: 0 })
    const { counted, read } = counting(zip)
    const book = await openZip(counted)
    expect(book.pages.length).toBe(20)
    expect(read()).toBeLessThan(zip.length / 10 + 66_000)
    const before = read()
    expect((await book.read("p3.png")).length).toBe(pages["p3.png"]!.length)
    expect(read() - before).toBeLessThan(zip.length / 10)
  })

  test("a tar stays on disk too", async () => {
    const header = new Uint8Array(512)
    header.set(strToU8("p1.png"))
    header.set(strToU8("00000040000\0"), 124)
    header[156] = 0x30
    const tar = new Uint8Array(512 + 16384 + 1024)
    tar.set(header)
    tar.set(png(), 512)
    const { counted, read } = counting(tar)
    expect((await tarEntries(counted)).length).toBe(1)
    expect(read()).toBeLessThan(2048)
  })

  test("a ZIP name reads as UTF-8, flagged or not, else as Latin-1", async () => {
    const zip = zipSync({ "ページ.png": png(), "caf\u00e9.png": png() })
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    let central = zip.length - 22
    while (v.getUint32(central, true) !== 0x02014b50) central--
    v.setUint16(central + 8, 0, true)
    const book = await openZip(bytesSource(zip))
    expect(book.pages.map((p) => p.name).sort()).toEqual([
      "caf\u00e9.png",
      "ページ.png",
    ])
    expect(
      (await zipEntries(bytesSource(latin1Zip()))).map((e) => e.name)
    ).toEqual(["caf\u00e9A.png"])
  })

  test("an encrypted ZIP entry says so, instead of failing later", async () => {
    const zip = zipSync({ "p1.png": png() })
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    let central = zip.length - 22
    while (v.getUint32(central, true) !== 0x02014b50) central--
    v.setUint16(central + 8, v.getUint16(central + 8, true) | 1, true)
    expect(await code(() => openZip(bytesSource(zip)))).toBe("encrypted")
  })
})

describe("cancelling an open", () => {
  test("ends the worker and rejects at once", async () => {
    const { made, spawn } = spawner()
    const controller = new AbortController()
    const opening = openComic([zipFile()], {
      spawn,
      signal: controller.signal,
    })
    await sleep(5)
    expect(made.length).toBe(1)
    controller.abort()
    await expect(opening).rejects.toBeDefined()
    expect(made[0]!.terminated).toBe(true)
  })

  test("leaves later files unopened", async () => {
    const { made, spawn } = spawner()
    const controller = new AbortController()
    const opening = openComic([zipFile("a.cbz"), zipFile("b.cbz")], {
      spawn,
      signal: controller.signal,
    })
    await sleep(5)
    controller.abort()
    await expect(opening).rejects.toBeDefined()
    await sleep(5)
    expect(made.flatMap((w) => w.sent).length).toBe(1)
  })

  test("an already cancelled open never starts a worker", async () => {
    const { made, spawn } = spawner()
    await expect(
      openComic([zipFile()], { spawn, signal: AbortSignal.abort() })
    ).rejects.toBeDefined()
    expect(made).toEqual([])
  })

  test("a close stops pages from starting a new worker", async () => {
    const { made, spawn } = spawner((m: { id: number; type: string }) =>
      m.type === "open"
        ? { id: m.id, ok: true, book: 1, pages: [{ name: "p1.png", size: 1 }] }
        : null
    )
    const opened = await openComic([zipFile()], { spawn })
    opened.close()
    expect(made[0]!.terminated).toBe(true)
    expect(await code(() => opened.pages[0]!.draw(100))).toBe("corrupt")
    expect(made.length).toBe(1)
  })

  const comic = () => {
    const close = mock(() => {})
    return { pages: [], failures: [], close } as unknown as OpenedComic & {
      close: ReturnType<typeof mock>
    }
  }

  test("a second drop while one is opening is ignored", async () => {
    let finish!: (c: OpenedComic) => void
    const open = mock(
      () => new Promise<OpenedComic>((resolve) => (finish = resolve))
    )
    const opener = comicOpener(open as unknown as typeof openComic)
    const first = opener.open([])
    expect(opener.busy).toBe(true)
    expect(await opener.open([])).toBe(null)
    expect(open).toHaveBeenCalledTimes(1)
    const result = comic()
    finish(result)
    expect(await first).toBe(result)
    expect(opener.busy).toBe(false)
  })

  test("a result arriving after a cancel is closed, not kept", async () => {
    let finish!: (c: OpenedComic) => void
    const opener = comicOpener(
      (() => new Promise<OpenedComic>((resolve) => (finish = resolve))) as never
    )
    const opening = opener.open([])
    opener.close()
    const late = comic()
    finish(late)
    expect(await opening).toBe(null)
    expect(late.close).toHaveBeenCalled()
  })

  test("a new open closes the book before it", async () => {
    const results = [comic(), comic()]
    const opener = comicOpener((async () => results.shift()!) as never)
    const first = (await opener.open([]))!
    await opener.open([])
    expect(first.close).toHaveBeenCalled()
  })

  test("a worker that goes silent times out instead of waiting for ever", async () => {
    expect(await code(() => withDeadline(new Promise(() => {}), 5))).toBe(
      "timed_out"
    )
    const stuck = mock(() => {})
    await code(() => withDeadline(new Promise(() => {}), 5, stuck))
    expect(stuck).toHaveBeenCalled()
    expect(await withDeadline(Promise.resolve(1), 5)).toBe(1)
  })

  test("a worker that dies fails the open rather than hanging it", async () => {
    const { made, spawn } = spawner()
    const opening = openComic([zipFile()], { spawn })
    await sleep(5)
    made[0]!.onmessageerror?.()
    expect((await opening).failures).toEqual([
      { file: "book.cbz", code: "corrupt" },
    ])
  })
})

describe("telling a password from a word in a name", () => {
  async function sevenZip(names: string[]) {
    const { default: SevenZip } = await import("7z-wasm")
    const seven = await SevenZip({ print: () => {}, printErr: () => {} })
    seven.FS.mkdir("/in")
    seven.FS.chdir("/in")
    for (const name of names) {
      const stream = seven.FS.open(name, "w+")
      seven.FS.write(stream, png(), 0, png().length)
      seven.FS.close(stream)
    }
    seven.callMain(["a", "/out.7z", ...names])
    return seven.FS.readFile("/out.7z")
  }

  test("an open archive with the word in a page name opens", async () => {
    const data = await sevenZip(["The Password 01.png"])
    const book = await openSevenZip(bytesSource(data))
    expect(book.pages.map((p) => p.name)).toEqual(["The Password 01.png"])
    expect(assertPage(await book.read("The Password 01.png"))).toBe("png")
  })

  test("reads 7-Zip's own error lines only", () => {
    expect(
      sevenZipWantsPassword([
        "ERROR: Data Error in encrypted file. Wrong password? : p.png",
      ])
    ).toBe(true)
    expect(
      sevenZipWantsPassword(["ERROR: Data Error : Wrong password.png"])
    ).toBe(false)
    expect(sevenZipWantsPassword(["Path = The Password 01.png"])).toBe(false)
  })
})

describe("drafts", () => {
  const prepared = (pages: number) => ({
    id: "style",
    targets: Array.from({ length: pages }, (_, i) => ({
      path: `u/s/${i}.jpg`,
      token: `t${i}`,
    })),
    blobs: Array.from({ length: pages }, () => new Blob(["x"])),
    sent: 0,
  })

  test("a retry carries on from the page that failed, in the same row", async () => {
    const upload = prepared(3)
    const sent: string[] = []
    const put = async (target: { path: string }) => {
      sent.push(target.path)
      if (sent.length === 2) throw new Error("network")
    }
    await expect(sendPages(upload, put)).rejects.toThrow("network")
    expect(upload.sent).toBe(1)
    expect(uploadFinished(upload)).toBe(false)
    await sendPages(upload, put)
    expect(uploadFinished(upload)).toBe(true)
    expect(sent).toEqual(["u/s/0.jpg", "u/s/1.jpg", "u/s/1.jpg", "u/s/2.jpg"])
  })

  test("a page already stored doesn't fail a retry", () => {
    expect(alreadyStored({ statusCode: "409" })).toBe(true)
    expect(alreadyStored({ status: 409 })).toBe(true)
    expect(alreadyStored({ status: 500 })).toBe(false)
  })
})

describe("translated errors", () => {
  test("every code resolves to a message in every locale", () => {
    for (const locale of LOCALES) {
      for (const c of IMPORT_ERROR_CODES)
        expect(messages[locale].errors[c]).toBeTruthy()
      for (const c of STYLE_ERROR_CODES)
        expect(messages[locale].styleErrors[c]).toBeTruthy()
    }
  })

  test("an import failure while saving is worded, not shown as its code", () => {
    expect(errorKey(new ImportError("page_too_large"))).toBe(
      "errors.page_too_large"
    )
    expect(errorKey(new ImportError("corrupt"))).toBe("errors.corrupt")
  })

  test("running out of credits is worded", () => {
    expect(errorKey(new Error("insufficient_credits"))).toBe("dialog.noCredits")
  })

  test("a refused request is worded by its code", () => {
    expect(errorKey(new StyleRequestError("limit_reached"))).toBe(
      "styleErrors.limit_reached"
    )
  })

  test("a library's English never reaches a person", () => {
    expect(errorKey(new Error("Failed to fetch"))).toBe("dialog.failed")
    expect(errorKey("nonsense")).toBe("dialog.failed")
  })

  test("a render failure speaks the page's language", () => {
    expect(styleErrorText("style_unavailable", "fr")).toBe(
      messages.fr.styleErrors.style_unavailable
    )
    expect(styleErrorText("needs_openrouter", "xx")).toBe(
      messages.en.styleErrors.needs_openrouter
    )
  })
})

describe("PAX headers", () => {
  function paxRecord(key: string, value: string) {
    const body = strToU8(` ${key}=${value}\n`)
    let length = body.length
    while (String(length + body.length).length + body.length !== length)
      length = String(length).length + body.length
    return Uint8Array.from([...strToU8(String(length)), ...body])
  }

  const entry = (
    name: string,
    size: number,
    type: string,
    sizeField = size
  ) => {
    const h = new Uint8Array(512)
    h.set(strToU8(name))
    h.set(strToU8(`${sizeField.toString(8).padStart(11, "0")}\0`), 124)
    h[156] = type.charCodeAt(0)
    return h
  }

  const block = (data: Uint8Array) => {
    const out = new Uint8Array(Math.ceil(data.length / 512) * 512)
    out.set(data)
    return out
  }

  const archive = (...parts: Uint8Array[]) =>
    Uint8Array.from(Buffer.concat([...parts, new Uint8Array(1024)]))

  test("lengths count bytes, so non-ASCII paths stay whole", () => {
    const records = Uint8Array.from([
      ...paxRecord("path", "ページ01.png"),
      ...paxRecord("mtime", "1700000000.5"),
    ])
    expect(paxRecords(records).path).toBe("ページ01.png")
  })

  test("a Japanese CBT opens and its page reads", async () => {
    const pax = paxRecord("path", "巻一/ページ01.png")
    const data = archive(
      entry("PaxHeader/x", pax.length, "x"),
      block(pax),
      entry("ignored.png", png().length, "0"),
      block(png())
    )
    const book = await openTar(bytesSource(data))
    expect(book.pages.map((p) => p.name)).toEqual(["巻一/ページ01.png"])
    expect(assertPage(await book.read("巻一/ページ01.png"))).toBe("png")
  })

  test("size= overrides the header", async () => {
    const pax = paxRecord("size", String(png().length))
    const data = archive(
      entry("PaxHeader/x", pax.length, "x"),
      block(pax),
      entry("p1.png", 0, "0"),
      block(png()),
      entry("p2.png", png().length, "0"),
      block(png())
    )
    const files = await tarEntries(bytesSource(data))
    expect(files.map((f) => [f.name, f.size])).toEqual([
      ["p1.png", png().length],
      ["p2.png", png().length],
    ])
  })

  test("a nonsense size= is refused", async () => {
    const pax = paxRecord("size", "lots")
    const data = archive(entry("x", pax.length, "x"), block(pax))
    expect(await code(() => tarEntries(bytesSource(data)))).toBe("corrupt")
  })

  test("a global header doesn't swallow the next file's name", async () => {
    const pax = paxRecord("comment", "hello")
    const name = paxRecord("path", "ページ.png")
    const data = archive(
      entry("x", name.length, "x"),
      block(name),
      entry("g", pax.length, "g"),
      block(pax),
      entry("short.png", png().length, "0"),
      block(png())
    )
    const files = await tarEntries(bytesSource(data))
    expect(files[0]!.name).toBe("ページ.png")
  })
})

describe("the storage policy", () => {
  const migration = readFileSync(
    new URL(
      "../../../../../supabase/migrations/20261101120000_create_comic_styles.sql",
      import.meta.url
    ),
    "utf8"
  )

  test("people can only read the bucket and the table", () => {
    const policies = [...migration.matchAll(/for (\w+) to (\w+)/g)].map(
      (m) => m[1]
    )
    expect(policies).toEqual(["select", "select"])
    expect(migration).toMatch(
      /grant select on public\.comic_styles to authenticated/
    )
    expect(migration).not.toMatch(/grant (insert|update|delete)/)
    expect(migration).not.toContain("Owners upload")
    expect(migration).not.toContain("Owners delete")
  })

  // Answers a query the way supabase-js does, and records every write.
  function client(rows: { pages: string[]; status?: string }[], count = 0) {
    const calls: string[] = []
    const query: Record<string, unknown> = {}
    const chain = () => query
    Object.assign(query, {
      select: (_: string, o?: { head?: boolean }) => {
        query.then = (resolve: (r: unknown) => void) =>
          resolve(
            o?.head ? { count, error: null } : { data: rows, error: null }
          )
        return query
      },
      eq: chain,
      order: chain,
      insert: (row: unknown) => {
        calls.push(`insert ${JSON.stringify(row)}`)
        return query
      },
      delete: () => {
        calls.push("delete")
        query.then = (resolve: (r: unknown) => void) => resolve({ error: null })
        return query
      },
      single: async () => ({ data: { id: "style" }, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    })
    const bucket = {
      createSignedUploadUrl: async (path: string) => {
        calls.push(`sign ${path}`)
        return { data: { token: "t" }, error: null }
      },
      createSignedUrls: async (paths: string[]) => ({
        data: paths.map((path) => ({
          path,
          signedUrl: path.includes("missing") ? null : `https://x/${path}`,
        })),
      }),
      remove: async (paths: string[]) => {
        calls.push(`remove ${paths.join(",")}`)
        return { error: null }
      },
      download: async (path: string) => ({
        data: new Blob([files[path] ?? new Uint8Array()]),
        error: files[path] ? null : { message: "not found" },
      }),
    }
    return {
      calls,
      from: () => query,
      storage: {
        from: (b: string) => (b === COMIC_STYLES_BUCKET ? bucket : null),
      },
    } as never as { calls: string[] } & Parameters<typeof prepareStyle>[0]
  }
  const files: Record<string, Uint8Array<ArrayBuffer>> = {}

  const styleError = async (run: () => unknown) => {
    try {
      await run()
    } catch (e) {
      if (e instanceof StyleError) return e.code
      throw e
    }
    return "no error"
  }

  test("uploads are signed by the server, after the quota check", async () => {
    const viewer = client([])
    const admin = client([])
    const { uploads } = await prepareStyle(viewer, admin, "u1", "Inky", 2)
    expect(uploads.length).toBe(2)
    expect(viewer.calls).toEqual([])
    expect(admin.calls.filter((c) => c.startsWith("sign")).length).toBe(2)
    expect(admin.calls.at(-1)).toContain('"user_id":"u1"')
  })

  test("past the quota, nothing is signed or created", async () => {
    const viewer = client([], 50)
    const admin = client([])
    expect(
      await styleError(() => prepareStyle(viewer, admin, "u1", "Inky", 2))
    ).toBe("limit_reached")
    expect(admin.calls).toEqual([])
  })

  test("deleting goes through the server, and only inside the owner's folder", async () => {
    const viewer = client([{ pages: ["u1/s/0.jpg", "someone/else/0.jpg"] }])
    const admin = client([])
    await deleteStyle(viewer, admin, "u1", "style")
    expect(viewer.calls).toEqual([])
    expect(admin.calls).toEqual(["remove u1/s/0.jpg", "delete"])
  })

  test("someone else's style isn't found, so nothing is deleted", async () => {
    const admin = client([])
    await deleteStyle(client([]), admin, "u1", "style")
    expect(admin.calls).toEqual([])
  })

  test("a draft with a missing page shows as unfinished", async () => {
    const styles = await listStyles(
      client([
        { pages: ["u/a/0.jpg", "u/a/missing.jpg"], status: "draft" },
        { pages: ["u/b/0.jpg", "u/b/1.jpg"], status: "draft" },
        { pages: ["u/c/0.jpg"], status: "ready" },
      ])
    )
    expect(styles.map((s) => s.uploaded)).toEqual([false, true, true])
    expect(styles[0]!.cover).toBe("https://x/u/a/0.jpg")
  })

  const jpeg = (side: number) => jpegWithJunk(side)

  test("a page past the downscale limit is refused by the server", async () => {
    files["u/big.jpg"] = jpeg(STYLE_PAGE_SIDE + 1)
    files["u/ok.jpg"] = jpeg(STYLE_PAGE_SIDE)
    expect(
      await styleError(() => readPages(client([{ pages: ["u/big.jpg"] }]), "s"))
    ).toBe("page_too_large")
    expect(
      (await readPages(client([{ pages: ["u/ok.jpg"] }]), "s")).length
    ).toBe(1)
  })

  test("a missing page is reported as such", async () => {
    expect(
      await styleError(() =>
        readPages(client([{ pages: ["u/nothing.jpg"] }]), "s")
      )
    ).toBe("page_missing")
  })

  test("a page that isn't a JPEG is refused", async () => {
    files["u/page.png"] = png()
    expect(
      await styleError(() =>
        readPages(client([{ pages: ["u/page.png"] }]), "s")
      )
    ).toBe("page_not_jpeg")
  })
})

test("the RAR source is read once, however many pages get read", async () => {
  // Reading pages is covered with a real archive in import.test.ts; this holds
  // the memory side of it.
  const data = Uint8Array.from([0x52, 0x61, 0x72, 0x21, 0x1a, 7, 0])
  const source = bytesSource(data)
  const bytes = mock(source.bytes)
  const wasm = readFileSync(require.resolve("node-unrar-js/esm/js/unrar.wasm"))
  await openRar(
    { size: source.size, bytes },
    {
      unrar: async () =>
        wasm.buffer.slice(
          wasm.byteOffset,
          wasm.byteOffset + wasm.byteLength
        ) as ArrayBuffer,
    }
  ).catch(() => {})
  expect(bytes).toHaveBeenCalledTimes(1)
})

test("7z copies its source once too", async () => {
  const source = bytesSource(new Uint8Array(8))
  const bytes = mock(source.bytes)
  await openSevenZip({ size: source.size, bytes }).catch(() => {})
  expect(bytes).toHaveBeenCalledTimes(1)
})
