import { strToU8, zipSync, type Zippable } from "fflate"
import PDFDocument from "pdfkit"

import { encodeGrayPng } from "./png"

// Real files for tests, built here rather than checked in: a broken parser
// should fail on an actual EPUB, DOCX or PDF, not on a stubbed shape.
export const tinyPng = () => {
  const gray = new Uint8Array(32 * 32).fill(200)
  return encodeGrayPng(gray, 32, 32)
}

const page = (
  title: string,
  body: string
) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><title>${title}</title><link rel="stylesheet" type="text/css" href="style.css"/><script>alert(1)</script></head>
<body>${body}</body>
</html>
`

export const CHAPTER_ONE = `
<h1 id="c1">Chapter One</h1>
<p class="first" onclick="steal()">Ada met <em class="name">Grace Hopper</em> in <strong>London</strong> in 1843.<a href="#n1" epub:type="noteref" id="r1">1</a></p>
<p>The machine had 1,024 wheels &amp; levers.</p>
<p>The machine had 1,024 wheels &amp; levers.</p>
<ul><li>First item</li><li>Second <b>item</b></li></ul>
<table><tr><th>Name</th><th>Age</th></tr><tr><td>Ada</td><td>36</td></tr></table>
<blockquote><p>A quoted line of text.</p></blockquote>
<figure><img src="images/plate.png" alt="A plate of gears"/><figcaption>Figure one.</figcaption></figure>
<a href="javascript:alert(1)">bad link</a>
<aside epub:type="footnote" id="n1"><p>A note about <i>the</i> date.</p></aside>
`

export const CHAPTER_TWO = `
<h1>Chapter Two</h1>
<p>Loose text<br/>after a break.</p>
<div>Text directly in a div, then <span class="x">a span</span>.</div>
<pre>const code = 1</pre>
<hr/>
<p>Ada went home.</p>
`

interface EpubOptions {
  chapters?: string[]
  extra?: Zippable
  opfExtra?: string
  nav?: boolean
  dropMimetype?: boolean
}

export function makeEpub(options: EpubOptions = {}) {
  const chapters = options.chapters ?? [CHAPTER_ONE, CHAPTER_TWO]
  const docs: Zippable = {}
  chapters.forEach((body, i) => {
    docs[`OEBPS/c${i + 1}.xhtml`] = strToU8(page(`C${i + 1}`, body))
  })
  const manifest = chapters
    .map(
      (_, i) =>
        `<item id="c${i + 1}" href="c${i + 1}.xhtml" media-type="application/xhtml+xml"${i === 0 ? ' properties="scripted"' : ""}/>`
    )
    .join("\n")
  const spine = chapters
    .map((_, i) => `<itemref idref="c${i + 1}"/>`)
    .join("\n")
  const nav = chapters
    .map((_, i) => `<li><a href="c${i + 1}.xhtml">Chapter ${i + 1}</a></li>`)
    .join("")
  const zip: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    "OEBPS/content.opf": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:12345678-1234-1234-1234-123456789012</dc:identifier>
<dc:title>The Analytical Engine</dc:title>
<dc:creator>A. Author</dc:creator>
<dc:language>en</dc:language>
<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="plate" href="images/plate.png" media-type="image/png"/>
${manifest}
</manifest>
<spine toc="ncx">
${spine}
</spine>
${options.opfExtra ?? ""}
</package>`),
    "OEBPS/nav.xhtml": strToU8(
      page("Contents", `<nav epub:type="toc" id="toc"><ol>${nav}</ol></nav>`)
    ),
    "OEBPS/toc.ncx": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:uuid:12345678-1234-1234-1234-123456789012"/></head>
<docTitle><text>The Analytical Engine</text></docTitle>
<navMap>${chapters
      .map(
        (_, i) =>
          `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>Chapter ${i + 1}</text></navLabel><content src="c${i + 1}.xhtml"/></navPoint>`
      )
      .join("")}</navMap>
</ncx>`),
    "OEBPS/style.css": strToU8("p { margin: 0; }"),
    "OEBPS/images/plate.png": tinyPng(),
    ...docs,
    ...options.extra,
  }
  if (options.dropMimetype) delete zip.mimetype
  return zipSync(zip)
}

export function makeDocx() {
  const w =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(`<?xml version="1.0"?>
<w:document ${w}><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>First part</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> words</w:t></w:r><w:r><w:t xml:space="preserve"> and a note.</w:t></w:r><w:r><w:footnoteReference w:id="2"/></w:r></w:p>
<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>A list item</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Second part</w:t></w:r></w:p>
<w:p><w:hyperlink r:id="rId9"><w:r><w:t>A link</w:t></w:r></w:hyperlink></w:p>
</w:body></w:document>`),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="hyperlink" Target="https://example.com/" TargetMode="External"/>
</Relationships>`),
    "word/styles.xml": strToU8(`<?xml version="1.0"?>
<w:styles ${w}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`),
    "word/footnotes.xml": strToU8(`<?xml version="1.0"?>
<w:footnotes ${w}><w:footnote w:type="separator" w:id="0"><w:p/></w:footnote><w:footnote w:id="2"><w:p><w:r><w:t>The note text.</w:t></w:r></w:p></w:footnote></w:footnotes>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="c" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A Word Book</dc:title><dc:creator>W. Writer</dc:creator></cp:coreProperties>`),
  })
}

const SENTENCE =
  "The quick brown fox jumps over the lazy dog while the sun goes down behind the hills. "

export interface PdfOptions {
  scannedPages?: number
  textPages?: number
  columns?: boolean
  image?: Uint8Array
}

// Typeset pages with a running head, a heading and a footnote, optionally
// followed by image-only pages, or set in two columns.
export function makePdf(options: PdfOptions = {}) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    info: { Title: "Paged" },
  })
  const chunks: Buffer[] = []
  doc.on("data", (b: Buffer) => chunks.push(b))
  const done = new Promise<Uint8Array>((resolve) =>
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))))
  )
  const pages = options.textPages ?? 3
  for (let i = 0; i < pages; i++) {
    doc.addPage({ size: "A4", margin: 72 })
    doc.font("Times-Roman").fontSize(9).text("The Running Head", 72, 40, {
      lineBreak: false,
    })
    doc.y = 90
    doc.x = 72
    if (i === 0) {
      doc.fontSize(22).text("Chapter One", 72, 90)
      doc.moveDown()
    }
    if (options.columns) {
      doc.fontSize(11).text(`Left column ${SENTENCE.repeat(6)}`, 72, 200, {
        width: 200,
      })
      doc.text(`Right column ${SENTENCE.repeat(6)}`, 330, 200, { width: 200 })
    } else {
      doc.fontSize(11)
      doc.text(SENTENCE.repeat(5), 72)
      doc.moveDown()
      doc.text(`Page ${i + 1} second paragraph. ${SENTENCE.repeat(3)}`, 72)
    }
    doc.fontSize(7.5).text("1 A small footnote at the foot.", 72, 740, {
      lineBreak: false,
    })
    doc.fontSize(9).text(String(i + 1), 290, 780, { lineBreak: false })
  }
  const image =
    options.image ??
    encodeGrayPng(new Uint8Array(900 * 1200).fill(235), 900, 1200)
  for (let i = 0; i < (options.scannedPages ?? 0); i++) {
    doc.addPage({ size: "A4", margin: 0 })
    doc.image(Buffer.from(image), 0, 0, {
      width: doc.page.width,
      height: doc.page.height,
    })
  }
  doc.end()
  return done
}
