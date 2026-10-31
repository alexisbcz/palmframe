import { chat, messages } from "@/lib/books/assistant.server"
import { replaceAcross } from "@/lib/books/assistant.server"
import * as books from "@/lib/books/service.server"
import { BookError, type Actor } from "@/lib/books/service.server"
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/books/model"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.books"

export const config = { maxDuration: 150 }

// Studio's side of book translation: one POST with an intent. Replies carry a
// code for the client to word, and the rules live in the service.
const fail = (code: string, status: number) =>
  Response.json({ error: code }, { status })

type Body = Record<string, any>

async function run(actor: Actor, b: Body, origin: string): Promise<unknown> {
  const id = b.id as string
  switch (b.intent) {
    case "prepare":
      return books.prepareBook(actor, {
        fileName: b.fileName,
        size: b.size,
        rights: b.rights,
        sourceLang: b.sourceLang,
        targetLang: b.targetLang,
      })
    case "ingest":
      return books.ingest(actor, id, origin, b.detect === true)
    case "status":
      return books.bookStatus(actor, id)
    case "chapters":
      return { chapters: await books.chapters(actor, id) }
    case "update":
      return books.updateBook(actor, id, b.patch ?? {})
    case "delete":
      await books.deleteBook(actor, id)
      return { ok: true }
    case "segments":
      return books.segments(actor, id, {
        chapter: b.chapter,
        status: b.status,
        search: b.search,
        page: b.page,
        cursor: b.cursor,
      })
    case "edit":
      return books.editSegment(actor, id, b.segment, b.edit ?? {})
    case "chapterStatus":
      if (b.status !== "reviewed" && b.status !== "locked")
        throw new BookError(400, "invalid")
      return books.setChapterStatus(actor, id, b.chapter, b.status)
    case "estimate":
      return b.retranslate
        ? books.estimateRetranslation(actor, id, b.includeReviewed)
        : books.estimate(actor, id, { chapters: b.chapters })
    case "translate":
      return books.startTranslation(actor, id, origin, {
        mode: b.mode,
        chapters: b.chapters,
        instruction: b.instruction,
        retranslate: b.retranslate,
        include_reviewed: b.includeReviewed,
        max_credits: b.maxCredits,
        idempotency_key: b.idempotencyKey,
      })
    case "ocr":
      return books.startOcr(actor, id, origin, {
        idempotency_key: b.idempotencyKey,
      })
    case "extract":
      return books.startExtraction(actor, id, origin)
    case "checks":
      return books.startChecks(actor, id, origin, { backcheck: b.backcheck })
    case "cancel":
      return books.cancelJob(actor, id, b.job)
    case "export":
      if (!EXPORT_FORMATS.includes(b.format as ExportFormat))
        throw new BookError(400, "invalid")
      return books.startExport(actor, id, origin, {
        format: b.format,
        bilingual: b.bilingual === true,
      })
    case "exports":
      return { exports: await books.exportsOf(actor, id) }
    case "download":
      return books.exportUrl(actor, id, b.job)
    case "issues":
      return { issues: await books.issues(actor, id, b.chapter) }
    case "dismiss":
      await books.dismissIssue(actor, id, b.issue)
      return { ok: true }
    case "pages":
      return { pages: await books.scanPages(actor, id) }
    case "glossary":
      return books.bookGlossary(actor, id)
    case "glossaries":
      return { glossaries: await books.reusableGlossaries(actor) }
    case "saveGlossary":
      return books.saveAsReusable(actor, id, b.name)
    case "addTerm":
      return books.addTerm(actor, b.glossary, b.term ?? {})
    case "updateTerm":
      return books.updateTerm(actor, b.term, b.patch ?? {})
    case "deleteTerm":
      await books.deleteTerm(actor, b.term)
      return { ok: true }
    case "approveAll":
      await books.approveAllTerms(actor, b.glossary)
      return { ok: true }
    case "importTerms": {
      const book = await books.getBook(actor, id)
      return books.importTerms(
        actor,
        b.glossary,
        String(b.body ?? ""),
        b.format === "tbx" ? "tbx" : "csv",
        book.source_lang,
        book.target_lang
      )
    }
    case "exportTerms": {
      const book = await books.getBook(actor, id)
      return {
        body: await books.exportTerms(
          actor,
          b.glossary,
          b.format === "tbx" ? "tbx" : "csv",
          book.source_lang,
          book.target_lang
        ),
      }
    }
    case "checkGlossary":
      return books.checkBookGlossary(actor, id)
    case "messages":
      return { messages: await messages(actor, id) }
    case "chat":
      return chat(actor, id, { message: b.message, selected: b.selected })
    case "changeSets":
      return { sets: await books.changeSets(actor, id) }
    case "applyChanges":
      return books.applyChangeSet(actor, id, b.set, b.accepted)
    case "discardChanges":
      await books.discardChangeSet(actor, id, b.set)
      return { ok: true }
    case "replace": {
      const book = await books.getBook(actor, id)
      const items = await replaceAcross(book, String(b.find), String(b.replace))
      if (!items.length) return { set: null }
      return {
        set: await books.proposeChanges(
          book,
          `${b.find} → ${b.replace}`,
          items
        ),
      }
    }
    default:
      throw new BookError(400, "invalid")
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("invalid", 405)
  const { viewer } = await getViewer(request)
  if (!viewer) return fail("sign_in", 401)
  if (!viewer.labs.machines) return fail("not_found", 404)
  const body = (await request.json().catch(() => null)) as Body | null
  if (!body) return fail("invalid", 400)
  try {
    const data = await run(
      { userId: viewer.id },
      body,
      new URL(request.url).origin
    )
    return Response.json(data, { headers: { "cache-control": "no-store" } })
  } catch (e) {
    if (e instanceof BookError) return fail(e.code, e.status)
    console.error("Book request failed", body.intent, e)
    return fail("failed", 500)
  }
}
