import { strToU8, zipSync, type Zippable } from "fflate"

import { CLOTHS, type Manuscript } from "../model"
import { escapeXml, partLabel, titled } from "./common"
import { BOOK_CSS, partHtml } from "./text"

const page = (m: Manuscript, title: string, body: string, extra = "") =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${m.language}" lang="${m.language}"${extra}>
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="book.css"/></head>
<body>${body}</body>
</html>
`

// A cloth cover with the title stamped on it, since nobody has art yet.
function coverSvg(m: Manuscript) {
  const cloth = CLOTHS[m.cloth]
  const ink = m.cloth === "bone" ? "#2a2118" : "#e6c98a"
  const words = m.title.split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const w of words) {
    if (line && (line + w).length > 16) {
      lines.push(line)
      line = w
    } else line = line ? `${line} ${w}` : w
  }
  if (line) lines.push(line)
  const title = lines
    .map(
      (l, i) =>
        `<text x="800" y="${820 + (i - lines.length / 2) * 170}" text-anchor="middle" font-family="Georgia, serif" font-size="130" fill="${ink}">${escapeXml(l)}</text>`
    )
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 2400"><rect width="1600" height="2400" fill="${cloth}"/><rect x="90" y="90" width="1420" height="2220" fill="none" stroke="${ink}" stroke-width="6"/>${title}<text x="800" y="2090" text-anchor="middle" font-family="Georgia, serif" font-size="70" fill="${ink}">${escapeXml(m.author)}</text></svg>`
}

export function toEpub(
  source: Manuscript,
  id = "urn:uuid:00000000-0000-4000-8000-000000000000"
) {
  const m = titled(source)
  const files = m.parts.map((p, i) => {
    const label = partLabel(m, p, i)
    return {
      name: `part-${i + 1}.xhtml`,
      label: label || m.title,
      xhtml: page(
        m,
        label || m.title,
        `<section epub:type="chapter">${label ? `<h1>${escapeXml(label)}</h1>` : ""}\n${partHtml(m, i)}\n</section>`
      ),
    }
  })
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z")
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="${m.language}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">${escapeXml(id)}</dc:identifier>
<dc:title>${escapeXml(m.title || "Untitled")}</dc:title>
<dc:language>${m.language}</dc:language>
${m.author ? `<dc:creator>${escapeXml(m.author)}</dc:creator>` : ""}
<meta property="dcterms:modified">${modified}</meta>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="book.css" media-type="text/css"/>
<item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml" properties="svg"/>
<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${files.map((f, i) => `<item id="p${i + 1}" href="${f.name}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine toc="ncx">
<itemref idref="cover"/>
<itemref idref="title"/>
${files.map((_, i) => `<itemref idref="p${i + 1}"/>`).join("\n")}
</spine>
</package>
`
  const nav = page(
    m,
    "Contents",
    `<nav epub:type="toc" id="toc"><h1>${escapeXml(m.title || "Contents")}</h1><ol>${files
      .map((f) => `<li><a href="${f.name}">${escapeXml(f.label)}</a></li>`)
      .join("")}</ol></nav>`
  )
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escapeXml(id)}"/></head>
<docTitle><text>${escapeXml(m.title || "Untitled")}</text></docTitle>
<navMap>${files
    .map(
      (f, i) =>
        `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(f.label)}</text></navLabel><content src="${f.name}"/></navPoint>`
    )
    .join("")}</navMap>
</ncx>
`
  const zip: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`),
    "OEBPS/book.opf": strToU8(opf),
    "OEBPS/nav.xhtml": strToU8(nav),
    "OEBPS/toc.ncx": strToU8(ncx),
    "OEBPS/book.css": strToU8(BOOK_CSS),
    "OEBPS/cover.svg": strToU8(coverSvg(m)),
    "OEBPS/cover.xhtml": strToU8(
      page(
        m,
        m.title || "Cover",
        `<div style="text-align:center"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1600 2400" height="100%" width="100%"><image width="1600" height="2400" xlink:href="cover.svg"/></svg></div>`
      )
    ),
    "OEBPS/title.xhtml": strToU8(
      page(
        m,
        m.title || "Title",
        `<div class="title"><h1>${escapeXml(m.title)}</h1>${m.subtitle ? `<p><em>${escapeXml(m.subtitle)}</em></p>` : ""}<p>${escapeXml(m.author)}</p></div>`
      )
    ),
  }
  for (const f of files) zip[`OEBPS/${f.name}`] = strToU8(f.xhtml)
  return zipSync(zip)
}
