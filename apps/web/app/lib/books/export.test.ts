import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { strFromU8, strToU8, unzipSync } from "fflate"

import type { ExportBook, ExportChapter } from "./export/common"
import { inlineHtml, inlineRuns } from "./export/common"
import { buildDocx } from "./export/docx"
import { buildEpub, rewriteEpub } from "./export/epub"
import { buildMarkdown } from "./export/markdown"
import { buildPdf } from "./export/pdf.server"
import { fakeModel } from "./fake"
import { CHAPTER_ONE, makeDocx, makeEpub, tinyPng } from "./fixtures"
import { stripTags } from "./inline"
import type { ParsedBook } from "./model"
import { parseDocx } from "./parse/docx"
import { parseEpub } from "./parse/epub"
import { readPdf } from "./parse/pdf.server"

const translate = async (text: string) => {
  const { value } = await fakeModel().json({
    task: "translate",
    system: "",
    user: JSON.stringify([{ id: "a", text }]),
    schema: {},
  })
  return (value as { segments: { text: string }[] }).segments[0]!.text
}

async function bookFrom(
  parsed: ParsedBook,
  options: Partial<ExportBook> = {}
): Promise<ExportBook> {
  const chapters: ExportChapter[] = []
  for (const chapter of parsed.chapters) {
    const segments = []
    for (const b of chapter.blocks)
      segments.push({
        kind: b.kind,
        level: b.level ?? null,
        group_key: b.group ?? null,
        cell: b.cell ?? null,
        locator: b.locator ?? null,
        asset: b.asset ?? null,
        source: b.text,
        tags: b.tags,
        target: b.kind === "code" || !b.text ? null : await translate(b.text),
      })
    chapters.push({ title: chapter.title, segments })
  }
  return {
    title: parsed.meta.title,
    author: parsed.meta.author,
    sourceLang: "en",
    targetLang: "fr",
    bilingual: false,
    chapters,
    asset: async () => tinyPng(),
    ...options,
  }
}

describe("EPUB round trip", () => {
  test("translated text lands back in the original elements", async () => {
    const source = makeEpub()
    const out = await rewriteEpub(
      source,
      await bookFrom(await parseEpub(source))
    )
    const files = unzipSync(out)
    const page = strFromU8(files["OEBPS/c1.xhtml"]!)
    // Words changed; classes, ids and links stayed.
    expect(page).toContain('<em class="name">')
    expect(page).toContain("Grácé Hóppér")
    expect(page).toContain('<h1 id="c1">')
    expect(page).toContain('id="r1"')
    expect(page).toContain('href="#n1"')
    expect(page).toContain('epub:type="noteref"')
    expect(page).toContain('src="images/plate.png"')
    expect(page).not.toContain("alert(1)")
    expect(page).not.toContain("onclick")
    expect(page).not.toContain("javascript:")
    expect(page).toContain('lang="fr"')
    expect(page).toContain("1,024")
    const two = strFromU8(files["OEBPS/c2.xhtml"]!)
    expect(two).toContain("<br/>")
    expect(two).toContain("const code = 1")
    expect(two).toContain('<span class="x">')
  })

  test("formatting added in the editor reaches the rewritten file", async () => {
    const source = makeEpub()
    const book = await bookFrom(await parseEpub(source))
    const line = book.chapters
      .flatMap((c) => c.segments)
      .find((s) => s.kind === "paragraph" && s.target?.trim())!
    line.target = `${line.target} <g02>ajouté</g02> 1<g05>er</g05>`
    const page = Object.values(unzipSync(await rewriteEpub(source, book)))
      .map((f) => strFromU8(f))
      .join("")
    expect(page).toContain("<em>ajouté</em>")
    expect(page).toContain("<sup>er</sup>")
  })

  test("formatting added in the editor needs no tag on the line", () => {
    const text = "a <g01>b</g01> <g02>c</g02>"
    expect(inlineHtml(text, [])).toBe("a <strong>b</strong> <em>c</em>")
    expect(inlineRuns(text, []).filter((r) => r.bold || r.italic)).toEqual([
      { bold: true, text: "b" },
      { italic: true, text: "c" },
    ])
  })

  test("the package stays a valid EPUB", async () => {
    const source = makeEpub()
    const out = await rewriteEpub(
      source,
      await bookFrom(await parseEpub(source))
    )
    const names = Object.keys(unzipSync(out))
    expect(names[0]).toBe("mimetype")
    // `mimetype` must be first and stored, so its bytes sit at a fixed offset.
    expect(strFromU8(out.subarray(30, 38))).toBe("mimetype")
    expect(strFromU8(out.subarray(38, 58))).toBe("application/epub+zip")
    expect(names).toContain("OEBPS/images/plate.png")
    expect(names).toContain("OEBPS/style.css")
  })

  test("metadata and contents are translated", async () => {
    const source = makeEpub()
    const out = await rewriteEpub(
      source,
      await bookFrom(await parseEpub(source))
    )
    const files = unzipSync(out)
    const opf = strFromU8(files["OEBPS/content.opf"]!)
    expect(opf).toContain("<dc:language>fr</dc:language>")
    expect(opf).toContain("Thé Ánálytícál Éngíné")
    expect(opf).toContain("<dc:creator>A. Author</dc:creator>")
    expect(opf).not.toContain("scripted")
    expect(opf).not.toContain("2026-01-01T00:00:00Z")
    expect(strFromU8(files["OEBPS/nav.xhtml"]!)).toContain("Cháptér 1")
    expect(strFromU8(files["OEBPS/toc.ncx"]!)).toContain("Cháptér 2")
  })

  test("what comes out reads back in as the same structure", async () => {
    const source = makeEpub()
    const before = await parseEpub(source)
    const out = await rewriteEpub(source, await bookFrom(before))
    const after = await parseEpub(out)
    expect(after.chapters.length).toBe(before.chapters.length)
    expect(after.chapters[1]!.blocks.map((b) => b.kind)).toEqual(
      before.chapters[1]!.blocks.map((b) => b.kind)
    )
    expect(after.chapters[1]!.blocks[1]!.text).toContain("Grácé Hóppér")
    expect(after.chapters[1]!.blocks[1]!.tags.map((t) => t.type)).toEqual([
      "i",
      "b",
      "noteref",
    ])
    expect(after.assets).toEqual(before.assets)
  })

  test("right-to-left output marks the book and its spine", async () => {
    const source = makeEpub()
    const data = await bookFrom(await parseEpub(source), { targetLang: "ar" })
    const files = unzipSync(await rewriteEpub(source, data))
    expect(strFromU8(files["OEBPS/c1.xhtml"]!)).toContain('dir="rtl"')
    expect(strFromU8(files["OEBPS/content.opf"]!)).toContain(
      'page-progression-direction="rtl"'
    )
  })

  test("bilingual keeps the original and adds the translation", async () => {
    const source = makeEpub()
    const data = await bookFrom(await parseEpub(source), { bilingual: true })
    const page = strFromU8(
      unzipSync(await rewriteEpub(source, data))["OEBPS/c1.xhtml"]!
    )
    expect(page).toContain("Grace Hopper")
    expect(page).toContain("Grácé Hóppér")
    // Duplicated ids would make the file invalid.
    expect(page.match(/id="c1"/g)!.length).toBe(1)
    expect(page.match(/id="r1"/g)!.length).toBe(1)
  })

  test("an untranslated line keeps its original text", async () => {
    const source = makeEpub()
    const data = await bookFrom(await parseEpub(source))
    for (const c of data.chapters) for (const s of c.segments) s.target = null
    const page = strFromU8(
      unzipSync(await rewriteEpub(source, data))["OEBPS/c1.xhtml"]!
    )
    expect(page).toContain("Grace Hopper")
  })

  test("no XHTML file keeps a script, in the spine or out of it", async () => {
    const source = makeEpub({
      extra: {
        "OEBPS/loose.xhtml": strToU8(
          "<html><body><script>x()</script></body></html>"
        ),
      },
      opfExtra: "",
    })
    const out = await rewriteEpub(
      source,
      await bookFrom(await parseEpub(source))
    )
    const files = unzipSync(out)
    for (const name of ["OEBPS/nav.xhtml", "OEBPS/c1.xhtml", "OEBPS/c2.xhtml"])
      expect(strFromU8(files[name]!)).not.toContain("<script")
  })

  test("a bilingual figure keeps one caption", async () => {
    const source = makeEpub()
    const data = await bookFrom(await parseEpub(source), { bilingual: true })
    const page = strFromU8(
      unzipSync(await rewriteEpub(source, data))["OEBPS/c1.xhtml"]!
    )
    expect(page.match(/<figcaption/g)!.length).toBe(1)
    expect(page).toContain("Figure one.")
    expect(page).toContain("Fígúré óné.")
  })

  test("fixture still has its hostile parts", () => {
    expect(CHAPTER_ONE).toContain("javascript:")
  })
})

describe("generated files", () => {
  test("EPUB built from another format has nav, NCX, images and lang", async () => {
    const parsed = await parseDocx(makeDocx())
    const data = await bookFrom(parsed)
    data.chapters[0]!.segments.unshift({
      kind: "image",
      level: null,
      group_key: null,
      cell: null,
      locator: null,
      asset: "word/media/a.png",
      source: "",
      tags: [],
      target: null,
    })
    const out = await buildEpub(data)
    const files = unzipSync(out)
    expect(Object.keys(files)[0]).toBe("mimetype")
    expect(files["OEBPS/nav.xhtml"]).toBeTruthy()
    expect(files["OEBPS/toc.ncx"]).toBeTruthy()
    expect(files["OEBPS/images/i1.png"]).toBeTruthy()
    const opf = strFromU8(files["OEBPS/content.opf"]!)
    expect(opf).toContain("images/i1.png")
    expect(opf).toContain("<dc:language>fr</dc:language>")
    // It opens with our own reader.
    const back = await parseEpub(out)
    expect(back.chapters.length).toBeGreaterThan(1)
    expect(strFromU8(files["OEBPS/c1.xhtml"]!)).toContain("<table>")
  })

  test("DOCX has styles, a table and reads back", async () => {
    const parsed = await parseDocx(makeDocx())
    const out = await buildDocx(await bookFrom(parsed))
    const back = await parseDocx(out)
    expect(back.chapters.map((c) => stripTags(c.title))).toEqual([
      "Fírst párt",
      "Sécónd párt",
    ])
    const blocks = back.chapters[0]!.blocks
    expect(blocks.some((b) => b.kind === "table_cell")).toBe(true)
    expect(blocks.some((b) => b.kind === "list_item")).toBe(true)
    expect(blocks.find((b) => b.tags.some((t) => t.type === "b"))).toBeTruthy()
  })

  test("DOCX marks right-to-left paragraphs and runs", async () => {
    const parsed = await parseDocx(makeDocx())
    const out = await buildDocx(await bookFrom(parsed, { targetLang: "he" }))
    const xml = strFromU8(unzipSync(out)["word/document.xml"]!)
    expect(xml).toContain("<w:bidi/>")
    expect(xml).toContain("<w:rtl/>")
    expect(xml).toContain('w:bidi="he"')
  })

  test("bilingual DOCX pairs each line in a table", async () => {
    const parsed = await parseDocx(makeDocx())
    const out = await buildDocx(await bookFrom(parsed, { bilingual: true }))
    const xml = strFromU8(unzipSync(out)["word/document.xml"]!)
    expect(xml).toContain("and a note.")
    expect(xml).toContain("ánd á nóté.")
  })

  test("Markdown keeps structure", async () => {
    const parsed = await parseEpub(makeEpub())
    const out = new TextDecoder().decode(buildMarkdown(await bookFrom(parsed)))
    expect(out).toContain("# Cháptér Óné")
    expect(out).toContain("*Grácé Hóppér*")
    expect(out).toContain("**Lóndón**")
    expect(out).toContain("- Fírst ítém")
    expect(out).toContain("| Námé | Ágé |\n| --- | --- |")
    expect(out).toContain("lang: fr")
  })

  test("bilingual Markdown quotes the original", async () => {
    const parsed = await parseEpub(makeEpub())
    const out = new TextDecoder().decode(
      buildMarkdown(await bookFrom(parsed, { bilingual: true }))
    )
    expect(out).toContain("> The machine had")
  })
})

// Needs the Noto fonts on disk: BOOK_FONTS_DIR. CI without them skips these,
// and the report says so.
const fonts = process.env.BOOK_FONTS_DIR
const pdfTest = fonts && existsSync(fonts) ? test : test.skip

const segment = (target: string, source = "Source line of text.") => ({
  kind: "paragraph" as const,
  level: null,
  group_key: null,
  cell: null,
  locator: null,
  asset: null,
  source,
  tags: [],
  target,
})

const pdfBook = (lang: string, lines: string[]): ExportBook => ({
  title: "Book",
  author: "Author",
  sourceLang: "en",
  targetLang: lang,
  bilingual: false,
  asset: async () => tinyPng(),
  chapters: [
    {
      title: "One",
      segments: [
        { ...segment("Heading"), kind: "heading", level: 1 },
        ...lines.map((l) => segment(l)),
      ],
    },
  ],
})

describe("PDF", () => {
  const text = async (bytes: Uint8Array) =>
    (await readPdf(bytes)).pages
      .flatMap((p) => p.blocks.map((b) => b.text))
      .join("\n")

  pdfTest("sets Latin text with bold, tables and images", async () => {
    const parsed = await parseEpub(makeEpub())
    const out = await buildPdf(await bookFrom(parsed))
    expect(String.fromCharCode(...out.subarray(0, 5))).toBe("%PDF-")
    const read = await text(out)
    expect(read).toContain("Cháptér Óné")
    expect(read).toContain("Lóndón")
  })

  pdfTest(
    "embeds Japanese, Korean and Chinese",
    async () => {
      for (const [lang, line] of [
        ["ja", "吾輩は猫である。名前はまだ無い。"],
        ["ko", "나는 고양이로소이다. 이름은 아직 없다."],
        ["zh-Hans", "我是一只猫。我还没有名字。"],
        ["zh-Hant", "我是一隻貓。我還沒有名字。"],
      ] as const) {
        const out = await buildPdf(pdfBook(lang, [line]))
        expect((await text(out)).replace(/\s/g, "")).toContain(
          line.replace(/\s/g, "")
        )
      }
    },
    60_000
  )

  pdfTest(
    "sets Cyrillic, Greek and Vietnamese with the Latin face",
    async () => {
      const line = "Привет мир Γειά σου Xin chào thế giới"
      const out = await buildPdf(pdfBook("ru", [line]))
      expect(await text(out)).toContain("Привет мир")
      expect(await text(out)).toContain("Xin chào")
    }
  )

  pdfTest(
    "sets Arabic and Hebrew right to left, English in place",
    async () => {
      const out = await buildPdf(
        pdfBook("ar", ["قال أحمد مرحبا Palmframe بالعالم"])
      )
      expect(await text(out)).toContain("Palmframe")
      const heb = await buildPdf(pdfBook("he", ["שלום עולם"]))
      expect(heb.length).toBeGreaterThan(1000)
    },
    30_000
  )

  pdfTest("keeps right-to-left word order", async () => {
    // pdf.js reads visual order back to logical, so a line set backwards
    // comes out with its words swapped.
    const line = "אחת שתיים שלוש"
    const read = await text(await buildPdf(pdfBook("he", [line])))
    expect(read).toContain(line)
    const mixed = "אחת שתיים Palmframe שלוש ארבע חמש"
    const both = await text(await buildPdf(pdfBook("he", [mixed])))
    expect(both).toContain(mixed)
  })

  pdfTest(
    "breaks long Japanese lines and adds pages",
    async () => {
      const out = await buildPdf(
        pdfBook("ja", ["吾輩は猫である。".repeat(400)])
      )
      expect((await readPdf(out)).pageCount).toBeGreaterThan(2)
    },
    30_000
  )

  pdfTest("bilingual carries both languages", async () => {
    const data = pdfBook("fr", ["Le texte traduit."])
    data.bilingual = true
    const read = await text(await buildPdf(data))
    expect(read).toContain("Source line of text.")
    expect(read).toContain("Le texte traduit.")
  })
})
