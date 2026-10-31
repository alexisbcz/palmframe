import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { memorable, sourceHash, translatable } from "./chunk"
import {
  BOOK_PAGES_BUCKET,
  type BookRow,
  type PageRow,
  type SegmentRow,
} from "./database"
import { MAX_ATTEMPTS, type EngineRepo } from "./engine"
import { stripTags } from "./inline"
import { countWords, type ParsedChapter } from "./model"

const db = () => supabaseAdmin()

const check = <T>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message)
  return r.data as NonNullable<T>
}

const PAGE = 1000

// PostgREST stops at 1,000 rows, and a book has tens of thousands.
async function pagedSegments(
  query: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: SegmentRow[] | null
    error: { message: string } | null
  }>,
  limit = Infinity
) {
  const out: SegmentRow[] = []
  for (let from = 0; out.length < limit; from += PAGE) {
    const rows = check(await query(from, from + PAGE - 1)) ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out.slice(0, limit === Infinity ? undefined : limit)
}

const segmentRows = (
  book: BookRow,
  chapterId: string,
  blocks: ParsedChapter["blocks"]
): Partial<SegmentRow>[] =>
  blocks.map((b, position) => {
    const words = countWords(stripTags(b.text))
    const does = translatable(b.kind, b.text)
    return {
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
      words: does ? words : 0,
      translatable: does,
      status: does ? "pending" : "fixed",
    }
  })

async function insertSegments(rows: Partial<SegmentRow>[]) {
  for (let i = 0; i < rows.length; i += 500)
    check(
      await db()
        .from("book_segments")
        .insert(rows.slice(i, i + 500))
    )
}

async function refreshTotals(bookId: string) {
  const segments = await pagedSegments(
    (from, to) =>
      db()
        .from("book_segments")
        .select("words")
        .eq("book_id", bookId)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: SegmentRow[] | null
        error: { message: string } | null
      }>
  )
  check(
    await db()
      .from("book_projects")
      .update({
        segments: segments.length,
        words: segments.reduce((n, s) => n + s.words, 0),
      })
      .eq("id", bookId)
  )
}

export const repo: EngineRepo = {
  async book(id) {
    return check(
      await db().from("book_projects").select("*").eq("id", id).single()
    )
  },
  async setBook(id, patch) {
    check(await db().from("book_projects").update(patch).eq("id", id))
  },
  async chapters(bookId) {
    return (
      check(
        await db()
          .from("book_chapters")
          .select("*")
          .eq("book_id", bookId)
          .order("position")
      ) ?? []
    )
  },
  async setChapter(id, patch) {
    check(await db().from("book_chapters").update(patch).eq("id", id))
  },
  async pending(bookId, chapters, limit) {
    const order = await this.chapters(bookId)
    const allowed = chapters ? new Set(chapters) : null
    const out: SegmentRow[] = []
    for (const chapter of order) {
      if (allowed && !allowed.has(chapter.id)) continue
      const rows = await pagedSegments(
        (from, to) =>
          db()
            .from("book_segments")
            .select("*")
            .eq("chapter_id", chapter.id)
            .eq("status", "pending")
            .order("position")
            .range(from, to),
        limit - out.length
      )
      out.push(...rows)
      if (out.length >= limit) break
    }
    return out
  },
  async memory(bookId, hashes) {
    const out = new Map<string, { target: string; rank: number }>()
    const rank = { locked: 3, reviewed: 2, machine: 1 } as Record<
      string,
      number
    >
    for (let i = 0; i < hashes.length; i += 200) {
      const rows =
        check(
          await db()
            .from("book_segments")
            .select("source_hash, target, status")
            .eq("book_id", bookId)
            .in("source_hash", hashes.slice(i, i + 200))
            .in("status", ["locked", "reviewed", "machine"])
            .limit(PAGE)
        ) ?? []
      for (const row of rows) {
        const r = rank[row.status] ?? 0
        if (row.target && r > (out.get(row.source_hash)?.rank ?? 0))
          out.set(row.source_hash, { target: row.target, rank: r })
      }
    }
    return new Map([...out].map(([k, v]) => [k, v.target]))
  },
  async save(jobId, items) {
    const { data, error } = await db().rpc("book_save_translations", {
      p_job: jobId,
      p_items: items,
    })
    if (error) throw new Error(error.message)
    return data as number
  },
  async attempted(ids) {
    const rows =
      check(
        await db()
          .from("book_segments")
          .select("id, attempts")
          .in("id", ids)
          .eq("status", "pending")
      ) ?? []
    await Promise.all(
      rows.map((row) =>
        db()
          .from("book_segments")
          .update({
            attempts: row.attempts + 1,
            ...(row.attempts + 1 >= MAX_ATTEMPTS && { status: "failed" }),
          })
          .eq("id", row.id)
          .eq("status", "pending")
      )
    )
  },
  async before(chapterId, position, limit) {
    const rows =
      check(
        await db()
          .from("book_segments")
          .select("*")
          .eq("chapter_id", chapterId)
          .lt("position", position)
          .eq("translatable", true)
          .order("position", { ascending: false })
          .limit(limit)
      ) ?? []
    return rows.reverse()
  },
  async segments(bookId) {
    const chapters = await this.chapters(bookId)
    const out: SegmentRow[] = []
    for (const chapter of chapters)
      out.push(...(await this.chapterSegments(chapter.id)))
    return out
  },
  chapterSegments(chapterId) {
    return pagedSegments((from, to) =>
      db()
        .from("book_segments")
        .select("*")
        .eq("chapter_id", chapterId)
        .order("position")
        .range(from, to)
    )
  },
  async terms(book) {
    const own = await db()
      .from("book_glossaries")
      .select("id")
      .eq("book_id", book.id)
      .maybeSingle()
    const ids = [...book.glossaries, ...(own.data ? [own.data.id] : [])]
    if (!ids.length) return []
    const rows =
      check(
        await db()
          .from("book_terms")
          .select("source, target, dnt, case_sensitive")
          .in("glossary_id", ids)
          .eq("state", "approved")
          .limit(PAGE * 5)
      ) ?? []
    return rows.filter((t) => t.dnt || t.target.trim())
  },
  async addSuggestions(book, terms) {
    const glossary = await ownGlossary(book)
    if (!terms.length) return
    check(
      await db()
        .from("book_terms")
        .upsert(
          terms.map((t) => ({
            ...t,
            glossary_id: glossary,
            user_id: book.user_id,
            state: "suggested" as const,
          })),
          { onConflict: "glossary_id,source", ignoreDuplicates: true }
        )
    )
  },
  async job(id) {
    return check(await db().from("book_jobs").select("*").eq("id", id).single())
  },
  async setJob(id, patch) {
    check(await db().from("book_jobs").update(patch).eq("id", id))
  },
  async finishJob(id, patch) {
    const rows = check(
      await db()
        .from("book_jobs")
        .update(patch)
        .eq("id", id)
        .in("status", ["queued", "running"])
        .select("id")
    )
    return !!rows?.length
  },
  async startQa(job) {
    const chapters = await this.chapters(job.book_id)
    const { data, error } = await db()
      .from("book_jobs")
      .insert({
        book_id: job.book_id,
        user_id: job.user_id,
        kind: "qa",
        payer: job.payer === "openrouter" ? "openrouter" : "free",
        total: chapters.length,
        params: { backcheck: true },
      })
      .select("id")
      .single()
    if (!error && data) await enqueue(data.id)
  },
  async settle(job, used) {
    const { data, error } = await db().rpc("settle_credits_for", {
      p_user: job.user_id,
      p_job: job.id,
      p_used: used,
    })
    if (error) throw new Error(error.message)
    return data as number
  },
  async replaceIssues(chapter, issues) {
    check(await db().from("book_issues").delete().eq("chapter_id", chapter.id))
    for (let i = 0; i < issues.length; i += 500)
      check(
        await db()
          .from("book_issues")
          .insert(
            issues.slice(i, i + 500).map((issue) => ({
              ...issue,
              book_id: chapter.book_id,
              chapter_id: chapter.id,
              user_id: chapter.user_id,
            }))
          )
      )
  },
  async scanPages(bookId, limit) {
    return (
      check(
        await db()
          .from("book_pages")
          .select("*")
          .eq("book_id", bookId)
          .eq("status", "pending")
          .eq("kind", "scan")
          .not("image_path", "is", null)
          .order("number")
          .limit(limit)
      ) ?? []
    )
  },
  async allPages(bookId) {
    const out: PageRow[] = []
    for (let from = 0; ; from += PAGE) {
      const rows =
        check(
          await db()
            .from("book_pages")
            .select("*")
            .eq("book_id", bookId)
            .order("number")
            .range(from, from + PAGE - 1)
        ) ?? []
      out.push(...rows)
      if (rows.length < PAGE) return out
    }
  },
  async setPage(id, patch) {
    check(await db().from("book_pages").update(patch).eq("id", id))
  },
  async pageImage(path) {
    const { data, error } = await db()
      .storage.from(BOOK_PAGES_BUCKET)
      .download(path)
    if (error) throw new Error(error.message)
    return {
      data: Buffer.from(await data.arrayBuffer()).toString("base64"),
      media: data.type || "image/png",
    }
  },
  async writeBook(book, chapters) {
    check(await db().from("book_chapters").delete().eq("book_id", book.id))
    for (const [position, chapter] of chapters.entries()) {
      const row = check(
        await db()
          .from("book_chapters")
          .insert({
            book_id: book.id,
            user_id: book.user_id,
            position,
            title: chapter.title.slice(0, 500),
            href: chapter.href ?? null,
            segments: chapter.blocks.length,
          })
          .select("id")
          .single()
      )
      await insertSegments(segmentRows(book, row.id, chapter.blocks))
    }
    await refreshTotals(book.id)
  },
  async replaceChapter(book, position, blocks) {
    const chapter = check(
      await db()
        .from("book_chapters")
        .select("id")
        .eq("book_id", book.id)
        .eq("position", position)
        .single()
    )
    check(
      await db().from("book_segments").delete().eq("chapter_id", chapter.id)
    )
    await insertSegments(segmentRows(book, chapter.id, blocks))
    check(
      await db()
        .from("book_chapters")
        .update({ segments: blocks.length })
        .eq("id", chapter.id)
    )
    await refreshTotals(book.id)
  },
}

export async function ownGlossary(
  book: Pick<
    BookRow,
    "id" | "user_id" | "title" | "file_name" | "source_lang" | "target_lang"
  >
) {
  const found = await db()
    .from("book_glossaries")
    .select("id")
    .eq("book_id", book.id)
    .maybeSingle()
  if (found.data) return found.data.id
  const made = check(
    await db()
      .from("book_glossaries")
      .upsert(
        {
          user_id: book.user_id,
          book_id: book.id,
          name: (book.title || book.file_name).slice(0, 120),
          source_lang: book.source_lang,
          target_lang: book.target_lang,
        },
        { onConflict: "book_id" }
      )
      .select("id")
      .single()
  )
  return made.id
}

// Set by run.server so this file doesn't need the kick's origin.
let enqueue: (jobId: string) => Promise<void> = async () => {}

export const setEnqueue = (fn: typeof enqueue) => {
  enqueue = fn
}

export { memorable }
