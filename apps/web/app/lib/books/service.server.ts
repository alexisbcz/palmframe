import { payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { fakeEnabled, modelAvailable } from "./ai.server"
import { memorable, sourceHash, translatable } from "./chunk"
import {
  BOOK_EXPORTS_BUCKET,
  BOOK_PAGES_BUCKET,
  BOOK_SOURCES_BUCKET,
  type BookRow,
  type ChangeItem,
  type GlossaryRow,
  type JobParams,
  type JobRow,
  type SegmentRow,
  type TermRow,
} from "./database"
import { finish, type Engine } from "./engine"
import {
  checkGlossary,
  countTerm,
  exportCsv,
  exportTbx,
  importCsv,
  importTbx,
  type ImportedTerm,
} from "./glossary"
import { escapeStrayAngles, stripTags } from "./inline"
import {
  MAX_ACTIVE_FREE_JOBS_PER_USER,
  MAX_ACTIVE_JOBS_PER_USER,
  MAX_BOOK_BYTES,
  MAX_CHANGES,
  MAX_FREE_JOBS_PER_HOUR,
  MAX_GLOSSARY_CHECK,
  MAX_GLOSSARY_IMPORT_BYTES,
  MAX_GLOSSARY_TERMS,
  MAX_WEBHOOKS,
} from "./limits"
import {
  BOOK_RATES,
  TERM_KINDS,
  TERM_STATES,
  billableWords,
  isLanguage,
  styleSchema,
  uuid,
  wordsToCredits,
  type ExportFormat,
  type TermKind,
  type TermState,
  type TranslateMode,
} from "./model"
import { formatFromName } from "./parse/index"
import { allTerms, ownGlossary, repo } from "./repo.server"
import { kick } from "./run.server"
import { WEBHOOK_EVENTS, emitEvent, newSecret } from "./webhooks.server"

// Everything a person can do to a book, shared by the session API, the keyed
// API and MCP. Every function takes the owner's id and filters on it with the
// admin client, so there's one set of checks whichever door someone came in by.
export class BookError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code
  ) {
    super(message)
  }
}

const QUOTA_REACHED = "P0409"
const LOCKED = "P0423"
const SOURCE_FROZEN = "P0424"
const db = () => supabaseAdmin()
const DOWNLOAD_SECONDS = 600
const PAGE_SIZE = 200

const must = <T>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new BookError(500, "failed", r.error.message)
  return r.data as NonNullable<T>
}

export interface Actor {
  userId: string
  // Set when an API key is acting: its credit limit applies.
  keyId?: string
}

export async function getBook(actor: Actor, id: string): Promise<BookRow> {
  if (!uuid.safeParse(id).success) throw new BookError(404, "not_found")
  const { data } = await db()
    .from("book_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", actor.userId)
    .maybeSingle()
  if (!data) throw new BookError(404, "not_found")
  return data
}

export async function listBooks(actor: Actor) {
  return must(
    await db()
      .from("book_projects")
      .select(
        "id, title, author, file_name, format, source_lang, target_lang, status, words, segments, pages, error, created_at, updated_at"
      )
      .eq("user_id", actor.userId)
      .order("created_at", { ascending: false })
      .limit(200)
  )
}

export interface PrepareInput {
  fileName: unknown
  size: unknown
  rights: unknown
  sourceLang?: unknown
  targetLang?: unknown
}

// The row and one signed slot, the only way into the bucket. The file then goes
// straight to storage, so the size of a book never touches a function.
export async function prepareBook(actor: Actor, input: PrepareInput) {
  const fileName =
    typeof input.fileName === "string" ? input.fileName.trim().slice(-255) : ""
  const size = input.size
  if (!fileName || typeof size !== "number" || !Number.isInteger(size))
    throw new BookError(400, "invalid")
  if (input.rights !== true) throw new BookError(400, "rights_required")
  if (size <= 0 || size > MAX_BOOK_BYTES) throw new BookError(413, "too_large")
  if (!formatFromName(fileName)) throw new BookError(415, "unsupported")
  const detect = !isLanguage(input.sourceLang)
  const source = isLanguage(input.sourceLang) ? input.sourceLang : "en"
  const target = isLanguage(input.targetLang)
    ? input.targetLang
    : source === "fr"
      ? "en"
      : "fr"
  if (source === target) throw new BookError(400, "same_language")
  const id = crypto.randomUUID()
  const path = `${actor.userId}/${id}/source`
  const slot = await db()
    .storage.from(BOOK_SOURCES_BUCKET)
    .createSignedUploadUrl(path)
  if (slot.error) throw new BookError(500, "failed", slot.error.message)
  const { error } = await db()
    .from("book_projects")
    .insert({
      id,
      user_id: actor.userId,
      file_name: fileName,
      size_bytes: size,
      source_path: path,
      source_lang: source,
      target_lang: target,
      title: fileName.replace(/\.[^.]+$/, "").slice(0, 500),
      rights_confirmed_at: new Date().toISOString(),
    })
  if (error?.code === QUOTA_REACHED) throw new BookError(409, "limit_reached")
  if (error) throw new BookError(500, "failed", error.message)
  return {
    id,
    bucket: BOOK_SOURCES_BUCKET,
    path,
    token: slot.data.token,
    upload_url: slot.data.signedUrl,
    detect,
  }
}

const activeJobs = async (userId: string) => {
  const { count } = await db()
    .from("book_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["unpaid", "queued", "running"])
    .neq("kind", "export")
  return count ?? 0
}

interface Start {
  kind: JobRow["kind"]
  cost: number
  credit: string
  params?: JobParams
  total?: number
  idempotencyKey?: string
}

// A retry of a call that already got through. Checked before anything else, so
// a repeat can't requeue a book or be told there's nothing left to do.
async function replayOf(
  actor: Actor,
  book: BookRow,
  kind: JobRow["kind"],
  key: string | undefined
) {
  if (!key) return null
  const { data } = await db()
    .from("book_jobs")
    .select("*")
    .eq("user_id", actor.userId)
    .eq("idempotency_key", key)
    .maybeSingle()
  if (!data) return null
  if (data.book_id !== book.id || data.kind !== kind)
    throw new BookError(409, "idempotency_conflict")
  return { job: jobView(data), replayed: true, balance: null }
}

// Free work costs us all the same, so it has limits of its own.
async function assertFreeRoom(actor: Actor) {
  const rows = (filter: "active" | "hour") => {
    const query = db()
      .from("book_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", actor.userId)
      .eq("payer", "free")
    return filter === "active"
      ? query.in("status", ["queued", "running"])
      : query.gte(
          "created_at",
          new Date(Date.now() - 60 * 60 * 1000).toISOString()
        )
  }
  const [active, hour] = await Promise.all([rows("active"), rows("hour")])
  if (
    (active.count ?? 0) >= MAX_ACTIVE_FREE_JOBS_PER_USER ||
    (hour.count ?? 0) >= MAX_FREE_JOBS_PER_HOUR
  )
    throw new BookError(429, "busy")
}

// A paid job starts `unpaid`, which nothing will claim, and `book_charge_job`
// charges and releases it in one transaction. So a lost reply can't leave money
// taken with no job, and the row itself says which way it went.
async function chargeJob(job: JobRow) {
  const { data, error } = await db().rpc("book_charge_job", { p_job: job.id })
  if (!error) return data
  const dropUnpaid = () =>
    db().from("book_jobs").delete().eq("id", job.id).eq("status", "unpaid")
  if (error.code === "P0402" || error.code === "P0403") {
    await dropUnpaid()
    throw error.code === "P0402"
      ? new BookError(402, "insufficient_credits", error.message)
      : new BookError(403, "key_credit_limit", error.message)
  }
  const { data: row } = await db()
    .from("book_jobs")
    .select("status")
    .eq("id", job.id)
    .maybeSingle()
  if (row && row.status !== "unpaid") return null
  await dropUnpaid()
  throw new BookError(500, "charge_failed", error.message)
}

async function startJob(
  actor: Actor,
  book: BookRow,
  origin: string,
  start: Start
) {
  if (start.kind !== "export" && start.cost > 0) {
    if ((await activeJobs(actor.userId)) >= MAX_ACTIVE_JOBS_PER_USER)
      throw new BookError(429, "busy")
  }
  const paid = start.cost > 0
  if (!paid) await assertFreeRoom(actor)
  const openrouter = paid ? await payingConnection(actor.userId) : null
  const payer = openrouter ? "openrouter" : paid ? "credits" : "free"
  if (paid && !modelAvailable(openrouter))
    throw new BookError(501, "not_set_up")
  const { data: job, error } = await db()
    .from("book_jobs")
    .insert({
      book_id: book.id,
      user_id: actor.userId,
      key_id: actor.keyId ?? null,
      kind: start.kind,
      status: payer === "credits" ? "unpaid" : "queued",
      payer,
      params: start.params ?? {},
      total: start.total ?? 0,
      credits_charged: payer === "credits" ? start.cost : 0,
      idempotency_key: start.idempotencyKey ?? null,
    })
    .select("*")
    .single()
  if (error?.code === "23505") throw new BookError(409, "job_running")
  if (error || !job) throw new BookError(500, "failed", error?.message)
  if (payer !== "credits") return { job, balance: null }
  const balance = await chargeJob(job)
  return { job: { ...job, status: "queued" as const }, balance }
}

async function launch(
  book: BookRow,
  origin: string,
  job: JobRow,
  status: BookRow["status"] | null
) {
  if (status) await repo.setBook(book.id, { status })
  await kick(origin, job.id)
}

export async function ingest(
  actor: Actor,
  id: string,
  origin: string,
  // Take the source language from the file, when its metadata names one.
  detect = false
) {
  const book = await getBook(actor, id)
  if (book.status !== "uploading" && book.status !== "failed")
    throw new BookError(409, "already_ingested")
  const folder = await db()
    .storage.from(BOOK_SOURCES_BUCKET)
    .list(`${actor.userId}/${id}`)
  const file = folder.data?.find((f) => f.name === "source")
  if (!file) throw new BookError(409, "upload_missing")
  // The size given at the start was only a claim: count what actually arrived.
  const size = Number(file.metadata?.size)
  if (size > 0 && size !== book.size_bytes) {
    const { error } = await db()
      .from("book_projects")
      .update({ size_bytes: size })
      .eq("id", id)
    if (error?.code === QUOTA_REACHED || error?.code === "23514") {
      await db().storage.from(BOOK_SOURCES_BUCKET).remove([book.source_path])
      await db().from("book_projects").delete().eq("id", id)
      throw new BookError(409, "limit_reached")
    }
    if (error) throw new BookError(500, "failed", error.message)
  }
  const { job } = await startJob(actor, book, origin, {
    kind: "ingest",
    cost: 0,
    credit: "",
    params: { detect },
  })
  // The file's own title replaces the name it was uploaded under.
  await repo.setBook(book.id, { title: "", error: null })
  await launch(book, origin, job, "parsing")
  return { job: jobView(job) }
}

export const jobView = (j: JobRow) => ({
  id: j.id,
  book_id: j.book_id,
  kind: j.kind,
  status: j.status,
  done: j.done,
  total: j.total,
  billable: j.billable,
  credits_charged: j.credits_charged,
  credits_used: j.credits_used,
  payer: j.payer,
  params: j.params,
  result: j.result,
  error: j.error,
  waiting: !!j.state?.batch,
  created_at: j.created_at,
  finished_at: j.finished_at,
})

export async function bookStatus(actor: Actor, id: string) {
  const book = await getBook(actor, id)
  const [{ data: jobs }, counts] = await Promise.all([
    db()
      .from("book_jobs")
      .select("*")
      .eq("book_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    segmentCounts(id),
  ])
  return {
    book: bookView(book),
    jobs: (jobs ?? []).map(jobView),
    counts,
  }
}

export const bookView = (b: BookRow) => ({
  id: b.id,
  title: b.title,
  author: b.author,
  file_name: b.file_name,
  format: b.format,
  source_lang: b.source_lang,
  target_lang: b.target_lang,
  status: b.status,
  style: b.style,
  bible: b.bible,
  glossaries: b.glossaries,
  words: b.words,
  segments: b.segments,
  pages: b.pages,
  error: b.error,
  warnings: b.warnings,
  created_at: b.created_at,
  updated_at: b.updated_at,
})

async function segmentCounts(bookId: string) {
  const statuses = [
    "pending",
    "machine",
    "reviewed",
    "locked",
    "failed",
  ] as const
  const rows = await Promise.all(
    statuses.map((status) =>
      db()
        .from("book_segments")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId)
        .eq("status", status)
        .then((r) => [status, r.count ?? 0] as const)
    )
  )
  return Object.fromEntries(rows) as Record<(typeof statuses)[number], number>
}

export async function updateBook(
  actor: Actor,
  id: string,
  patch: {
    title?: unknown
    source_lang?: unknown
    target_lang?: unknown
    style?: unknown
    glossaries?: unknown
  }
) {
  const book = await getBook(actor, id)
  const next: Partial<BookRow> = {}
  if (typeof patch.title === "string")
    next.title = patch.title.trim().slice(0, 500)
  const translating = await hasTranslation(id)
  if (patch.source_lang !== undefined || patch.target_lang !== undefined) {
    if (translating) throw new BookError(409, "already_translating")
    const source = patch.source_lang ?? book.source_lang
    const target = patch.target_lang ?? book.target_lang
    if (!isLanguage(source) || !isLanguage(target))
      throw new BookError(400, "invalid")
    if (source === target) throw new BookError(400, "same_language")
    next.source_lang = source
    next.target_lang = target
  }
  if (patch.style !== undefined) {
    const style = styleSchema.safeParse(patch.style)
    if (!style.success) throw new BookError(400, "invalid")
    next.style = style.data
  }
  if (patch.glossaries !== undefined) {
    const ids = patch.glossaries
    if (!Array.isArray(ids) || !ids.every((g) => uuid.safeParse(g).success))
      throw new BookError(400, "invalid")
    const { data } = await db()
      .from("book_glossaries")
      .select("id")
      .eq("user_id", actor.userId)
      .is("book_id", null)
      .in("id", ids as string[])
    next.glossaries = (data ?? []).map((g) => g.id)
  }
  must(await db().from("book_projects").update(next).eq("id", id))
  return bookView({ ...book, ...next })
}

const hasTranslation = async (id: string) => {
  const { count } = await db()
    .from("book_segments")
    .select("id", { count: "exact", head: true })
    .eq("book_id", id)
    .in("status", ["machine", "reviewed", "locked"])
  return (count ?? 0) > 0
}

export async function deleteBook(actor: Actor, id: string) {
  const book = await getBook(actor, id)
  const { data: active } = await db()
    .from("book_jobs")
    .select("id")
    .eq("book_id", id)
    .in("status", ["queued", "running"])
  if (active?.length) throw new BookError(409, "job_running")
  const folder = `${actor.userId}/${id}`
  for (const bucket of [
    BOOK_SOURCES_BUCKET,
    BOOK_PAGES_BUCKET,
    BOOK_EXPORTS_BUCKET,
  ]) {
    const { data } = await db()
      .storage.from(bucket)
      .list(folder, { limit: 2000 })
    const paths = (data ?? []).map((f) => `${folder}/${f.name}`)
    if (paths.length) {
      const removed = await db().storage.from(bucket).remove(paths)
      if (removed.error)
        throw new BookError(500, "failed", removed.error.message)
    }
  }
  must(await db().from("book_projects").delete().eq("id", book.id))
}

export async function chapters(actor: Actor, id: string) {
  await getBook(actor, id)
  const rows = await repo.chapters(id)
  return rows.map((c) => ({
    id: c.id,
    position: c.position,
    title: c.title,
    score: c.score,
    segments: c.segments,
  }))
}

export const segmentView = (s: SegmentRow) => ({
  id: s.id,
  chapter_id: s.chapter_id,
  position: s.position,
  kind: s.kind,
  level: s.level,
  page: s.page,
  ocr: s.ocr,
  source: s.source,
  target: s.target,
  tags: s.tags,
  status: s.status,
  from_memory: s.from_memory,
  translatable: s.translatable,
  version: s.version,
})

export interface SegmentQuery {
  chapter?: string
  status?: string
  search?: string
  page?: number
  cursor?: number
}

export async function segments(actor: Actor, id: string, q: SegmentQuery) {
  await getBook(actor, id)
  const from = Math.max(0, q.cursor ?? 0)
  let query = db()
    .from("book_segments")
    .select("*")
    .eq("book_id", id)
    .order("chapter_id")
    .order("position")
  if (q.chapter) {
    if (!uuid.safeParse(q.chapter).success) throw new BookError(400, "invalid")
    query = query.eq("chapter_id", q.chapter)
  }
  if (q.status) query = query.eq("status", q.status as SegmentRow["status"])
  if (q.page) query = query.eq("page", q.page)
  const needle = q.search?.trim().slice(0, 200)
  if (needle) {
    const like = `%${needle.replace(/[\\%_]/g, "\\$&")}%`
    const safe = like.replace(/[",()]/g, " ")
    query = query.or(`source.ilike."${safe}",target.ilike."${safe}"`)
  }
  const rows = must(await query.range(from, from + PAGE_SIZE - 1))
  return {
    segments: rows.map(segmentView),
    next: rows.length === PAGE_SIZE ? from + PAGE_SIZE : null,
  }
}

export interface SegmentEdit {
  target?: unknown
  source?: unknown
  status?: unknown
  version?: unknown
}

const EDITABLE_STATUSES = ["machine", "reviewed", "locked"]

// A translation or OCR job holds a price for the text as it stood. The database
// refuses too; this gives the common case a clean answer.
const pricedJobRunning = async (bookId: string) => {
  const { count } = await db()
    .from("book_jobs")
    .select("id", { count: "exact", head: true })
    .eq("book_id", bookId)
    .in("kind", ["translate", "ocr"])
    .in("status", ["unpaid", "queued", "running"])
  return (count ?? 0) > 0
}

const creditCap = (value: unknown) => {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new BookError(400, "invalid")
  return value
}

// `version` is what the editor last saw. A newer row isn't overwritten: two
// tabs, or a person and a running job, can't quietly undo each other.
export async function editSegment(
  actor: Actor,
  id: string,
  segmentId: string,
  edit: SegmentEdit
) {
  await getBook(actor, id)
  if (!uuid.safeParse(segmentId).success) throw new BookError(404, "not_found")
  const { data: row } = await db()
    .from("book_segments")
    .select("*")
    .eq("id", segmentId)
    .eq("book_id", id)
    .maybeSingle()
  if (!row) throw new BookError(404, "not_found")
  if (typeof edit.version !== "number" || edit.version !== row.version)
    throw new BookError(409, "stale_version")
  const patch: Partial<SegmentRow> = {}
  if (typeof edit.status === "string") {
    if (!EDITABLE_STATUSES.includes(edit.status) || !row.target?.trim())
      throw new BookError(400, "invalid")
    patch.status = edit.status as SegmentRow["status"]
  }
  if (typeof edit.target === "string") {
    if (row.status === "locked" && patch.status !== "reviewed")
      throw new BookError(423, "locked")
    if (row.status === "locked") {
      // Unlock first, as its own step: the guard forbids doing both at once.
      must(
        await db()
          .from("book_segments")
          .update({ status: "reviewed" })
          .eq("id", segmentId)
      )
    }
    patch.target = escapeStrayAngles(edit.target).slice(0, 40_000)
    patch.status ??= "reviewed"
    patch.from_memory = false
  }
  if (typeof edit.source === "string") {
    if (row.status === "locked") throw new BookError(423, "locked")
    if (await pricedJobRunning(id)) throw new BookError(409, "job_running")
    const source = escapeStrayAngles(edit.source).slice(0, 40_000)
    patch.source = source
    patch.source_hash = sourceHash(source)
    patch.words = billableWords(stripTags(source))
    patch.translatable = translatable(row.kind, source)
    // Corrected text means the old translation no longer answers it.
    if (source !== row.source && row.status !== "fixed") {
      patch.status = "pending"
      patch.target = null
    }
  }
  const { data, error } = await db()
    .from("book_segments")
    .update(patch)
    .eq("id", segmentId)
    .select("*")
    .single()
  if (error?.code === LOCKED) throw new BookError(423, "locked")
  if (error?.code === SOURCE_FROZEN) throw new BookError(409, "job_running")
  if (error || !data) throw new BookError(500, "failed", error?.message)
  return segmentView(data)
}

// Whole chapter at once: review it, or lock it.
export async function setChapterStatus(
  actor: Actor,
  id: string,
  chapterId: string,
  status: "reviewed" | "locked"
) {
  await getBook(actor, id)
  const rows = must(
    await db()
      .from("book_segments")
      .update({ status })
      .eq("book_id", id)
      .eq("chapter_id", chapterId)
      .in("status", status === "locked" ? ["machine", "reviewed"] : ["machine"])
      .select("id")
  )
  return { updated: rows.length }
}

// What a retranslation sends back through. Never locked lines.
const requeued = (includeReviewed: unknown): SegmentRow["status"][] =>
  includeReviewed === true
    ? ["machine", "reviewed", "failed"]
    : ["machine", "failed"]

export async function estimate(
  actor: Actor,
  id: string,
  options: {
    chapters?: string[]
    // Prices these as if they were queued, without touching them.
    requeue?: SegmentRow["status"][]
  } = {}
) {
  const book = await getBook(actor, id)
  const scope = options.chapters
  const rows = await repo.segments(id)
  const going = (s: SegmentRow) =>
    s.status === "pending" ||
    (!!options.requeue?.includes(s.status) &&
      (!scope || scope.includes(s.chapter_id)))
  const pending = rows.filter(
    (s) => going(s) && (!scope || scope.includes(s.chapter_id))
  )
  const done = new Set(
    rows
      .filter(
        (s) => !going(s) && ["machine", "reviewed", "locked"].includes(s.status)
      )
      .map((s) => s.source_hash)
  )
  const seen = new Set<string>()
  let words = 0
  let repeats = 0
  for (const s of pending) {
    if (memorable(s.source)) {
      if (done.has(s.source_hash) || seen.has(s.source_hash)) {
        repeats += s.words
        continue
      }
      seen.add(s.source_hash)
    }
    words += s.words
  }
  const openrouter = await payingConnection(actor.userId)
  const standard = wordsToCredits(words, "standard")
  const economy = wordsToCredits(words, "economy")
  const { data: balance } = await db().rpc("credits_for", {
    p_user: actor.userId,
  })
  return {
    words,
    repeat_words: repeats,
    segments: pending.length,
    locked: rows.filter((s) => s.status === "locked").length,
    credits: { standard, economy },
    billed_by: openrouter ? ("openrouter" as const) : ("credits" as const),
    // The Batch API needs the server's own key.
    economy_available: !openrouter,
    balance: balance ?? 0,
    book: book.id,
  }
}

export async function startTranslation(
  actor: Actor,
  id: string,
  origin: string,
  options: {
    mode?: unknown
    chapters?: unknown
    instruction?: unknown
    retranslate?: unknown
    include_reviewed?: unknown
    max_credits?: unknown
    idempotency_key?: string
  }
) {
  const book = await getBook(actor, id)
  const maxCredits = creditCap(options.max_credits)
  const replay = await replayOf(
    actor,
    book,
    "translate",
    options.idempotency_key
  )
  if (replay) return replay
  if (!["setup", "review"].includes(book.status))
    throw new BookError(409, "not_ready")
  const chapterIds = Array.isArray(options.chapters)
    ? (options.chapters as unknown[]).filter(
        (c): c is string => uuid.safeParse(c).success
      )
    : undefined
  const openrouter = await payingConnection(actor.userId)
  const mode: TranslateMode =
    options.mode === "economy" && !openrouter ? "economy" : "standard"
  const instruction =
    typeof options.instruction === "string"
      ? options.instruction.trim().slice(0, 1000)
      : undefined
  const requeue =
    options.retranslate === true
      ? requeued(options.include_reviewed)
      : undefined
  const quote = await estimate(actor, id, { chapters: chapterIds, requeue })
  if (!quote.segments) throw new BookError(409, "nothing_to_translate")
  const cost = Math.max(1, quote.credits[mode])
  if (maxCredits !== undefined && maxCredits < cost && !openrouter)
    throw new BookError(409, "over_budget")
  const started = await startJob(actor, book, origin, {
    kind: "translate",
    cost,
    credit: "book_translate",
    params: { mode, chapters: chapterIds, instruction, words: quote.words },
    total: quote.segments,
    idempotencyKey: options.idempotency_key,
  })
  // After the charge: a refused one has to leave the book as it was. Only what
  // isn't locked goes back, and the database enforces that too.
  if (requeue) {
    let query = db()
      .from("book_segments")
      .update({ status: "pending", attempts: 0 })
      .eq("book_id", id)
      .in("status", requeue)
    if (chapterIds) query = query.in("chapter_id", chapterIds)
    must(await query)
    if (!chapterIds)
      must(
        await db()
          .from("book_chapters")
          .update({ summary: "" })
          .eq("book_id", id)
      )
  }
  await launch(book, origin, started.job, "translating")
  return {
    job: jobView(started.job),
    replayed: false,
    balance: started.balance,
  }
}

export async function startOcr(
  actor: Actor,
  id: string,
  origin: string,
  options: { idempotency_key?: string; max_credits?: unknown } = {}
) {
  const book = await getBook(actor, id)
  const maxCredits = creditCap(options.max_credits)
  const replay = await replayOf(actor, book, "ocr", options.idempotency_key)
  if (replay) return replay
  if (book.status !== "needs_ocr") throw new BookError(409, "not_ready")
  const { count } = await db()
    .from("book_pages")
    .select("id", { count: "exact", head: true })
    .eq("book_id", id)
    .eq("kind", "scan")
    .eq("status", "pending")
    .not("image_path", "is", null)
  const pages = count ?? 0
  const cost = pages * BOOK_RATES.ocr_page
  if (maxCredits !== undefined && maxCredits < cost)
    throw new BookError(409, "over_budget")
  if (!pages) {
    await repo.setBook(id, { status: "setup" })
    return { job: null, replayed: false, balance: null }
  }
  const started = await startJob(actor, book, origin, {
    kind: "ocr",
    cost,
    credit: "book_ocr",
    total: pages,
    idempotencyKey: options.idempotency_key,
  })
  await launch(book, origin, started.job, "ocr")
  return {
    job: jobView(started.job),
    replayed: false,
    balance: started.balance,
  }
}

export async function startExtraction(
  actor: Actor,
  id: string,
  origin: string
) {
  const book = await getBook(actor, id)
  if (book.status !== "setup") throw new BookError(409, "not_ready")
  const started = await startJob(actor, book, origin, {
    kind: "extract",
    cost: BOOK_RATES.extract,
    credit: "book_extract",
    total: 1,
  })
  await launch(book, origin, started.job, "glossary")
  return { job: jobView(started.job), balance: started.balance }
}

export async function startChecks(
  actor: Actor,
  id: string,
  origin: string,
  options: { backcheck?: boolean } = {}
) {
  const book = await getBook(actor, id)
  const backcheck = options.backcheck === true
  const chapterCount = (await repo.chapters(id)).length
  const started = await startJob(actor, book, origin, {
    kind: "qa",
    cost: backcheck ? Math.max(1, chapterCount) * BOOK_RATES.backcheck : 0,
    credit: "book_qa",
    params: { backcheck },
  })
  await launch(book, origin, started.job, null)
  return { job: jobView(started.job), balance: started.balance }
}

export async function startExport(
  actor: Actor,
  id: string,
  origin: string,
  options: { format: ExportFormat; bilingual?: boolean }
) {
  const book = await getBook(actor, id)
  if (!book.segments) throw new BookError(409, "not_ready")
  const started = await startJob(actor, book, origin, {
    kind: "export",
    cost: 0,
    credit: "",
    params: { format: options.format, bilingual: !!options.bilingual },
  })
  await launch(book, origin, started.job, null)
  return { job: jobView(started.job) }
}

export async function exportsOf(actor: Actor, id: string) {
  await getBook(actor, id)
  const rows = must(
    await db()
      .from("book_jobs")
      .select("*")
      .eq("book_id", id)
      .eq("kind", "export")
      .order("created_at", { ascending: false })
      .limit(30)
  )
  return rows.map(jobView)
}

export async function exportUrl(actor: Actor, id: string, jobId: string) {
  await getBook(actor, id)
  if (!uuid.safeParse(jobId).success) throw new BookError(404, "not_found")
  const { data: job } = await db()
    .from("book_jobs")
    .select("result, status")
    .eq("id", jobId)
    .eq("book_id", id)
    .eq("kind", "export")
    .maybeSingle()
  const path = job?.result?.path
  if (job?.status !== "succeeded" || typeof path !== "string")
    throw new BookError(404, "not_found")
  const { data, error } = await db()
    .storage.from(BOOK_EXPORTS_BUCKET)
    .createSignedUrl(path, DOWNLOAD_SECONDS, { download: true })
  if (error) throw new BookError(500, "failed", error.message)
  return { url: data.signedUrl, expires_in: DOWNLOAD_SECONDS }
}

// Ends a running job. What was already saved stays and is paid for; the rest of
// the charge goes back through the job's own settlement.
export async function cancelJob(actor: Actor, id: string, jobId: string) {
  await getBook(actor, id)
  if (!uuid.safeParse(jobId).success) throw new BookError(404, "not_found")
  const { data: job } = await db()
    .from("book_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("book_id", id)
    .maybeSingle()
  if (!job) throw new BookError(404, "not_found")
  if (job.status !== "queued" && job.status !== "running")
    throw new BookError(409, "not_active")
  const engine: Pick<Engine, "repo" | "now" | "emit"> = {
    repo,
    now: Date.now,
    emit: emitEvent,
  }
  await finish(engine as Engine, job, "cancelled")
  return jobView(await repo.job(job.id))
}

export async function issues(actor: Actor, id: string, chapter?: string) {
  await getBook(actor, id)
  let query = db()
    .from("book_issues")
    .select("id, chapter_id, segment_id, kind, severity, detail, dismissed")
    .eq("book_id", id)
    .eq("dismissed", false)
    .order("severity")
    .limit(1000)
  if (chapter) query = query.eq("chapter_id", chapter)
  return must(await query)
}

export async function dismissIssue(actor: Actor, id: string, issueId: string) {
  await getBook(actor, id)
  must(
    await db()
      .from("book_issues")
      .update({ dismissed: true })
      .eq("id", issueId)
      .eq("book_id", id)
  )
}

export async function scanPages(actor: Actor, id: string) {
  await getBook(actor, id)
  const rows = await repo.allPages(id)
  const scans = rows.filter((p) => p.kind === "scan")
  const paths = scans.flatMap((p) => (p.image_path ? [p.image_path] : []))
  const signed = paths.length
    ? await db()
        .storage.from(BOOK_PAGES_BUCKET)
        .createSignedUrls(paths, DOWNLOAD_SECONDS)
    : null
  const urls = new Map(signed?.data?.map((d) => [d.path, d.signedUrl]))
  return scans.map((p) => ({
    id: p.id,
    number: p.number,
    status: p.status,
    confidence: p.confidence,
    image: p.image_path ? (urls.get(p.image_path) ?? null) : null,
  }))
}

const termView = (t: TermRow) => ({
  id: t.id,
  source: t.source,
  target: t.target,
  kind: t.kind,
  dnt: t.dnt,
  note: t.note,
  case_sensitive: t.case_sensitive,
  state: t.state,
  occurrences: t.occurrences,
})

async function glossaryOf(actor: Actor, id: string): Promise<GlossaryRow> {
  if (!uuid.safeParse(id).success) throw new BookError(404, "not_found")
  const { data } = await db()
    .from("book_glossaries")
    .select("*")
    .eq("id", id)
    .eq("user_id", actor.userId)
    .maybeSingle()
  if (!data) throw new BookError(404, "not_found")
  return data
}

export async function bookGlossary(actor: Actor, id: string) {
  const book = await getBook(actor, id)
  const glossary = await ownGlossary(book)
  const terms = await allTerms([glossary])
  terms.sort(
    (a, b) => b.state.localeCompare(a.state) || b.occurrences - a.occurrences
  )
  return { id: glossary, terms: terms.map(termView) }
}

export async function reusableGlossaries(actor: Actor) {
  return must(
    await db()
      .from("book_glossaries")
      .select("id, name, source_lang, target_lang, created_at")
      .eq("user_id", actor.userId)
      .is("book_id", null)
      .order("created_at", { ascending: false })
      .limit(200)
  )
}

export async function createGlossary(actor: Actor, name: unknown) {
  const clean = typeof name === "string" ? name.trim().slice(0, 120) : ""
  if (!clean) throw new BookError(400, "invalid")
  return must(
    await db()
      .from("book_glossaries")
      .insert({ user_id: actor.userId, name: clean })
      .select("id, name, source_lang, target_lang, created_at")
      .single()
  )
}

export async function deleteGlossary(actor: Actor, id: string) {
  const glossary = await glossaryOf(actor, id)
  if (glossary.book_id) throw new BookError(409, "book_glossary")
  must(await db().from("book_glossaries").delete().eq("id", id))
}

// Reuse: a book's reviewed terms become a glossary that outlives it.
export async function saveAsReusable(
  actor: Actor,
  bookId: string,
  name: unknown
) {
  const { terms } = await bookGlossary(actor, bookId)
  const created = await createGlossary(actor, name)
  const approved = terms.filter((t) => t.state === "approved")
  if (approved.length)
    must(
      await db()
        .from("book_terms")
        .insert(
          approved.map(({ id: _, ...t }) => ({
            ...t,
            glossary_id: created.id,
            user_id: actor.userId,
          }))
        )
    )
  return created
}

const termInput = (raw: Record<string, unknown>) => {
  const source = typeof raw.source === "string" ? raw.source.trim() : ""
  if (!source || source.length > 200) throw new BookError(400, "invalid")
  return {
    source,
    target:
      typeof raw.target === "string" ? raw.target.trim().slice(0, 200) : "",
    kind: TERM_KINDS.includes(raw.kind as TermKind)
      ? (raw.kind as TermKind)
      : "term",
    dnt: raw.dnt === true,
    note: typeof raw.note === "string" ? raw.note.trim().slice(0, 500) : "",
    case_sensitive: raw.case_sensitive === true,
    state: TERM_STATES.includes(raw.state as TermState)
      ? (raw.state as TermState)
      : ("approved" as TermState),
  }
}

export async function listTerms(actor: Actor, glossaryId: string) {
  await glossaryOf(actor, glossaryId)
  const rows = await allTerms([glossaryId])
  rows.sort((a, b) => a.source.localeCompare(b.source))
  return rows.map(termView)
}

export async function addTerm(
  actor: Actor,
  glossaryId: string,
  raw: Record<string, unknown>
) {
  await glossaryOf(actor, glossaryId)
  const { data, error } = await db()
    .from("book_terms")
    .upsert(
      { ...termInput(raw), glossary_id: glossaryId, user_id: actor.userId },
      { onConflict: "glossary_id,source" }
    )
    .select("*")
    .single()
  if (error || !data) throw new BookError(500, "failed", error?.message)
  return termView(data)
}

export async function updateTerm(
  actor: Actor,
  termId: string,
  raw: Record<string, unknown>
) {
  if (!uuid.safeParse(termId).success) throw new BookError(404, "not_found")
  const { data: row } = await db()
    .from("book_terms")
    .select("*")
    .eq("id", termId)
    .eq("user_id", actor.userId)
    .maybeSingle()
  if (!row) throw new BookError(404, "not_found")
  const { data, error } = await db()
    .from("book_terms")
    .update(termInput({ ...row, ...raw }))
    .eq("id", termId)
    .select("*")
    .single()
  if (error || !data) throw new BookError(500, "failed", error?.message)
  return termView(data)
}

export async function deleteTerm(actor: Actor, termId: string) {
  if (!uuid.safeParse(termId).success) throw new BookError(404, "not_found")
  must(
    await db()
      .from("book_terms")
      .delete()
      .eq("id", termId)
      .eq("user_id", actor.userId)
  )
}

export async function approveAllTerms(actor: Actor, glossaryId: string) {
  await glossaryOf(actor, glossaryId)
  must(
    await db()
      .from("book_terms")
      .update({ state: "approved" })
      .eq("glossary_id", glossaryId)
      .eq("state", "suggested")
  )
}

export async function importTerms(
  actor: Actor,
  glossaryId: string,
  body: string,
  format: "csv" | "tbx",
  sourceLang: string,
  targetLang: string
) {
  await glossaryOf(actor, glossaryId)
  if (body.length > MAX_GLOSSARY_IMPORT_BYTES)
    throw new BookError(413, "too_large")
  let terms: ImportedTerm[]
  try {
    terms =
      format === "tbx"
        ? importTbx(body, sourceLang, targetLang)
        : importCsv(body)
  } catch {
    throw new BookError(422, "unreadable")
  }
  if (!terms.length) throw new BookError(422, "unreadable")
  const unique = new Map(terms.map((t) => [t.source, t]))
  const rows = [...unique.values()].slice(0, MAX_GLOSSARY_TERMS)
  for (let i = 0; i < rows.length; i += 500)
    must(
      await db()
        .from("book_terms")
        .upsert(
          rows.slice(i, i + 500).map((t) => ({
            ...t,
            glossary_id: glossaryId,
            user_id: actor.userId,
            state: "approved" as const,
          })),
          { onConflict: "glossary_id,source" }
        )
    )
  return { imported: rows.length }
}

export async function exportTerms(
  actor: Actor,
  glossaryId: string,
  format: "csv" | "tbx",
  sourceLang: string,
  targetLang: string
) {
  const terms = (await listTerms(actor, glossaryId)).filter(
    (t) => t.state !== "rejected"
  )
  return format === "tbx"
    ? exportTbx(terms, sourceLang, targetLang)
    : exportCsv(terms)
}

// Every occurrence in the book, against the glossary as it stands now.
export async function checkBookGlossary(actor: Actor, id: string) {
  const book = await getBook(actor, id)
  const [rows, terms] = await Promise.all([repo.segments(id), repo.terms(book)])
  const translated = rows.filter((s) => s.target?.trim())
  // Regexes for every term over every line, inside a request.
  if (terms.length * translated.length > MAX_GLOSSARY_CHECK)
    throw new BookError(413, "too_long")
  const breaks = translated.flatMap((s) =>
    checkGlossary(
      s.source,
      s.target!,
      terms,
      book.source_lang,
      book.target_lang
    ).map((hit) => ({ segment_id: s.id, ...hit }))
  )
  return {
    checked: translated.length,
    terms: terms.length,
    occurrences: terms.reduce(
      (n, t) =>
        n +
        translated.reduce(
          (m, s) =>
            m +
            countTerm(
              t.source,
              stripTags(s.source),
              book.source_lang,
              t.case_sensitive
            ),
          0
        ),
      0
    ),
    breaks: breaks.slice(0, 500),
  }
}

export async function changeSets(actor: Actor, id: string) {
  await getBook(actor, id)
  return must(
    await db()
      .from("book_change_sets")
      .select("*")
      .eq("book_id", id)
      .order("created_at", { ascending: false })
      .limit(50)
  )
}

export async function proposeChanges(
  book: BookRow,
  summary: string,
  items: ChangeItem[]
) {
  return must(
    await db()
      .from("book_change_sets")
      .insert({
        book_id: book.id,
        user_id: book.user_id,
        summary: summary.slice(0, 500),
        items: items.slice(0, MAX_CHANGES),
      })
      .select("*")
      .single()
  )
}

// Applied line by line, each guarded by the version it was proposed against. A
// line someone has edited since, or locked, is skipped and counted.
export async function applyChangeSet(
  actor: Actor,
  id: string,
  setId: string,
  accepted?: string[]
) {
  await getBook(actor, id)
  if (!uuid.safeParse(setId).success) throw new BookError(404, "not_found")
  const { data: set } = await db()
    .from("book_change_sets")
    .select("*")
    .eq("id", setId)
    .eq("book_id", id)
    .maybeSingle()
  if (!set) throw new BookError(404, "not_found")
  if (set.status !== "proposed") throw new BookError(409, "already_decided")
  const wanted = accepted ? new Set(accepted) : null
  const items = set.items.filter((i) => !wanted || wanted.has(i.segment_id))
  let applied = 0
  for (let i = 0; i < items.length; i += 50) {
    const results = await Promise.all(
      items.slice(i, i + 50).map(async (item) => {
        const { data } = await db()
          .from("book_segments")
          .update({
            target: item.after,
            status: "reviewed",
            from_memory: false,
          })
          .eq("id", item.segment_id)
          .eq("book_id", id)
          .eq("version", item.version)
          // Only lines already translated: a proposal must not be a way to
          // get a line done without paying for it.
          .in("status", ["machine", "reviewed"])
          .select("id")
        return data?.length ?? 0
      })
    )
    applied += results.reduce((a, b) => a + b, 0)
  }
  const skipped = set.items.length - applied
  must(
    await db()
      .from("book_change_sets")
      .update({ status: "applied", applied, skipped })
      .eq("id", setId)
  )
  return { applied, skipped }
}

export async function discardChangeSet(
  actor: Actor,
  id: string,
  setId: string
) {
  await getBook(actor, id)
  must(
    await db()
      .from("book_change_sets")
      .update({ status: "discarded" })
      .eq("id", setId)
      .eq("book_id", id)
      .eq("status", "proposed")
  )
}

export async function listWebhooks(actor: Actor) {
  return must(
    await db()
      .from("book_webhooks")
      .select("id, url, events, created_at")
      .eq("user_id", actor.userId)
      .order("created_at", { ascending: false })
  )
}

export async function createWebhook(
  actor: Actor,
  url: unknown,
  events: unknown
) {
  let parsed: URL
  try {
    parsed = new URL(String(url))
  } catch {
    throw new BookError(400, "invalid_url")
  }
  if (parsed.protocol !== "https:" || String(url).length > 500)
    throw new BookError(400, "invalid_url")
  const wanted = Array.isArray(events)
    ? events.filter((e) => WEBHOOK_EVENTS.includes(e))
    : [...WEBHOOK_EVENTS]
  if (!wanted.length) throw new BookError(400, "invalid")
  const { count } = await db()
    .from("book_webhooks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", actor.userId)
  if ((count ?? 0) >= MAX_WEBHOOKS) throw new BookError(409, "limit_reached")
  const secret = newSecret()
  const row = must(
    await db()
      .from("book_webhooks")
      .insert({
        user_id: actor.userId,
        url: parsed.href,
        secret,
        events: wanted,
      })
      .select("id, url, events, created_at")
      .single()
  )
  // The only time the secret leaves the server.
  return { ...row, secret }
}

export async function deleteWebhook(actor: Actor, id: string) {
  if (!uuid.safeParse(id).success) throw new BookError(404, "not_found")
  must(
    await db()
      .from("book_webhooks")
      .delete()
      .eq("id", id)
      .eq("user_id", actor.userId)
  )
}

export const estimateRetranslation = (
  actor: Actor,
  id: string,
  includeReviewed: unknown
) => estimate(actor, id, { requeue: requeued(includeReviewed) })

export const bookCapabilities = () => ({
  credits: {
    per_1000_words_standard: BOOK_RATES.standard,
    per_1000_words_economy: BOOK_RATES.economy,
    ocr_per_page: BOOK_RATES.ocr_page,
    glossary_extraction: BOOK_RATES.extract,
    back_check_per_chapter: BOOK_RATES.backcheck,
  },
  max_file_bytes: MAX_BOOK_BYTES,
  fake_model: fakeEnabled(),
})

export { WEBHOOK_EVENTS }
