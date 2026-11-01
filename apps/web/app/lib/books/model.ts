import { z } from "zod"

// Book translation, shared by server and UI. A book is chapters of segments:
// one segment is one paragraph, heading, footnote or table cell, and is the
// unit of translation, review, locking and billing.

export const BOOK_FORMATS = [
  "epub",
  "pdf",
  "docx",
  "txt",
  "md",
  "html",
] as const
export type BookFormat = (typeof BOOK_FORMATS)[number]

export const EXPORT_FORMATS = ["epub", "pdf", "docx", "md"] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const BOOK_STATUSES = [
  "uploading",
  "parsing",
  "needs_ocr",
  "ocr",
  "setup",
  "glossary",
  "translating",
  "review",
  "failed",
] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]

export const JOB_KINDS = [
  "ingest",
  "ocr",
  "extract",
  "translate",
  "qa",
  "export",
] as const
export type JobKind = (typeof JOB_KINDS)[number]

export type JobStatus =
  "unpaid" | "queued" | "running" | "succeeded" | "failed" | "cancelled"

export const SEGMENT_STATUSES = [
  "pending",
  "machine",
  "reviewed",
  "locked",
  // Nothing to translate: an image without alt text, code, a row of numbers.
  "fixed",
  // Gave up after repeated tries. Never billed, and flagged by the checks.
  "failed",
] as const
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number]

export const SEGMENT_KINDS = [
  "heading",
  "paragraph",
  "quote",
  "list_item",
  "table_cell",
  "footnote",
  "caption",
  "verse",
  "code",
  "image",
  "rule",
  // The book's title and contents entries, kept in the front-matter chapter.
  "meta",
] as const
export type SegmentKind = (typeof SEGMENT_KINDS)[number]

export type InlineType =
  | "b"
  | "i"
  | "u"
  | "s"
  | "sup"
  | "sub"
  | "code"
  | "a"
  | "noteref"
  | "span"
  | "br"
  | "img"

// What `<g1>` or `<x2/>` stands for in a segment's text.
export interface InlineTag {
  id: string
  type: InlineType
  href?: string
}

// What every parser produces. `text` carries inline tags; see inline.ts.
export interface Block {
  kind: SegmentKind
  text: string
  tags: InlineTag[]
  level?: number
  // Keeps a table, a list or a footnote's parts together when chunking.
  group?: string
  cell?: { row: number; col: number; header?: boolean }
  // Where the block came from, so the original file can be rewritten.
  locator?: string
  page?: number
  asset?: string
  ocr?: number
}

export interface ParsedChapter {
  title: string
  href?: string
  blocks: Block[]
}

export interface ParsedMeta {
  title: string
  author: string
  language: string | null
}

export interface ParsedAsset {
  id: string
  name: string
  mime: string
}

// A page only a vision model can read.
export interface ScanRecord {
  number: number
  // The spine file of an image-only EPUB page; absent for a PDF page.
  href?: string
  // The image inside the EPUB; PDF pages are extracted separately.
  image?: string
  chapter?: number
}

export interface ParsedBook {
  meta: ParsedMeta
  chapters: ParsedChapter[]
  assets: ParsedAsset[]
  scans: ScanRecord[]
  warnings: string[]
}

export interface StyleGuide {
  register: "neutral" | "formal" | "literary" | "conversational" | "academic"
  audience: string
  dialect: string
  idioms: "adapt" | "keep"
  notes: string
}

export const DEFAULT_STYLE: StyleGuide = {
  register: "neutral",
  audience: "",
  dialect: "",
  idioms: "adapt",
  notes: "",
}

export const styleSchema = z.object({
  register: z.enum([
    "neutral",
    "formal",
    "literary",
    "conversational",
    "academic",
  ]),
  audience: z.string().trim().max(200),
  dialect: z.string().trim().max(80),
  idioms: z.enum(["adapt", "keep"]),
  notes: z.string().trim().max(2000),
})

// What the extraction pass learns, and the translator is told every time.
export interface BookBible {
  summary: string
  tone: string
  characters: { name: string; notes: string }[]
}

export const EMPTY_BIBLE: BookBible = { summary: "", tone: "", characters: [] }

export const TERM_KINDS = ["name", "place", "term", "title", "phrase"] as const
export type TermKind = (typeof TERM_KINDS)[number]

export const TERM_STATES = ["suggested", "approved", "rejected"] as const
export type TermState = (typeof TERM_STATES)[number]

export interface Term {
  id: string
  source: string
  target: string
  kind: TermKind
  dnt: boolean
  note: string
  case_sensitive: boolean
  state: TermState
}

export const ISSUE_KINDS = [
  "missing",
  "untranslated",
  "numbers",
  "names",
  "glossary",
  "formatting",
  "length",
  "back_check",
] as const
export type IssueKind = (typeof ISSUE_KINDS)[number]

export type Severity = "error" | "warning"

export interface Language {
  code: string
  name: string
  native: string
  rtl?: boolean
  // Read in characters rather than words, for length and word counts.
  cjk?: boolean
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "nb", name: "Norwegian", native: "Norsk" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "ja", name: "Japanese", native: "日本語", cjk: true },
  { code: "ko", name: "Korean", native: "한국어", cjk: true },
  {
    code: "zh-Hans",
    name: "Chinese (Simplified)",
    native: "简体中文",
    cjk: true,
  },
  {
    code: "zh-Hant",
    name: "Chinese (Traditional)",
    native: "繁體中文",
    cjk: true,
  },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "he", name: "Hebrew", native: "עברית", rtl: true },
  { code: "fa", name: "Persian", native: "فارسی", rtl: true },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true },
]

export const languageOf = (code: string | null | undefined) =>
  LANGUAGES.find((l) => l.code === code) ??
  LANGUAGES.find((l) => l.code === code?.split(/[-_]/)[0]?.toLowerCase())

export const isLanguage = (code: unknown): code is string =>
  typeof code === "string" && LANGUAGES.some((l) => l.code === code)

export const isRtl = (code: string | null | undefined) =>
  !!languageOf(code)?.rtl

// Credits, set from the model bill. 1,000 words at Sonnet's $2/$10 per million
// tokens is about 2,400 tokens in, 2,600 out with thinking, and the cached
// prefix, so about $0.037 with retries, summaries and checks. Twelve credits
// keeps roughly the margin of the other LLM operations in lib/credits.ts.
export const BOOK_RATES = {
  // Per 1,000 source words sent to the model. Repeats and locked text are free.
  standard: 12,
  // The same work through the Batch API: half the token bill, up to a day.
  economy: 7,
  // Per scanned page read by a vision model.
  ocr_page: 4,
  // The glossary, character and tone pass, once per book.
  extract: 15,
  // An extra round of independent back-checks, per chapter, on request.
  backcheck: 2,
  // One message to the book's assistant.
  chat: 2,
} as const

export type TranslateMode = "standard" | "economy"

export const wordsToCredits = (words: number, mode: TranslateMode) =>
  words <= 0 ? 0 : Math.max(1, Math.ceil((words / 1000) * BOOK_RATES[mode]))

const DENSE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/gu

// A CJK or Thai "word" is about two characters; the rest splits on spaces.
export function countWords(text: string) {
  const dense = text.match(DENSE)?.length ?? 0
  const rest = text.replace(DENSE, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
  return Math.ceil(dense / 2) + (rest?.length ?? 0)
}

// What a text is billed as. Long unbroken strings count as one word each, so a
// segment can't be made cheap by leaving out the spaces.
export const billableWords = (text: string) =>
  Math.max(countWords(text), Math.ceil([...text].length / 6))

export const uuid = z.string().regex(/^[0-9a-f-]{36}$/i)
