import { describe, expect, test } from "bun:test"
import { strToU8, unzipSync, zipSync } from "fflate"

import { chunkSegments, memorable, sourceHash, translatable } from "./chunk"
import { BookParseError } from "./errors"
import { checkTags, escapeStrayAngles, parseInline, stripTags } from "./inline"
import { CHAPTER_ONE, makeDocx, makeEpub, makePdf } from "./fixtures"
import { countWords } from "./model"
import { parseDocx } from "./parse/docx"
import { parseEpub, readToc, openEpub } from "./parse/epub"
import { assertReadable, detectFormat, parseBook } from "./parse/index"
import { assemblePages } from "./parse/layout"
import { extractScans, readPdf } from "./parse/pdf.server"
import { parseHtmlBook, parseMarkdown, parseText } from "./parse/text"
import { assertSafeXml, parseXml } from "./xml"

const rejects = async (work: Promise<unknown>, code: string) => {
  const error = await work.then(
    () => null,
    (e) => e
  )
  expect(error).toBeInstanceOf(BookParseError)
  expect(error.code).toBe(code)
}

describe("EPUB", () => {
  test("keeps structure, inline tags, footnotes, tables and images", async () => {
    const book = await parseEpub(makeEpub())
    expect(book.meta).toEqual({
      title: "The Analytical Engine",
      author: "A. Author",
      language: "en",
    })
    // The front matter, then one chapter per spine file.
    expect(book.chapters.length).toBe(3)
    const front = book.chapters[0]!.blocks
    expect(front.map((b) => b.locator)).toEqual([
      "meta:title",
      "toc:OEBPS/c1.xhtml",
      "toc:OEBPS/c2.xhtml",
    ])
    const blocks = book.chapters[1]!.blocks
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 })
    const para = blocks[1]!
    expect(para.text).toBe(
      "Ada met <g1>Grace Hopper</g1> in <g2>London</g2> in 1843.<g3>1</g3>"
    )
    expect(para.tags.map((t) => t.type)).toEqual(["i", "b", "noteref"])
    expect(blocks[2]!.text).toBe("The machine had 1,024 wheels &amp; levers.")
    expect(blocks.filter((b) => b.kind === "list_item").length).toBe(2)
    const cells = blocks.filter((b) => b.kind === "table_cell")
    expect(cells.map((c) => c.cell)).toEqual([
      { row: 0, col: 0, header: true },
      { row: 0, col: 1, header: true },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ])
    expect(new Set(cells.map((c) => c.group)).size).toBe(1)
    expect(blocks.find((b) => b.kind === "quote")?.text).toBe(
      "A quoted line of text."
    )
    const image = blocks.find((b) => b.kind === "image")!
    expect(image.asset).toBe("OEBPS/images/plate.png")
    expect(image.text).toBe("A plate of gears")
    expect(blocks.find((b) => b.kind === "caption")?.text).toBe("Figure one.")
    expect(blocks.find((b) => b.kind === "footnote")?.text).toBe(
      "A note about <g1>the</g1> date."
    )
    expect(book.assets.map((a) => a.mime)).toEqual(["image/png"])
    const two = book.chapters[2]!.blocks
    expect(two[1]!.text).toBe("Loose text<x1/>after a break.")
    expect(two.find((b) => b.kind === "code")?.text).toBe("const code = 1")
    expect(two.some((b) => b.kind === "rule")).toBe(true)
  })

  test("drops scripts and event handlers on the way in", async () => {
    const book = await parseEpub(makeEpub())
    const all = JSON.stringify(book)
    expect(all).not.toContain("alert(1)")
    expect(all).not.toContain("steal")
    expect(all).not.toContain("javascript:")
  })

  test("reads the contents from nav, and from the NCX without it", async () => {
    const toc = await readToc(await openEpub(makeEpub()))
    expect(toc.map((t) => t.label)).toEqual(["Chapter 1", "Chapter 2"])
    const old = unzipSync(makeEpub())
    delete old["OEBPS/nav.xhtml"]
    const noNav = await readToc(await openEpub(zipSync(old)))
    expect(noNav.map((t) => t.path)).toEqual([
      "OEBPS/c1.xhtml",
      "OEBPS/c2.xhtml",
    ])
  })

  test("refuses external entities and billion laughs", async () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><p>&x;</p>`
    expect(() => assertSafeXml(xxe)).toThrow(BookParseError)
    const laughs = `<!DOCTYPE lolz [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><p>&b;</p>`
    expect(() => parseXml(laughs)).toThrow(BookParseError)
    const evil = makeEpub({
      chapters: [xxe],
    })
    await rejects(parseEpub(evil), "unsafe_xml")
  })

  test("allows the stock XHTML doctypes", () => {
    const strict = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html/>`
    expect(() => assertSafeXml(strict)).not.toThrow()
    expect(() => assertSafeXml("<!DOCTYPE html><html/>")).not.toThrow()
    expect(() =>
      assertSafeXml(`<!DOCTYPE html SYSTEM "file:///etc/passwd"><html/>`)
    ).toThrow(BookParseError)
  })

  test("refuses malformed files and DRM", async () => {
    await rejects(parseEpub(strToU8("not a zip")), "corrupt")
    const noContainer = unzipSync(makeEpub())
    delete noContainer["META-INF/container.xml"]
    await rejects(parseEpub(zipSync(noContainer)), "corrupt")
    const drm = makeEpub({
      extra: {
        "META-INF/encryption.xml": strToU8(
          `<encryption><EncryptedData><CipherData><CipherReference URI="OEBPS/c1.xhtml"/></CipherData></EncryptedData></encryption>`
        ),
      },
    })
    await rejects(parseEpub(drm), "encrypted")
    const fonts = makeEpub({
      extra: {
        "META-INF/encryption.xml": strToU8(
          `<encryption><EncryptedData><CipherData><CipherReference URI="OEBPS/font.otf"/></CipherData></EncryptedData></encryption>`
        ),
      },
    })
    await parseEpub(fonts)
  })

  test("refuses a zip bomb before inflating it", async () => {
    const big = new Uint8Array(400 * 1024 * 1024)
    const bomb = zipSync({
      "META-INF/container.xml": [big, { level: 9 }],
    })
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024)
    await rejects(parseEpub(bomb), "expands_too_much")
  })

  test("doesn't let a path climb out of the archive", async () => {
    const book = await parseEpub(
      makeEpub({
        chapters: [`<p>x</p><img src="../../../../etc/passwd" alt="y"/>`],
      })
    )
    const image = book.chapters[1]!.blocks.find((b) => b.kind === "image")
    expect(image?.asset).toBeUndefined()
    expect(book.assets).toEqual([])
  })

  test("treats a book of full-page images as scanned, but not one plate", async () => {
    const pic = `<p><img src="images/plate.png" alt=""/></p>`
    const one = await parseEpub(
      makeEpub({ chapters: [pic, "<p>Words here.</p>", "<p>More words.</p>"] })
    )
    expect(one.scans).toEqual([])
    const scan = await parseEpub(makeEpub({ chapters: [pic, pic, pic, pic] }))
    expect(scan.scans.length).toBe(4)
    expect(scan.scans[0]!.image).toBe("OEBPS/images/plate.png")
  })
})

describe("DOCX", () => {
  test("merges runs and keeps chapters, lists, tables, notes and links", async () => {
    const book = await parseDocx(makeDocx())
    expect(book.meta.title).toBe("A Word Book")
    expect(book.chapters.map((c) => c.title)).toEqual([
      "First part",
      "Second part",
    ])
    const blocks = book.chapters[0]!.blocks
    expect(blocks[1]!.text).toBe("Hello <g1>bold words</g1> and a note.<x2/>")
    expect(blocks[1]!.tags[1]!.type).toBe("noteref")
    expect(blocks[2]!.kind).toBe("list_item")
    expect(
      blocks.filter((b) => b.kind === "table_cell").map((b) => b.cell)
    ).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ])
    expect(blocks.at(-1)).toMatchObject({
      kind: "footnote",
      text: "The note text.",
    })
    expect(book.chapters[1]!.blocks[1]!.tags[0]).toMatchObject({
      type: "a",
      href: "https://example.com/",
    })
  })
})

describe("text formats", () => {
  test("TXT joins wrapped lines and finds chapters", () => {
    const book = parseText(
      "Chapter 1\n\nA line that was\nwrapped at a fixed wid-\nth by a tool.\n\nSecond.\n\nChapter 2\n\nThird."
    )
    expect(book.chapters.length).toBe(2)
    expect(book.chapters[0]!.blocks[1]!.text).toBe(
      "A line that was wrapped at a fixed width by a tool."
    )
  })

  test("Markdown keeps inline marks, tables, footnotes and front matter", () => {
    const book = parseMarkdown(`---
title: "A Book"
author: Someone
---

# One

Some **bold** and *italic* with [a link](https://example.com) and a note[^1].

- first
- second

| A | B |
| --- | --- |
| 1 | 2 |

\`\`\`
code here
\`\`\`

[^1]: The note.

# Two

Ends here.
`)
    expect(book.meta.title).toBe("A Book")
    expect(book.chapters.length).toBe(2)
    const blocks = book.chapters[0]!.blocks
    expect(blocks[1]!.text).toBe(
      "Some <g1>bold</g1> and <g2>italic</g2> with <g3>a link</g3> and a note<x4/>."
    )
    expect(blocks.filter((b) => b.kind === "list_item").length).toBe(2)
    expect(blocks.filter((b) => b.kind === "table_cell").length).toBe(4)
    expect(blocks.some((b) => b.kind === "code")).toBe(true)
    expect(blocks.find((b) => b.kind === "footnote")?.text).toBe("The note.")
  })

  test("HTML strips active content and splits on headings", () => {
    const book = parseHtmlBook(`<html lang="fr"><head><title>T</title>
      <script>evil()</script></head><body onload="x()">
      <h1>Un</h1><p>Texte <b>gras</b><br>suite</p><iframe src="x"></iframe>
      <h1>Deux</h1><p>Fin</p></body></html>`)
    expect(book.meta).toMatchObject({ title: "T", language: "fr" })
    expect(book.chapters.length).toBe(2)
    expect(book.chapters[0]!.blocks[1]!.text).toBe(
      "Texte <g1>gras</g1><x2/>suite"
    )
    expect(JSON.stringify(book)).not.toContain("evil")
  })

  test("detects by content, not the name", async () => {
    expect(await detectFormat(makeEpub(), "book.bin")).toBe("epub")
    expect(await detectFormat(makeDocx(), "book.zip")).toBe("docx")
    expect(await detectFormat(await makePdf(), "book.txt")).toBe("pdf")
    expect(await detectFormat(strToU8("# Hi"), "book.md")).toBe("md")
    expect(
      await detectFormat(new Uint8Array([0x7f, 0x45, 0, 0, 1]), "a.txt")
    ).toBe(null)
    expect(
      await detectFormat(zipSync({ "a.txt": strToU8("x") }), "a.epub")
    ).toBe(null)
  })

  test("an empty book is refused, and an over-long one too", async () => {
    await rejects(parseBook(strToU8("   \n\n  "), "txt"), "empty")
    const blocks = Array.from({ length: 60_001 }, () => ({
      kind: "paragraph" as const,
      text: "word",
      tags: [],
    }))
    expect(() =>
      assertReadable({
        meta: { title: "", author: "", language: null },
        chapters: [{ title: "", blocks }],
        assets: [],
        scans: [],
        warnings: [],
      })
    ).toThrow(BookParseError)
  })
})

describe("PDF", () => {
  test("drops running heads and folios, and finds headings and notes", async () => {
    const pdf = await readPdf(await makePdf({ textPages: 4 }))
    expect(pdf.scans).toEqual([])
    const text = pdf.pages.flatMap((p) => p.blocks.map((b) => b.text)).join(" ")
    expect(text).not.toContain("The Running Head")
    expect(pdf.pages[0]!.blocks[0]).toMatchObject({
      kind: "heading",
      text: "Chapter One",
    })
    expect(
      pdf.pages[0]!.blocks.some(
        (b) => b.kind === "footnote" && b.text.includes("small footnote")
      )
    ).toBe(true)
    const chapters = assemblePages(pdf.pages, pdf.outline)
    const body = chapters.flatMap((c) => c.blocks)
    expect(body.filter((b) => b.kind === "paragraph").length).toBeGreaterThan(3)
    // Notes wait for the end of the chapter instead of cutting a paragraph.
    expect(body.at(-1)!.kind).toBe("footnote")
  })

  test("reads two columns in order", async () => {
    const pdf = await readPdf(await makePdf({ textPages: 1, columns: true }))
    const text = pdf.pages[0]!.blocks.map((b) => b.text).join("\n")
    const left = text.indexOf("Left column")
    const right = text.indexOf("Right column")
    expect(left).toBeGreaterThanOrEqual(0)
    expect(right).toBeGreaterThan(left)
    // The left column finishes before the right one starts.
    const between = text.slice(left, right)
    expect(between).toContain("behind the hills")
    expect(between).not.toContain("Right")
  })

  test("detects scanned pages and pulls out their images", async () => {
    const bytes = await makePdf({ textPages: 1, scannedPages: 2 })
    const pdf = await readPdf(bytes)
    expect(pdf.scans).toEqual([2, 3])
    expect(pdf.pageCount).toBe(3)
    const images = await extractScans(bytes, pdf.scans)
    expect(images.length).toBe(2)
    const first = images[0]!
    if (!first.png) throw new Error("no image")
    expect([...first.png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect((first as { height: number }).height).toBeLessThanOrEqual(1568)
  })

  test("refuses what isn't a PDF", async () => {
    await rejects(readPdf(strToU8("%PDF-1.7 garbage")), "corrupt")
  })
})

describe("inline tags", () => {
  test("round trips and reports lost tags", () => {
    const s = "a <g1>b <g2>c</g2></g1> d<x3/>"
    expect(stripTags(s)).toBe("a b c d")
    expect(parseInline(s).length).toBe(4)
    expect(checkTags(s, s)).toBe(null)
    expect(checkTags(s, "a <g1>b</g1> d<x3/>")?.missing).toEqual(["g2"])
    expect(checkTags(s, s + "<x9/>")?.extra).toEqual(["x9"])
    expect(checkTags("<g1>a</g1>", "<g1>a")?.unbalanced).toBe(true)
  })

  test("a model can't smuggle markup in", () => {
    expect(
      escapeStrayAngles("<g1>ok</g1> <script>x</script> 1 < 2 &amp; 3")
    ).toBe("<g1>ok</g1> &lt;script&gt;x&lt;/script&gt; 1 &lt; 2 &amp; 3")
    expect(parseInline("<g1>never closed")).toEqual([
      { id: "g1", children: [{ text: "never closed" }] },
    ])
  })
})

describe("chunking", () => {
  const seg = (i: number, chars: number, group_key: string | null = null) => ({
    id: `s${i}`,
    kind: "paragraph" as const,
    source: "x".repeat(chars),
    source_hash: `${i}`,
    group_key,
  })

  test("never splits a segment and keeps to the budget", () => {
    const chunks = chunkSegments(
      Array.from({ length: 30 }, (_, i) => seg(i, 500)),
      2_000
    )
    expect(chunks.flatMap((c) => c.segments.map((s) => s.id))).toEqual(
      Array.from({ length: 30 }, (_, i) => `s${i}`)
    )
    for (const c of chunks) expect(c.chars).toBeLessThanOrEqual(2_000)
  })

  test("keeps a table together, unless it can't fit", () => {
    const rows = Array.from({ length: 4 }, (_, i) => seg(i + 1, 300, "t1"))
    const chunks = chunkSegments([seg(0, 900), ...rows, seg(9, 100)], 1_500)
    const holding = chunks.filter((c) =>
      c.segments.some((s) => s.group_key === "t1")
    )
    expect(holding.length).toBe(1)
    const huge = Array.from({ length: 10 }, (_, i) => seg(i, 500, "t2"))
    expect(chunkSegments(huge, 1_000).length).toBeGreaterThan(1)
  })

  test("a segment past the budget travels alone", () => {
    const chunks = chunkSegments(
      [seg(0, 100), seg(1, 9_000), seg(2, 100)],
      1_000
    )
    expect(chunks.map((c) => c.segments.length)).toEqual([1, 1, 1])
  })

  test("hashes ignore spacing but not tags or wording", () => {
    expect(sourceHash("a  b\n c")).toBe(sourceHash("a b c"))
    expect(sourceHash("<g1>a</g1>")).not.toBe(sourceHash("a"))
    expect(memorable("Yes.")).toBe(false)
    expect(memorable("The machine had wheels.")).toBe(true)
  })

  test("only text with letters is translatable", () => {
    expect(translatable("paragraph", "12 345")).toBe(false)
    expect(translatable("code", "const a")).toBe(false)
    expect(translatable("paragraph", "日本語")).toBe(true)
    expect(translatable("image", "A plate")).toBe(true)
  })

  test("counts words across scripts", () => {
    expect(countWords("three small words")).toBe(3)
    expect(countWords("日本語です")).toBe(3)
    expect(countWords("mixed 日本 text")).toBe(3)
  })
})

test("fixture chapter is what the assertions think it is", () => {
  expect(CHAPTER_ONE).toContain("Grace Hopper")
})
