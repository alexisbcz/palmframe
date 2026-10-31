import { strToU8, zipSync, type Zippable } from "fflate"

import { imageSize, sniffKind } from "@/lib/comic-import/sniff"

import { isRtl } from "../model"
import {
  escapeXml,
  inlineRuns,
  layoutItems,
  textOf,
  type ExportBook,
  type ExportSegment,
  type InlineRun,
} from "./common"

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'

const EMU = 9525
const MAX_WIDTH_PX = 560

const lang = (code: string) => (code === "nb" ? "nb-NO" : code)

function runXml(run: InlineRun, code: string, muted: boolean) {
  if (run.br) return "<w:r><w:br/></w:r>"
  if (!run.text) return ""
  const rtl = isRtl(code)
  const props = [
    run.bold && "<w:b/><w:bCs/>",
    run.italic && "<w:i/><w:iCs/>",
    run.strike && "<w:strike/>",
    muted && '<w:color w:val="666666"/>',
    run.underline && '<w:u w:val="single"/>',
    run.sup && '<w:vertAlign w:val="superscript"/>',
    run.sub && '<w:vertAlign w:val="subscript"/>',
    rtl && "<w:rtl/>",
    `<w:lang w:val="${lang(code)}" w:eastAsia="${lang(code)}" w:bidi="${lang(code)}"/>`,
  ]
    .filter(Boolean)
    .join("")
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`
}

function paragraphXml(
  text: string,
  s: ExportSegment,
  code: string,
  muted = false
) {
  const style =
    s.kind === "heading"
      ? `<w:pStyle w:val="Heading${Math.min(s.level ?? 2, 4)}"/>`
      : s.kind === "quote"
        ? '<w:pStyle w:val="Quote"/>'
        : s.kind === "footnote"
          ? '<w:pStyle w:val="Note"/>'
          : ""
  const bidi = isRtl(code) ? "<w:bidi/>" : ""
  const list =
    s.kind === "list_item"
      ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
      : ""
  const runs = inlineRuns(text, s.tags)
    .map((r) => runXml(r, code, muted))
    .join("")
  return `<w:p><w:pPr>${style}${list}${bidi}</w:pPr>${runs}</w:p>`
}

function imageXml(rel: string, id: number, width: number, height: number) {
  const scale = Math.min(1, MAX_WIDTH_PX / width)
  const cx = Math.round(width * scale * EMU)
  const cy = Math.round(height * scale * EMU)
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

const BORDERS =
  '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders>'

function tableXml(rows: string[][], rtl: boolean) {
  const cols = Math.max(...rows.map((r) => r.length))
  const width = Math.floor(9000 / cols)
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${BORDERS}${rtl ? "<w:bidiVisual/>" : ""}</w:tblPr><w:tblGrid>${Array.from(
    { length: cols },
    () => `<w:gridCol w:w="${width}"/>`
  ).join("")}</w:tblGrid>${rows
    .map(
      (row) =>
        `<w:tr>${row
          .map(
            (cell) =>
              `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${cell}</w:tc>`
          )
          .join("")}</w:tr>`
    )
    .join("")}</w:tbl><w:p/>`
}

const FONT =
  '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="Noto Serif CJK JP" w:cs="Noto Naskh Arabic"/>'

const headingStyle = (level: number, size: number) =>
  `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`

const styles = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr>${FONT}<w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${headingStyle(1, 40)}${headingStyle(2, 32)}${headingStyle(3, 27)}${headingStyle(4, 24)}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="480" w:right="480"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
</w:styles>
`

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>
`

export async function buildDocx(book: ExportBook) {
  const zip: Zippable = {}
  const rtl = isRtl(book.targetLang)
  const rels: string[] = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
  ]
  const media = new Map<
    string,
    { rel: string; width: number; height: number }
  >()
  const types = new Set<string>()
  let images = 0
  const body: string[] = []

  const twoSided = (s: ExportSegment) =>
    tableXml(
      [
        [
          paragraphXml(s.source, s, book.sourceLang, true),
          paragraphXml(textOf(s), s, book.targetLang),
        ],
      ],
      false
    )

  for (const [index, chapter] of book.chapters.entries()) {
    if (chapter.segments.every((s) => s.kind === "meta")) continue
    if (index > 0 && body.length)
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    for (const item of layoutItems(chapter.segments)) {
      if (item.type === "table") {
        body.push(
          tableXml(
            item.rows.map((row) =>
              row.map(
                (c) =>
                  (book.bilingual
                    ? paragraphXml(c.source, c, book.sourceLang, true)
                    : "") + paragraphXml(textOf(c), c, book.targetLang)
              )
            ),
            rtl
          )
        )
        continue
      }
      const s = item.segment
      if (s.kind === "rule") {
        body.push(
          '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>* * *</w:t></w:r></w:p>'
        )
        continue
      }
      if (s.kind === "image") {
        const bytes = s.asset ? await book.asset(s.asset) : null
        const kind = bytes ? sniffKind(bytes) : null
        const size = bytes && imageSize(bytes)
        if (
          !bytes ||
          !size ||
          !s.asset ||
          (kind !== "png" && kind !== "jpeg" && kind !== "gif")
        )
          continue
        let entry = media.get(s.asset)
        if (!entry) {
          images++
          const name = `image${images}.${kind}`
          zip[`word/media/${name}`] = [bytes, { level: 0 }]
          types.add(kind)
          entry = { rel: `rIdImg${images}`, ...size }
          rels.push(
            `<Relationship Id="${entry.rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`
          )
          media.set(s.asset, entry)
        }
        body.push(imageXml(entry.rel, images, entry.width, entry.height))
        continue
      }
      if (s.kind === "code") {
        body.push(paragraphXml(s.source, s, book.sourceLang))
        continue
      }
      body.push(
        book.bilingual && s.kind !== "heading"
          ? twoSided(s)
          : paragraphXml(textOf(s), s, book.targetLang)
      )
    }
  }

  const titleSegment = book.chapters
    .flatMap((c) => c.segments)
    .find((s) => s.locator === "meta:title")
  zip["[Content_Types].xml"] =
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${[...types].map((t) => `<Default Extension="${t}" ContentType="image/${t}"/>`).join("\n")}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>
`)
  zip["_rels/.rels"] =
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>
`)
  zip["word/_rels/document.xml.rels"] =
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.join("\n")}
</Relationships>
`)
  zip["word/styles.xml"] = strToU8(styles())
  zip["word/numbering.xml"] = strToU8(NUMBERING)
  zip["docProps/core.xml"] =
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${escapeXml((titleSegment?.target ?? book.title).replace(/<[^>]+>/g, ""))}</dc:title>
<dc:creator>${escapeXml(book.author)}</dc:creator>
<dc:language>${lang(book.targetLang)}</dc:language>
</cp:coreProperties>
`)
  zip["word/document.xml"] =
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1440" w:left="1300" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>
`)
  return zipSync(zip)
}
