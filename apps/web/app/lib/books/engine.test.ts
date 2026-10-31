import { beforeAll, describe, expect, spyOn, test } from "bun:test"

import { ModelCutShort, ModelDeclined, PayerFailed } from "./ai.server"
import type { BookModel, ModelCall } from "./ai.server"
import type { BookRow, JobRow } from "./database"
import {
  CONCURRENCY,
  extractSlice,
  finish,
  ocrSlice,
  qaSlice,
  recoverable,
  translateSlice,
  type Engine,
} from "./engine"
import { fakeModel } from "./fake"
import { plainBlock } from "./inline"
import { MemoryRepo } from "./memory-repo"
import { BOOK_RATES, type Block, wordsToCredits } from "./model"

// Retried failures are logged on purpose; these tests cause plenty.
beforeAll(() => void spyOn(console, "error").mockImplementation(() => {}))

const para = (text: string, extra: Partial<Block> = {}) =>
  plainBlock("paragraph", text, extra)

const LONG = (i: number) =>
  `Sentence number ${i} tells of the old harbour and the long road home.`

interface Setup {
  repo: MemoryRepo
  book: BookRow
  job: JobRow
  e: Engine
  calls: ModelCall[]
  events: string[]
}

async function setup(
  chapters: Block[][],
  model: BookModel = fakeModel(),
  patch: Partial<JobRow> = {}
): Promise<Setup> {
  const repo = new MemoryRepo()
  const book = repo.addBook()
  await repo.writeBook(
    book,
    chapters.map((blocks, i) => ({ title: `Chapter ${i + 1}`, blocks }))
  )
  const job = repo.addJob(book, { credits_charged: 500, ...patch })
  const calls: ModelCall[] = []
  const events: string[] = []
  const e: Engine = {
    repo,
    model: {
      ...model,
      json: (call, signal) => {
        calls.push(call)
        return model.json(call, signal)
      },
    },
    now: Date.now,
    emit: async (event) => void events.push(event),
  }
  return { repo, book, job, e, calls, events }
}

const run = async (s: Setup, job = s.job) => {
  const fresh = await s.repo.job(job.id)
  return translateSlice(s.e, fresh, Date.now() + 10_000)
}

describe("translation", () => {
  test("translates a whole book, settles, and queues the checks", async () => {
    const s = await setup([[para(LONG(1)), para(LONG(2))], [para(LONG(3))]])
    expect(await run(s)).toBe("done")
    const rows = await s.repo.segments(s.book.id)
    expect(rows.every((r) => r.status === "machine")).toBe(true)
    expect(rows[0]!.target).toContain("Sénténcé")
    const job = await s.repo.job(s.job.id)
    expect(job.status).toBe("succeeded")
    expect(s.repo.qaStarted).toBe(1)
    expect((await s.repo.book(s.book.id)).status).toBe("review")
    // A summary per chapter, for the next one's translator.
    expect((await s.repo.chapters(s.book.id)).every((c) => c.summary)).toBe(
      true
    )
  })

  test("keeps inline tags, and rewrites nothing outside them", async () => {
    const s = await setup([
      [
        {
          kind: "paragraph",
          text: "He said <g1>hello</g1> to the crowd.<x2/>",
          tags: [
            { id: "g1", type: "i" },
            { id: "x2", type: "br" },
          ],
        },
      ],
    ])
    await run(s)
    const [row] = await s.repo.segments(s.book.id)
    expect(row!.target).toMatch(/<g1>.*<\/g1>.*<x2\/>/)
  })

  test("a repeat is free and word for word the same", async () => {
    const line = "The machine had one thousand wheels and levers."
    const s = await setup([
      [para(line), para(LONG(9)), para(line)],
      [para(line)],
    ])
    await run(s)
    const rows = (await s.repo.segments(s.book.id)).filter(
      (r) => r.source === line
    )
    expect(new Set(rows.map((r) => r.target)).size).toBe(1)
    expect(rows.filter((r) => r.from_memory).length).toBe(2)
    const job = await s.repo.job(s.job.id)
    const words = rows[0]!.words
    // One copy billed, plus the other sentence.
    expect(job.billable).toBe(
      words + (await s.repo.segments(s.book.id))[1]!.words
    )
    const translateCalls = s.calls.filter((c) => c.task === "translate")
    const sent = translateCalls.map((c) => c.user).join("")
    expect(sent.split(line).length - 1).toBe(1)
  })

  test("short lines translate in context, not from memory", async () => {
    const s = await setup([[para("Yes."), para("Yes.")]])
    await run(s)
    const rows = await s.repo.segments(s.book.id)
    expect(rows.every((r) => !r.from_memory)).toBe(true)
  })

  test("a locked segment stays exactly as it was", async () => {
    const s = await setup([[para(LONG(1)), para(LONG(2))]])
    const rows = await s.repo.segments(s.book.id)
    Object.assign(s.repo.rows.get(rows[0]!.id)!, {
      status: "locked",
      target: "Mon texte verrouillé",
    })
    await run(s)
    expect(s.repo.rows.get(rows[0]!.id)!.target).toBe("Mon texte verrouillé")
    expect(s.repo.rows.get(rows[0]!.id)!.status).toBe("locked")
    expect(s.repo.rows.get(rows[1]!.id)!.status).toBe("machine")
    const sent = s.calls.find((c) => c.task === "translate")!.user
    expect(sent).not.toContain(LONG(1))
  })

  test("a locked repeat is what the others copy", async () => {
    const line = "The harbour lights went out one by one."
    const s = await setup([[para(line), para(line)]])
    const rows = await s.repo.segments(s.book.id)
    Object.assign(s.repo.rows.get(rows[0]!.id)!, {
      status: "locked",
      target: "Version de la traductrice",
    })
    await run(s)
    expect(s.repo.rows.get(rows[1]!.id)!.target).toBe(
      "Version de la traductrice"
    )
    expect(s.calls.filter((c) => c.task === "translate").length).toBe(0)
  })

  test("a chapter limit is respected", async () => {
    const s = await setup([[para(LONG(1))], [para(LONG(2))]])
    const [first] = await s.repo.chapters(s.book.id)
    await s.repo.setJob(s.job.id, { params: { chapters: [first!.id] } })
    await run(s)
    const rows = await s.repo.segments(s.book.id)
    expect(rows.map((r) => r.status)).toEqual(["machine", "pending"])
  })

  test("the book's context reaches the model, with only the terms in use", async () => {
    const s = await setup([[para("Ada met Grace at the old harbour wall.")]])
    s.repo.glossary = [
      { source: "harbour", target: "port", dnt: false, case_sensitive: false },
      { source: "Ada", target: "", dnt: true, case_sensitive: false },
      {
        source: "unicorn",
        target: "licorne",
        dnt: false,
        case_sensitive: false,
      },
    ]
    await s.repo.setBook(s.book.id, {
      bible: { summary: "A book about engines.", tone: "Dry." },
      style: { register: "literary", notes: "Keep it short." },
    })
    await run(s)
    const call = s.calls.find((c) => c.task === "translate")!
    expect(call.system).toContain("A book about engines.")
    expect(call.system).toContain("literary register")
    expect(call.system).toContain("Keep it short.")
    expect(call.context).toContain('"harbour" → "port"')
    expect(call.context).toContain('"Ada": keep')
    expect(call.context).not.toContain("unicorn")
    // Stable text goes first, so caching can work.
    expect(call.system).not.toContain("harbour")
    const row = (await s.repo.segments(s.book.id))[0]!
    expect(row.target).toContain("port")
    expect(row.target).toContain("Ada")
  })
})

describe("resume and idempotence", () => {
  const book = Array.from({ length: 40 }, (_, i) => para(LONG(i)))

  test("a slice that dies carries on, and nothing is billed twice", async () => {
    const whole = await setup([book])
    await run(whole)
    const clean = await whole.repo.job(whole.job.id)

    const s = await setup([book])
    // Dies on the first save, then again partway through.
    s.repo.failSaves = 1
    await expect(run(s)).rejects.toThrow("Function killed.")
    expect((await s.repo.job(s.job.id)).done).toBe(0)
    expect(await run(s)).toBe("done")
    const job = await s.repo.job(s.job.id)
    expect(job.billable).toBe(clean.billable)
    expect(job.done).toBe(40)
    expect((await s.repo.segments(s.book.id)).map((r) => r.status)).toEqual(
      Array(40).fill("machine")
    )
  })

  test("a slice cut off by its deadline resumes where it stopped", async () => {
    const s = await setup([
      book,
      book.map((b) => ({ ...b, text: `${b.text} Two.` })),
    ])
    const job = await s.repo.job(s.job.id)
    // The clock runs out straight after the first pass.
    let ticks = 0
    s.e.now = () => (ticks++ > 0 ? 1e15 : 0)
    expect(await translateSlice(s.e, job, 1e14)).toBe("continue")
    const partial = (await s.repo.segments(s.book.id)).filter(
      (r) => r.status === "machine"
    ).length
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(80)
    s.e.now = Date.now
    expect(await run(s)).toBe("done")
    expect((await s.repo.job(s.job.id)).done).toBe(80)
  })

  test("a reply that lands twice writes once", async () => {
    const s = await setup([[para(LONG(1))]])
    const [row] = await s.repo.segments(s.book.id)
    const item = { id: row!.id, target: "Premier", memory: false }
    expect(await s.repo.save(s.job.id, [item])).toBe(1)
    expect(await s.repo.save(s.job.id, [{ ...item, target: "Second" }])).toBe(0)
    expect(s.repo.rows.get(row!.id)!.target).toBe("Premier")
    expect((await s.repo.job(s.job.id)).billable).toBe(row!.words)
  })

  test("two overlapping slices don't bill for the same line", async () => {
    const s = await setup([book])
    await Promise.all([run(s), run(s)])
    const job = await s.repo.job(s.job.id)
    const words = (await s.repo.segments(s.book.id)).reduce(
      (n, r) => n + r.words,
      0
    )
    expect(job.billable).toBe(words)
    expect(job.done).toBe(40)
  })

  test("a transient failure waits and tries again", async () => {
    const s = await setup([[para(LONG(1))]])
    const job = await s.repo.job(s.job.id)
    expect(await recoverable(s.e, job, new Error("529"))).toBe("wait")
    const after = await s.repo.job(s.job.id)
    expect(after.state.errors).toBe(1)
    expect(after.next_at).not.toBe(null)
    expect(after.status).toBe("running")
  })

  test("repeated failures end the job and return what wasn't used", async () => {
    const s = await setup([[para(LONG(1))]])
    for (let i = 0; i < 6; i++) {
      const job = await s.repo.job(s.job.id)
      await recoverable(s.e, job, new Error("529"))
    }
    const job = await s.repo.job(s.job.id)
    expect(job.status).toBe("failed")
    expect(job.error).toBe("too_many_errors")
    expect(s.repo.settled.get(job.id)).toBe(500)
    expect((await s.repo.book(s.book.id)).status).toBe("setup")
  })

  test("an empty OpenRouter account stops at once", async () => {
    const s = await setup([[para(LONG(1))]], fakeModel(), {
      payer: "openrouter",
      credits_charged: 0,
    })
    const job = await s.repo.job(s.job.id)
    expect(await recoverable(s.e, job, new PayerFailed("402"))).toBe("done")
    expect((await s.repo.job(s.job.id)).error).toBe("openrouter_credits")
  })
})

describe("a model that won't cooperate", () => {
  const stubborn = (reject: (s: { id: string; text: string }) => unknown) => {
    const base = fakeModel()
    return {
      ...base,
      async json(call: ModelCall) {
        if (call.task !== "translate") return base.json(call)
        const segments = JSON.parse(call.user) as { id: string; text: string }[]
        for (const s of segments) {
          const result = reject(s)
          if (result instanceof Error) throw result
        }
        return base.json(call)
      },
    } as BookModel
  }

  test("a declined line is isolated, marked failed and not billed", async () => {
    const bad = "This one line is refused every single time."
    const s = await setup(
      [[para(LONG(1)), para(bad), para(LONG(2))]],
      stubborn((seg) =>
        seg.text === bad ? new ModelDeclined("no") : undefined
      )
    )
    for (let i = 0; i < 8; i++) {
      if ((await run(s)) === "done") break
    }
    const rows = await s.repo.segments(s.book.id)
    expect(rows.map((r) => r.status)).toEqual(["machine", "failed", "machine"])
    const job = await s.repo.job(s.job.id)
    expect(job.status).toBe("succeeded")
    expect(job.billable).toBe(rows[0]!.words + rows[2]!.words)
  })

  test("a reply cut short retries line by line", async () => {
    let first = true
    const s = await setup(
      [[para(LONG(1)), para(LONG(2))]],
      stubborn(() => {
        if (!first) return undefined
        first = false
        return new ModelCutShort("max_tokens")
      })
    )
    await run(s)
    const rows = await s.repo.segments(s.book.id)
    expect(rows.every((r) => r.status === "machine")).toBe(true)
  })

  test("a reply that drops tags gets one correction, then keeps the words", async () => {
    let calls = 0
    const model: BookModel = {
      ...fakeModel(),
      async json(call) {
        if (call.task !== "translate") return fakeModel().json(call)
        calls++
        const [seg] = JSON.parse(call.user) as { id: string; fix?: string[] }[]
        if (calls === 2) expect(seg!.fix?.[0]).toContain("inline tags")
        return {
          value: { segments: [{ id: seg!.id, text: "Bonjour sans balises" }] },
          usage: { input: 1, output: 1, cache_read: 0, cache_write: 0 },
        }
      },
    }
    const s = await setup(
      [
        [
          {
            kind: "paragraph",
            text: "Hello <g1>there</g1> friend.",
            tags: [{ id: "g1", type: "i" }],
          },
        ],
      ],
      model
    )
    await run(s)
    expect(calls).toBe(2)
    const [row] = await s.repo.segments(s.book.id)
    expect(row!.target).toBe("Bonjour sans balises")
    expect(row!.status).toBe("machine")
  })

  test("a glossary miss gets a pointed second try", async () => {
    let calls = 0
    const model: BookModel = {
      ...fakeModel(),
      async json(call) {
        if (call.task !== "translate") return fakeModel().json(call)
        calls++
        const [seg] = JSON.parse(call.user) as { id: string; fix?: string[] }[]
        return {
          value: {
            segments: [
              {
                id: seg!.id,
                text: seg!.fix ? "Le port est calme." : "La rade est calme.",
              },
            ],
          },
          usage: { input: 1, output: 1, cache_read: 0, cache_write: 0 },
        }
      },
    }
    const s = await setup([[para("The harbour is calm tonight.")]], model)
    s.repo.glossary = [
      { source: "harbour", target: "port", dnt: false, case_sensitive: false },
    ]
    await run(s)
    expect(calls).toBe(2)
    expect((await s.repo.segments(s.book.id))[0]!.target).toBe(
      "Le port est calme."
    )
  })

  test("a reply that invents an id can't touch another row", async () => {
    const model: BookModel = {
      ...fakeModel(),
      async json(call) {
        if (call.task !== "translate") return fakeModel().json(call)
        const [seg] = JSON.parse(call.user) as { id: string }[]
        return {
          value: {
            segments: [
              { id: seg!.id, text: "Bien." },
              { id: "someone-elses-row", text: "Volé." },
            ],
          },
          usage: { input: 1, output: 1, cache_read: 0, cache_write: 0 },
        }
      },
    }
    const s = await setup([[para(LONG(1))]], model)
    await run(s)
    expect((await s.repo.segments(s.book.id))[0]!.target).toBe("Bien.")
  })

  test("HTML in a reply stays text", async () => {
    const model: BookModel = {
      ...fakeModel(),
      async json(call) {
        if (call.task !== "translate") return fakeModel().json(call)
        const [seg] = JSON.parse(call.user) as { id: string }[]
        return {
          value: {
            segments: [{ id: seg!.id, text: "<script>alert(1)</script>" }],
          },
          usage: { input: 1, output: 1, cache_read: 0, cache_write: 0 },
        }
      },
    }
    const s = await setup([[para(LONG(1))]], model)
    await run(s)
    expect((await s.repo.segments(s.book.id))[0]!.target).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    )
  })
})

describe("credits", () => {
  test("a finished job pays for what ran and gets the rest back", async () => {
    const s = await setup([[para(LONG(1)), para(LONG(2))]], fakeModel(), {
      credits_charged: 100,
    })
    await run(s)
    const job = await s.repo.job(s.job.id)
    const used = wordsToCredits(job.billable, "standard")
    expect(job.credits_used).toBe(used)
    expect(s.repo.settled.get(job.id)).toBe(100 - used)
  })

  test("a cancelled job pays only for what was saved", async () => {
    const s = await setup([[para(LONG(1)), para(LONG(2))]], fakeModel(), {
      credits_charged: 100,
    })
    const [first] = await s.repo.segments(s.book.id)
    await s.repo.save(s.job.id, [
      { id: first!.id, target: "Fait", memory: false },
    ])
    await finish(s.e, await s.repo.job(s.job.id), "cancelled")
    const job = await s.repo.job(s.job.id)
    expect(job.credits_used).toBe(wordsToCredits(first!.words, "standard"))
    expect(s.repo.settled.get(job.id)).toBe(100 - job.credits_used)
    expect(s.events).toEqual(["job.cancelled"])
  })

  test("settling twice gives back once", async () => {
    const s = await setup([[para(LONG(1))]], fakeModel(), {
      credits_charged: 100,
    })
    const job = await s.repo.job(s.job.id)
    await finish(s.e, job, "failed", "x")
    await finish(s.e, job, "failed", "x")
    expect(s.repo.settled.size).toBe(1)
    expect(s.events).toEqual(["job.failed"])
  })

  test("a failed flat-price job is fully refunded", async () => {
    const s = await setup([[para(LONG(1))]], fakeModel(), {
      kind: "extract",
      credits_charged: BOOK_RATES.extract,
    })
    await finish(s.e, await s.repo.job(s.job.id), "failed", "x")
    expect(s.repo.settled.get(s.job.id)).toBe(BOOK_RATES.extract)
  })

  test("OpenRouter jobs touch no credits", async () => {
    const s = await setup([[para(LONG(1))]], fakeModel(), {
      payer: "openrouter",
      credits_charged: 0,
    })
    await run(s)
    expect(s.repo.settled.size).toBe(0)
  })

  test("the economy rate is about half the standard one", () => {
    expect(wordsToCredits(100_000, "standard")).toBe(1_200)
    expect(wordsToCredits(100_000, "economy")).toBe(700)
    expect(wordsToCredits(1, "standard")).toBe(1)
    expect(wordsToCredits(0, "standard")).toBe(0)
  })
})

describe("economy mode", () => {
  test("submits a chapter, waits, saves, and moves on", async () => {
    const s = await setup([[para(LONG(1))], [para(LONG(2))]], fakeModel(), {
      params: { mode: "economy" },
    })
    expect(await run(s)).toBe("wait")
    let job = await s.repo.job(s.job.id)
    expect(job.state.batch?.id).toBeTruthy()
    expect(job.next_at).not.toBe(null)
    expect(await run(s)).toBe("wait")
    job = await s.repo.job(s.job.id)
    expect(job.done).toBe(1)
    expect(await run(s)).toBe("done")
    job = await s.repo.job(s.job.id)
    expect(job.status).toBe("succeeded")
    expect(job.credits_used).toBe(wordsToCredits(job.billable, "economy"))
  })

  test("a line the batch lost comes back through the standard path", async () => {
    const base = fakeModel()
    const s = await setup(
      [[para(LONG(1))]],
      {
        ...base,
        batch: {
          ...base.batch!,
          results: async () => [{ id: "c0", ok: false }],
        },
      },
      { params: { mode: "economy" } }
    )
    await run(s)
    await run(s)
    const [row] = await s.repo.segments(s.book.id)
    expect(row!.attempts).toBe(1)
    await run(s)
    expect((await s.repo.segments(s.book.id))[0]!.status).toBe("machine")
  })
})

describe("OCR", () => {
  test("reads pages in order, bills by page, and assembles the book", async () => {
    const s = await setup([], fakeModel(), {
      kind: "ocr",
      credits_charged: 8 * BOOK_RATES.ocr_page,
    })
    await s.repo.setBook(s.book.id, { format: "pdf" })
    for (const number of [1, 2]) {
      const id = crypto.randomUUID()
      s.repo.pages.set(id, {
        id,
        book_id: s.book.id,
        user_id: "user",
        number,
        kind: "scan",
        chapter_position: null,
        href: null,
        image_path: `p${number}`,
        width: 100,
        height: 100,
        status: "pending",
        blocks: [],
        confidence: null,
        attempts: 0,
      })
      s.repo.images.set(`p${number}`, { data: "aaaa", media: "image/png" })
    }
    const job = await s.repo.job(s.job.id)
    expect(await ocrSlice(s.e, job, Date.now() + 5_000)).toBe("done")
    const closed = await s.repo.job(s.job.id)
    expect(closed.billable).toBe(2)
    expect(closed.credits_used).toBe(2 * BOOK_RATES.ocr_page)
    expect(s.repo.settled.get(s.job.id)).toBe(6 * BOOK_RATES.ocr_page)
    const rows = await s.repo.segments(s.book.id)
    expect(rows.some((r) => r.ocr === 0.62 && r.kind === "paragraph")).toBe(
      true
    )
    // Notes wait for the end of the chapter.
    expect(rows.at(-1)!.kind).toBe("footnote")
    expect((await s.repo.book(s.book.id)).status).toBe("setup")
    expect(s.calls.every((c) => c.images?.length === 1)).toBe(true)
  })
})

describe("extraction and checks", () => {
  test("extraction fills the bible and suggests terms, never approves them", async () => {
    const lines = Array.from(
      { length: 6 },
      (_, i) =>
        `On that morning, Ada Lovelace walked with Grace Hopper past stone number ${i} and on along the quiet river towards the old mill.`
    )
    const s = await setup([lines.map((l) => para(l))], fakeModel(), {
      kind: "extract",
      credits_charged: BOOK_RATES.extract,
    })
    expect(await extractSlice(s.e, await s.repo.job(s.job.id))).toBe("done")
    const book = await s.repo.book(s.book.id)
    expect(book.bible.summary).toBeTruthy()
    expect(s.repo.suggestions.length).toBeGreaterThan(0)
    expect(
      (s.repo.suggestions as { source: string; occurrences: number }[]).find(
        (t) => t.source === "Ada Lovelace"
      )?.occurrences
    ).toBe(6)
    expect(s.repo.glossary).toEqual([])
    expect((await s.repo.job(s.job.id)).credits_used).toBe(BOOK_RATES.extract)
  })

  test("checks score each chapter and back-check a sample", async () => {
    const s = await setup(
      [Array.from({ length: 6 }, (_, i) => para(LONG(i)))],
      fakeModel(),
      { kind: "qa", payer: "free", params: { backcheck: true } }
    )
    const rows = await s.repo.segments(s.book.id)
    for (const r of rows)
      Object.assign(s.repo.rows.get(r.id)!, {
        status: "machine",
        target: `Traduction complète de la phrase ${rows.indexOf(r)} du port et de la route.`,
      })
    Object.assign(s.repo.rows.get(rows[1]!.id)!, { target: "" })
    const job = await s.repo.job(s.job.id)
    expect(await qaSlice(s.e, job, Date.now() + 5_000)).toBe("done")
    const [chapter] = await s.repo.chapters(s.book.id)
    const issues = s.repo.issues.get(chapter!.id)!
    expect(issues.some((i) => i.kind === "missing")).toBe(true)
    expect(issues.some((i) => i.kind === "back_check")).toBe(true)
    expect(chapter!.score).toBeLessThan(100)
    expect(s.calls.filter((c) => c.task === "backcheck").length).toBe(1)
  })

  test("free checks spend no model calls", async () => {
    const s = await setup([[para(LONG(1))]], fakeModel(), {
      kind: "qa",
      payer: "free",
      params: { backcheck: false },
    })
    const job = await s.repo.job(s.job.id)
    await qaSlice(s.e, job, Date.now() + 5_000)
    expect(s.calls.length).toBe(0)
  })
})

test("concurrency stays bounded", async () => {
  const lines = Array.from({ length: 200 }, (_, i) =>
    para(`${LONG(i)} `.repeat(6))
  )
  let open = 0
  let peak = 0
  const base = fakeModel()
  const s = await setup([lines], {
    ...base,
    async json(call) {
      open++
      peak = Math.max(peak, open)
      await new Promise((r) => setTimeout(r, 1))
      const out = await base.json(call)
      open--
      return out
    },
  })
  await run(s)
  expect(peak).toBeLessThanOrEqual(CONCURRENCY)
})
