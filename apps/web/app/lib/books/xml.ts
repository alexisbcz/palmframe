import {
  CDATA,
  Comment,
  Document,
  Element,
  ProcessingInstruction,
  Text,
  type AnyNode,
  type ChildNode,
} from "domhandler"
import { parseDocument } from "htmlparser2"

import { BookParseError } from "./errors"
import { MAX_PART_BYTES, MAX_XML_DEPTH } from "./limits"

// htmlparser2 never reads a DTD, so entities a book declares aren't expanded
// and nothing is fetched. A document that declares them is refused anyway:
// nothing legitimate needs one, and a downstream reader of a rewritten file
// might be less careful. The stock XHTML doctypes pass.
const DOCTYPE = /<!DOCTYPE[^>[]*(\[|>)/gi
const DECLARES = /<!(ENTITY|ELEMENT|ATTLIST|NOTATION)\b/i
const STOCK_DOCTYPE =
  /^<!DOCTYPE\s+(html|ncx|package)(\s+PUBLIC\s+"[^"<>]*"(\s+"https?:\/\/[^"<>]*")?)?(\s+SYSTEM\s+"about:legacy-compat")?\s*>$/i

export function assertSafeXml(xml: string) {
  if (DECLARES.test(xml))
    throw new BookParseError("unsafe_xml", "The file declares XML entities.")
  for (const m of xml.matchAll(DOCTYPE))
    if (m[1] === "[" || !STOCK_DOCTYPE.test(m[0]))
      throw new BookParseError("unsafe_xml", "Unexpected DOCTYPE.")
}

function assertDepth(root: AnyNode) {
  const stack: [AnyNode, number][] = [[root, 0]]
  while (stack.length) {
    const [node, depth] = stack.pop()!
    if (depth > MAX_XML_DEPTH) throw new BookParseError("corrupt", "Too deep.")
    if (node instanceof Element || node instanceof Document)
      for (const child of node.children) stack.push([child, depth + 1])
  }
}

export const decodeText = (bytes: Uint8Array) => {
  if (bytes.length > MAX_PART_BYTES) throw new BookParseError("too_large")
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

export function parseXml(source: string) {
  assertSafeXml(source)
  const doc = parseDocument(source, {
    xmlMode: true,
    decodeEntities: true,
    recognizeSelfClosing: true,
  })
  assertDepth(doc)
  return doc
}

// Plain HTML, with the forgiving rules browsers use: `<br>`, unclosed `<p>`.
export function parseHtml(source: string) {
  assertSafeXml(source)
  const doc = parseDocument(source, {
    xmlMode: false,
    decodeEntities: true,
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
  })
  assertDepth(doc)
  return doc
}

const escapeXmlText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const escapeAttr = (s: string) => escapeXmlText(s).replace(/"/g, "&quot;")

// Written out by hand: dom-serializer turns every non-ASCII character into a
// numeric reference, doubling a Japanese book, and loses the `?>` of the XML
// declaration, which leaves a file nothing can open.
export function serializeXml(node: AnyNode): string {
  if (node instanceof Document) return node.children.map(serializeXml).join("")
  if (node instanceof Text) return escapeXmlText(node.data)
  if (node instanceof CDATA)
    return `<![CDATA[${node.children.map((c) => (c as Text).data).join("")}]]>`
  if (node instanceof Comment) return `<!--${node.data}-->`
  if (node instanceof ProcessingInstruction)
    return node.name.toLowerCase() === "?xml"
      ? '<?xml version="1.0" encoding="UTF-8"?>'
      : node.data.startsWith("?")
        ? `<${node.data.replace(/\?$/, "")}?>`
        : `<${node.data}>`
  if (node instanceof Element) {
    const attrs = Object.entries(node.attribs)
      .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
      .join("")
    return node.children.length
      ? `<${node.name}${attrs}>${node.children.map(serializeXml).join("")}</${node.name}>`
      : `<${node.name}${attrs}/>`
  }
  return ""
}

// The name without its namespace prefix: `dc:title`, `opf:meta` and `title`
// are the same element to us.
export const localName = (e: Element) =>
  (e.name.includes(":") ? e.name.split(":").pop()! : e.name).toLowerCase()

export const isElement = (n: AnyNode | null | undefined): n is Element =>
  n instanceof Element

export const isText = (n: AnyNode | null | undefined): n is Text =>
  n instanceof Text

export function* walk(root: AnyNode): Generator<Element> {
  const stack: AnyNode[] = [root]
  while (stack.length) {
    const node = stack.pop()!
    if (node instanceof Element) yield node
    if (node instanceof Element || node instanceof Document)
      for (let i = node.children.length - 1; i >= 0; i--)
        stack.push(node.children[i]!)
  }
}

export const find = (root: AnyNode, name: string) => {
  for (const e of walk(root)) if (localName(e) === name) return e
  return null
}

export const findAll = (root: AnyNode, name: string) =>
  [...walk(root)].filter((e) => localName(e) === name)

export function textOf(node: AnyNode): string {
  if (node instanceof Text) return node.data
  if (node instanceof Element || node instanceof Document)
    return node.children.map(textOf).join("")
  return ""
}

export const childElements = (e: Element) => e.children.filter(isElement)

const UNSAFE_ELEMENTS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "base",
])

const SAFE_URL = /^(?:https?:|mailto:|#|[^:]*$)/i

// What a book may not carry into anything we hand back. Pages render as text
// in the editor, so this is for the exported file: the people who open it
// shouldn't be running code a stranger put in a book.
export function sanitize(root: Document | Element) {
  for (const e of [...walk(root)]) {
    const name = localName(e)
    if (UNSAFE_ELEMENTS.has(name)) {
      removeNode(e)
      continue
    }
    for (const key of Object.keys(e.attribs)) {
      const lower = key.toLowerCase()
      const value = e.attribs[key]!.replace(/[\s\0]/g, "")
      if (
        lower.startsWith("on") ||
        (/^(href|src|xlink:href|action|formaction|poster|data)$/.test(lower) &&
          !SAFE_URL.test(value))
      )
        delete e.attribs[key]
    }
    if (name === "meta" && /refresh/i.test(e.attribs["http-equiv"] ?? ""))
      removeNode(e)
  }
}

export function removeNode(node: ChildNode) {
  const siblings = (node.parent as Element | Document | null)?.children
  if (!siblings) return
  const at = siblings.indexOf(node)
  if (at < 0) return
  siblings.splice(at, 1)
  const prev = node.prev
  const next = node.next
  if (prev) prev.next = next
  if (next) next.prev = prev
  node.parent = node.prev = node.next = null
}

export function replaceChildren(parent: Element, nodes: ChildNode[]) {
  parent.children = nodes
  nodes.forEach((n, i) => {
    n.parent = parent
    n.prev = nodes[i - 1] ?? null
    n.next = nodes[i + 1] ?? null
  })
}

export function insertAt(
  parent: Element | Document,
  index: number,
  nodes: ChildNode[]
) {
  parent.children.splice(index, 0, ...nodes)
  parent.children.forEach((n, i) => {
    n.parent = parent
    n.prev = parent.children[i - 1] ?? null
    n.next = parent.children[i + 1] ?? null
  })
}

export { Document, Element, Text }
export type { AnyNode, ChildNode }
