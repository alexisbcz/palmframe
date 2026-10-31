import { BookParseError } from "../errors"
import { plainBlock } from "../inline"
import type { Block, ParsedAsset, ParsedBook, ScanRecord } from "../model"
import {
  Element,
  childElements,
  find,
  findAll,
  isElement,
  localName,
  parseXml,
  sanitize,
  textOf,
  walk,
  type AnyNode,
} from "../xml"
import { openArchive, resolvePath, type Archive } from "./archive"
import { collectUnits, imageHref } from "./units"

export interface ManifestItem {
  id: string
  href: string
  path: string
  type: string
  properties: string
}

export interface OpenedEpub {
  archive: Archive
  opfPath: string
  opf: ReturnType<typeof parseXml>
  manifest: Map<string, ManifestItem>
  spine: ManifestItem[]
  nav: ManifestItem | null
  ncx: ManifestItem | null
}

const XHTML = /^(application\/xhtml\+xml|text\/html)$/i

// `META-INF/encryption.xml` also lists obfuscated fonts, which are fine. Any
// text under encryption is DRM, and is not ours to read.
async function assertUnencrypted(archive: Archive) {
  if (!archive.has("META-INF/encryption.xml")) return
  const doc = parseXml(await archive.text("META-INF/encryption.xml"))
  for (const ref of findAll(doc, "cipherreference")) {
    const uri = ref.attribs.URI ?? ref.attribs.uri ?? ""
    if (/\.(x?html?|opf|ncx)$/i.test(uri)) throw new BookParseError("encrypted")
  }
}

export async function openEpub(bytes: Uint8Array): Promise<OpenedEpub> {
  const archive = await openArchive(bytes)
  if (!archive.has("META-INF/container.xml"))
    throw new BookParseError("corrupt", "No container.xml.")
  await assertUnencrypted(archive)
  const container = parseXml(await archive.text("META-INF/container.xml"))
  const rootfile = find(container, "rootfile")?.attribs["full-path"]
  const opfPath = rootfile && resolvePath("", rootfile)
  if (!opfPath || !archive.has(opfPath))
    throw new BookParseError("corrupt", "No package document.")
  const opf = parseXml(await archive.text(opfPath))
  const manifest = new Map<string, ManifestItem>()
  for (const item of findAll(opf, "item")) {
    const { id, href } = item.attribs
    if (!id || !href) continue
    const path = resolvePath(opfPath, href)
    if (!path) continue
    manifest.set(id, {
      id,
      href,
      path,
      type: item.attribs["media-type"] ?? "",
      properties: item.attribs.properties ?? "",
    })
  }
  const spineEl = find(opf, "spine")
  const spine = spineEl
    ? childElements(spineEl).flatMap((e) => {
        const item = manifest.get(e.attribs.idref ?? "")
        return localName(e) === "itemref" && item && archive.has(item.path)
          ? [item]
          : []
      })
    : []
  if (!spine.length) throw new BookParseError("corrupt", "Empty spine.")
  const items = [...manifest.values()]
  return {
    archive,
    opfPath,
    opf,
    manifest,
    spine,
    nav:
      items.find((i) => /\bnav\b/.test(i.properties) && archive.has(i.path)) ??
      null,
    ncx:
      manifest.get(spineEl?.attribs.toc ?? "") ??
      items.find(
        (i) => i.type === "application/x-dtbncx+xml" && archive.has(i.path)
      ) ??
      null,
  }
}

const metaText = (opf: AnyNode, name: string) => {
  const metadata = find(opf, "metadata")
  if (!metadata) return ""
  for (const e of walk(metadata))
    if (e.name.toLowerCase() === `dc:${name}` || localName(e) === name)
      return textOf(e).replace(/\s+/g, " ").trim()
  return ""
}

export interface TocEntry {
  label: string
  path: string
  fragment: string
}

function tocEntry(base: string, label: string, href: string): TocEntry | null {
  const path = resolvePath(base, href)
  const clean = label.replace(/\s+/g, " ").trim()
  return path && clean
    ? { label: clean, path, fragment: href.split("#")[1] ?? "" }
    : null
}

// The contents, from the EPUB 3 nav document or the older NCX.
export async function readToc(book: OpenedEpub): Promise<TocEntry[]> {
  if (book.nav) {
    const doc = parseXml(await book.archive.text(book.nav.path))
    const navs = findAll(doc, "nav")
    const toc =
      navs.find((n) => /\btoc\b/.test(n.attribs["epub:type"] ?? "")) ?? navs[0]
    if (toc) {
      const found = findAll(toc, "a").flatMap((a) => {
        const entry = tocEntry(book.nav!.path, textOf(a), a.attribs.href ?? "")
        return entry ? [entry] : []
      })
      if (found.length) return found
    }
  }
  if (book.ncx && book.archive.has(book.ncx.path)) {
    const doc = parseXml(await book.archive.text(book.ncx.path))
    return findAll(doc, "navpoint").flatMap((point) => {
      const label = find(point, "text")
      const src = childElements(point).find((c) => localName(c) === "content")
      const entry =
        label &&
        src &&
        tocEntry(book.ncx!.path, textOf(label), src.attribs.src ?? "")
      return entry ? [entry] : []
    })
  }
  return []
}

export const tocKey = (e: { path: string; fragment: string }) =>
  e.fragment ? `${e.path}#${e.fragment}` : e.path

const isCover = (item: ManifestItem, opf: AnyNode) => {
  const declared = findAll(opf, "meta").find((m) => m.attribs.name === "cover")
    ?.attribs.content
  return (
    /\bcover-image\b/.test(item.properties) ||
    item.id === declared ||
    /(^|[/_-])cover[^/]*$/i.test(item.path)
  )
}

export async function readDocument(book: OpenedEpub, item: ManifestItem) {
  const doc = parseXml(await book.archive.text(item.path))
  sanitize(doc)
  const body = find(doc, "body")
  return { doc, body }
}

export async function parseEpub(bytes: Uint8Array): Promise<ParsedBook> {
  const book = await openEpub(bytes)
  const toc = await readToc(book)
  const titles = new Map<string, string>()
  for (const entry of toc)
    if (!titles.has(entry.path)) titles.set(entry.path, entry.label)

  const assets = new Map<string, ParsedAsset>()
  const chapters: ParsedBook["chapters"] = []
  const imageOnly: { chapter: number; image: string; item: ManifestItem }[] = []
  const warnings: string[] = []

  for (const item of book.spine) {
    if (!XHTML.test(item.type)) continue
    const { body } = await readDocument(book, item)
    if (!body) continue
    const blocks: Block[] = collectUnits(body, item.path).map((u) => {
      const block = { ...u.block }
      if (block.asset) {
        const path = resolvePath(item.path, block.asset)
        if (path && book.archive.has(path)) {
          assets.set(path, {
            id: path,
            name: path.split("/").pop()!,
            mime: mimeOf(path),
          })
          block.asset = path
        } else delete block.asset
      }
      return block
    })
    const words = blocks.filter((b) => b.kind !== "image" && b.text).length
    const pictures = blocks.filter((b) => b.kind === "image" && b.asset)
    if (
      !words &&
      pictures.length === 1 &&
      !isCover(item, book.opf) &&
      !/\.svg$/i.test(pictures[0]!.asset!)
    )
      imageOnly.push({
        chapter: chapters.length,
        image: pictures[0]!.asset!,
        item,
      })
    if (!blocks.length) continue
    const heading = blocks.find((b) => b.kind === "heading")
    chapters.push({
      title:
        titles.get(item.path) ?? (heading ? plainOf(heading.text) : "") ?? "",
      href: item.path,
      blocks,
    })
  }

  // A few full-page plates are illustrations. A book of them is a scan.
  const scanned =
    imageOnly.length >= Math.max(3, Math.ceil(book.spine.length * 0.3))
  const scans: ScanRecord[] = scanned
    ? imageOnly.map((p, i) => ({
        number: i + 1,
        href: p.item.path,
        image: p.image,
        chapter: p.chapter,
      }))
    : []

  const title = metaText(book.opf, "title")
  const front: Block[] = [
    ...(title ? [plainBlock("meta", title, { locator: "meta:title" })] : []),
    ...toc.map((entry) =>
      plainBlock("meta", entry.label, { locator: `toc:${tocKey(entry)}` })
    ),
  ]
  if (front.length) chapters.unshift({ title: "", blocks: front })
  if (scanned) for (const scan of scans) if (front.length) scan.chapter! += 1

  return {
    meta: {
      title,
      author: metaText(book.opf, "creator"),
      language: metaText(book.opf, "language") || null,
    },
    chapters,
    assets: [...assets.values()],
    scans,
    warnings,
  }
}

const plainOf = (s: string) =>
  s
    .replace(/<\/?[gx]\d+\/?>/g, "")
    .replace(/\s+/g, " ")
    .trim()

export function mimeOf(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      css: "text/css",
    }[ext ?? ""] ?? "application/octet-stream"
  )
}

export { Element, imageHref, isElement }
