import {
  ApiError,
  apiError,
  authenticate,
  jsonBody,
  type Access,
  type Caller,
} from "@/lib/api.server"
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/books/model"
import * as books from "@/lib/books/service.server"
import { BookError, type Actor } from "@/lib/books/service.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { Route } from "./+types/api.v1.books"

export const config = { maxDuration: 60 }

// The keyed API for books. Paths are matched here rather than in the route
// table, so this feature adds one line there. A key limited to some projects
// is limited: books aren't among its projects, so it sees none.
const actorOf = async (caller: Caller): Promise<Actor> => {
  if (caller.projects) throw new ApiError(404, "not_found", "Not found.")
  const { data } = await supabaseAdmin().auth.admin.getUserById(caller.userId)
  // The same switch that opens Studio opens this.
  if (data.user?.user_metadata?.labs?.machines !== true)
    throw new ApiError(404, "not_found", "Not found.")
  return { userId: caller.userId, keyId: caller.keyId }
}

const wrap = async (work: () => Promise<unknown>): Promise<unknown> => {
  try {
    return await work()
  } catch (e) {
    if (e instanceof BookError) throw new ApiError(e.status, e.code, e.message)
    throw e
  }
}

const notFound = () => new ApiError(404, "not_found", "No such route.")

interface Ctx {
  request: Request
  actor: Actor
  origin: string
  url: URL
}

const idempotency = (request: Request) =>
  request.headers.get("idempotency-key")?.trim().slice(0, 255) || undefined

async function handleGet(path: string[], c: Ctx) {
  const { actor, url } = c
  const [first, second, third] = path
  if (!first) return { books: await books.listBooks(actor) }
  if (first === "webhooks") return { webhooks: await books.listWebhooks(actor) }
  if (first === "glossaries") {
    if (!second) return { glossaries: await books.reusableGlossaries(actor) }
    if (third === "terms")
      return { terms: await books.listTerms(actor, second) }
    if (third === "export") {
      const format = url.searchParams.get("format") === "tbx" ? "tbx" : "csv"
      return {
        format,
        body: await books.exportTerms(
          actor,
          second,
          format,
          url.searchParams.get("source") ?? "en",
          url.searchParams.get("target") ?? "fr"
        ),
      }
    }
    throw notFound()
  }
  const id = first
  if (!second) return books.bookStatus(actor, id)
  if (second === "chapters")
    return { chapters: await books.chapters(actor, id) }
  if (second === "estimate") return books.estimate(actor, id)
  if (second === "segments")
    return books.segments(actor, id, {
      chapter: url.searchParams.get("chapter") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      search: url.searchParams.get("q") ?? undefined,
      cursor: Number(url.searchParams.get("cursor")) || 0,
    })
  if (second === "glossary") return books.bookGlossary(actor, id)
  if (second === "issues") return { issues: await books.issues(actor, id) }
  if (second === "exports") {
    if (!third) return { exports: await books.exportsOf(actor, id) }
    return books.exportUrl(actor, id, third)
  }
  throw notFound()
}

async function handleWrite(path: string[], c: Ctx) {
  const { request, actor, origin } = c
  const [first, second, third, fourth] = path
  const method = request.method
  const body =
    method === "DELETE" ? {} : await jsonBody(request).catch(() => ({}))

  if (!first && method === "POST") {
    const prepared = await books.prepareBook(actor, {
      fileName: body.file_name,
      size: body.size_bytes,
      rights: body.rights_confirmed,
      sourceLang: body.source_lang,
      targetLang: body.target_lang,
    })
    return {
      book_id: prepared.id,
      // PUT the file's bytes here, then call /ingest.
      upload_url: prepared.upload_url,
    }
  }
  if (first === "webhooks") {
    if (!second && method === "POST")
      return books.createWebhook(actor, body.url, body.events)
    if (second && method === "DELETE") {
      await books.deleteWebhook(actor, second)
      return { deleted: true }
    }
    throw notFound()
  }
  if (first === "glossaries") {
    if (!second && method === "POST")
      return books.createGlossary(actor, body.name)
    if (second && !third && method === "DELETE") {
      await books.deleteGlossary(actor, second)
      return { deleted: true }
    }
    if (second && third === "terms" && method === "POST")
      return books.addTerm(actor, second, body)
    if (second && third === "import" && method === "POST") {
      const format = body.format === "tbx" ? "tbx" : "csv"
      return books.importTerms(
        actor,
        second,
        String(body.body ?? ""),
        format,
        String(body.source ?? "en"),
        String(body.target ?? "fr")
      )
    }
    throw notFound()
  }
  if (first === "terms" && second) {
    if (method === "PATCH") return books.updateTerm(actor, second, body)
    if (method === "DELETE") {
      await books.deleteTerm(actor, second)
      return { deleted: true }
    }
    throw notFound()
  }
  const id = first!
  if (!second && method === "PATCH") return books.updateBook(actor, id, body)
  if (!second && method === "DELETE") {
    await books.deleteBook(actor, id)
    return { deleted: true }
  }
  if (method !== "POST" && !(second === "segments" && method === "PATCH"))
    throw notFound()
  if (second === "ingest")
    return books.ingest(actor, id, origin, body.detect_language === true)
  if (second === "ocr")
    return books.startOcr(actor, id, origin, {
      idempotency_key: idempotency(request),
      max_credits: body.max_credits,
    })
  if (second === "extract") return books.startExtraction(actor, id, origin)
  if (second === "translate")
    return books.startTranslation(actor, id, origin, {
      ...body,
      idempotency_key: idempotency(request),
    })
  if (second === "checks")
    return books.startChecks(actor, id, origin, {
      backcheck: body.back_check === true,
    })
  if (second === "exports") {
    if (!EXPORT_FORMATS.includes(body.format as ExportFormat))
      throw new ApiError(
        400,
        "invalid",
        "format must be epub, pdf, docx or md."
      )
    return books.startExport(actor, id, origin, {
      format: body.format as ExportFormat,
      bilingual: body.bilingual === true,
    })
  }
  if (second === "jobs" && third && fourth === "cancel")
    return books.cancelJob(actor, id, third)
  if (second === "segments" && third && method === "PATCH")
    return books.editSegment(actor, id, third, body)
  throw notFound()
}

async function handle(request: Request, splat: string) {
  try {
    const url = new URL(request.url)
    const path = splat.split("/").filter(Boolean)
    const read = request.method === "GET"
    const caller = await authenticate(
      request,
      read ? "read" : ("write" as Access)
    )
    const actor = await actorOf(caller)
    const ctx = { request, actor, origin: url.origin, url }
    const data = await wrap(() =>
      read ? handleGet(path, ctx) : handleWrite(path, ctx)
    )
    return Response.json(data, {
      status: !read && request.method === "POST" ? 201 : 200,
      headers: { "cache-control": "no-store" },
    })
  } catch (e) {
    return apiError(e)
  }
}

export const loader = ({ request, params }: Route.LoaderArgs) =>
  handle(request, params["*"] ?? "")
export const action = ({ request, params }: Route.ActionArgs) =>
  handle(request, params["*"] ?? "")
