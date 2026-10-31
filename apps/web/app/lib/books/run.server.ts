import { kickWork } from "@/lib/deepdive/run.server"
import { payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { PayerFailed, bookModel } from "./ai.server"
import {
  BOOK_EXPORTS_BUCKET,
  BOOK_PAGES_BUCKET,
  BOOK_SOURCES_BUCKET,
  type JobRow,
  type PageRow,
} from "./database"
import {
  extractSlice,
  finish,
  ocrSlice,
  qaSlice,
  recoverable,
  translateSlice,
  type Engine,
  type SliceResult,
} from "./engine"
import { BookParseError } from "./errors"
import type { ExportBook } from "./export/common"
import { missing } from "./export/common"
import { buildDocx } from "./export/docx"
import { buildEpub, rewriteEpub } from "./export/epub"
import { buildMarkdown } from "./export/markdown"
import { buildPdf } from "./export/pdf.server"
import { isLanguage, languageOf, type BookFormat } from "./model"
import { openArchive } from "./parse/archive"
import { mimeOf } from "./parse/epub"
import { assemblePages } from "./parse/layout"
import { assertReadable, detectFormat, parseBook } from "./parse/index"
import { extractScans, readPdf } from "./parse/pdf.server"
import { repo, setEnqueue } from "./repo.server"
import { deliverDue, emitEvent } from "./webhooks.server"

const SLICE_MS = 235_000
const LEASE_MS = 280_000
const MAX_SLICES = 2_000
const SCANS_PER_PASS = 8

const db = () => supabaseAdmin()

export const kick = (origin: string, id: string) =>
  kickWork(origin, "/api/books/work", id)

async function download(path: string) {
  const { data, error } = await db()
    .storage.from(BOOK_SOURCES_BUCKET)
    .download(path)
  if (error) throw new BookParseError("upload_missing")
  return new Uint8Array(await data.arrayBuffer())
}

async function ingestSlice(
  e: Engine,
  job: JobRow,
  deadline: number
): Promise<SliceResult> {
  const book = await repo.book(job.book_id)
  const language = (value: string | null) => {
    const code = languageOf(value)?.code
    return job.params.detect && isLanguage(code) && code !== book.target_lang
      ? { source_lang: code }
      : {}
  }
  const bytes = await download(book.source_path)
  if (job.state.scans) return extractPdfScans(e, job, bytes, deadline)

  const format: BookFormat | null = await detectFormat(bytes, book.file_name)
  if (!format) throw new BookParseError("unsupported")
  if (format === "pdf") {
    const pdf = await readPdf(bytes)
    const words = pdf.pages.some((p) => p.blocks.length)
    if (!words && !pdf.scans.length) throw new BookParseError("empty")
    const base = {
      format,
      title: (book.title || pdf.meta.title).slice(0, 500),
      author: pdf.meta.author.slice(0, 300),
      pages: pdf.pageCount,
      warnings: pdf.warnings,
      outline: pdf.outline,
      ...language(pdf.meta.language),
    }
    if (!pdf.scans.length) {
      const chapters = assemblePages(pdf.pages, pdf.outline)
      assertReadable({
        meta: pdf.meta,
        chapters,
        assets: [],
        scans: [],
        warnings: [],
      })
      await repo.setBook(book.id, base)
      await repo.writeBook({ ...book, ...base }, chapters)
      await repo.setBook(book.id, { status: "setup" })
      await finish(e, job, "succeeded")
      return "done"
    }
    // Mixed or scanned: every page is kept, so OCR can slot in between them.
    const typed = pdf.pages.map((p) => ({
      book_id: book.id,
      user_id: book.user_id,
      number: p.number,
      kind: "text" as const,
      status: "done" as const,
      blocks: p.blocks,
    }))
    const scans = pdf.scans.map((number) => ({
      book_id: book.id,
      user_id: book.user_id,
      number,
      kind: "scan" as const,
      // Rows in a bulk insert share their columns, so nothing can be left out.
      status: "pending" as const,
      blocks: [],
    }))
    await db().from("book_pages").delete().eq("book_id", book.id)
    const rows: Partial<PageRow>[] = [...typed, ...scans]
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db()
        .from("book_pages")
        .insert(rows.slice(i, i + 200))
      if (error) throw new Error(error.message)
    }
    await repo.setBook(book.id, base)
    job.state = { ...job.state, scans: pdf.scans, cursor: 0 }
    await repo.setJob(job.id, { state: job.state, total: pdf.scans.length })
    return extractPdfScans(e, job, bytes, deadline)
  }

  const parsed = await parseBook(bytes, format)
  const patch = {
    format,
    title: (book.title || parsed.meta.title).slice(0, 500),
    author: parsed.meta.author.slice(0, 300),
    warnings: parsed.warnings,
    ...language(parsed.meta.language),
  }
  await repo.setBook(book.id, patch)
  await repo.writeBook({ ...book, ...patch }, parsed.chapters)
  if (parsed.scans.length) {
    const archive = await openArchive(bytes)
    await db().from("book_pages").delete().eq("book_id", book.id)
    for (const scan of parsed.scans) {
      const image = await archive.read(scan.image!)
      const path = `${book.user_id}/${book.id}/p${scan.number}.${scan.image!.split(".").pop()}`
      const up = await db()
        .storage.from(BOOK_PAGES_BUCKET)
        .upload(path, image, {
          contentType: mimeOf(scan.image!),
          upsert: true,
        })
      if (up.error) throw new Error(up.error.message)
      const { error } = await db()
        .from("book_pages")
        .insert({
          book_id: book.id,
          user_id: book.user_id,
          number: scan.number,
          kind: "scan",
          chapter_position: scan.chapter ?? null,
          href: scan.href ?? null,
          image_path: path,
        })
      if (error) throw new Error(error.message)
    }
    await repo.setBook(book.id, {
      status: "needs_ocr",
      pages: parsed.scans.length,
    })
  } else await repo.setBook(book.id, { status: "setup" })
  await finish(e, job, "succeeded")
  return "done"
}

async function extractPdfScans(
  e: Engine,
  job: JobRow,
  bytes: Uint8Array,
  deadline: number
): Promise<SliceResult> {
  const scans = job.state.scans ?? []
  let cursor = job.state.cursor ?? 0
  const book = await repo.book(job.book_id)
  while (cursor < scans.length && e.now() < deadline) {
    const numbers = scans.slice(cursor, cursor + SCANS_PER_PASS)
    for (const scan of await extractScans(bytes, numbers)) {
      if (!scan.png) {
        await db()
          .from("book_pages")
          .update({ status: "unreadable" })
          .eq("book_id", book.id)
          .eq("number", scan.number)
        continue
      }
      const path = `${book.user_id}/${book.id}/p${scan.number}.png`
      const up = await db()
        .storage.from(BOOK_PAGES_BUCKET)
        .upload(path, scan.png, { contentType: "image/png", upsert: true })
      if (up.error) throw new Error(up.error.message)
      await db()
        .from("book_pages")
        .update({ image_path: path, width: scan.width, height: scan.height })
        .eq("book_id", book.id)
        .eq("number", scan.number)
    }
    cursor += numbers.length
    job.state = { ...job.state, cursor }
    await repo.setJob(job.id, { state: job.state, done: cursor })
  }
  if (cursor < scans.length) return "continue"
  await repo.setBook(book.id, { status: "needs_ocr" })
  await finish(e, job, "succeeded")
  return "done"
}

const EXPORT_TYPES = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown; charset=utf-8",
} as const

async function exportSlice(e: Engine, job: JobRow): Promise<SliceResult> {
  const book = await repo.book(job.book_id)
  const chapters = await repo.chapters(book.id)
  const format = job.params.format ?? "epub"
  let source: Uint8Array | null = null
  const needsSource = book.format === "epub" || book.format === "docx"
  if (needsSource) source = await download(book.source_path)
  const archive = needsSource ? await openArchive(source!) : null
  const data: ExportBook = {
    title: book.title || book.file_name.replace(/\.[^.]+$/, ""),
    author: book.author,
    sourceLang: book.source_lang,
    targetLang: book.target_lang,
    bilingual: !!job.params.bilingual,
    chapters: await Promise.all(
      chapters.map(async (c) => ({
        title: c.title,
        segments: await repo.chapterSegments(c.id),
      }))
    ),
    asset: async (path) => (archive?.has(path) ? archive.read(path) : null),
  }
  const bytes =
    format === "md"
      ? buildMarkdown(data)
      : format === "docx"
        ? await buildDocx(data)
        : format === "pdf"
          ? await buildPdf(data)
          : book.format === "epub"
            ? await rewriteEpub(source!, data)
            : await buildEpub(data)
  const path = `${book.user_id}/${book.id}/${job.id}.${format}`
  const up = await db()
    .storage.from(BOOK_EXPORTS_BUCKET)
    .upload(path, bytes, { contentType: EXPORT_TYPES[format], upsert: true })
  if (up.error) throw new Error(up.error.message)
  await finish(e, job, "succeeded", undefined, {
    path,
    size: bytes.length,
    format,
    bilingual: data.bilingual,
    untranslated: missing(data),
  })
  return "done"
}

const engineFor = async (job: JobRow): Promise<Engine> => {
  const openrouter =
    job.payer === "openrouter" ? await payingConnection(job.user_id) : null
  if (job.payer === "openrouter" && !openrouter)
    throw new PayerFailed("OpenRouter was disconnected.")
  return {
    repo,
    model: bookModel(openrouter),
    now: Date.now,
    emit: (event, closed) => emitEvent(event, closed),
  }
}

async function claim(id: string) {
  const now = new Date()
  const { data } = await db()
    .from("book_jobs")
    .update({
      status: "running",
      leased_until: new Date(now.getTime() + LEASE_MS).toISOString(),
    })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .or(`leased_until.is.null,leased_until.lt.${now.toISOString()}`)
    .select("*")
  return data?.[0] ?? null
}

export async function runSlice(id: string, origin: string) {
  setEnqueue((jobId) => kick(origin, jobId))
  const job = await claim(id)
  // Someone else holds it, or it has finished.
  if (!job) return "skipped"
  const silent: Engine = {
    repo,
    model: {
      json() {
        throw new Error("No model.")
      },
    },
    now: Date.now,
    emit: emitEvent,
  }
  if (job.slices >= MAX_SLICES) {
    await finish(silent, job, "failed", "too_many_slices")
    return "failed"
  }
  const deadline = Date.now() + SLICE_MS
  let step: SliceResult
  let engine = silent
  try {
    engine = await engineFor(job)
    step =
      job.kind === "ingest"
        ? await ingestSlice(engine, job, deadline)
        : job.kind === "ocr"
          ? await ocrSlice(engine, job, deadline)
          : job.kind === "extract"
            ? await extractSlice(engine, job)
            : job.kind === "translate"
              ? await translateSlice(engine, job, deadline)
              : job.kind === "qa"
                ? await qaSlice(engine, job, deadline)
                : await exportSlice(engine, job)
  } catch (e) {
    if (e instanceof BookParseError) {
      await finish(engine, job, "failed", e.code)
      return "failed"
    }
    step = await recoverable(engine, job, e)
  }
  if (step === "done") return "finished"
  if (step === "wait") return "waiting"
  await repo.setJob(id, {
    slices: job.slices + 1,
    leased_until: null,
    usage: job.usage,
    state: { ...job.state, errors: 0 },
  })
  await kick(origin, id)
  return "continued"
}

// Runs from pg_cron. Re-kicks anything due whose function died or whose batch
// needs a look, then gets webhooks moving. Each kick is its own function, so
// this stays quick however many books are running.
export async function tick(origin: string) {
  const now = new Date().toISOString()
  const { data } = await db()
    .from("book_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .or(`leased_until.is.null,leased_until.lt.${now}`)
    .or(`next_at.is.null,next_at.lte.${now}`)
    .order("updated_at")
    .limit(20)
  await Promise.all((data ?? []).map((job) => kick(origin, job.id)))
  await deliverDue()
  return data?.length ?? 0
}
