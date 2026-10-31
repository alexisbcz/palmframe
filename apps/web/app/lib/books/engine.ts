import type { BookModel, BatchResult, ModelCall, Usage } from "./ai.server"
import { ModelCutShort, ModelDeclined, PayerFailed } from "./ai.server"
import { chunkSegments, memorable, sourceHash, translatable } from "./chunk"
import type {
  BookRow,
  ChapterRow,
  JobRow,
  PageRow,
  SegmentRow,
} from "./database"
import {
  checkGlossary,
  countTerm,
  findCandidates,
  termsFor,
  type GlossaryTerm,
} from "./glossary"
import { checkTags, escapeStrayAngles, stripAllTags, stripTags } from "./inline"
import {
  BOOK_RATES,
  DEFAULT_STYLE,
  countWords,
  wordsToCredits,
  type BookBible,
  type ParsedChapter,
  type Term,
} from "./model"
import type { LaidOutPage, PageBlock } from "./parse/layout"
import { assemblePages } from "./parse/layout"
import {
  BACKCHECK_SCHEMA,
  EXTRACT_SCHEMA,
  OCR_SCHEMA,
  OCR_SYSTEM,
  SUMMARY_SCHEMA,
  SUMMARY_SYSTEM,
  TRANSLATE_SCHEMA,
  backCheckSystem,
  extractSystem,
  translatorContext,
  translatorSystem,
} from "./prompts"
import {
  chapterScore,
  checkSegment,
  sampleForBackCheck,
  type Issue,
} from "./qa"

// The work itself, against a small repository interface: the same code runs on
// Supabase in production and on an in-memory store in tests, which is how the
// claims below get checked. A job only ever moves forward by writing rows, so
// any slice can die at any line and the next one carries on.
export const CONCURRENCY = 4
export const MAX_ATTEMPTS = 3
const MAX_ERRORS = 6
const BACKOFF_MS = 60_000
const BATCH_POLL_MS = 60_000
const TAIL = 3

export interface NewIssue extends Issue {
  segment_id: string
}

export interface NewTerm extends Omit<Term, "id" | "state"> {
  occurrences: number
}

export interface EngineRepo {
  book(id: string): Promise<BookRow>
  setBook(id: string, patch: Partial<BookRow>): Promise<void>
  chapters(bookId: string): Promise<ChapterRow[]>
  setChapter(id: string, patch: Partial<ChapterRow>): Promise<void>
  // Pending segments in reading order, limited to `chapters` if given.
  pending(
    bookId: string,
    chapters: string[] | undefined,
    limit: number
  ): Promise<SegmentRow[]>
  // Best translation so far of each hash: locked, then reviewed, then machine.
  memory(bookId: string, hashes: string[]): Promise<Map<string, string>>
  save(
    jobId: string,
    items: { id: string; target: string; memory: boolean }[]
  ): Promise<number>
  // Counts a try. Past MAX_ATTEMPTS the segment becomes `failed`.
  attempted(ids: string[]): Promise<void>
  before(
    chapterId: string,
    position: number,
    limit: number
  ): Promise<SegmentRow[]>
  segments(bookId: string): Promise<SegmentRow[]>
  chapterSegments(chapterId: string): Promise<SegmentRow[]>
  terms(book: BookRow): Promise<GlossaryTerm[]>
  addSuggestions(book: BookRow, terms: NewTerm[]): Promise<void>
  job(id: string): Promise<JobRow>
  setJob(id: string, patch: Partial<JobRow>): Promise<void>
  finishJob(id: string, patch: Partial<JobRow>): Promise<boolean>
  startQa(job: JobRow): Promise<void>
  settle(job: JobRow, used: number): Promise<number>
  replaceIssues(chapter: ChapterRow, issues: NewIssue[]): Promise<void>
  scanPages(bookId: string, limit: number): Promise<PageRow[]>
  allPages(bookId: string): Promise<PageRow[]>
  setPage(id: string, patch: Partial<PageRow>): Promise<void>
  pageImage(path: string): Promise<{ data: string; media: string }>
  writeBook(book: BookRow, chapters: ParsedChapter[]): Promise<void>
  replaceChapter(
    book: BookRow,
    position: number,
    blocks: ParsedChapter["blocks"]
  ): Promise<void>
}

export interface Engine {
  repo: EngineRepo
  model: BookModel
  now: () => number
  emit: (event: string, job: JobRow) => Promise<void>
}

export type SliceResult = "continue" | "wait" | "done"

const addUsage = (job: JobRow, u: Usage | undefined) => {
  if (!u) return
  const sum = job.usage as Record<string, number>
  for (const key of Object.keys(u) as (keyof Usage)[])
    sum[key] = (sum[key] ?? 0) + u[key]
}

const styleOf = (book: BookRow) => ({ ...DEFAULT_STYLE, ...book.style })

function fail(job: JobRow, e: Engine, error: string) {
  return finish(e, job, "failed", error)
}

// What each kind of job is worth at this point, from rows rather than from
// memory, so a resumed job bills the same as an unbroken one.
const usedCredits = (job: JobRow) => {
  if (job.payer !== "credits") return 0
  if (job.kind === "translate")
    return Math.min(
      job.credits_charged,
      wordsToCredits(job.billable, job.params.mode ?? "standard")
    )
  if (job.kind === "ocr")
    return Math.min(job.credits_charged, job.billable * BOOK_RATES.ocr_page)
  return job.status === "succeeded" ? job.credits_charged : 0
}

export async function finish(
  e: Engine,
  job: JobRow,
  status: "succeeded" | "failed" | "cancelled",
  error?: string,
  result?: Record<string, unknown>
) {
  // Counters from the row: a slice's copy can be behind what was really saved.
  const fresh = await e.repo.job(job.id)
  const closed = { ...fresh, usage: job.usage, status }
  const used = usedCredits(closed)
  const moved = await e.repo.finishJob(job.id, {
    status,
    error: error ?? null,
    result: result ?? fresh.result,
    usage: job.usage,
    credits_used: used,
    leased_until: null,
    next_at: null,
    finished_at: new Date(e.now()).toISOString(),
  })
  // Someone else closed it: it was settled there.
  if (!moved) return
  if (closed.payer === "credits" && closed.credits_charged > 0)
    await e.repo.settle(closed, used)
  if (status !== "succeeded") {
    const back = {
      ingest: "failed",
      ocr: "needs_ocr",
      extract: "setup",
      translate: closed.done > 0 ? "review" : "setup",
    } as const
    const next = back[closed.kind as keyof typeof back]
    if (next)
      await e.repo.setBook(closed.book_id, {
        status: next,
        ...(closed.kind === "ingest" && { error: error ?? null }),
      })
  }
  await e.emit(`job.${status}`, { ...closed, credits_used: used })
}

// One retry at the end of a slice, then give up: a job that keeps failing
// shouldn't hold money or a queue slot.
export async function recoverable(e: Engine, job: JobRow, error: unknown) {
  if (error instanceof PayerFailed) {
    await fail(job, e, "openrouter_credits")
    return "done" as const
  }
  const errors = (job.state.errors ?? 0) + 1
  if (errors >= MAX_ERRORS) {
    console.error("Book job gave up", job.id, error)
    await fail(job, e, "too_many_errors")
    return "done" as const
  }
  console.error("Book job will retry", job.id, error)
  await e.repo.setJob(job.id, {
    state: { ...job.state, errors },
    usage: job.usage,
    leased_until: null,
    next_at: new Date(e.now() + BACKOFF_MS).toISOString(),
  })
  return "wait" as const
}

// Pending segments that repeat something already translated are filled in for
// free. Whichever of a run's repeats comes first gets translated; the others
// wait for it, here, on the next pass.
async function fillFromMemory(
  e: Engine,
  job: JobRow,
  segments: SegmentRow[]
): Promise<SegmentRow[]> {
  const candidates = segments.filter((s) => memorable(s.source))
  const known = candidates.length
    ? await e.repo.memory(job.book_id, [
        ...new Set(candidates.map((s) => s.source_hash)),
      ])
    : new Map<string, string>()
  const filled = candidates.flatMap((s) => {
    const target = known.get(s.source_hash)
    return target ? [{ id: s.id, target, memory: true }] : []
  })
  if (filled.length) await e.repo.save(job.id, filled)
  const done = new Set(filled.map((f) => f.id))
  const seen = new Set<string>()
  return segments.filter((s) => {
    if (done.has(s.id)) return false
    if (!memorable(s.source)) return true
    if (seen.has(s.source_hash)) return false
    seen.add(s.source_hash)
    return true
  })
}

interface Reply {
  segments?: { id?: unknown; text?: unknown }[]
}

const clean = (text: string) => escapeStrayAngles(text.trim())

// What's wrong with one translated line, worded for the model's second try.
function reasons(
  s: SegmentRow,
  text: string,
  terms: GlossaryTerm[],
  book: BookRow
) {
  const out: string[] = []
  const tags = checkTags(s.source, text)
  if (tags) out.push("It must keep exactly the inline tags of the source.")
  for (const hit of checkGlossary(
    s.source,
    text,
    terms,
    book.source_lang,
    book.target_lang
  ))
    out.push(`"${hit.term}" must be rendered as "${hit.expected}".`)
  return out
}

async function chunkContext(
  e: Engine,
  book: BookRow,
  chapter: ChapterRow | undefined,
  first: SegmentRow,
  summary: string,
  terms: GlossaryTerm[]
) {
  const tail = await e.repo.before(first.chapter_id, first.position, TAIL)
  return translatorContext({
    terms,
    summary,
    chapter: chapter?.title ?? "",
    tail: tail.map((s) => ({
      source: stripTags(s.source),
      target: s.target && stripTags(s.target),
    })),
  })
}

const payload = (segments: SegmentRow[], notes?: Map<string, string[]>) =>
  JSON.stringify(
    segments.map((s) => ({
      id: s.id,
      kind: s.kind,
      text: s.source,
      ...(notes?.get(s.id) && { fix: notes.get(s.id) }),
    }))
  )

// Saves what's usable from a reply and returns the lines that need another go.
function sortReply(
  value: unknown,
  segments: SegmentRow[],
  terms: GlossaryTerm[],
  book: BookRow
) {
  const texts = new Map<string, string>()
  for (const item of (value as Reply).segments ?? [])
    if (typeof item.id === "string" && typeof item.text === "string")
      texts.set(item.id, clean(item.text))
  const good: { id: string; target: string; memory: boolean }[] = []
  const bad: SegmentRow[] = []
  const notes = new Map<string, string[]>()
  for (const s of segments) {
    const text = texts.get(s.id)
    if (!text) {
      bad.push(s)
      notes.set(s.id, ["This segment was left out. Translate it."])
      continue
    }
    const why = reasons(s, text, terms, book)
    if (why.length) {
      bad.push(s)
      notes.set(s.id, why)
    } else good.push({ id: s.id, target: text, memory: false })
  }
  return { good, bad, notes, texts }
}

async function translateChunk(
  e: Engine,
  job: JobRow,
  book: BookRow,
  system: string,
  chapter: ChapterRow | undefined,
  summary: string,
  allTerms: GlossaryTerm[],
  segments: SegmentRow[],
  signal?: AbortSignal
) {
  const terms = termsFor(
    allTerms,
    segments.map((s) => s.source),
    book.source_lang
  )
  const context = await chunkContext(
    e,
    book,
    chapter,
    segments[0]!,
    summary,
    terms
  )
  const call = (user: string): ModelCall => ({
    task: "translate",
    system,
    context,
    user,
    schema: TRANSLATE_SCHEMA,
    effort: "medium",
  })
  let first: { value: unknown; usage: Usage }
  try {
    first = await e.model.json(call(payload(segments)), signal)
  } catch (error) {
    if (error instanceof ModelDeclined || error instanceof ModelCutShort) {
      // A long chunk retries as smaller ones. One line at a time isolates a
      // line the model won't touch, so one passage can't sink a book.
      if (segments.length > 1) return
      await e.repo.attempted(segments.map((s) => s.id))
      return
    }
    throw error
  }
  addUsage(job, first.usage)
  const { good, bad, notes, texts } = sortReply(
    first.value,
    segments,
    terms,
    book
  )
  if (good.length) await e.repo.save(job.id, good)
  if (!bad.length) return
  let second: Awaited<ReturnType<typeof sortReply>> | null = null
  try {
    const reply = await e.model.json(call(payload(bad, notes)), signal)
    addUsage(job, reply.usage)
    second = sortReply(reply.value, bad, terms, book)
  } catch (error) {
    if (!(error instanceof ModelDeclined || error instanceof ModelCutShort))
      throw error
  }
  if (second?.good.length) await e.repo.save(job.id, second.good)
  // Words without their formatting beat no words: keep the better attempt and
  // let the checks flag it. A line with no words at all gets tried again.
  const left = second?.bad ?? bad
  const kept = left.flatMap((s) => {
    const text = second?.texts.get(s.id) ?? texts.get(s.id)
    if (!text) return []
    const usable = checkTags(s.source, text) ? stripAllTags(text) : text
    return [{ id: s.id, target: usable, memory: false }]
  })
  if (kept.length) await e.repo.save(job.id, kept)
  const missing = left.filter((s) => !kept.some((k) => k.id === s.id))
  if (missing.length) await e.repo.attempted(missing.map((s) => s.id))
}

async function summarize(
  e: Engine,
  job: JobRow,
  book: BookRow,
  chapter: ChapterRow,
  chapters: ChapterRow[]
) {
  if (chapter.summary) return
  const previous =
    chapters.filter((c) => c.position < chapter.position && c.summary).at(-1)
      ?.summary ?? ""
  const text = (await e.repo.chapterSegments(chapter.id))
    .filter((s) => s.translatable)
    .map((s) => stripTags(s.source))
    .join("\n")
    .slice(0, 24_000)
  if (!text) return
  const reply = await e.model.json({
    task: "summary",
    system: SUMMARY_SYSTEM,
    user: `Summary so far:\n${previous || "(none)"}\n\nChapter:\n${text}`,
    schema: SUMMARY_SCHEMA,
    effort: "low",
    maxTokens: 2_000,
  })
  addUsage(job, reply.usage)
  const summary = String((reply.value as { summary?: unknown }).summary ?? "")
  chapter.summary = summary.slice(0, 4_000)
  await e.repo.setChapter(chapter.id, { summary: chapter.summary })
}

const latestSummary = (chapters: ChapterRow[], position: number) =>
  chapters.filter((c) => c.position < position && c.summary).at(-1)?.summary ??
  ""

async function completeTranslation(e: Engine, job: JobRow) {
  const fresh = await e.repo.job(job.id)
  await e.repo.setBook(job.book_id, { status: "review" })
  await finish(e, job, "succeeded", undefined, {
    translated: fresh.done,
    billed_words: fresh.billable,
  })
  await e.repo.startQa(fresh)
}

async function economyPass(
  e: Engine,
  job: JobRow,
  book: BookRow,
  system: string,
  chapters: ChapterRow[],
  terms: GlossaryTerm[]
): Promise<SliceResult> {
  const batch = e.model.batch!
  const open = job.state.batch
  if (open) {
    const results = await batch.results(open.id)
    if (!results) {
      await e.repo.setJob(job.id, {
        leased_until: null,
        next_at: new Date(e.now() + BATCH_POLL_MS).toISOString(),
      })
      return "wait"
    }
    await saveBatch(e, job, book, open, results, terms)
    job.state = { ...job.state, batch: undefined }
    await e.repo.setJob(job.id, { state: job.state, usage: job.usage })
    const chapter = chapters.find((c) => c.id === open.chapter)
    if (chapter) await summarize(e, job, book, chapter, chapters)
    return "continue"
  }
  const pending = await e.repo.pending(book.id, job.params.chapters, 5_000)
  if (!pending.length) return "done"
  // What a batch couldn't do goes line by line at the standard rate, where
  // refusal fallbacks exist. The owner still pays the economy price.
  const retry = pending.filter((s) => s.attempts > 0).slice(0, CONCURRENCY)
  if (retry.length) {
    await Promise.all(
      retry.map((s) => {
        const chapter = chapters.find((c) => c.id === s.chapter_id)
        return translateChunk(
          e,
          job,
          book,
          system,
          chapter,
          latestSummary(chapters, chapter?.position ?? 0),
          terms,
          [s]
        )
      })
    )
    await e.repo.setJob(job.id, { usage: job.usage })
    return "continue"
  }
  const chapterId = pending[0]!.chapter_id
  const inChapter = await fillFromMemory(
    e,
    job,
    pending.filter((s) => s.chapter_id === chapterId)
  )
  if (!inChapter.length) return "continue"
  const chapter = chapters.find((c) => c.id === chapterId)
  const summary = latestSummary(chapters, chapter?.position ?? 0)
  const chunks = chunkSegments(inChapter)
  const calls = await Promise.all(
    chunks.map(async (chunk, i) => {
      const used = termsFor(
        terms,
        chunk.segments.map((s) => s.source),
        book.source_lang
      )
      return {
        id: `c${i}`,
        call: {
          task: "translate" as const,
          system,
          context: await chunkContext(
            e,
            book,
            chapter,
            chunk.segments[0]!,
            summary,
            used
          ),
          user: payload(chunk.segments),
          schema: TRANSLATE_SCHEMA,
          effort: "medium" as const,
        },
      }
    })
  )
  const id = await batch.create(calls)
  job.state = {
    ...job.state,
    batch: {
      id,
      chapter: chapterId,
      chunks: Object.fromEntries(
        chunks.map((chunk, i) => [`c${i}`, chunk.segments.map((s) => s.id)])
      ),
    },
  }
  await e.repo.setJob(job.id, {
    state: job.state,
    leased_until: null,
    next_at: new Date(e.now() + BATCH_POLL_MS).toISOString(),
  })
  return "wait"
}

async function saveBatch(
  e: Engine,
  job: JobRow,
  book: BookRow,
  open: NonNullable<JobRow["state"]["batch"]>,
  results: BatchResult[],
  terms: GlossaryTerm[]
) {
  const ids = Object.values(open.chunks).flat()
  const all = await e.repo.pending(book.id, [open.chapter], 5_000)
  const byId = new Map(all.map((s) => [s.id, s]))
  for (const result of results) {
    if (!result.ok || !open.chunks[result.id]) continue
    addUsage(job, result.usage)
    const segments = open.chunks[result.id]!.flatMap((id) => {
      const s = byId.get(id)
      return s ? [s] : []
    })
    const { good, bad, texts } = sortReply(result.value, segments, terms, book)
    const kept = bad.flatMap((s) => {
      const text = texts.get(s.id)
      return text
        ? [
            {
              id: s.id,
              target: checkTags(s.source, text) ? stripAllTags(text) : text,
              memory: false,
            },
          ]
        : []
    })
    if (good.length || kept.length)
      await e.repo.save(job.id, [...good, ...kept])
  }
  // Whatever the batch lost stays pending and goes round again. Counted, so a
  // line that always fails can't hold the book up forever.
  const answered = new Set(
    results.filter((r) => r.ok).flatMap((r) => open.chunks[r.id] ?? [])
  )
  const lost = ids.filter((id) => !answered.has(id))
  if (lost.length) await e.repo.attempted(lost)
}

export async function translateSlice(
  e: Engine,
  job: JobRow,
  deadline: number
): Promise<SliceResult> {
  const book = await e.repo.book(job.book_id)
  const terms = await e.repo.terms(book)
  const chapters = await e.repo.chapters(book.id)
  const system = translatorSystem({
    sourceLang: book.source_lang,
    targetLang: book.target_lang,
    style: styleOf(book),
    bible: book.bible,
    instruction: job.params.instruction,
  })

  if (job.params.mode === "economy" && e.model.batch) {
    while (e.now() < deadline) {
      const step = await economyPass(e, job, book, system, chapters, terms)
      if (step === "wait") return "wait"
      if (step === "done") {
        await completeTranslation(e, job)
        return "done"
      }
    }
    return "continue"
  }

  while (e.now() < deadline) {
    const current = await e.repo.job(job.id)
    if (current.status !== "running") return "done"
    const pending = await e.repo.pending(book.id, job.params.chapters, 500)
    if (!pending.length) {
      await completeTranslation(e, job)
      return "done"
    }
    const chapterId = pending[0]!.chapter_id
    const chapter = chapters.find((c) => c.id === chapterId)
    const todo = await fillFromMemory(
      e,
      job,
      pending.filter((s) => s.chapter_id === chapterId)
    )
    if (todo.length) {
      const summary = latestSummary(chapters, chapter?.position ?? 0)
      // After a declined or cut-short chunk, one line at a time.
      const retrying = todo.filter((s) => s.attempts > 0)
      const chunks = (
        retrying.length ? chunkSegments(retrying, 1) : chunkSegments(todo)
      ).slice(0, CONCURRENCY)
      const before = job.done
      await Promise.all(
        chunks.map((chunk) =>
          translateChunk(
            e,
            job,
            book,
            system,
            chapter,
            summary,
            terms,
            chunk.segments
          )
        )
      )
      await e.repo.setJob(job.id, { usage: job.usage })
      const after = await e.repo.job(job.id)
      job.done = after.done
      job.billable = after.billable
      // Nothing moved, so the whole chunks were declined or cut short. Each
      // line has a try on its record now, which turns on the path above.
      if (after.done === before && chunks.length)
        await e.repo.attempted(
          chunks.flatMap((c) => c.segments.map((s) => s.id))
        )
    }
    if (chapter) {
      const left = await e.repo.pending(book.id, [chapter.id], 1)
      if (!left.length) await summarize(e, job, book, chapter, chapters)
    }
  }
  return "continue"
}

const pickSamples = (segments: SegmentRow[], every: number) => {
  const step = Math.max(1, Math.floor(segments.length / every))
  return segments.filter((_, i) => i % step === 0).slice(0, every)
}

export async function extractSlice(
  e: Engine,
  job: JobRow
): Promise<SliceResult> {
  const book = await e.repo.book(job.book_id)
  const segments = (await e.repo.segments(book.id)).filter(
    (s) => s.translatable
  )
  const texts = segments.map((s) => s.source)
  const candidates = findCandidates(texts)
  const passages = pickSamples(
    segments.filter((s) => s.kind === "paragraph" && s.source.length > 200),
    40
  ).map((s) => stripTags(s.source).slice(0, 700))
  const reply = await e.model.json({
    task: "extract",
    system: extractSystem(book.source_lang, book.target_lang),
    user: `Candidates:\n${candidates
      .map((c) => `${c.source} (${c.count}): ${c.context}`)
      .join("\n")}\n\nPassages:\n${passages.join("\n\n")}`,
    schema: EXTRACT_SCHEMA,
    effort: "medium",
  })
  addUsage(job, reply.usage)
  const value = reply.value as BookBible & {
    terms?: Omit<Term, "id" | "state" | "case_sensitive">[]
  }
  const all = texts.map(stripTags).join("\n")
  const terms = (value.terms ?? [])
    .filter((t) => t.source?.trim())
    .slice(0, 800)
    .map((t) => ({
      source: t.source.trim().slice(0, 200),
      target: (t.target ?? "").trim().slice(0, 200),
      kind: t.kind,
      dnt: !!t.dnt,
      note: (t.note ?? "").slice(0, 500),
      case_sensitive: false,
      occurrences: countTerm(t.source, all, book.source_lang),
    }))
  await e.repo.addSuggestions(book, terms)
  await e.repo.setBook(book.id, {
    status: "setup",
    bible: {
      summary: String(value.summary ?? "").slice(0, 2_000),
      tone: String(value.tone ?? "").slice(0, 1_000),
      characters: (value.characters ?? []).slice(0, 40).map((c) => ({
        name: String(c.name).slice(0, 100),
        notes: String(c.notes).slice(0, 400),
      })),
    },
  })
  await finish(e, job, "succeeded", undefined, { terms: terms.length })
  return "done"
}

function cleanOcr(value: unknown): { blocks: PageBlock[]; confidence: number } {
  const raw =
    (
      value as {
        blocks?: {
          kind?: unknown
          text?: unknown
          level?: unknown
          confidence?: unknown
        }[]
      }
    ).blocks ?? []
  const blocks = raw.flatMap((b) => {
    const text = typeof b.text === "string" ? b.text.trim() : ""
    if (!text) return []
    const confidence = Math.min(1, Math.max(0, Number(b.confidence) || 0))
    return [
      {
        kind: (b.kind as PageBlock["kind"]) ?? "paragraph",
        text,
        ...(typeof b.level === "number" && { level: b.level }),
        ocr: confidence,
      },
    ]
  })
  const chars = blocks.reduce((n, b) => n + b.text.length, 0)
  return {
    blocks,
    // By length, so a confident heading can't hide a shaky page.
    confidence: chars
      ? blocks.reduce((n, b) => n + b.ocr * b.text.length, 0) / chars
      : 1,
  }
}

async function readPage(e: Engine, job: JobRow, page: PageRow) {
  try {
    const image = await e.repo.pageImage(page.image_path!)
    const reply = await e.model.json({
      task: "ocr",
      system: OCR_SYSTEM,
      user: "Transcribe this page.",
      images: [image],
      schema: OCR_SCHEMA,
      effort: "low",
    })
    addUsage(job, reply.usage)
    const { blocks, confidence } = cleanOcr(reply.value)
    await e.repo.setPage(page.id, { status: "done", blocks, confidence })
    return true
  } catch (error) {
    if (error instanceof ModelDeclined || error instanceof ModelCutShort) {
      await e.repo.setPage(page.id, {
        attempts: page.attempts + 1,
        ...(page.attempts + 1 >= MAX_ATTEMPTS && { status: "failed" }),
      })
      return false
    }
    throw error
  }
}

// OCR is done: pages become chapters. Typeset pages of a mixed PDF were kept
// with their layout, so everything lands in page order.
export async function assembleOcr(e: Engine, book: BookRow) {
  const pages = await e.repo.allPages(book.id)
  if (book.format === "epub") {
    const groups = new Map<number, PageRow[]>()
    for (const page of pages) {
      if (page.chapter_position === null) continue
      groups.set(page.chapter_position, [
        ...(groups.get(page.chapter_position) ?? []),
        page,
      ])
    }
    for (const [position, list] of groups) {
      const blocks = list.flatMap((page) =>
        page.blocks.map((b, i) => ({
          kind: b.kind,
          text: b.text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;"),
          tags: [],
          page: page.number,
          ocr: b.ocr,
          level: b.level,
          locator: `ocr:${page.href}#${i}`,
        }))
      )
      if (blocks.length) await e.repo.replaceChapter(book, position, blocks)
    }
    return
  }
  const laid: LaidOutPage[] = pages.map((p) => ({
    number: p.number,
    blocks: p.blocks,
  }))
  await e.repo.writeBook(book, assemblePages(laid, book.outline))
}

export async function ocrSlice(
  e: Engine,
  job: JobRow,
  deadline: number
): Promise<SliceResult> {
  const book = await e.repo.book(job.book_id)
  while (e.now() < deadline) {
    const current = await e.repo.job(job.id)
    if (current.status !== "running") return "done"
    const pages = await e.repo.scanPages(book.id, CONCURRENCY)
    if (!pages.length) {
      await assembleOcr(e, await e.repo.book(job.book_id))
      await e.repo.setBook(book.id, { status: "setup" })
      await finish(e, { ...current, usage: job.usage }, "succeeded")
      return "done"
    }
    const read = await Promise.all(pages.map((p) => readPage(e, job, p)))
    const count = read.filter(Boolean).length
    const billable = current.billable + count
    await e.repo.setJob(job.id, {
      billable,
      done: current.done + count,
      usage: job.usage,
    })
    job.billable = billable
  }
  return "continue"
}

export async function qaSlice(
  e: Engine,
  job: JobRow,
  deadline: number
): Promise<SliceResult> {
  const book = await e.repo.book(job.book_id)
  const terms = await e.repo.terms(book)
  const chapters = await e.repo.chapters(book.id)
  let cursor = job.state.cursor ?? 0
  while (cursor < chapters.length && e.now() < deadline) {
    const chapter = chapters[cursor]!
    const segments = await e.repo.chapterSegments(chapter.id)
    const issues: NewIssue[] = segments.flatMap((s) =>
      checkSegment(
        {
          source: s.source,
          target: s.target,
          status: s.status,
          translatable: s.translatable,
          kind: s.kind,
        },
        terms,
        book.source_lang,
        book.target_lang
      ).map((issue) => ({ ...issue, segment_id: s.id }))
    )
    if (job.params.backcheck !== false) {
      const sample = sampleForBackCheck(
        segments.filter((s) => s.translatable && s.target?.trim())
      )
      if (sample.length) {
        const reply = await e.model.json({
          task: "backcheck",
          system: backCheckSystem(book.source_lang, book.target_lang),
          user: JSON.stringify(
            sample.map((s) => ({
              id: s.id,
              source: stripTags(s.source),
              translation: stripTags(s.target!),
            }))
          ),
          schema: BACKCHECK_SCHEMA,
          effort: "low",
        })
        addUsage(job, reply.usage)
        const known = new Set(sample.map((s) => s.id))
        for (const row of (
          reply.value as {
            segments?: { id: string; score: number; problem: string }[]
          }
        ).segments ?? [])
          if (known.has(row.id) && row.score < 75)
            issues.push({
              segment_id: row.id,
              kind: "back_check",
              severity: row.score < 50 ? "error" : "warning",
              detail: { score: row.score, problem: row.problem.slice(0, 300) },
            })
      }
    }
    const score = chapterScore(
      segments.filter((s) => s.translatable).length,
      issues
    )
    await e.repo.replaceIssues(chapter, issues)
    await e.repo.setChapter(chapter.id, { score })
    cursor++
    job.state = { ...job.state, cursor }
    await e.repo.setJob(job.id, {
      state: job.state,
      done: cursor,
      total: chapters.length,
      usage: job.usage,
    })
  }
  if (cursor >= chapters.length) {
    await finish(e, job, "succeeded", undefined, {
      chapters: chapters.length,
    })
    return "done"
  }
  return "continue"
}

export { countWords, sourceHash, translatable }
