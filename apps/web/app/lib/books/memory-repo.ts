import { memorable, sourceHash, translatable } from "./chunk"
import type {
  BookRow,
  ChapterRow,
  JobRow,
  PageRow,
  SegmentRow,
} from "./database"
import { MAX_ATTEMPTS, type EngineRepo, type NewIssue } from "./engine"
import type { GlossaryTerm } from "./glossary"
import { stripTags } from "./inline"
import { countWords, type ParsedChapter } from "./model"

// The engine's repository in memory, for tests. It keeps the database's two
// promises by hand, so a test can see them hold: `save` only writes pending
// rows, and a locked row refuses a change. `rls.sql` tests the real ones.
export class MemoryRepo implements EngineRepo {
  books = new Map<string, BookRow>()
  chaptersById = new Map<string, ChapterRow>()
  rows = new Map<string, SegmentRow>()
  jobs = new Map<string, JobRow>()
  pages = new Map<string, PageRow>()
  glossary: GlossaryTerm[] = []
  suggestions: unknown[] = []
  issues = new Map<string, NewIssue[]>()
  images = new Map<string, { data: string; media: string }>()
  settled = new Map<string, number>()
  qaStarted = 0
  // Fails the next N saves, to stop a job at the worst possible moment.
  failSaves = 0

  addBook(patch: Partial<BookRow> = {}) {
    const id = crypto.randomUUID()
    const book = {
      id,
      user_id: "user",
      title: "Book",
      author: "",
      file_name: "book.txt",
      format: "txt",
      size_bytes: 10,
      source_path: "x",
      source_lang: "en",
      target_lang: "fr",
      status: "setup",
      rights_confirmed_at: "",
      style: {},
      bible: {},
      glossaries: [],
      words: 0,
      segments: 0,
      pages: 0,
      error: null,
      warnings: [],
      outline: [],
      created_at: "",
      updated_at: "",
      ...patch,
    } satisfies BookRow as BookRow
    this.books.set(id, book)
    return book
  }

  addJob(book: BookRow, patch: Partial<JobRow> = {}) {
    const job = {
      id: crypto.randomUUID(),
      book_id: book.id,
      user_id: book.user_id,
      key_id: null,
      kind: "translate",
      status: "running",
      params: {},
      state: {},
      done: 0,
      total: 0,
      billable: 0,
      credits_charged: 0,
      credits_used: 0,
      payer: "credits",
      usage: {},
      result: null,
      error: null,
      slices: 0,
      leased_until: null,
      next_at: null,
      idempotency_key: null,
      created_at: "",
      finished_at: null,
      updated_at: "",
      ...patch,
    } satisfies JobRow as JobRow
    this.jobs.set(job.id, job)
    return job
  }

  async book(id: string) {
    return structuredClone(this.books.get(id)!)
  }
  async setBook(id: string, patch: Partial<BookRow>) {
    Object.assign(this.books.get(id)!, patch)
  }
  async chapters(bookId: string) {
    return [...this.chaptersById.values()]
      .filter((c) => c.book_id === bookId)
      .sort((a, b) => a.position - b.position)
  }
  async setChapter(id: string, patch: Partial<ChapterRow>) {
    Object.assign(this.chaptersById.get(id)!, patch)
  }
  private ordered(bookId: string) {
    const positions = new Map(
      [...this.chaptersById.values()].map((c) => [c.id, c.position])
    )
    return [...this.rows.values()]
      .filter((s) => s.book_id === bookId)
      .sort(
        (a, b) =>
          positions.get(a.chapter_id)! - positions.get(b.chapter_id)! ||
          a.position - b.position
      )
  }
  async pending(bookId: string, chapters: string[] | undefined, limit: number) {
    return this.ordered(bookId)
      .filter(
        (s) =>
          s.status === "pending" &&
          (!chapters || chapters.includes(s.chapter_id))
      )
      .slice(0, limit)
      .map((s) => structuredClone(s))
  }
  async memory(bookId: string, hashes: string[]) {
    const out = new Map<string, string>()
    const ranks: Record<string, number> = { locked: 3, reviewed: 2, machine: 1 }
    const best = new Map<string, number>()
    for (const s of this.ordered(bookId)) {
      const rank = ranks[s.status]
      if (
        rank &&
        s.target &&
        hashes.includes(s.source_hash) &&
        rank > (best.get(s.source_hash) ?? 0)
      ) {
        best.set(s.source_hash, rank)
        out.set(s.source_hash, s.target)
      }
    }
    return out
  }
  async save(
    jobId: string,
    items: { id: string; target: string; memory: boolean }[]
  ) {
    if (this.failSaves > 0) {
      this.failSaves--
      throw new Error("Function killed.")
    }
    const job = this.jobs.get(jobId)!
    let written = 0
    for (const item of items) {
      const s = this.rows.get(item.id)
      if (s?.status !== "pending") continue
      s.target = item.target
      s.status = "machine"
      s.from_memory = item.memory
      s.job_id = jobId
      written++
      if (!item.memory) job.billable += s.words
    }
    job.done += written
    return written
  }
  async attempted(ids: string[]) {
    for (const id of ids) {
      const s = this.rows.get(id)
      if (s?.status !== "pending") continue
      s.attempts++
      if (s.attempts >= MAX_ATTEMPTS) s.status = "failed"
    }
  }
  async before(chapterId: string, position: number, limit: number) {
    return [...this.rows.values()]
      .filter(
        (s) =>
          s.chapter_id === chapterId && s.position < position && s.translatable
      )
      .sort((a, b) => a.position - b.position)
      .slice(-limit)
  }
  async segments(bookId: string) {
    return this.ordered(bookId)
  }
  async chapterSegments(chapterId: string) {
    return [...this.rows.values()]
      .filter((s) => s.chapter_id === chapterId)
      .sort((a, b) => a.position - b.position)
  }
  async terms() {
    return this.glossary
  }
  async addSuggestions(_book: BookRow, terms: unknown[]) {
    this.suggestions.push(...terms)
  }
  async job(id: string) {
    return structuredClone(this.jobs.get(id)!)
  }
  async setJob(id: string, patch: Partial<JobRow>) {
    Object.assign(this.jobs.get(id)!, patch)
  }
  async finishJob(id: string, patch: Partial<JobRow>) {
    const job = this.jobs.get(id)!
    if (job.status !== "queued" && job.status !== "running") return false
    Object.assign(job, patch)
    return true
  }
  async startQa() {
    this.qaStarted++
  }
  async settle(job: JobRow, used: number) {
    if (this.settled.has(job.id)) return 0
    const back = Math.max(job.credits_charged - used, 0)
    this.settled.set(job.id, back)
    return back
  }
  async replaceIssues(chapter: ChapterRow, issues: NewIssue[]) {
    this.issues.set(chapter.id, issues)
  }
  async scanPages(bookId: string, limit: number) {
    return [...this.pages.values()]
      .filter((p) => p.book_id === bookId && p.status === "pending")
      .sort((a, b) => a.number - b.number)
      .slice(0, limit)
  }
  async allPages(bookId: string) {
    return [...this.pages.values()]
      .filter((p) => p.book_id === bookId)
      .sort((a, b) => a.number - b.number)
  }
  async setPage(id: string, patch: Partial<PageRow>) {
    Object.assign(this.pages.get(id)!, patch)
  }
  async pageImage(path: string) {
    return this.images.get(path)!
  }
  async writeBook(book: BookRow, chapters: ParsedChapter[]) {
    for (const [id, c] of this.chaptersById)
      if (c.book_id === book.id) this.chaptersById.delete(id)
    for (const [id, s] of this.rows)
      if (s.book_id === book.id) this.rows.delete(id)
    chapters.forEach((chapter, position) => {
      const id = crypto.randomUUID()
      this.chaptersById.set(id, {
        id,
        book_id: book.id,
        user_id: book.user_id,
        position,
        title: chapter.title,
        href: chapter.href ?? null,
        summary: "",
        score: null,
        segments: chapter.blocks.length,
      })
      this.addBlocks(book, id, chapter.blocks)
    })
  }
  addBlocks(book: BookRow, chapterId: string, blocks: ParsedChapter["blocks"]) {
    blocks.forEach((b, position) => {
      const id = crypto.randomUUID()
      const does = translatable(b.kind, b.text)
      this.rows.set(id, {
        id,
        book_id: book.id,
        chapter_id: chapterId,
        user_id: book.user_id,
        position,
        kind: b.kind,
        level: b.level ?? null,
        group_key: b.group ?? null,
        cell: b.cell ?? null,
        locator: b.locator ?? null,
        page: b.page ?? null,
        asset: b.asset ?? null,
        ocr: b.ocr ?? null,
        source: b.text,
        tags: b.tags,
        source_hash: sourceHash(b.text),
        words: does ? countWords(stripTags(b.text)) : 0,
        translatable: does,
        target: null,
        status: does ? "pending" : "fixed",
        from_memory: false,
        attempts: 0,
        version: 1,
        job_id: null,
        updated_at: "",
      })
    })
  }
  async replaceChapter(
    book: BookRow,
    position: number,
    blocks: ParsedChapter["blocks"]
  ) {
    const chapter = (await this.chapters(book.id))[position]!
    for (const [id, s] of this.rows)
      if (s.chapter_id === chapter.id) this.rows.delete(id)
    this.addBlocks(book, chapter.id, blocks)
  }
}

export { memorable }
