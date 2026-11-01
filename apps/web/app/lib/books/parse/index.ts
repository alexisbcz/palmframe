import { sniffKind } from "@/lib/comic-import/sniff"

import { BookParseError } from "../errors"
import {
  MAX_CHAPTERS,
  MAX_SEGMENT_CHARS,
  MAX_SEGMENTS,
  MAX_WORDS,
} from "../limits"
import { billableWords, type BookFormat, type ParsedBook } from "../model"
import { stripTags } from "../inline"
import { decodeText } from "../xml"
import { openArchive } from "./archive"
import { parseDocx } from "./docx"
import { parseEpub } from "./epub"
import { parseHtmlBook, parseMarkdown, parseText } from "./text"

const EXTENSIONS: Record<string, BookFormat> = {
  epub: "epub",
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  xhtml: "html",
}

export const formatFromName = (name: string) =>
  EXTENSIONS[name.split(".").pop()?.toLowerCase() ?? ""] ?? null

const looksBinary = (b: Uint8Array) => {
  const head = b.subarray(0, 4096)
  if (head[0] === 0xff || head[0] === 0xfe) return false
  return head.includes(0)
}

// By content where it can tell: the file's name is only a hint. A renamed
// `.exe` doesn't become a book by ending in `.txt`.
export async function detectFormat(bytes: Uint8Array, name: string) {
  const kind = sniffKind(bytes)
  if (kind === "pdf") return "pdf" as const
  if (kind === "zip") {
    const archive = await openArchive(bytes)
    if (archive.names.includes("META-INF/container.xml")) return "epub" as const
    if (archive.has("word/document.xml")) return "docx" as const
    return null
  }
  if (kind || looksBinary(bytes)) return null
  const hinted = formatFromName(name)
  if (hinted && hinted !== "epub" && hinted !== "pdf" && hinted !== "docx")
    return hinted
  return /^\s*(<!doctype html|<html)/i.test(
    new TextDecoder().decode(bytes.subarray(0, 256))
  )
    ? ("html" as const)
    : ("txt" as const)
}

// Every format but PDF, which has pages and goes through parse/layout.
export async function parseBook(
  bytes: Uint8Array,
  format: Exclude<BookFormat, "pdf">
): Promise<ParsedBook> {
  const book =
    format === "epub"
      ? await parseEpub(bytes)
      : format === "docx"
        ? await parseDocx(bytes)
        : format === "md"
          ? parseMarkdown(decodeText(bytes))
          : format === "html"
            ? parseHtmlBook(decodeText(bytes))
            : parseText(decodeText(bytes))
  return assertReadable(book)
}

export function assertReadable<T extends ParsedBook>(book: T): T {
  let segments = 0
  let words = 0
  for (const chapter of book.chapters)
    for (const block of chapter.blocks) {
      segments++
      if (block.text.length > MAX_SEGMENT_CHARS) splitLong(chapter, block)
      words += billableWords(stripTags(block.text))
    }
  if (
    segments > MAX_SEGMENTS ||
    words > MAX_WORDS ||
    book.chapters.length > MAX_CHAPTERS
  )
    throw new BookParseError("too_long")
  if (!words && !book.scans.length) throw new BookParseError("empty")
  return book
}

// A "paragraph" past 20,000 characters is a badly extracted page. It gets
// split at sentences, so no single segment outgrows a request.
function splitLong(
  chapter: ParsedBook["chapters"][number],
  block: ParsedBook["chapters"][number]["blocks"][number]
) {
  if (block.tags.length) block.tags = []
  const plain = stripTags(block.text)
  const parts: string[] = []
  let rest = plain
  while (rest.length > MAX_SEGMENT_CHARS) {
    const window = rest.slice(0, MAX_SEGMENT_CHARS)
    const cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("。"),
      window.lastIndexOf(" ")
    )
    const at = cut > 1000 ? cut + 1 : MAX_SEGMENT_CHARS
    parts.push(rest.slice(0, at).trim())
    rest = rest.slice(at)
  }
  if (rest.trim()) parts.push(rest.trim())
  const at = chapter.blocks.indexOf(block)
  const encode = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  chapter.blocks.splice(
    at,
    1,
    ...parts.map((text, i) => ({
      ...block,
      text: encode(text),
      locator: block.locator && `${block.locator}.${i}`,
    }))
  )
}
