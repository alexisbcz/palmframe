import type {
  BookBible,
  BookFormat,
  BookStatus,
  InlineTag,
  JobKind,
  JobStatus,
  SegmentKind,
  SegmentStatus,
  Severity,
  StyleGuide,
  TermKind,
  TermState,
  IssueKind,
} from "./model"
import type { PageBlock } from "./parse/layout"

export const BOOK_SOURCES_BUCKET = "book-sources"
export const BOOK_PAGES_BUCKET = "book-pages"
export const BOOK_EXPORTS_BUCKET = "book-exports"

export type BookRow = {
  id: string
  user_id: string
  title: string
  author: string
  file_name: string
  format: BookFormat | null
  size_bytes: number
  source_path: string
  source_lang: string
  target_lang: string
  status: BookStatus
  rights_confirmed_at: string
  style: Partial<StyleGuide>
  bible: Partial<BookBible>
  glossaries: string[]
  words: number
  segments: number
  pages: number
  error: string | null
  warnings: string[]
  outline: { title: string; page: number }[]
  created_at: string
  updated_at: string
}

export type ChapterRow = {
  id: string
  book_id: string
  user_id: string
  position: number
  title: string
  href: string | null
  summary: string
  score: number | null
  segments: number
}

export type SegmentRow = {
  id: string
  book_id: string
  chapter_id: string
  user_id: string
  position: number
  kind: SegmentKind
  level: number | null
  group_key: string | null
  cell: { row: number; col: number; header?: boolean } | null
  locator: string | null
  page: number | null
  asset: string | null
  ocr: number | null
  source: string
  tags: InlineTag[]
  source_hash: string
  words: number
  translatable: boolean
  target: string | null
  status: SegmentStatus
  from_memory: boolean
  attempts: number
  version: number
  job_id: string | null
  updated_at: string
}

export type PageRow = {
  id: string
  book_id: string
  user_id: string
  number: number
  kind: "text" | "scan"
  chapter_position: number | null
  href: string | null
  image_path: string | null
  width: number | null
  height: number | null
  status: "pending" | "done" | "failed" | "unreadable"
  blocks: PageBlock[]
  confidence: number | null
  attempts: number
}

export type GlossaryRow = {
  id: string
  user_id: string
  book_id: string | null
  name: string
  source_lang: string | null
  target_lang: string | null
  created_at: string
}

export type TermRow = {
  id: string
  glossary_id: string
  user_id: string
  source: string
  target: string
  kind: TermKind
  dnt: boolean
  note: string
  case_sensitive: boolean
  state: TermState
  occurrences: number
  created_at: string
}

export interface JobParams {
  mode?: "standard" | "economy"
  // Limits a translation to these chapters.
  chapters?: string[]
  // Words that went in the estimate, for progress.
  words?: number
  instruction?: string
  format?: "epub" | "pdf" | "docx" | "md"
  bilingual?: boolean
  backcheck?: boolean
  // Take the source language from the file's metadata.
  detect?: boolean
}

export interface JobState {
  errors?: number
  // Next PDF page or next chapter, depending on the job.
  cursor?: number
  scans?: number[]
  batch?: { id: string; chapter: string; chunks: Record<string, string[]> }
}

export type JobRow = {
  id: string
  book_id: string
  user_id: string
  key_id: string | null
  kind: JobKind
  status: JobStatus
  params: JobParams
  state: JobState
  done: number
  total: number
  billable: number
  credits_charged: number
  credits_used: number
  payer: "credits" | "openrouter" | "free"
  usage: Record<string, number>
  result: Record<string, unknown> | null
  error: string | null
  slices: number
  leased_until: string | null
  next_at: string | null
  idempotency_key: string | null
  created_at: string
  finished_at: string | null
  updated_at: string
}

export type IssueRow = {
  id: string
  book_id: string
  chapter_id: string
  segment_id: string
  user_id: string
  kind: IssueKind
  severity: Severity
  detail: Record<string, string | number>
  dismissed: boolean
  created_at: string
}

export interface ChangeItem {
  segment_id: string
  before: string
  after: string
  version: number
}

export type ChangeSetRow = {
  id: string
  book_id: string
  user_id: string
  summary: string
  status: "proposed" | "applied" | "discarded"
  items: ChangeItem[]
  applied: number
  skipped: number
  created_at: string
}

export type MessageRow = {
  id: string
  book_id: string
  user_id: string
  role: "user" | "assistant"
  content: string
  change_set_id: string | null
  created_at: string
}

export type WebhookRow = {
  id: string
  user_id: string
  url: string
  secret: string
  events: string[]
  created_at: string
}

export type DeliveryRow = {
  id: string
  webhook_id: string
  user_id: string
  event: string
  payload: Record<string, unknown>
  status: "pending" | "delivered" | "failed"
  attempts: number
  next_at: string
  response_status: number | null
  created_at: string
}

type Table<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type BookTables = {
  book_projects: Table<BookRow>
  book_chapters: Table<ChapterRow>
  book_segments: Table<SegmentRow>
  book_pages: Table<PageRow>
  book_glossaries: Table<GlossaryRow>
  book_terms: Table<TermRow>
  book_jobs: Table<JobRow>
  book_issues: Table<IssueRow>
  book_change_sets: Table<ChangeSetRow>
  book_messages: Table<MessageRow>
  book_webhooks: Table<WebhookRow>
  book_webhook_deliveries: Table<DeliveryRow>
}

export type BookFunctions = {
  book_save_translations: {
    Args: {
      p_job: string
      p_items: { id: string; target: string; memory: boolean }[]
    }
    Returns: number
  }
  settle_credits_for: {
    Args: { p_user: string; p_job: string; p_used: number }
    Returns: number
  }
}
