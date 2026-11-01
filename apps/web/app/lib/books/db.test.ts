import { beforeAll, describe, expect, test } from "bun:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database"

// Against a real, throwaway Supabase stack, because row-level security, the
// lock trigger and the ledger are what these claims rest on, and only Postgres
// can prove them. Skipped unless BOOKS_TEST_SUPABASE_URL is set. Never point
// this at a shared project: it creates users and rows.
const url = process.env.BOOKS_TEST_SUPABASE_URL
const anon = process.env.BOOKS_TEST_SUPABASE_KEY
const secret = process.env.BOOKS_TEST_SUPABASE_SECRET
const suite = url && anon && secret ? describe : describe.skip

const TABLES = [
  "book_projects",
  "book_chapters",
  "book_segments",
  "book_pages",
  "book_glossaries",
  "book_terms",
  "book_jobs",
  "book_issues",
  "book_change_sets",
  "book_messages",
  "book_webhooks",
  "book_webhook_deliveries",
] as const

type Client = SupabaseClient<Database>

suite("books in Postgres", () => {
  let admin: Client
  let alice: Client
  let bob: Client
  let aliceId: string
  let bookId: string
  let chapterId: string
  let segmentId: string
  let jobId: string

  const user = async (name: string) => {
    const email = `${name}-${crypto.randomUUID()}@test.local`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "password-123",
      email_confirm: true,
    })
    if (error) throw error
    const client = createClient<Database>(url!, anon!, {
      auth: { persistSession: false },
    })
    await client.auth.signInWithPassword({ email, password: "password-123" })
    return { client, id: data.user.id }
  }

  const insert = async <T extends (typeof TABLES)[number]>(
    table: T,
    row: Record<string, unknown>
  ) => {
    const { data, error } = await admin
      .from(table)
      .insert(row as never)
      .select("*")
      .single()
    if (error) throw error
    return data as unknown as { id: string }
  }

  const addSegment = (position: number, patch: Record<string, unknown> = {}) =>
    insert("book_segments", {
      book_id: bookId,
      chapter_id: chapterId,
      user_id: aliceId,
      position,
      kind: "paragraph",
      source: `Line ${position}`,
      source_hash: `h${position}`,
      words: 10,
      ...patch,
    })

  beforeAll(async () => {
    admin = createClient<Database>(url!, secret!, {
      auth: { persistSession: false },
    })
    const a = await user("alice")
    const b = await user("bob")
    alice = a.client
    bob = b.client
    aliceId = a.id
    const book = await insert("book_projects", {
      user_id: aliceId,
      file_name: "a.txt",
      size_bytes: 10,
      source_path: `${aliceId}/x/source`,
      rights_confirmed_at: new Date().toISOString(),
    })
    bookId = book.id
    chapterId = (
      await insert("book_chapters", {
        book_id: bookId,
        user_id: aliceId,
        position: 0,
      })
    ).id
    segmentId = (await addSegment(0)).id
    jobId = (
      await insert("book_jobs", {
        book_id: bookId,
        user_id: aliceId,
        kind: "translate",
      })
    ).id
    const glossary = await insert("book_glossaries", {
      user_id: aliceId,
      book_id: bookId,
      name: "g",
    })
    await insert("book_terms", {
      glossary_id: glossary.id,
      user_id: aliceId,
      source: "a",
    })
    await insert("book_pages", { book_id: bookId, user_id: aliceId, number: 1 })
    await insert("book_issues", {
      book_id: bookId,
      chapter_id: chapterId,
      segment_id: segmentId,
      user_id: aliceId,
      kind: "missing",
      severity: "error",
    })
    await insert("book_change_sets", { book_id: bookId, user_id: aliceId })
    await insert("book_messages", {
      book_id: bookId,
      user_id: aliceId,
      role: "user",
      content: "hi",
    })
    const hook = await insert("book_webhooks", {
      user_id: aliceId,
      url: "https://example.com/hook",
      secret: "whsec_private",
      events: ["job.succeeded"],
    })
    await insert("book_webhook_deliveries", {
      webhook_id: hook.id,
      user_id: aliceId,
      event: "job.succeeded",
      payload: {},
    })
  })

  describe("row-level security", () => {
    test("is switched on for every book table", async () => {
      for (const table of TABLES) {
        const { data } = await alice
          .from(table)
          .select(table === "book_webhooks" ? "id" : "*")
        expect(data?.length, `${table} owner`).toBeGreaterThan(0)
      }
    })

    test("a stranger sees nothing in any table", async () => {
      for (const table of TABLES) {
        const { data } = await bob.from(table).select("id")
        expect(data ?? [], table).toEqual([])
      }
    })

    test("signed out sees nothing", async () => {
      const client = createClient<Database>(url!, anon!, {
        auth: { persistSession: false },
      })
      for (const table of TABLES) {
        const { data } = await client.from(table).select("id")
        expect(data ?? [], table).toEqual([])
      }
    })

    test("not even the owner can write directly", async () => {
      const write = await alice
        .from("book_segments")
        .update({ target: "hacked" })
        .eq("id", segmentId)
        .select("id")
      expect(write.error?.code).toBe("42501")
      const insertBook = await alice.from("book_projects").insert({
        user_id: aliceId,
        file_name: "x",
        size_bytes: 1,
        source_path: "x",
        rights_confirmed_at: new Date().toISOString(),
      })
      expect(insertBook.error?.code).toBe("42501")
      for (const table of TABLES) {
        const del = await alice.from(table).delete().eq("user_id", aliceId)
        expect(del.error?.code, table).toBe("42501")
      }
    })

    test("a webhook's secret can't be read back, even by its owner", async () => {
      const { data, error } = await alice.from("book_webhooks").select("secret")
      expect(data).toBe(null)
      expect(error?.code).toBe("42501")
    })

    test("the server-only functions refuse a signed-in person", async () => {
      const save = await alice.rpc("book_save_translations", {
        p_job: jobId,
        p_items: [],
      })
      expect(save.error?.code).toBe("42501")
      const settle = await alice.rpc("settle_credits_for", {
        p_user: aliceId,
        p_job: jobId,
        p_used: 0,
      })
      expect(settle.error?.code).toBe("42501")
    })
  })

  describe("storage", () => {
    const path = () => `${aliceId}/test/source`

    test("a signed slot uploads once, and only its owner can read it", async () => {
      const slot = await admin.storage
        .from("book-sources")
        .createSignedUploadUrl(path())
      expect(slot.error).toBe(null)
      const put = await fetch(slot.data!.signedUrl, {
        method: "PUT",
        headers: { "content-type": "application/epub+zip" },
        body: new Uint8Array([1, 2, 3]),
      })
      expect(put.ok).toBe(true)
      expect(
        (await alice.storage.from("book-sources").download(path())).error
      ).toBe(null)
      expect(
        (await bob.storage.from("book-sources").download(path())).error
      ).not.toBe(null)
      const again = await fetch(slot.data!.signedUrl, {
        method: "PUT",
        body: new Uint8Array([9]),
      })
      expect(again.ok).toBe(false)
    })

    test("a browser can't write into or delete from the buckets", async () => {
      const upload = await alice.storage
        .from("book-sources")
        .upload(`${aliceId}/mine.epub`, new Uint8Array([1]))
      expect(upload.error).not.toBe(null)
      await alice.storage.from("book-sources").remove([path()])
      expect(
        (await alice.storage.from("book-sources").download(path())).error
      ).toBe(null)
    })
  })

  describe("locked segments", () => {
    test("refuse a change of text from any client, the server's included", async () => {
      const { id } = await addSegment(10, {
        target: "Mine",
        status: "locked",
      })
      const edit = await admin
        .from("book_segments")
        .update({ target: "Overwritten" })
        .eq("id", id)
      expect(edit.error?.code).toBe("P0423")
      const source = await admin
        .from("book_segments")
        .update({ source: "Changed" })
        .eq("id", id)
      expect(source.error?.code).toBe("P0423")
      const back = await admin
        .from("book_segments")
        .update({ status: "pending" })
        .eq("id", id)
      expect(back.error?.code).toBe("P0423")
      const { data } = await admin
        .from("book_segments")
        .select("target, status")
        .eq("id", id)
        .single()
      expect(data).toEqual({ target: "Mine", status: "locked" })
    })

    test("can be unlocked, keeping their text, and then edited", async () => {
      const { id } = await addSegment(11, { target: "Mine", status: "locked" })
      const open = await admin
        .from("book_segments")
        .update({ status: "reviewed" })
        .eq("id", id)
      expect(open.error).toBe(null)
      const edit = await admin
        .from("book_segments")
        .update({ target: "New" })
        .eq("id", id)
      expect(edit.error).toBe(null)
    })

    test("retranslation can't queue them", async () => {
      const { id } = await addSegment(12, { target: "Mine", status: "locked" })
      const { data } = await admin
        .from("book_segments")
        .update({ status: "pending" })
        .eq("book_id", bookId)
        .in("status", ["machine", "failed"])
        .select("id")
      expect(data?.some((r) => r.id === id)).toBe(false)
    })

    test("each change bumps the version", async () => {
      const { id } = await addSegment(13, { target: "A", status: "machine" })
      await admin.from("book_segments").update({ target: "B" }).eq("id", id)
      await admin.from("book_segments").update({ attempts: 2 }).eq("id", id)
      const { data } = await admin
        .from("book_segments")
        .select("version")
        .eq("id", id)
        .single()
      expect(data?.version).toBe(2)
    })
  })

  describe("saving a chunk", () => {
    test("is atomic, idempotent and only bills what it wrote", async () => {
      const a = await addSegment(20)
      const b = await addSegment(21, { status: "locked", target: "Kept" })
      const c = await addSegment(22, { status: "fixed" })
      const memo = await addSegment(23)
      const job = (await insert("book_jobs", {
        book_id: bookId,
        user_id: aliceId,
        kind: "export",
        status: "running",
      })) as { id: string }
      const items = [
        { id: a.id, target: "Un", memory: false },
        { id: b.id, target: "Stolen", memory: false },
        { id: c.id, target: "Stolen", memory: false },
        { id: memo.id, target: "Copie", memory: true },
      ]
      const first = await admin.rpc("book_save_translations", {
        p_job: job.id,
        p_items: items,
      })
      expect(first.data).toBe(2)
      const second = await admin.rpc("book_save_translations", {
        p_job: job.id,
        p_items: items,
      })
      expect(second.data).toBe(0)
      const { data } = await admin
        .from("book_jobs")
        .select("done, billable")
        .eq("id", job.id)
        .single()
      expect(data).toEqual({ done: 2, billable: 10 })
      const kept = await admin
        .from("book_segments")
        .select("target")
        .eq("id", b.id)
        .single()
      expect(kept.data?.target).toBe("Kept")
    })

    test("a job can't write to another book", async () => {
      const other = await insert("book_projects", {
        user_id: aliceId,
        file_name: "b.txt",
        size_bytes: 10,
        source_path: "y",
        rights_confirmed_at: new Date().toISOString(),
      })
      const job = await insert("book_jobs", {
        book_id: other.id,
        user_id: aliceId,
        kind: "export",
        status: "running",
      })
      const victim = await addSegment(30)
      const r = await admin.rpc("book_save_translations", {
        p_job: job.id,
        p_items: [{ id: victim.id, target: "x", memory: false }],
      })
      expect(r.data).toBe(0)
    })
  })

  describe("one job at a time", () => {
    test("a second active job on a book is refused, exports aside", async () => {
      const second = await admin.from("book_jobs").insert({
        book_id: bookId,
        user_id: aliceId,
        kind: "qa",
      })
      expect(second.error?.code).toBe("23505")
      const exported = await admin.from("book_jobs").insert({
        book_id: bookId,
        user_id: aliceId,
        kind: "export",
      })
      expect(exported.error).toBe(null)
    })
  })

  describe("credits", () => {
    const balance = async () =>
      (await admin.rpc("credits_for", { p_user: aliceId })).data as number

    test("settling gives back the unused part, once", async () => {
      const job = crypto.randomUUID()
      const before = await balance()
      const spent = await admin.rpc("spend_credits_for", {
        p_user: aliceId,
        p_cost: 40,
        p_kind: "book_translate",
        p_job: job,
      })
      expect(spent.error).toBe(null)
      expect(await balance()).toBe(before - 40)
      const back = await admin.rpc("settle_credits_for", {
        p_user: aliceId,
        p_job: job,
        p_used: 15,
      })
      expect(back.data).toBe(25)
      expect(await balance()).toBe(before - 15)
      const again = await admin.rpc("settle_credits_for", {
        p_user: aliceId,
        p_job: job,
        p_used: 0,
      })
      expect(again.data).toBe(0)
      await admin.rpc("refund_credits_for", { p_user: aliceId, p_job: job })
      expect(await balance()).toBe(before - 15)
    })

    test("a job charged twice with one id charges once", async () => {
      const job = crypto.randomUUID()
      const before = await balance()
      await admin.rpc("spend_credits_for", {
        p_user: aliceId,
        p_cost: 5,
        p_kind: "book_translate",
        p_job: job,
      })
      const second = await admin.rpc("spend_credits_for", {
        p_user: aliceId,
        p_cost: 5,
        p_kind: "book_translate",
        p_job: job,
      })
      expect(second.error).not.toBe(null)
      expect(await balance()).toBe(before - 5)
    })

    test("using everything settles to nothing, and overspending can't take more", async () => {
      const job = crypto.randomUUID()
      const before = await balance()
      await admin.rpc("spend_credits_for", {
        p_user: aliceId,
        p_cost: 10,
        p_kind: "book_translate",
        p_job: job,
      })
      const r = await admin.rpc("settle_credits_for", {
        p_user: aliceId,
        p_job: job,
        p_used: 999,
      })
      expect(r.data).toBe(0)
      expect(await balance()).toBe(before - 10)
    })

    test("settling returns the amount to the key that spent it", async () => {
      const key = await admin
        .from("api_keys")
        .insert({
          user_id: aliceId,
          name: "t",
          prefix: "pf_live_test",
          hash: crypto.randomUUID().replace(/-/g, "").padEnd(64, "0"),
          credit_limit: 100,
        } as never)
        .select("id")
        .single()
      expect(key.error).toBe(null)
      const job = crypto.randomUUID()
      await admin.rpc("spend_credits_for_key", {
        p_user: aliceId,
        p_key: key.data!.id,
        p_cost: 30,
        p_kind: "book_translate",
        p_job: job,
      })
      await admin.rpc("settle_credits_for", {
        p_user: aliceId,
        p_job: job,
        p_used: 10,
      })
      const { data } = await admin
        .from("api_keys")
        .select("credits_spent")
        .eq("id", key.data!.id)
        .single()
      expect(data?.credits_spent).toBe(10)
    })
  })

  test("deleting a book takes every row with it", async () => {
    const { error } = await admin
      .from("book_jobs")
      .update({ status: "succeeded" })
      .eq("book_id", bookId)
    expect(error).toBe(null)
    await admin.from("book_projects").delete().eq("id", bookId)
    for (const table of TABLES) {
      if (table === "book_webhooks" || table === "book_webhook_deliveries")
        continue
      const { data } = await admin
        .from(table)
        .select("id")
        .eq((table === "book_projects" ? "id" : "book_id") as "id", bookId)
      expect(data ?? [], table).toEqual([])
    }
  })
})
