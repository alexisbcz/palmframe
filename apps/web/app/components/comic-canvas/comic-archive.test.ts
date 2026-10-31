import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { strFromU8, unzipSync } from "fflate"

import {
  ArchiveTooLargeError,
  CBZ_MIME,
  buildComicInfo,
  cbzFileName,
  comicInfoXml,
  escapeXml,
  pageFileName,
  writeCbz,
} from "./comic-archive"

// The names in the order their bytes sit in the file, which is what a
// streaming reader sees.
function entryOrder(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const names: string[] = []
  for (let at = 0; at + 4 <= bytes.length; at++) {
    if (view.getUint32(at, true) !== 0x04034b50) continue
    const length = view.getUint16(at + 26, true)
    names.push(strFromU8(bytes.subarray(at + 30, at + 30 + length)))
  }
  return names
}

const pageBlob = (position: number, size = 16) =>
  new Blob([new Uint8Array(size).fill(position + 1)], { type: "image/jpeg" })

async function unpack(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { bytes, files: unzipSync(bytes) }
}

describe("ComicInfo from the editor's details", () => {
  const page = { pageCount: 3 }

  test("an untitled comic has no Title", () => {
    for (const title of [undefined, "", "   "]) {
      const xml = comicInfoXml(buildComicInfo({ title }, page))
      assert.doesNotMatch(xml, /<Title>/)
    }
  })

  test("carries the project's details and the page's", () => {
    const info = buildComicInfo(
      { title: "Tides", series: "Sea", number: 2, writer: "Ada" },
      { pageCount: 3, language: "de", rtl: true }
    )
    assert.deepEqual(info, {
      title: "Tides",
      series: "Sea",
      number: 2,
      writer: "Ada",
      pageCount: 3,
      language: "de",
      rtl: true,
    })
  })

  test("uses the account's name until the writer is edited", () => {
    const info = buildComicInfo({ writer: "Ada" }, page)
    assert.match(comicInfoXml(info), /<Writer>Ada<\/Writer>/)
  })

  test("an edited writer replaces the account's name", () => {
    const info = buildComicInfo({ writer: "Ada" }, { ...page, writer: "Grace" })
    assert.match(comicInfoXml(info), /<Writer>Grace<\/Writer>/)
  })

  test("a cleared writer is left out", () => {
    const info = buildComicInfo({ writer: "Ada" }, { ...page, writer: "" })
    assert.doesNotMatch(comicInfoXml(info), /Writer|Ada/)
  })
})

describe("file name", () => {
  test("follows the project's title", () => {
    assert.equal(cbzFileName("Tides", "old-comic", false), "Tides")
  })

  test("keeps the remembered name for an untitled comic", () => {
    assert.equal(cbzFileName("", "old-comic", false), "old-comic")
    assert.equal(cbzFileName(undefined, "old-comic", false), "old-comic")
    assert.equal(cbzFileName("   ", "old-comic", false), "old-comic")
  })

  test("a typed name wins, even an empty one", () => {
    assert.equal(cbzFileName("Tides", "mine", true), "mine")
    assert.equal(cbzFileName("Tides", "", true), "")
  })
})

describe("page names", () => {
  test("are zero padded and sort in reading order", () => {
    const names = Array.from({ length: 120 }, (_, n) =>
      pageFileName(n, 120, "jpg")
    )
    assert.equal(names[0], "001.jpg")
    assert.equal(names[119], "120.jpg")
    assert.deepEqual([...names].sort(), names)
  })

  test("widen past 999 pages", () => {
    assert.equal(pageFileName(0, 1000, "jpg"), "0001.jpg")
    assert.equal(pageFileName(999, 1000, "jpg"), "1000.jpg")
  })
})

describe("ComicInfo.xml", () => {
  test("escapes all five markup characters", () => {
    assert.equal(
      escapeXml(`Tom & "Jerry's" <war>`),
      "Tom &amp; &quot;Jerry&apos;s&quot; &lt;war&gt;"
    )
  })

  test("treats text that looks escaped as plain text", () => {
    assert.equal(escapeXml("&amp;"), "&amp;amp;")
  })

  test("drops characters XML can't carry", () => {
    assert.equal(escapeXml("a\u0000b\u0008c\ud800d￿e"), "abcde")
    assert.equal(escapeXml("line\nbreak\ttab"), "line\nbreak\ttab")
  })

  test("keeps non-Latin text and emoji", () => {
    const xml = comicInfoXml({ title: "夜行列車 🌙 ночь", pageCount: 1 })
    assert.match(xml, /<Title>夜行列車 🌙 ночь<\/Title>/)
  })

  test("writes the fields in schema order", () => {
    const xml = comicInfoXml({
      title: "Night Fare",
      series: "Fares",
      number: 3,
      writer: "Alex",
      pageCount: 24,
      language: "fr",
      rtl: true,
    })
    const tags = [...xml.matchAll(/^ {2}<(\w+)>/gm)].map((m) => m[1])
    assert.deepEqual(tags, [
      "Title",
      "Series",
      "Number",
      "Writer",
      "PageCount",
      "LanguageISO",
      "Manga",
    ])
    assert.match(xml, /<Number>3<\/Number>/)
    assert.match(xml, /<PageCount>24<\/PageCount>/)
    assert.match(xml, /<LanguageISO>fr<\/LanguageISO>/)
    assert.match(xml, /<Manga>YesAndRightToLeft<\/Manga>/)
  })

  test("leaves out what isn't known", () => {
    const xml = comicInfoXml({ title: "  ", pageCount: 2 })
    assert.doesNotMatch(xml, /<Title|<Series|<Number|<Writer|<LanguageISO/)
    assert.match(xml, /<Manga>No<\/Manga>/)
  })
})

describe("writeCbz", () => {
  test("puts ComicInfo.xml and the pages in order, byte for byte", async () => {
    const blob = await writeCbz({
      info: { title: "Night Fare", pageCount: 12 },
      ext: "jpg",
      readPage: async (n) => pageBlob(n),
    })
    assert.equal(blob.type, CBZ_MIME)
    const { bytes, files } = await unpack(blob)
    const pages = Array.from({ length: 12 }, (_, n) =>
      pageFileName(n, 12, "jpg")
    )
    assert.deepEqual(entryOrder(bytes), ["ComicInfo.xml", ...pages])
    for (const [n, name] of pages.entries())
      assert.deepEqual(files[name], new Uint8Array(16).fill(n + 1))
    assert.match(strFromU8(files["ComicInfo.xml"]!), /<PageCount>12</)
  })

  test("reads one page at a time, in order", async () => {
    const reads: number[] = []
    let open = 0
    await writeCbz({
      info: { pageCount: 5 },
      ext: "jpg",
      readPage: async (n) => {
        assert.equal(++open, 1)
        reads.push(n)
        await new Promise((resolve) => setTimeout(resolve, 0))
        open--
        return pageBlob(n)
      },
    })
    assert.deepEqual(reads, [0, 1, 2, 3, 4])
  })

  test("carries pages larger than the deflate window intact", async () => {
    const big = new Uint8Array(3_000_000)
    for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) >>> 24
    const blob = await writeCbz({
      info: { pageCount: 2 },
      ext: "jpg",
      readPage: async () => new Blob([big]),
    })
    const { files } = await unpack(blob)
    assert.deepEqual(files["001.jpg"], big)
    assert.deepEqual(files["002.jpg"], big)
    // Level 0 adds a few bytes per block, and no real work.
    assert.ok(blob.size < big.length * 2 + 4096)
  })

  test("marks non-Latin metadata as UTF-8 and keeps it", async () => {
    const blob = await writeCbz({
      info: { title: "夜行列車", series: "ночь", pageCount: 1 },
      ext: "jpg",
      readPage: async (n) => pageBlob(n),
    })
    const { files } = await unpack(blob)
    const xml = strFromU8(files["ComicInfo.xml"]!)
    assert.match(xml, /encoding="utf-8"/)
    assert.match(xml, /<Title>夜行列車<\/Title>/)
    assert.match(xml, /<Series>ночь<\/Series>/)
  })

  test("refuses to grow past what a ZIP can hold", async () => {
    const reads: number[] = []
    await assert.rejects(
      writeCbz({
        info: { pageCount: 10 },
        ext: "jpg",
        maxBytes: 2000,
        readPage: async (n) => {
          reads.push(n)
          return pageBlob(n, 1000)
        },
      }),
      ArchiveTooLargeError
    )
    assert.ok(reads.length < 10)
  })

  test("refuses more entries than a ZIP can list", async () => {
    await assert.rejects(
      writeCbz({
        info: { pageCount: 70000 },
        ext: "jpg",
        readPage: async (n) => pageBlob(n),
      }),
      ArchiveTooLargeError
    )
  })

  test("passes a failed page on", async () => {
    await assert.rejects(
      writeCbz({
        info: { pageCount: 2 },
        ext: "jpg",
        readPage: async () => {
          throw new Error("canvas")
        },
      }),
      /canvas/
    )
  })
})
