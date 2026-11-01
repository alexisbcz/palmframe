import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test"

import { config as workConfig } from "@/routes/api.books.work"

import { fakeEnabled, type BookModel, type ModelCall } from "./ai.server"
import type { BookRow, JobRow } from "./database"
import {
  JobClosed,
  extractSlice,
  finish,
  ocrSlice,
  qaSlice,
  translateSlice,
  type Engine,
} from "./engine"
import { BookParseError } from "./errors"
import { fakeModel } from "./fake"
import { makePdf } from "./fixtures"
import { plainBlock } from "./inline"
import {
  LEASE_MS,
  MAX_CHAPTERS,
  MAX_DURATION_MS,
  MAX_WORDS,
  SLICE_MS,
} from "./limits"
import { MemoryRepo } from "./memory-repo"
import { billableWords, countWords, wordsToCredits } from "./model"
import { assertReadable } from "./parse/index"
import { extractScans, readPdf, withTimeout } from "./parse/pdf.server"
import { assertSafeXml, parseHtml, parseXml } from "./xml"

beforeAll(() => void spyOn(console, "error").mockImplementation(() => {}))

const LINE = (i: number) =>
  `Sentence number ${i} tells of the old harbour and the long road home.`

async function setup(
  lines: string[],
  model: BookModel = fakeModel(),
  patch: Partial<JobRow> = {}
) {
  const repo = new MemoryRepo()
  const book = repo.addBook()
  await repo.writeBook(book, [
    { title: "One", blocks: lines.map((l) => plainBlock("paragraph", l)) },
  ])
  const job = repo.addJob(book, { credits_charged: 500, ...patch })
  const e: Engine = {
    repo,
    model,
    now: Date.now,
    emit: async () => {},
  }
  return { repo, book: book as BookRow, job, e }
}

// A model that lets the test act while a call is in flight.
const during = (act: (call: ModelCall) => Promise<void>): BookModel => {
  const base = fakeModel()
  return {
    ...base,
    async json(call, signal) {
      await act(call)
      return base.json(call, signal)
    },
  }
}

describe("blocker 1: a job can't translate more than it holds", () => {
  test("stops before going past what was charged", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => LINE(i))
    let calls = 0
    const s = await setup(
      lines,
      during(async (c) => void (c.task === "translate" && calls++)),
      { credits_charged: 1 }
    )
    expect(
      await translateSlice(s.e, await s.repo.job(s.job.id), Date.now() + 5_000)
    ).toBe("done")
    const job = await s.repo.job(s.job.id)
    expect(job).toMatchObject({ status: "failed", error: "budget_reached" })
    expect(calls).toBe(0)
    expect(wordsToCredits(job.billable, "standard")).toBeLessThanOrEqual(1)
    expect(s.repo.settled.get(job.id)).toBe(1)
  })

  test("the economy path stops the same way", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => LINE(i))
    const s = await setup(lines, fakeModel(), {
      credits_charged: 1,
      params: { mode: "economy" },
    })
    await translateSlice(s.e, await s.repo.job(s.job.id), Date.now() + 5_000)
    expect((await s.repo.job(s.job.id)).error).toBe("budget_reached")
  })

  test("a job charged exactly its estimate still finishes", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => LINE(i))
    const s = await setup(lines)
    const words = (await s.repo.segments(s.book.id)).reduce(
      (n, r) => n + r.words,
      0
    )
    await s.repo.setJob(s.job.id, {
      credits_charged: wordsToCredits(words, "standard"),
    })
    await translateSlice(s.e, await s.repo.job(s.job.id), Date.now() + 5_000)
    expect((await s.repo.job(s.job.id)).status).toBe("succeeded")
  })
})

describe("blocker 2: nothing lands after a cancel", () => {
  test("a reply arriving after a cancel saves nothing and bills nothing", async () => {
    const s0 = { cancel: async () => {} }
    const s = await setup(
      [LINE(1), LINE(2)],
      during(async (c) => {
        if (c.task === "translate") await s0.cancel()
      }),
      { credits_charged: 100 }
    )
    s0.cancel = async () =>
      void (await finish(s.e, await s.repo.job(s.job.id), "cancelled"))
    await expect(
      translateSlice(s.e, await s.repo.job(s.job.id), Date.now() + 5_000)
    ).rejects.toBeInstanceOf(JobClosed)
    const rows = await s.repo.segments(s.book.id)
    expect(rows.every((r) => r.status === "pending")).toBe(true)
    expect(s.repo.settled.get(s.job.id)).toBe(100)
  })

  test("an OCR reply after a cancel doesn't land", async () => {
    const s0 = { cancel: async () => {} }
    const s = await setup(
      [],
      during(async (c) => {
        if (c.task === "ocr") await s0.cancel()
      }),
      { kind: "ocr", credits_charged: 40 }
    )
    s0.cancel = async () =>
      void (await finish(s.e, await s.repo.job(s.job.id), "cancelled"))
    const id = crypto.randomUUID()
    s.repo.pages.set(id, {
      id,
      book_id: s.book.id,
      user_id: "user",
      number: 1,
      kind: "scan",
      chapter_position: null,
      href: null,
      image_path: "p1",
      width: 1,
      height: 1,
      status: "pending",
      blocks: [],
      confidence: null,
      attempts: 0,
    })
    s.repo.images.set("p1", { data: "a", media: "image/png" })
    await expect(
      ocrSlice(s.e, await s.repo.job(s.job.id), Date.now() + 5_000)
    ).rejects.toBeInstanceOf(JobClosed)
    expect(s.repo.pages.get(id)!.status).toBe("pending")
    expect(s.repo.settled.get(s.job.id)).toBe(40)
  })

  test("a refunded extraction leaves no terms and no bible", async () => {
    const line =
      "On that morning, Ada Lovelace walked with Grace Hopper past the old mill and along the river."
    const s0 = { cancel: async () => {} }
    const s = await setup(
      [line, line],
      during(async (c) => {
        if (c.task === "extract") await s0.cancel()
      }),
      { kind: "extract", credits_charged: 15 }
    )
    s0.cancel = async () =>
      void (await finish(s.e, await s.repo.job(s.job.id), "cancelled"))
    await extractSlice(s.e, await s.repo.job(s.job.id))
    expect(s.repo.suggestions).toEqual([])
    expect((await s.repo.book(s.book.id)).bible.summary ?? "").toBe("")
    expect(s.repo.settled.get(s.job.id)).toBe(15)
  })

  test("a refunded back-check leaves no findings", async () => {
    const s0 = { cancel: async () => {} }
    const s = await setup(
      [LINE(1), LINE(2), LINE(3)],
      during(async (c) => {
        if (c.task === "backcheck") await s0.cancel()
      }),
      { kind: "qa", credits_charged: 2, params: { backcheck: true } }
    )
    s0.cancel = async () =>
      void (await finish(s.e, await s.repo.job(s.job.id), "cancelled"))
    for (const r of await s.repo.segments(s.book.id))
      Object.assign(s.repo.rows.get(r.id)!, {
        status: "machine",
        target: "Une traduction complète de cette phrase.",
      })
    await qaSlice(s.e, await s.repo.job(s.job.id), Date.now() + 5_000)
    expect(s.repo.issues.size).toBe(0)
  })
})

describe("blocker 3: hostile files", () => {
  test("a wall of DOCTYPEs is refused in linear time", () => {
    const evil = "<!DOCTYPE".repeat(200_000)
    const start = performance.now()
    expect(() => assertSafeXml(evil)).toThrow(BookParseError)
    expect(performance.now() - start).toBeLessThan(500)
  })

  test("an unterminated DOCTYPE and a second one are refused", () => {
    expect(() => assertSafeXml(`<!DOCTYPE html${" ".repeat(5000)}>`)).toThrow(
      BookParseError
    )
    expect(() =>
      assertSafeXml("<!DOCTYPE html><html/><!DOCTYPE html>")
    ).toThrow(BookParseError)
  })

  test("parsing stops at the node cap, in XML and HTML", () => {
    const flood = "<a/>".repeat(1_100_000)
    expect(() => parseXml(flood)).toThrow(BookParseError)
    expect(() => parseHtml("<b></b>".repeat(1_100_000))).toThrow(BookParseError)
  })

  test("a chapter flood is refused", () => {
    const chapters = Array.from({ length: MAX_CHAPTERS + 1 }, () => ({
      title: "",
      blocks: [plainBlock("paragraph", "word")],
    }))
    expect(() =>
      assertReadable({
        meta: { title: "", author: "", language: null },
        chapters,
        assets: [],
        scans: [],
        warnings: [],
      })
    ).toThrow(BookParseError)
  })

  test("PDF parsing respects its deadline", async () => {
    const bytes = await makePdf({ textPages: 3 })
    await expect(readPdf(bytes, Date.now() - 1)).rejects.toMatchObject({
      code: "too_slow",
    })
  })

  test("a hung step becomes too_slow instead of hanging", async () => {
    await expect(
      withTimeout(new Promise(() => {}), 10)
    ).rejects.toMatchObject({ code: "too_slow" })
  })

  test("scan offsets are handed over page by page, and a deadline stops cleanly", async () => {
    const bytes = await makePdf({ textPages: 0, scannedPages: 3 })
    const seen: number[] = []
    await extractScans(bytes, [1, 2, 3], {
      async onPage(scan) {
        seen.push(scan.number)
      },
    })
    expect(seen).toEqual([1, 2, 3])
    expect(
      await extractScans(bytes, [1, 2, 3], { deadline: Date.now() - 1 })
    ).toEqual([])
  })

  test("a thin page with no picture isn't a scan, and keeps its words", async () => {
    const pdf = await readPdf(await makePdf({ textPages: 1, scannedPages: 1 }))
    expect(pdf.scans).toEqual([2])
    const bytes = await makePdf({ textPages: 1 })
    const [scan] = await extractScans(bytes, [1])
    expect(scan).toMatchObject({ png: null, blank: true })
  })
})

describe("major 4: billing can't be dodged by leaving out spaces", () => {
  test("long unbroken text bills by length", () => {
    const blob = "a".repeat(6_000)
    expect(countWords(blob)).toBe(1)
    expect(billableWords(blob)).toBe(1_000)
    expect(billableWords("three small words")).toBe(3)
  })

  test("what the engine bills uses it", async () => {
    const s = await setup(["a".repeat(6_000)])
    expect((await s.repo.segments(s.book.id))[0]!.words).toBe(1_000)
  })

  test("the book limit counts the same way", () => {
    const blocks = Array.from({ length: 1000 }, () =>
      plainBlock("paragraph", "a".repeat(10_000))
    )
    expect(MAX_WORDS).toBeLessThan(1000 * 1667 + 1)
    expect(() =>
      assertReadable({
        meta: { title: "", author: "", language: null },
        chapters: [{ title: "", blocks }],
        assets: [],
        scans: [],
        warnings: [],
      })
    ).toThrow(BookParseError)
  })
})

describe("major 7: slices stop on time", () => {
  test("the lease outlasts the function, and the function the slice", () => {
    expect(workConfig.maxDuration * 1000).toBe(MAX_DURATION_MS)
    expect(LEASE_MS).toBeGreaterThan(MAX_DURATION_MS)
    expect(SLICE_MS).toBeLessThan(MAX_DURATION_MS)
  })

  test("every model call carries the slice's signal", async () => {
    const signals: (AbortSignal | undefined)[] = []
    const base = fakeModel()
    const model: BookModel = {
      ...base,
      json(call, signal) {
        signals.push(signal)
        return base.json(call, signal)
      },
    }
    const s = await setup([LINE(1), LINE(2)], model)
    const clock = new AbortController()
    s.e.signal = clock.signal
    await translateSlice(s.e, await s.repo.job(s.job.id), Date.now() + 5_000)
    expect(signals.length).toBeGreaterThan(1)
    expect(signals.every((x) => x === clock.signal)).toBe(true)
  })
})

describe("the fake model fails closed", () => {
  const saved = { ...process.env }
  afterEach(() => {
    for (const k of ["BOOKS_AI_FAKE", "NODE_ENV", "VERCEL", "VERCEL_ENV"]) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })
  const withEnv = (env: Record<string, string>) => {
    process.env.BOOKS_AI_FAKE = "1"
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
    Object.assign(process.env, env)
    return fakeEnabled()
  }

  test("on for tests and local development only", () => {
    expect(withEnv({ NODE_ENV: "test" })).toBe(true)
    expect(withEnv({ NODE_ENV: "development" })).toBe(true)
  })

  test("off in production, on any Vercel deployment, or unset", () => {
    expect(withEnv({ NODE_ENV: "production" })).toBe(false)
    expect(withEnv({ NODE_ENV: "development", VERCEL: "1" })).toBe(false)
    expect(withEnv({ NODE_ENV: "test", VERCEL_ENV: "preview" })).toBe(false)
    delete process.env.NODE_ENV
    expect(fakeEnabled()).toBe(false)
  })
})
