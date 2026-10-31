import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"

import {
  openRar,
  openSevenZip,
  openTar,
  openZip,
  parseSevenZipList,
  tarEntries,
} from "./archives"
import { naturalCompare, pageEntries, safeEntryName } from "./entries"
import { ImportError } from "./errors"
import {
  EXPANSION_FLOOR_BYTES,
  MAX_ENTRIES,
  MAX_PAGE_BYTES,
  MAX_PAGES,
} from "./limits"
import { assertPage, imageSize, sniffKind } from "./sniff"

const require = createRequire(import.meta.url)

// A real 1x1 PNG; `shade` keeps pages of a fixture apart.
const png = (shade = 0) => {
  const bytes = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64"
    )
  )
  const out = new Uint8Array(bytes.length + 1)
  out.set(bytes)
  out[bytes.length] = shade
  return out
}

const code = async (run: () => unknown) => {
  try {
    await run()
  } catch (e) {
    if (e instanceof ImportError) return e.code
    throw e
  }
  return "no error"
}

function tarHeader(name: string, size: number, type = "0") {
  const h = new Uint8Array(512)
  h.set(strToU8(name.slice(0, 100)))
  h.set(strToU8("0000644\0"), 100)
  h.set(strToU8(`${size.toString(8).padStart(11, "0")}\0`), 124)
  h.set(strToU8("        "), 148)
  h[156] = type.charCodeAt(0)
  h.set(strToU8("ustar\x0000"), 257)
  const sum = h.reduce((a, b) => a + b, 0)
  h.set(strToU8(`${sum.toString(8).padStart(6, "0")}\0 `), 148)
  return h
}

function tar(files: { name: string; data: Uint8Array; type?: string }[]) {
  const parts: Uint8Array[] = []
  for (const f of files) {
    parts.push(tarHeader(f.name, f.data.length, f.type))
    parts.push(f.data, new Uint8Array((512 - (f.data.length % 512)) % 512))
  }
  parts.push(new Uint8Array(1024))
  return Uint8Array.from(Buffer.concat(parts))
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(b: Uint8Array) {
  let c = 0xffffffff
  for (const v of b) c = crcTable[(c ^ v) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// A RAR 4 archive with the "store" method, laid out by hand: there is no rar
// encoder here. It runs the real unrar decoder, but no RAR compression.
function rar(files: { name: string; data: Uint8Array }[], headerFlags = 0) {
  const block = (type: number, flags: number, body: number[]) => {
    const size = 7 + body.length
    const head = [
      type,
      flags & 0xff,
      flags >> 8,
      size & 0xff,
      size >> 8,
      ...body,
    ]
    const crc = crc32(Uint8Array.from(head)) & 0xffff
    return Uint8Array.from([crc & 0xff, crc >> 8, ...head])
  }
  const u32 = (n: number) => [
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    n >>> 24,
  ]
  const parts: Uint8Array[] = [
    Uint8Array.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]),
    block(0x73, headerFlags, [0, 0, 0, 0, 0, 0]),
  ]
  for (const { name, data } of files) {
    const nameBytes = [...strToU8(name)]
    parts.push(
      block(0x74, 0x8000, [
        ...u32(data.length),
        ...u32(data.length),
        3,
        ...u32(crc32(data)),
        ...u32(0x5a210000),
        20,
        0x30,
        nameBytes.length & 0xff,
        nameBytes.length >> 8,
        ...u32(0x81a4),
        ...nameBytes,
      ]),
      data
    )
  }
  parts.push(block(0x7b, 0x4000, []))
  return Uint8Array.from(Buffer.concat(parts))
}

const sevenZipWasm = () => require.resolve("7z-wasm/7zz.wasm")

async function sevenZip(
  files: { name: string; data: Uint8Array }[],
  ...flags: string[]
) {
  const { default: SevenZip } = await import("7z-wasm")
  const seven = await SevenZip({ print: () => {}, printErr: () => {} })
  seven.FS.mkdir("/in")
  seven.FS.chdir("/in")
  for (const { name, data } of files) {
    const stream = seven.FS.open(name, "w+")
    seven.FS.write(stream, data, 0, data.length)
    seven.FS.close(stream)
  }
  seven.callMain(["a", ...flags, "/out.7z", ...files.map((f) => f.name)])
  return seven.FS.readFile("/out.7z")
}

const unrarWasm = async () => {
  const file = readFileSync(require.resolve("node-unrar-js/esm/js/unrar.wasm"))
  return file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength
  ) as ArrayBuffer
}

describe("sniffKind", () => {
  test("goes by content, whatever the file was called", () => {
    expect(sniffKind(png())).toBe("png")
    expect(sniffKind(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg")
    expect(sniffKind(strToU8("GIF89a..."))).toBe("gif")
    expect(sniffKind(strToU8("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp")
    expect(sniffKind(Uint8Array.from([0x49, 0x49, 0x2a, 0]))).toBe("tiff")
    expect(sniffKind(strToU8("%PDF-1.7"))).toBe("pdf")
    expect(sniffKind(strToU8("\n\n%PDF-1.4"))).toBe("pdf")
    expect(sniffKind(zipSync({ "a.png": png() }))).toBe("zip")
    expect(sniffKind(rar([{ name: "a.png", data: png() }]))).toBe("rar")
    expect(sniffKind(tar([{ name: "a.png", data: png() }]))).toBe("tar")
  })

  test("recognises RAR 5 and 7z signatures", () => {
    expect(
      sniffKind(Uint8Array.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 1, 0]))
    ).toBe("rar")
    expect(
      sniffKind(Uint8Array.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))
    ).toBe("7z")
  })

  test("refuses what it doesn't know", () => {
    expect(sniffKind(strToU8("<svg onload=alert(1)>"))).toBeNull()
    expect(sniffKind(strToU8("MZ executable"))).toBeNull()
    expect(sniffKind(new Uint8Array())).toBeNull()
  })
})

describe("imageSize", () => {
  test("reads dimensions from the header", () => {
    expect(imageSize(png())).toEqual({ width: 1, height: 1 })
  })

  test("reads a JPEG's frame header past other segments", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0x90,
      0x02, 0x58, 1, 1, 0x11, 0, 0, 0,
    ])
    expect(imageSize(jpeg)).toEqual({ width: 600, height: 400 })
  })

  test("refuses a small file that decodes to a huge image", async () => {
    const bomb = png()
    new DataView(bomb.buffer).setUint32(16, 60_000)
    new DataView(bomb.buffer).setUint32(20, 60_000)
    expect(await code(() => assertPage(bomb))).toBe("page_too_large")
  })

  test("refuses a page that isn't an image, whatever it's named", async () => {
    expect(await code(() => assertPage(strToU8("<script>")))).toBe(
      "unsupported"
    )
  })
})

describe("safeEntryName", () => {
  test("normalises separators and harmless dots", () => {
    expect(safeEntryName("ch1\\page 1.jpg")).toBe("ch1/page 1.jpg")
    expect(safeEntryName("./ch1//p.png")).toBe("ch1/p.png")
  })

  test("refuses anything that climbs out or starts at a root", () => {
    for (const name of [
      "../evil.png",
      "ch1/../../evil.png",
      "..\\..\\evil.png",
      "/etc/passwd.png",
      "\\\\server\\share.png",
      "C:\\Windows\\evil.png",
      "ok\0.png",
      "",
    ])
      expect(safeEntryName(name)).toBeNull()
  })
})

describe("pageEntries", () => {
  const entry = (name: string, size = 10) => ({ name, size })

  test("orders pages the way a reader does", () => {
    expect(
      pageEntries(
        [entry("p10.jpg"), entry("p2.jpg"), entry("P1.jpg")],
        100
      ).map((p) => p.name)
    ).toEqual(["P1.jpg", "p2.jpg", "p10.jpg"])
    expect(naturalCompare("page9", "page10")).toBeLessThan(0)
  })

  test("drops junk, non-images and traversal", () => {
    expect(
      pageEntries(
        [
          entry("__MACOSX/._p1.jpg"),
          entry(".DS_Store"),
          entry("ch/.hidden.png"),
          entry("Thumbs.db"),
          entry("ComicInfo.xml"),
          entry("cover.svg"),
          entry("script.exe"),
          entry("../evil.jpg"),
          entry("p1.jpg"),
        ],
        100
      ).map((p) => p.name)
    ).toEqual(["p1.jpg"])
  })

  test("refuses an archive with no pages", async () => {
    expect(await code(() => pageEntries([entry("readme.txt")], 100))).toBe(
      "no_pages"
    )
  })

  test("refuses too many entries and too many pages", async () => {
    const many = (n: number, name: (i: number) => string) =>
      Array.from({ length: n }, (_, i) => entry(name(i), 1))
    expect(
      await code(() =>
        pageEntries(
          many(MAX_ENTRIES + 1, (i) => `${i}.txt`),
          1e9
        )
      )
    ).toBe("too_many_entries")
    expect(
      await code(() =>
        pageEntries(
          many(MAX_PAGES + 1, (i) => `${i}.jpg`),
          1e9
        )
      )
    ).toBe("too_many_pages")
  })

  test("refuses a page past the size cap", async () => {
    expect(
      await code(() => pageEntries([entry("a.jpg", MAX_PAGE_BYTES + 1)], 1e9))
    ).toBe("page_too_large")
  })

  test("refuses an archive that expands like a bomb", async () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      entry(`${i}.png`, MAX_PAGE_BYTES)
    )
    expect(EXPANSION_FLOOR_BYTES).toBeLessThan(MAX_PAGE_BYTES * 10)
    expect(await code(() => pageEntries(pages, 1024))).toBe("expands_too_much")
    expect(pageEntries(pages, 400 * 1024 * 1024)).toHaveLength(10)
  })

  test("refuses nonsense sizes", async () => {
    expect(await code(() => pageEntries([entry("a.jpg", -1)], 10))).toBe(
      "corrupt"
    )
  })
})

describe("zip and cbz", () => {
  test("lists pages in order and reads them", async () => {
    const book = await openZip(
      zipSync({
        "ch1/p10.png": png(10),
        "ch1/p2.png": png(2),
        "ComicInfo.xml": strToU8("<ComicInfo/>"),
        "__MACOSX/._p2.png": strToU8("junk"),
      })
    )
    expect(book.pages.map((p) => p.name)).toEqual(["ch1/p2.png", "ch1/p10.png"])
    expect((await book.read("ch1/p10.png")).at(-1)).toBe(10)
  })

  test("refuses a .jpg entry that holds something else", async () => {
    const book = await openZip(zipSync({ "p1.jpg": strToU8("<html>") }))
    expect(await code(() => book.read("p1.jpg"))).toBe("unsupported")
  })

  test("doesn't serve a name it didn't list", async () => {
    const book = await openZip(
      zipSync({ "p1.png": png(), "../evil.png": png() })
    )
    expect(book.pages.map((p) => p.name)).toEqual(["p1.png"])
    expect(await code(() => book.read("../evil.png"))).toBe("corrupt")
  })

  test("a real deflate bomb is refused before anything inflates", async () => {
    // Over the page cap, from a file of about 100 KB.
    const zeros = new Uint8Array(MAX_PAGE_BYTES + 1)
    const bomb = zipSync({ "p1.png": [zeros, { level: 9 }] })
    expect(bomb.length).toBeLessThan(MAX_PAGE_BYTES / 100)
    expect(await code(() => openZip(bomb))).toBe("page_too_large")
  })

  test("an entry understating its size can't outgrow what it declared", async () => {
    const real = new Uint8Array(4096)
    real.set(png())
    const zip = zipSync({ "p1.png": [real, { level: 9 }] })
    // Patch the central directory's uncompressed size down to 64 bytes.
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    let central = zip.length - 22
    while (v.getUint32(central, true) !== 0x02014b50) central--
    v.setUint32(central + 24, 64, true)
    const book = await openZip(zip)
    const read = await book.read("p1.png").catch(() => null)
    expect(read === null || read.length <= 64).toBe(true)
  })

  test("reports a broken file", async () => {
    const zip = zipSync({ "p1.png": png() })
    expect(await code(() => openZip(zip.subarray(0, 12)))).toBe("corrupt")
  })
})

describe("tar and cbt", () => {
  test("reads regular files", async () => {
    const book = await openTar(
      tar([
        { name: "p2.png", data: png(2) },
        { name: "p1.png", data: png(1) },
      ])
    )
    expect(book.pages.map((p) => p.name)).toEqual(["p1.png", "p2.png"])
    expect((await book.read("p2.png")).at(-1)).toBe(2)
  })

  test("skips links and traversal", async () => {
    const book = await openTar(
      tar([
        { name: "link.png", data: new Uint8Array(), type: "2" },
        { name: "../evil.png", data: png() },
        { name: "p1.png", data: png() },
      ])
    )
    expect(book.pages.map((p) => p.name)).toEqual(["p1.png"])
  })

  test("takes a GNU long name", async () => {
    const long = `${"d/".repeat(60)}p1.png`
    const entries = tarEntries(
      tar([
        { name: "././@LongLink", data: strToU8(`${long}\0`), type: "L" },
        { name: "truncated", data: png() },
      ])
    )
    expect(entries.map((e) => e.name)).toEqual([long])
  })

  test("refuses a size that runs past the end", async () => {
    const data = tar([{ name: "p1.png", data: png() }])
    data.set(strToU8("77777777777\0"), 124)
    expect(await code(() => openTar(data))).toBe("corrupt")
  })
})

describe("rar and cbr", () => {
  const files = [
    { name: "ch1/p10.png", data: png(10) },
    { name: "ch1/p2.png", data: png(2) },
    { name: "notes.txt", data: strToU8("not a page") },
  ]

  test("lists and reads a stored RAR 4 archive", async () => {
    const book = await openRar(rar(files), { unrar: unrarWasm })
    expect(book.pages.map((p) => p.name)).toEqual(["ch1/p2.png", "ch1/p10.png"])
    expect((await book.read("ch1/p10.png")).at(-1)).toBe(10)
    expect((await book.read("ch1/p2.png")).at(-1)).toBe(2)
  })

  test("refuses an entry named .png that isn't", async () => {
    const book = await openRar(
      rar([{ name: "p1.png", data: strToU8("<html>") }]),
      { unrar: unrarWasm }
    )
    expect(await code(() => book.read("p1.png"))).toBe("unsupported")
  })

  test("finds nothing in a file cut off after its signature", async () => {
    expect(
      await code(() =>
        openRar(Uint8Array.from([0x52, 0x61, 0x72, 0x21, 0x1a, 7, 0, 1, 2]), {
          unrar: unrarWasm,
        })
      )
    ).toBe("no_pages")
  })
})

describe("7z and cb7", () => {
  test("lists and reads an archive made by 7-Zip", async () => {
    const data = await sevenZip([
      { name: "p10.png", data: png(10) },
      { name: "p2.png", data: png(2) },
      { name: "notes.txt", data: strToU8("not a page") },
    ])
    const book = await openSevenZip(data)
    expect(book.pages.map((p) => p.name)).toEqual(["p2.png", "p10.png"])
    expect((await book.read("p10.png")).at(-1)).toBe(10)
    expect((await book.read("p2.png")).at(-1)).toBe(2)
    expect(sevenZipWasm()).toContain("7zz.wasm")
  })

  test("refuses a password-protected archive", async () => {
    const files = [{ name: "p1.png", data: png() }]
    expect(
      await code(async () => openSevenZip(await sevenZip(files, "-psecret")))
    ).toBe("encrypted")
  })

  // 7-Zip dies before saying why, so this can't be told from a damaged file.
  test("refuses an archive that encrypts its file list too", async () => {
    const files = [{ name: "p1.png", data: png() }]
    expect(
      await code(async () =>
        openSevenZip(await sevenZip(files, "-psecret", "-mhe=on"))
      )
    ).toBe("corrupt")
  })

  test("parses a listing", () => {
    expect(
      parseSevenZipList(
        "Path = ch1\nFolder = +\nSize = 0\n\nPath = ch1/p1.png\nFolder = -\nSize = 12\nEncrypted = -\n\nPath = ch1/p2.png\nSize = 3\nEncrypted = +\n"
      )
    ).toEqual([
      { name: "ch1/p1.png", size: 12, encrypted: false },
      { name: "ch1/p2.png", size: 3, encrypted: true },
    ])
  })
})
