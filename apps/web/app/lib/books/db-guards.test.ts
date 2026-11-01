import { beforeAll, describe, expect, spyOn, test } from "bun:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database"

import { BOOK_RATES } from "./model"

// The money and safety rules that only Postgres can prove, end to end through
// the real service code. Same throwaway-stack rule as db.test.ts: skipped unless
// BOOKS_TEST_SUPABASE_URL is set, and never for a shared project. Also needs
// SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY, since the
// service code reads those.
const url = process.env.BOOKS_TEST_SUPABASE_URL
const secret = process.env.BOOKS_TEST_SUPABASE_SECRET
const suite =
  url && secret && process.env.SUPABASE_URL ? describe : describe.skip

// Nothing listens here: a kick fails at once, and the job stays where it is.
const ORIGIN = "http://127.0.0.1:9"

type Client = SupabaseClient<Database>

suite("book guards in Postgres", () => {
  let admin: Client
  let service: typeof import("./service.server")
  let run: typeof import("./run.server")
  let assistant: typeof import("./assistant.server")
  let hooks: typeof import("./webhooks.server")
  let repoModule: typeof import("./repo.server")

  const newUser = async (credits = 1000) => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `guard-${crypto.randomUUID()}@test.local`,
      password: "password-123",
      email_confirm: true,
    })
    if (error) throw error
    const id = data.user.id
    await admin.rpc("grant_credits", {
      p_user: id,
      p_delta: credits,
      p_kind: "adjustment",
      p_ref: "test",
      p_idem: `test:${id}`,
    })
    return id
  }

  const balance = async (user: string) =>
    (await admin.rpc("credits_for", { p_user: user })).data as number

  const insert = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await admin
      .from(table as "book_jobs")
      .insert(row as never)
      .select("*")
      .single()
    if (error) throw new Error(error.message)
    return data as unknown as Record<string, any> & { id: string }
  }

  const newBook = async (
    user: string,
    lines = 2,
    patch: Record<string, unknown> = {}
  ) => {
    const book = await insert("book_projects", {
      user_id: user,
      file_name: "a.txt",
      size_bytes: 10,
      source_path: `${user}/${crypto.randomUUID()}/source`,
      rights_confirmed_at: new Date().toISOString(),
      status: "setup",
      segments: lines,
      ...patch,
    })
    const chapter = await insert("book_chapters", {
      book_id: book.id,
      user_id: user,
      position: 0,
    })
    const segments = []
    for (let i = 0; i < lines; i++)
      segments.push(
        await insert("book_segments", {
          book_id: book.id,
          chapter_id: chapter.id,
          user_id: user,
          position: i,
          kind: "paragraph",
          source: `A line of the book, number ${i}.`,
          source_hash: `${book.id}-${i}`,
          words: 100,
        })
      )
    return { book, chapter, segments }
  }

  const newJob = (
    user: string,
    bookId: string,
    patch: Record<string, unknown> = {}
  ) =>
    insert("book_jobs", {
      book_id: bookId,
      user_id: user,
      kind: "translate",
      status: "running",
      ...patch,
    })

  // A held charge, as the real path leaves it.
  const paidJob = async (
    user: string,
    bookId: string,
    charged: number,
    patch: Record<string, unknown> = {}
  ) => {
    const job = await newJob(user, bookId, {
      status: "unpaid",
      credits_charged: charged,
      ...patch,
    })
    const { error } = await admin.rpc("book_charge_job", { p_job: job.id })
    if (error) throw new Error(error.message)
    await admin.from("book_jobs").update({ status: "running" }).eq("id", job.id)
    return job
  }

  const jobRow = async (id: string) =>
    (await admin.from("book_jobs").select("*").eq("id", id).single()).data!

  const close = (id: string, status = "cancelled", rate = 0.012, flat = 0) =>
    admin.rpc("book_close_job", {
      p_job: id,
      p_status: status,
      p_error: null,
      p_result: null,
      p_usage: {},
      p_rate: rate,
      p_flat: flat,
    })

  beforeAll(async () => {
    spyOn(console, "error").mockImplementation(() => {})
    admin = createClient<Database>(url!, secret!, {
      auth: { persistSession: false },
    })
    service = await import("./service.server")
    run = await import("./run.server")
    assistant = await import("./assistant.server")
    hooks = await import("./webhooks.server")
    repoModule = await import("./repo.server")
    void assistant
  })

  describe("blocker 1: no free translation", () => {
    test("source can't change under a running job, at the service or the database", async () => {
      const user = await newUser()
      const { book, segments } = await newBook(user)
      await newJob(user, book.id)
      const s = segments[0]!
      await expect(
        service.editSegment({ userId: user }, book.id, s.id, {
          source: "x ".repeat(5000),
          version: s.version,
        })
      ).rejects.toMatchObject({ code: "job_running" })
      const direct = await admin
        .from("book_segments")
        .update({ source: "changed" })
        .eq("id", s.id)
      expect(direct.error?.code).toBe("P0424")
    })

    test("source can change again once the job has ended", async () => {
      const user = await newUser()
      const { book, segments } = await newBook(user)
      const job = await newJob(user, book.id)
      await close(job.id)
      const s = segments[0]!
      const edited = await service.editSegment(
        { userId: user },
        book.id,
        s.id,
        { source: "A corrected line.", version: s.version }
      )
      expect(edited.status).toBe("pending")
    })
  })

  describe("blocker 2: cancelling can't refund work that lands", () => {
    test("a closed job's save raises and writes nothing", async () => {
      const user = await newUser()
      const { book, segments } = await newBook(user)
      const job = await paidJob(user, book.id, 100)
      await close(job.id)
      const save = await admin.rpc("book_save_translations", {
        p_job: job.id,
        p_items: [{ id: segments[0]!.id, target: "Late", memory: false }],
      })
      expect(save.error?.code).toBe("P0410")
      const { data } = await admin
        .from("book_segments")
        .select("status, target")
        .eq("id", segments[0]!.id)
        .single()
      expect(data).toEqual({ status: "pending", target: null })
    })

    test("a job not yet running can't save either", async () => {
      const user = await newUser()
      const { book, segments } = await newBook(user)
      const job = await newJob(user, book.id, { status: "queued" })
      const save = await admin.rpc("book_save_translations", {
        p_job: job.id,
        p_items: [{ id: segments[0]!.id, target: "Early", memory: false }],
      })
      expect(save.error?.code).toBe("P0410")
    })

    test("an OCR page can't land after a cancel", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const job = await paidJob(user, book.id, 40, { kind: "ocr" })
      const page = await insert("book_pages", {
        book_id: book.id,
        user_id: user,
        number: 1,
      })
      await close(job.id, "cancelled", BOOK_RATES.ocr_page)
      const save = await admin.rpc("book_save_page", {
        p_job: job.id,
        p_page: page.id,
        p_status: "done",
        p_blocks: [{ kind: "paragraph", text: "x" }],
        p_confidence: 1,
        p_attempts: 0,
      })
      expect(save.error?.code).toBe("P0410")
      const { data } = await admin
        .from("book_pages")
        .select("status")
        .eq("id", page.id)
        .single()
      expect(data?.status).toBe("pending")
    })

    test("OCR bills a page once, in the same step as saving it", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const job = await paidJob(user, book.id, 40, { kind: "ocr" })
      const page = await insert("book_pages", {
        book_id: book.id,
        user_id: user,
        number: 1,
      })
      const args = {
        p_job: job.id,
        p_page: page.id,
        p_status: "done",
        p_blocks: [],
        p_confidence: 1,
        p_attempts: 0,
      }
      await admin.rpc("book_save_page", args)
      await admin.rpc("book_save_page", args)
      expect((await jobRow(job.id)).billable).toBe(1)
    })

    test("cancel through the service refunds only what never ran", async () => {
      const user = await newUser()
      const { book, segments } = await newBook(user)
      const before = await balance(user)
      const job = await paidJob(user, book.id, 100)
      await admin.rpc("book_save_translations", {
        p_job: job.id,
        p_items: [{ id: segments[0]!.id, target: "Done", memory: false }],
      })
      await service.cancelJob({ userId: user }, book.id, job.id)
      const row = await jobRow(job.id)
      expect(row.status).toBe("cancelled")
      expect(row.credits_used).toBe(2)
      expect(await balance(user)).toBe(before - 2)
    })
  })

  describe("blocker 3: a file that kills functions", () => {
    test("each claim counts, and a held lease can't be claimed", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const job = await newJob(user, book.id, { status: "queued" })
      const claim = () =>
        admin.rpc("book_claim_job", { p_job: job.id, p_lease_seconds: 300 })
      expect((await claim()).data?.claims).toBe(1)
      expect((await claim()).data?.id ?? null).toBe(null)
      await admin
        .from("book_jobs")
        .update({ leased_until: null })
        .eq("id", job.id)
      expect((await claim()).data?.claims).toBe(2)
    })

    test("real progress starts the count again", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const job = await newJob(user, book.id, {
        claims: 3,
        claim_done: 5,
        done: 6,
      })
      const { data } = await admin.rpc("book_claim_job", {
        p_job: job.id,
        p_lease_seconds: 300,
      })
      expect(data).toMatchObject({ claims: 1, claim_done: 6 })
    })

    test("too many claims fails the job and refunds it", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const before = await balance(user)
      const job = await paidJob(user, book.id, 50)
      await admin.from("book_jobs").update({ claims: 3 }).eq("id", job.id)
      expect(await run.runSlice(job.id, ORIGIN)).toBe("failed")
      const row = await jobRow(job.id)
      expect(row).toMatchObject({ status: "failed", error: "stuck" })
      expect(await balance(user)).toBe(before)
    })
  })

  describe("major 5: unpaid jobs", () => {
    test("an unpaid job can't be claimed", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const job = await newJob(user, book.id, {
        status: "unpaid",
        credits_charged: 10,
      })
      const { data } = await admin.rpc("book_claim_job", {
        p_job: job.id,
        p_lease_seconds: 300,
      })
      expect(data?.id ?? null).toBe(null)
      expect(await run.runSlice(job.id, ORIGIN)).toBe("skipped")
      expect((await jobRow(job.id)).status).toBe("unpaid")
    })

    test("charging and releasing happen together, and only once", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const before = await balance(user)
      const job = await newJob(user, book.id, {
        status: "unpaid",
        credits_charged: 10,
      })
      await admin.rpc("book_charge_job", { p_job: job.id })
      expect((await jobRow(job.id)).status).toBe("queued")
      expect(await balance(user)).toBe(before - 10)
      // The reply was lost and the caller asks again.
      await admin.rpc("book_charge_job", { p_job: job.id })
      expect(await balance(user)).toBe(before - 10)
    })

    test("a refused charge leaves it unpaid and takes nothing", async () => {
      const user = await newUser(0)
      const { book } = await newBook(user)
      const before = await balance(user)
      const job = await newJob(user, book.id, {
        status: "unpaid",
        credits_charged: before + 500,
      })
      const r = await admin.rpc("book_charge_job", { p_job: job.id })
      expect(r.error?.code).toBe("P0402")
      expect((await jobRow(job.id)).status).toBe("unpaid")
      expect(await balance(user)).toBe(before)
    })

    test("the service deletes a job it couldn't charge", async () => {
      const user = await newUser(0)
      const { book } = await newBook(user, 2, { status: "setup" })
      await admin
        .from("book_segments")
        .update({ words: 1_000_000 })
        .eq("book_id", book.id)
      await expect(
        service.startTranslation({ userId: user }, book.id, ORIGIN, {})
      ).rejects.toMatchObject({ code: "insufficient_credits" })
      const { data } = await admin
        .from("book_jobs")
        .select("id")
        .eq("book_id", book.id)
      expect(data).toEqual([])
    })

    test("the tick's sweep clears an abandoned unpaid job", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const job = await newJob(user, book.id, {
        status: "unpaid",
        credits_charged: 10,
        created_at: new Date(Date.now() - 3_600_000).toISOString(),
      })
      await admin.rpc("book_sweep")
      const { data } = await admin
        .from("book_jobs")
        .select("id")
        .eq("id", job.id)
      expect(data).toEqual([])
    })
  })

  describe("major 6: refunds can't be lost", () => {
    test("closing settles in the same step, and only once", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const before = await balance(user)
      const job = await paidJob(user, book.id, 100)
      await admin.from("book_jobs").update({ billable: 1000 }).eq("id", job.id)
      expect((await close(job.id, "failed")).data).toBe(12)
      expect(await balance(user)).toBe(before - 12)
      expect((await jobRow(job.id)).settled_at).not.toBe(null)
      expect((await close(job.id, "failed")).data).toBe(null)
      expect(await balance(user)).toBe(before - 12)
    })

    test("the bill comes from the locked row, not the caller's copy", async () => {
      const user = await newUser()
      const { book, segments } = await newBook(user)
      const job = await paidJob(user, book.id, 100)
      await admin.rpc("book_save_translations", {
        p_job: job.id,
        p_items: segments.map((s) => ({
          id: s.id,
          target: "x",
          memory: false,
        })),
      })
      expect((await close(job.id)).data).toBe(3)
    })

    test("the sweep settles a closed job left unsettled", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      const before = await balance(user)
      const job = await paidJob(user, book.id, 100)
      await admin
        .from("book_jobs")
        .update({ status: "failed", credits_used: 30 })
        .eq("id", job.id)
      await admin.rpc("book_sweep")
      expect(await balance(user)).toBe(before - 30)
      expect((await jobRow(job.id)).settled_at).not.toBe(null)
      await admin.rpc("book_sweep")
      expect(await balance(user)).toBe(before - 30)
    })

    test("the sweep frees a book stuck in translating", async () => {
      const user = await newUser()
      const { book } = await newBook(user, 2, { status: "translating" })
      const status = async () =>
        (
          await admin
            .from("book_projects")
            .select("status")
            .eq("id", book.id)
            .single()
        ).data?.status
      await admin.rpc("book_sweep")
      // Touched just now: a job may still be starting.
      expect(await status()).toBe("translating")
      await admin.rpc("book_sweep", { p_stale_seconds: 0 })
      expect(await status()).toBe("setup")
    })

    test("a book with a live job is left alone", async () => {
      const user = await newUser()
      const { book } = await newBook(user, 2, { status: "translating" })
      await newJob(user, book.id)
      await admin.rpc("book_sweep", { p_stale_seconds: 0 })
      const { data } = await admin
        .from("book_projects")
        .select("status")
        .eq("id", book.id)
        .single()
      expect(data?.status).toBe("translating")
    })

    test("a stuck book with translated lines lands in review", async () => {
      const user = await newUser()
      const { book, segments } = await newBook(user, 2, {
        status: "translating",
      })
      await admin
        .from("book_segments")
        .update({ status: "machine", target: "x" })
        .eq("id", segments[0]!.id)
      await admin.rpc("book_sweep", { p_stale_seconds: 0 })
      const { data } = await admin
        .from("book_projects")
        .select("status")
        .eq("id", book.id)
        .single()
      expect(data?.status).toBe("review")
    })
  })

  describe("major 8: free work has limits", () => {
    test("too many running free jobs are refused", async () => {
      const user = await newUser()
      for (let i = 0; i < 4; i++) {
        const { book } = await newBook(user)
        await newJob(user, book.id, { kind: "export", payer: "free" })
      }
      const { book } = await newBook(user)
      await expect(
        service.startExport({ userId: user }, book.id, ORIGIN, { format: "md" })
      ).rejects.toMatchObject({ code: "busy" })
    })

    test("so are too many in an hour", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      await admin.from("book_jobs").insert(
        Array.from({ length: 40 }, () => ({
          book_id: book.id,
          user_id: user,
          kind: "export" as const,
          payer: "free" as const,
          status: "succeeded" as const,
        }))
      )
      await expect(
        service.startExport({ userId: user }, book.id, ORIGIN, { format: "md" })
      ).rejects.toMatchObject({ code: "busy" })
    })

    test("a back-check is priced per chapter", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      for (let i = 1; i < 5; i++)
        await insert("book_chapters", {
          book_id: book.id,
          user_id: user,
          position: i,
        })
      const { job } = await service.startChecks(
        { userId: user },
        book.id,
        ORIGIN,
        { backcheck: true }
      )
      expect(job.credits_charged).toBe(5 * BOOK_RATES.backcheck)
    })
  })

  describe("the smaller findings", () => {
    test("a proposal can't translate a line for free", async () => {
      const user = await newUser()
      const { book, segments } = await newBook(user)
      const set = await service.proposeChanges(
        (await service.getBook({ userId: user }, book.id)) as never,
        "Sneaky",
        [
          {
            segment_id: segments[0]!.id,
            before: "",
            after: "Free translation",
            version: segments[0]!.version,
          },
        ]
      )
      const result = await service.applyChangeSet(
        { userId: user },
        book.id,
        set.id
      )
      expect(result).toEqual({ applied: 0, skipped: 1 })
      const { data } = await admin
        .from("book_segments")
        .select("status, target")
        .eq("id", segments[0]!.id)
        .single()
      expect(data).toEqual({ status: "pending", target: null })
    })

    test("max_credits must be a number", async () => {
      const user = await newUser()
      const { book } = await newBook(user)
      await expect(
        service.startTranslation({ userId: user }, book.id, ORIGIN, {
          max_credits: "1",
        })
      ).rejects.toMatchObject({ code: "invalid" })
    })

    test("a glossary check too big for a request is refused", async () => {
      const user = await newUser()
      const { book } = await newBook(user, 1)
      const chapter = (
        await admin
          .from("book_chapters")
          .select("id")
          .eq("book_id", book.id)
          .single()
      ).data!
      for (let batch = 0; batch < 2; batch++)
        await admin.from("book_segments").insert(
          Array.from({ length: 700 }, (_, i) => ({
            book_id: book.id,
            chapter_id: chapter.id,
            user_id: user,
            position: batch * 1000 + i + 10,
            kind: "paragraph" as const,
            source: "s",
            source_hash: "h",
            target: "t",
            status: "machine" as const,
          }))
        )
      const glossary = await insert("book_glossaries", {
        user_id: user,
        book_id: book.id,
        name: "g",
      })
      await admin.from("book_terms").insert(
        Array.from({ length: 1500 }, (_, i) => ({
          glossary_id: glossary.id,
          user_id: user,
          source: `term ${i}`,
          target: `terme ${i}`,
        }))
      )
      await expect(
        service.checkBookGlossary({ userId: user }, book.id)
      ).rejects.toMatchObject({ code: "too_long" })
      // Past PostgREST's 1,000 rows, and every term still reaches enforcement.
      expect((await repoModule.repo.terms(book as never)).length).toBe(1500)
    })

    test("originals have a byte cap per person", async () => {
      const user = await newUser()
      const size = 200 * 1024 * 1024
      for (let i = 0; i < 10; i++) await newBook(user, 0, { size_bytes: size })
      // Ten books at 200 MiB leave 48 MiB of the 2 GiB.
      const { error } = await admin.from("book_projects").insert({
        user_id: user,
        file_name: "a.txt",
        size_bytes: 40 * 1024 * 1024,
        source_path: "x",
        rights_confirmed_at: new Date().toISOString(),
      })
      expect(error).toBe(null)
      const over = await admin.from("book_projects").insert({
        user_id: user,
        file_name: "b.txt",
        size_bytes: size,
        source_path: "y",
        rights_confirmed_at: new Date().toISOString(),
      })
      expect(over.error?.code).toBe("P0409")
    })

    test("a cap can't be dodged by understating the size", async () => {
      const user = await newUser()
      for (let i = 0; i < 10; i++)
        await newBook(user, 0, { size_bytes: 200 * 1024 * 1024 })
      const { book } = await newBook(user, 0, { size_bytes: 1 })
      const { error } = await admin
        .from("book_projects")
        .update({ size_bytes: 100 * 1024 * 1024 })
        .eq("id", book.id)
      expect(error?.code).toBe("P0409")
    })

    test("abandoned uploads expire, recent ones don't", async () => {
      const user = await newUser()
      const { book: old } = await newBook(user, 0, {
        status: "uploading",
        created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      })
      const { book: fresh } = await newBook(user, 0, { status: "uploading" })
      await run.expireUploads()
      const { data } = await admin
        .from("book_projects")
        .select("id")
        .in("id", [old.id, fresh.id])
      expect(data?.map((b) => b.id)).toEqual([fresh.id])
    })

    test("only one runner can claim a delivery", async () => {
      const user = await newUser()
      const hook = await insert("book_webhooks", {
        user_id: user,
        url: "https://127.0.0.1/hook",
        secret: "s",
        events: ["job.succeeded"],
      })
      const row = await insert("book_webhook_deliveries", {
        webhook_id: hook.id,
        user_id: user,
        event: "job.succeeded",
        payload: {},
      })
      const won = await Promise.all([
        hooks.claimDelivery(row as never),
        hooks.claimDelivery(row as never),
      ])
      expect(won.filter(Boolean).length).toBe(1)
    })

    test("two runners send a webhook once", async () => {
      const user = await newUser()
      const hook = await insert("book_webhooks", {
        user_id: user,
        // Refused by the address check, so no packet leaves this machine.
        url: "https://127.0.0.1/hook",
        secret: "s",
        events: ["job.succeeded"],
      })
      const row = await insert("book_webhook_deliveries", {
        webhook_id: hook.id,
        user_id: user,
        event: "job.succeeded",
        payload: {},
      })
      await Promise.all([hooks.deliverDue(), hooks.deliverDue()])
      const { data } = await admin
        .from("book_webhook_deliveries")
        .select("attempts, response_status")
        .eq("id", row.id)
        .single()
      expect(data).toEqual({ attempts: 1, response_status: null })
    })
  })
})
