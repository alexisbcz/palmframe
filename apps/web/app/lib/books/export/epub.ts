import { cloneNode } from "domhandler"
import { strToU8, zipSync, type Zippable } from "fflate"

import { addedTag, parseInline, type InlineNode } from "../inline"
import { isRtl, languageOf } from "../model"
import { mimeOf, openEpub, readDocument, tocKey } from "../parse/epub"
import { collectUnits, type Unit } from "../parse/units"
import { resolvePath } from "../parse/archive"
import {
  Element,
  Text,
  findAll,
  insertAt,
  localName,
  removeNode,
  replaceChildren,
  serializeXml,
  find,
  parseXml,
  textOf as nodeText,
  type ChildNode,
} from "../xml"
import {
  WRAP,
  escapeXml,
  inlineHtml,
  layoutItems,
  textOf,
  type ExportBook,
  type ExportSegment,
} from "./common"

const langCode = (code: string) => (code === "nb" ? "no" : code)

// Tags back to the very elements they came from, class names and all.
function rebuild(nodes: InlineNode[], inline: Unit["inline"]): ChildNode[] {
  return nodes.flatMap((node): ChildNode[] => {
    if ("text" in node) return [new Text(node.text)]
    const original = inline.get(node.id)
    const added = addedTag(node.id)
    if (!original && added)
      return [
        new Element(WRAP[added.type]!, {}, rebuild(node.children, inline)),
      ]
    if (!original) return rebuild(node.children, inline)
    if (!node.children.length) return [cloneNode(original, true)]
    const copy = cloneNode(original, false)
    replaceChildren(copy, rebuild(node.children, inline))
    return [copy]
  })
}

function setText(unit: Unit, nodes: ChildNode[]) {
  if (unit.element) {
    replaceChildren(unit.element, nodes)
    return
  }
  const at = unit.parent.children.indexOf(unit.nodes[0]!)
  for (const node of unit.nodes) removeNode(node)
  insertAt(unit.parent, Math.max(at, 0), nodes)
}

// Elements a parent can't simply hold twice, or that would break a grid.
const SINGLE_CHILD = new Set([
  "td",
  "th",
  "li",
  "dd",
  "dt",
  "figcaption",
  "caption",
  "summary",
  "legend",
])

// The translation, with the original left standing before it. Where an element
// can't be doubled, the pair shares it.
function addBilingual(unit: Unit, nodes: ChildNode[], lang: string) {
  const attrs = {
    lang: langCode(lang),
    "xml:lang": langCode(lang),
    dir: isRtl(lang) ? "rtl" : "ltr",
  }
  const stripIds = (node: ChildNode) => {
    if (node instanceof Element) {
      delete node.attribs.id
      node.children.forEach(stripIds)
    }
  }
  nodes.forEach(stripIds)
  const element = unit.element
  if (element && !SINGLE_CHILD.has(localName(element))) {
    const copy = cloneNode(element, false)
    delete copy.attribs.id
    Object.assign(copy.attribs, attrs)
    replaceChildren(copy, nodes)
    const parent = element.parent as Element
    insertAt(parent, parent.children.indexOf(element) + 1, [copy])
    return
  }
  const wrapper = new Element("div", attrs)
  replaceChildren(wrapper, nodes)
  if (element) insertAt(element, element.children.length, [wrapper])
  else {
    const at = unit.parent.children.indexOf(unit.nodes.at(-1)!)
    insertAt(unit.parent, at + 1, [wrapper])
  }
}

const setLanguage = (root: Element, lang: string) => {
  root.attribs.lang = langCode(lang)
  root.attribs["xml:lang"] = langCode(lang)
  root.attribs.dir = isRtl(lang) ? "rtl" : "ltr"
}

function replaceMetadata(
  doc: ReturnType<typeof parseXml>,
  name: string,
  value: string
) {
  for (const e of findAll(doc, name))
    if (e.name.toLowerCase() === `dc:${name}`) {
      replaceChildren(e, [new Text(value)])
      return
    }
}

// The original book with its words changed and everything else left alone:
// the same files, the same CSS and images, the same IDs and links. This is the
// route to a valid EPUB, since what was valid stays valid.
export async function rewriteEpub(source: Uint8Array, book: ExportBook) {
  const opened = await openEpub(source)
  const segments = book.chapters.flatMap((c) => c.segments)
  const byLocator = new Map(
    segments.flatMap((s) => (s.locator ? [[s.locator, s] as const] : []))
  )
  const ocr = new Map<string, ExportSegment[]>()
  for (const s of segments) {
    const m = /^ocr:(.+)#\d+$/.exec(s.locator ?? "")
    if (m) ocr.set(m[1]!, [...(ocr.get(m[1]!) ?? []), s])
  }

  const files = new Map<string, Uint8Array>()
  for (const name of opened.archive.names)
    if (name !== "mimetype" && !name.startsWith("META-INF/encryption"))
      files.set(name, await opened.archive.read(name))
  if (opened.archive.has("META-INF/encryption.xml"))
    files.set(
      "META-INF/encryption.xml",
      await opened.archive.read("META-INF/encryption.xml")
    )

  for (const item of opened.spine) {
    const { doc, body } = await readDocument(opened, item)
    if (!body) continue
    const root = find(doc, "html")
    if (root) setLanguage(root, book.targetLang)
    const scanned = ocr.get(item.path)
    if (scanned) {
      const parts = scanned
        .filter((s) => textOf(s))
        .map((s) => {
          const tag = s.kind === "heading" ? `h${s.level ?? 1}` : "p"
          const original = book.bilingual
            ? `<p>${inlineHtml(s.source, s.tags)}</p>`
            : ""
          return `${original}<${tag}>${inlineHtml(textOf(s), s.tags)}</${tag}>`
        })
        .join("")
      const fresh = find(parseXml(`<body>${parts}</body>`), "body")
      if (fresh) replaceChildren(body, fresh.children as ChildNode[])
    } else {
      for (const unit of collectUnits(body, item.path)) {
        const segment = unit.block.locator
          ? byLocator.get(unit.block.locator)
          : null
        if (!segment) continue
        if (segment.kind === "image") {
          if (unit.image && segment.target)
            unit.image.attribs.alt = segment.target
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&amp;/g, "&")
          continue
        }
        if (segment.kind === "rule" || !segment.target?.trim()) continue
        const nodes = rebuild(parseInline(segment.target), unit.inline)
        if (book.bilingual) addBilingual(unit, nodes, book.targetLang)
        else setText(unit, nodes)
      }
    }
    files.set(item.path, strToU8(serializeXml(doc)))
  }

  const toc = new Map<string, string>()
  for (const s of segments) {
    const key = s.locator?.startsWith("toc:") ? s.locator.slice(4) : null
    if (key && s.target?.trim()) toc.set(key, plain(s.target))
  }
  // Every XHTML file, in the spine or not: a nav or a loose page can carry a
  // script just the same.
  for (const item of opened.manifest.values()) {
    if (!/xhtml/i.test(item.type) || !opened.archive.has(item.path)) continue
    if (opened.spine.includes(item) || item === opened.nav) continue
    const { doc } = await readDocument(opened, item)
    files.set(item.path, strToU8(serializeXml(doc)))
  }
  if (opened.nav) {
    const { nav } = opened
    const { doc } = await readDocument(opened, nav)
    for (const a of findAll(doc, "a")) {
      const path = resolvePath(nav.path, a.attribs.href ?? "")
      const fragment = (a.attribs.href ?? "").split("#")[1] ?? ""
      const label = path && toc.get(tocKey({ path, fragment }))
      if (label) replaceChildren(a, [new Text(label)])
    }
    const root = find(doc, "html")
    if (root) setLanguage(root, book.targetLang)
    files.set(nav.path, strToU8(serializeXml(doc)))
  }
  if (opened.ncx && opened.archive.has(opened.ncx.path)) {
    const { ncx } = opened
    const doc = parseXml(await opened.archive.text(ncx.path))
    for (const point of findAll(doc, "navpoint")) {
      const content = point.children.find(
        (c): c is Element => c instanceof Element && localName(c) === "content"
      )
      const text = find(point, "text")
      const src = content?.attribs.src ?? ""
      const path = resolvePath(ncx.path, src)
      const fragment = src.split("#")[1] ?? ""
      const label = path && toc.get(tocKey({ path, fragment }))
      if (label && text) replaceChildren(text, [new Text(label)])
    }
    files.set(ncx.path, strToU8(serializeXml(doc)))
  }

  const opf = opened.opf
  const title = byLocator.get("meta:title")
  replaceMetadata(opf, "language", langCode(book.targetLang))
  if (title?.target?.trim()) replaceMetadata(opf, "title", plain(title.target))
  const spine = find(opf, "spine")
  if (spine)
    spine.attribs["page-progression-direction"] = isRtl(book.targetLang)
      ? "rtl"
      : "ltr"
  for (const item of findAll(opf, "item")) {
    const properties = item.attribs.properties
    if (!properties) continue
    const kept = properties.split(/\s+/).filter((p) => p !== "scripted")
    if (kept.length) item.attribs.properties = kept.join(" ")
    else delete item.attribs.properties
  }
  const modified = findAll(opf, "meta").find(
    (m) => m.attribs.property === "dcterms:modified"
  )
  if (modified)
    replaceChildren(modified, [
      new Text(new Date().toISOString().replace(/\.\d+Z$/, "Z")),
    ])
  files.set(opened.opfPath, strToU8(serializeXml(opf)))
  return packEpub(files)
}

const plain = (s: string) =>
  s
    .replace(/<\/?[gx]\d+\/?>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")

// EPUB wants `mimetype` first and uncompressed, and readers check.
function packEpub(files: Map<string, Uint8Array>) {
  const zip: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
  }
  for (const [name, data] of files)
    zip[name] = [
      data,
      { level: /\.(jpe?g|png|gif|webp|woff2?)$/i.test(name) ? 0 : 6 },
    ]
  return zipSync(zip)
}

const CSS = `body { font-family: serif; line-height: 1.5; margin: 5%; }
h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin: 1.6em 0 0.6em; }
p { margin: 0 0 0.8em; }
img { max-width: 100%; height: auto; }
blockquote { margin: 1em 1.5em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
td, th { border: 1px solid #999; padding: 0.3em 0.5em; text-align: start; vertical-align: top; }
pre { white-space: pre-wrap; font-family: monospace; font-size: 0.9em; }
.source { color: #666; font-size: 0.92em; }
.note { font-size: 0.88em; }
`

const xhtml = (title: string, lang: string, body: string, extra = "") =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}" dir="${isRtl(lang) ? "rtl" : "ltr"}">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/>${extra}</head>
<body>
${body}
</body>
</html>
`

const TAG: Partial<Record<ExportSegment["kind"], string>> = {
  quote: "blockquote",
  verse: "p",
  caption: "p",
  footnote: "p",
}

// Any other format's book as a new EPUB 3, with an NCX for older readers.
export async function buildEpub(book: ExportBook) {
  const lang = langCode(book.targetLang)
  const files = new Map<string, Uint8Array>()
  const images = new Map<string, string>()
  const manifestExtras: string[] = []
  const pages: { id: string; href: string; title: string }[] = []

  const paragraph = (s: ExportSegment) => {
    const tag =
      s.kind === "heading"
        ? `h${Math.min(s.level ?? 2, 6)}`
        : (TAG[s.kind] ?? "p")
    const cls = s.kind === "footnote" ? ' class="note"' : ""
    const inner = (text: string) =>
      tag === "blockquote"
        ? `<p>${inlineHtml(text, s.tags)}</p>`
        : inlineHtml(text, s.tags)
    const original = book.bilingual
      ? `<${tag} class="source" lang="${book.sourceLang}" dir="${isRtl(book.sourceLang) ? "rtl" : "ltr"}">${inner(s.source)}</${tag}>\n`
      : ""
    return `${original}<${tag}${cls}>${inner(textOf(s))}</${tag}>`
  }

  let index = 0
  for (const chapter of book.chapters) {
    if (chapter.segments.every((s) => s.kind === "meta")) continue
    index++
    const parts: string[] = []
    let list: string[] = []
    const flushList = () => {
      if (list.length) parts.push(`<ul>\n${list.join("\n")}\n</ul>`)
      list = []
    }
    for (const item of layoutItems(chapter.segments)) {
      if (item.type === "table") {
        flushList()
        parts.push(
          `<table>\n${item.rows
            .map(
              (row) =>
                `<tr>${row
                  .map((c) => {
                    const tag = c.cell?.header ? "th" : "td"
                    const original = book.bilingual
                      ? `<div class="source">${inlineHtml(c.source, c.tags)}</div>`
                      : ""
                    return `<${tag}>${original}${inlineHtml(textOf(c), c.tags)}</${tag}>`
                  })
                  .join("")}</tr>`
            )
            .join("\n")}\n</table>`
        )
        continue
      }
      const s = item.segment
      if (s.kind === "list_item") {
        list.push(
          `<li>${book.bilingual ? `<div class="source">${inlineHtml(s.source, s.tags)}</div>` : ""}${inlineHtml(textOf(s), s.tags)}</li>`
        )
        continue
      }
      flushList()
      if (s.kind === "rule") parts.push("<hr/>")
      else if (s.kind === "code")
        parts.push(`<pre>${escapeXml(plain(s.source))}</pre>`)
      else if (s.kind === "image") {
        const bytes = s.asset ? await book.asset(s.asset) : null
        if (bytes && s.asset) {
          let name = images.get(s.asset)
          if (!name) {
            const ext = s.asset.split(".").pop()!.toLowerCase()
            name = `images/i${images.size + 1}.${ext}`
            images.set(s.asset, name)
            files.set(`OEBPS/${name}`, bytes)
            manifestExtras.push(
              `<item id="img${images.size}" href="${name}" media-type="${mimeOf(name)}"/>`
            )
          }
          parts.push(
            `<p><img src="${name}" alt="${escapeXml(plain(textOf(s)))}"/></p>`
          )
        }
      } else parts.push(paragraph(s))
    }
    flushList()
    const href = `c${index}.xhtml`
    const title =
      chapter.segments.find((s) => s.kind === "heading")?.target?.trim() ||
      chapter.title ||
      `${index}`
    pages.push({ id: `c${index}`, href, title: plain(title) })
    files.set(
      `OEBPS/${href}`,
      strToU8(xhtml(plain(title), lang, parts.join("\n")))
    )
  }

  const titleSegment = book.chapters
    .flatMap((c) => c.segments)
    .find((s) => s.locator === "meta:title")
  const title = plain(titleSegment?.target?.trim() || book.title || "Untitled")
  const id = `urn:uuid:${crypto.randomUUID()}`
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z")
  files.set("OEBPS/style.css", strToU8(CSS))
  files.set(
    "OEBPS/nav.xhtml",
    strToU8(
      xhtml(
        title,
        lang,
        `<nav epub:type="toc" id="toc"><ol>\n${pages
          .map((p) => `<li><a href="${p.href}">${escapeXml(p.title)}</a></li>`)
          .join("\n")}\n</ol></nav>`
      )
    )
  )
  files.set(
    "OEBPS/toc.ncx",
    strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${id}"/></head>
<docTitle><text>${escapeXml(title)}</text></docTitle>
<navMap>
${pages
  .map(
    (p, i) =>
      `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(p.title)}</text></navLabel><content src="${p.href}"/></navPoint>`
  )
  .join("\n")}
</navMap>
</ncx>
`)
  )
  files.set(
    "OEBPS/content.opf",
    strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${id}</dc:identifier>
<dc:title>${escapeXml(title)}</dc:title>
<dc:language>${lang}</dc:language>
${book.author ? `<dc:creator>${escapeXml(book.author)}</dc:creator>` : ""}
<meta property="dcterms:modified">${now}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${pages.map((p) => `<item id="${p.id}" href="${p.href}" media-type="application/xhtml+xml"/>`).join("\n")}
${manifestExtras.join("\n")}
</manifest>
<spine toc="ncx" page-progression-direction="${isRtl(book.targetLang) ? "rtl" : "ltr"}">
${pages.map((p) => `<itemref idref="${p.id}"/>`).join("\n")}
</spine>
</package>
`)
  )
  files.set(
    "META-INF/container.xml",
    strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`)
  )
  return packEpub(files)
}

export { languageOf, nodeText }
