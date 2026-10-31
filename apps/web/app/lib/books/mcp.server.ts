import { z } from "zod"

import { ApiError, type Access, type Caller } from "@/lib/api.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { EXPORT_FORMATS } from "./model"
import * as books from "./service.server"
import { BookError, type Actor } from "./service.server"

type Tool = <Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  inputSchema: Shape,
  access: Access,
  work: (args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>
) => void

const labsOn = async (caller: Caller) => {
  if (caller.projects) return false
  const { data } = await supabaseAdmin().auth.admin.getUserById(caller.userId)
  return data.user?.user_metadata?.labs?.machines === true
}

// The same operations as /api/v1/books. Registered only for keys that can
// reach books, so other keys never see them listed.
export async function bookTools(caller: Caller, tool: Tool, origin: string) {
  if (!(await labsOn(caller))) return
  const actor: Actor = { userId: caller.userId, keyId: caller.keyId }
  const safe =
    <A, R>(work: (args: A) => Promise<R>) =>
    async (args: A) => {
      try {
        return await work(args)
      } catch (e) {
        throw e instanceof BookError
          ? new ApiError(e.status, e.code, e.message)
          : e
      }
    }
  const book_id = z.string().describe("Book ID from list_books.")

  tool("list_books", "The account's books.", {}, "read", async () => ({
    books: await books.listBooks(actor),
  }))
  tool(
    "create_book",
    "Starts a book: confirms the rights, and returns upload_url. PUT the file there, then call ingest_book.",
    {
      file_name: z
        .string()
        .describe("Ends in .epub .pdf .docx .txt .md or .html"),
      size_bytes: z.number().int().positive(),
      rights_confirmed: z
        .boolean()
        .describe(
          "True only if the user confirmed they own this book or may translate it."
        ),
      source_lang: z.string().optional(),
      target_lang: z.string().optional(),
    },
    "write",
    safe(async (a) => {
      const p = await books.prepareBook(actor, {
        fileName: a.file_name,
        size: a.size_bytes,
        rights: a.rights_confirmed,
        sourceLang: a.source_lang,
        targetLang: a.target_lang,
      })
      return { book_id: p.id, upload_url: p.upload_url }
    })
  )
  tool(
    "ingest_book",
    "Reads an uploaded file into chapters and segments. Free.",
    { book_id, detect_language: z.boolean().optional() },
    "write",
    safe((a) => books.ingest(actor, a.book_id, origin, a.detect_language))
  )
  tool(
    "get_book_status",
    "A book's state, its recent jobs with progress, and segment counts.",
    { book_id },
    "read",
    safe((a) => books.bookStatus(actor, a.book_id))
  )
  tool(
    "estimate_translation",
    "Free. Words to translate and what it costs. Show this to the user before start_translation.",
    { book_id },
    "read",
    safe((a) => books.estimate(actor, a.book_id))
  )
  tool(
    "start_translation",
    "Spends credits. Translates what's pending; locked segments are never touched. Unused credits come back when it ends.",
    {
      book_id,
      mode: z.enum(["standard", "economy"]).optional(),
      max_credits: z
        .number()
        .int()
        .describe("The most the user agreed to spend."),
      idempotency_key: z.string().min(1).max(255),
    },
    "write",
    safe((a) => books.startTranslation(actor, a.book_id, origin, a))
  )
  tool(
    "read_segments",
    "Reads segments with both languages, by chapter, status or search text.",
    {
      book_id,
      chapter: z.string().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
      cursor: z.number().int().optional(),
    },
    "read",
    safe((a) => books.segments(actor, a.book_id, a))
  )
  tool(
    "edit_segment",
    "Changes one segment's translation or status. Send the version you read; a newer row is refused.",
    {
      book_id,
      segment_id: z.string(),
      version: z.number().int(),
      target: z.string().optional(),
      status: z.enum(["machine", "reviewed", "locked"]).optional(),
    },
    "write",
    safe((a) => books.editSegment(actor, a.book_id, a.segment_id, a))
  )
  tool(
    "get_glossary",
    "A book's own glossary and its terms.",
    { book_id },
    "read",
    safe((a) => books.bookGlossary(actor, a.book_id))
  )
  tool(
    "add_glossary_term",
    "Adds or replaces a term in a glossary.",
    {
      glossary_id: z.string(),
      source: z.string(),
      target: z.string().optional(),
      dnt: z.boolean().optional().describe("Do not translate."),
      note: z.string().optional(),
    },
    "write",
    safe((a) => books.addTerm(actor, a.glossary_id, a))
  )
  tool(
    "export_book",
    "Builds a file of the translation. Poll get_book_status, then get_export_url.",
    {
      book_id,
      format: z.enum(EXPORT_FORMATS),
      bilingual: z.boolean().optional(),
    },
    "write",
    safe((a) =>
      books.startExport(actor, a.book_id, origin, {
        format: a.format,
        bilingual: a.bilingual,
      })
    )
  )
  tool(
    "get_export_url",
    "A download link for a finished export, valid ten minutes.",
    { book_id, job_id: z.string() },
    "read",
    safe((a) => books.exportUrl(actor, a.book_id, a.job_id))
  )
}
