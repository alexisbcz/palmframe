import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"

import { mock } from "bun:test"

import type { MachineRow } from "@/lib/database"

import type { AgentResult, Memory } from "./agent.logic"
import { DEFAULT_CREDITS_PER_DAY, type MachineConfig } from "./model"

// The real runner, publisher, ledger and limits over an in-memory database.
// Nothing here reaches a model, a feed or a social account, and the SQL itself
// isn't exercised: filters are honoured by this fake, not by Postgres.
type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

const USER = "user-1"
const MACHINE = "machine-1"

const db = {
  tables: {} as Record<string, Row[]>,
  balance: 100,
  spent: [] as { kind: string; job: string }[],
  refunded: [] as string[],
  controlBroken: false,
  agentCalls: [] as Memory[],
  agent: (() => passedResult("Nothing new")) as () => AgentResult,
  posted: [] as { text: string }[],
  postError: null as string | null,
  searches: 0,
  stories: 0,
  id: 0,
}

const passedResult = (reason: string): AgentResult => ({
  decision: "passed",
  reason,
  prompt: "machine-editor@1",
})

class Query {
  private op: "select" | "insert" | "update" | "delete" = "select"
  private filters: Filter[] = []
  private value: Row | Row[] = {}
  private one = false
  private counted = false
  private cap = Infinity

  constructor(private table: string) {}

  select(_?: string, options?: { count?: string }) {
    this.counted = !!options?.count
    return this
  }
  insert(value: Row | Row[]) {
    this.op = "insert"
    this.value = value
    return this
  }
  update(value: Row) {
    this.op = "update"
    this.value = value
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value)
    return this
  }
  in(column: string, values: readonly unknown[]) {
    this.filters.push((r) => values.includes(r[column]))
    return this
  }
  is(column: string, _: null) {
    this.filters.push((r) => r[column] == null)
    return this
  }
  not(column: string, _: string, __: null) {
    this.filters.push((r) => r[column] != null)
    return this
  }
  gte(column: string, value: string) {
    this.filters.push((r) => String(r[column] ?? "") >= value)
    return this
  }
  lt(column: string, value: string) {
    this.filters.push((r) => String(r[column] ?? "") < value)
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.cap = n
    return this
  }
  single() {
    this.one = true
    return this
  }
  maybeSingle() {
    this.one = true
    return this
  }

  private run() {
    if (this.table === "comic_machines_control" && db.controlBroken)
      return { data: null, error: { message: "unreachable" } }
    const rows = (db.tables[this.table] ??= [])
    const hits = rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.op === "insert") {
      const added = [this.value].flat().map((r) => ({
        id: `row-${++db.id}`,
        created_at: new Date().toISOString(),
        credits: 0,
        receipts: [],
        ...r,
      }))
      rows.push(...added)
      return { data: this.one ? added[0] : added, error: null }
    }
    if (this.op === "update") for (const r of hits) Object.assign(r, this.value)
    if (this.op === "delete")
      db.tables[this.table] = rows.filter((r) => !hits.includes(r))
    const found = hits.slice(0, this.cap)
    return {
      data: this.one ? (found[0] ?? null) : found,
      error: null,
      count: this.counted ? hits.length : undefined,
    }
  }

  then<A, B>(
    done?: (value: ReturnType<Query["run"]>) => A,
    failed?: (reason: unknown) => B
  ) {
    return Promise.resolve(this.run()).then(done, failed)
  }
}

const admin = {
  from: (table: string) => new Query(table),
  rpc: async (name: string, args: Record<string, string & number>) => {
    if (name === "refund_credits_for") {
      db.refunded.push(args.p_job)
      return { error: null }
    }
    if (db.balance < args.p_cost)
      return { error: { code: "P0402", message: "Not enough credits" } }
    db.balance -= args.p_cost
    db.spent.push({ kind: args.p_kind, job: args.p_job })
    return { error: null }
  },
}

mock.module("@/lib/supabase-admin.server", () => ({
  supabaseAdmin: () => admin,
}))
mock.module("./agent.server", () => ({
  runAgent: async (
    _machine: unknown,
    _voice: string,
    _inbox: unknown,
    memory: Memory
  ) => {
    db.agentCalls.push(memory)
    return db.agent()
  },
}))
mock.module("@/lib/media/pipeline.server", () => ({
  resumeStalled: async () => {},
  startMachineStory: async () => {
    db.stories++
    return true
  },
  afterStory: async () => {},
  afterRendition: async () => {},
}))
const openrouter = await import("@/lib/openrouter.server")
mock.module("@/lib/openrouter.server", () => ({
  ...openrouter,
  payingConnection: async () => null,
}))
mock.module("@/lib/studio/scrapecreators.server", () => ({
  searchVideos: async () => {
    db.searches++
    return []
  },
}))
mock.module("@/lib/instagram.server", () => ({
  InstagramError: class extends Error {},
  instagramEnabled: () => true,
  existingProfile: async () => "profile",
  postToAccount: async (r: { text: string }) => {
    db.posted.push(r)
    return db.postError
      ? { postId: "p", url: null, error: db.postError }
      : { postId: "p", url: "https://x.test/p", error: null }
  },
}))

const { runMachines } = await import("./run.server")
const { publishDraft } = await import("./publish.server")

const config = (o: Partial<MachineConfig> = {}): MachineConfig => ({
  keywords: [],
  exclude: [],
  threshold: 3,
  windowMinutes: 10,
  cooldownMinutes: 60,
  dailyCap: 5,
  maxCreditsPerDay: DEFAULT_CREDITS_PER_DAY,
  voice: "",
  language: "en",
  mission: "",
  feeds: [],
  listen: false,
  everyMinutes: 60,
  image: false,
  media: {
    enabled: false,
    formats: [],
    storiesPerDay: 1,
  },
  ...o,
})

const machine = (
  c: Partial<MachineConfig> = {},
  o: Partial<MachineRow> = {}
): MachineRow =>
  ({
    id: MACHINE,
    user_id: USER,
    name: "Desk",
    source: "wikipedia",
    config: config(c),
    enabled: true,
    state: {},
    last_error: null,
    next_run_at: null,
    publish_mode: "auto",
    outputs: [],
    failures: 0,
    slug: "desk",
    public: true,
    ...o,
  }) as MachineRow

const ACCOUNT = {
  platform: "bluesky",
  accountId: "a1",
  username: "desk",
} as const

const seed = (m: MachineRow) => {
  db.tables.comic_machines = [m as unknown as Row]
}

const inbox = (title = "Revenue grew 40% in 2026") => {
  db.tables.comic_machine_items = [
    {
      machine_id: MACHINE,
      key: "item-1",
      source: "Example",
      title,
      summary: "",
      url: "https://example.com/a",
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      status: "new",
    },
  ]
}

const filing = (text: string): AgentResult => {
  const source = {
    key: "item-1",
    source: "Example",
    title: "Revenue grew 40% in 2026",
    summary: "",
    url: "https://example.com/a",
    at: Date.now(),
  }
  return {
    decision: "filed",
    prompt: "machine-editor@1",
    filed: {
      text,
      scene: "",
      alt: "",
      sources: [source],
      link: source.url,
      read: "",
      prompt: "machine-editor@1",
    },
  }
}

const earlierRuns = (rows: Partial<Row>[]) => {
  db.tables.comic_machine_runs = rows.map((r) => ({
    machine_id: MACHINE,
    created_at: new Date().toISOString(),
    credits: 0,
    ...r,
  }))
}

const runs = () => db.tables.comic_machine_runs ?? []
const drafts = () => db.tables.comic_machine_drafts ?? []

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "not-used-the-agent-is-faked"
  Object.assign(db, {
    tables: {
      comic_machines_control: [{ id: true, halted: false }],
    },
    balance: 100,
    spent: [],
    refunded: [],
    controlBroken: false,
    agentCalls: [],
    agent: () => passedResult("Nothing new"),
    posted: [],
    postError: null,
    searches: 0,
    stories: 0,
  })
})

describe("the global halt", () => {
  const halt = () => {
    db.tables.comic_machines_control = [{ id: true, halted: true }]
  }

  test("stops a run before anything spends", async () => {
    seed(machine())
    inbox()
    halt()
    const result = await runMachines("https://x.test")
    assert.equal(result.halted, true)
    assert.equal(db.agentCalls.length, 0)
    assert.equal(db.spent.length, 0)
    assert.equal(runs().length, 0)
  })

  test("fails closed when the switch can't be read", async () => {
    seed(machine())
    inbox()
    db.controlBroken = true
    const result = await runMachines("https://x.test")
    assert.equal(result.halted, true)
    assert.equal(db.agentCalls.length, 0)
  })

  test("stops a post on the approve path too, and keeps it queued", async () => {
    const m = machine({}, { outputs: [ACCOUNT] })
    db.tables.comic_machine_drafts = [
      {
        id: "d1",
        machine_id: MACHINE,
        status: "approved",
        receipts: [],
        text: "Hi",
      },
    ]
    halt()
    const result = await publishDraft("d1", m)
    assert.equal(result?.halted, true)
    assert.equal(db.posted.length, 0)
    assert.equal(drafts()[0]!.status, "approved")
  })
})

describe("publishing", () => {
  const queued = (o: Row = {}) => {
    db.tables.comic_machine_drafts = [
      {
        id: "d1",
        machine_id: MACHINE,
        status: "approved",
        receipts: [],
        text: "Revenue grew 40%",
        link: "https://example.com/a",
        ...o,
      },
    ]
  }

  test("a public machine whose accounts all failed hasn't published", async () => {
    queued()
    db.postError = "Rejected"
    const result = await publishDraft(
      "d1",
      machine({}, { outputs: [ACCOUNT], public: true })
    )
    assert.equal(result?.published, false)
    assert.equal(drafts()[0]!.status, "failed")
    assert.equal(drafts()[0]!.published_at, null)
  })

  test("a page with no accounts still publishes", async () => {
    queued()
    const result = await publishDraft("d1", machine({}, { public: true }))
    assert.equal(result?.published, true)
    assert.equal(drafts()[0]!.status, "published")
  })

  test("every post goes out signed, in the machine's language", async () => {
    queued({ text: "x".repeat(500) })
    await publishDraft(
      "d1",
      machine({ language: "fr" }, { outputs: [ACCOUNT] })
    )
    assert.match(
      db.posted[0]!.text,
      /Écrit par une IA\nhttps:\/\/example\.com\/a$/
    )
  })
})

describe("an edition", () => {
  test("a pass leaves a billed row with its reason", async () => {
    seed(machine())
    inbox()
    await runMachines("https://x.test")
    const [run] = runs()
    assert.equal(run!.decision, "passed")
    assert.equal(run!.reason, "Nothing new")
    assert.equal(run!.credits, 1)
    assert.equal(run!.prompt, "machine-editor@1")
    assert.deepEqual(run!.shown, { Example: 1 })
    assert.equal(drafts().length, 0)
  })

  test("a refusal is told apart from a pass, and still billed", async () => {
    seed(machine())
    inbox()
    db.agent = () => ({ decision: "refused", reason: "", prompt: "p" })
    await runMachines("https://x.test")
    assert.equal(runs()[0]!.decision, "refused")
    assert.equal(runs()[0]!.credits, 1)
    assert.equal(db.refunded.length, 0)
  })

  test("a crash is refunded and recorded at no cost", async () => {
    seed(machine())
    inbox()
    db.agent = () => {
      throw new Error("Model down")
    }
    await runMachines("https://x.test")
    assert.equal(runs().length, 1)
    assert.equal(runs()[0]!.decision, "failed")
    assert.equal(runs()[0]!.reason, "Model down")
    assert.equal(runs()[0]!.credits, 0)
    assert.equal(db.refunded.length, 1)
  })

  test("an empty inbox is recorded and costs nothing", async () => {
    seed(machine())
    await runMachines("https://x.test")
    assert.equal(runs()[0]!.decision, "empty")
    assert.equal(db.spent.length, 0)
  })

  test("a clean post goes out, with its evidence stored", async () => {
    seed(machine({}, { outputs: [ACCOUNT] }))
    inbox()
    db.agent = () => filing("Revenue grew 40%")
    const result = await runMachines("https://x.test")
    assert.equal(result.published, 1)
    const [draft] = drafts()
    assert.equal(draft!.status, "published")
    assert.match(String(draft!.evidence), /Revenue grew 40% in 2026/)
    const [run] = runs()
    assert.equal(run!.decision, "filed")
    assert.equal(run!.agent_text, "Revenue grew 40%")
    assert.equal(run!.draft_id, draft!.id)
    assert.deepEqual(run!.cited, { Example: 1 })
  })

  test("a held post waits, buys no Story, and shows why in review", async () => {
    seed(
      machine(
        { media: { enabled: true, formats: ["linkedin"], storiesPerDay: 1 } },
        { publish_mode: "review" }
      )
    )
    inbox()
    db.agent = () => filing("Revenue grew 45%")
    await runMachines("https://x.test")
    const [draft] = drafts()
    assert.equal(draft!.status, "new")
    assert.match(String(draft!.held), /45%/)
    assert.equal(db.stories, 0)
  })

  test("a clean post can still start its Story", async () => {
    seed(
      machine({
        media: { enabled: true, formats: ["linkedin"], storiesPerDay: 1 },
      })
    )
    inbox()
    db.agent = () => filing("Revenue grew 40%")
    await runMachines("https://x.test")
    assert.equal(db.stories, 1)
    assert.equal(runs()[0]!.credits, 41)
  })

  test("a killed run still counts as an attempt", async () => {
    seed(machine({ dailyCap: 1 }))
    inbox()
    earlierRuns([{ decision: "running" }, { decision: "passed" }])
    await runMachines("https://x.test")
    assert.equal(db.agentCalls.length, 0)
    assert.equal(runs().at(-1)!.decision, "ceiling")
  })

  test("the agent only learns from what really went out", async () => {
    seed(machine())
    inbox()
    db.tables.comic_machine_drafts = [
      {
        machine_id: MACHINE,
        status: "published",
        text: "Went out",
        receipts: [{ postId: "p", error: null }],
        sources: [],
      },
      {
        machine_id: MACHINE,
        status: "new",
        held: "Held",
        text: "Unchecked claim",
        receipts: [],
        sources: [{ title: "The story" }],
      },
    ]
    await runMachines("https://x.test")
    assert.deepEqual(db.agentCalls[0]!.delivered, ["Went out"])
    assert.deepEqual(db.agentCalls[0]!.inReview, ["The story"])
  })
})

describe("the day's limits", () => {
  const paidFeed = { kind: "youtube", query: "news" } as const

  test("the attempts ceiling stops paid runs and paid searches", async () => {
    seed(machine({ dailyCap: 1, feeds: [paidFeed] }))
    inbox()
    earlierRuns([{ decision: "passed" }, { decision: "passed" }])
    await runMachines("https://x.test")
    assert.equal(db.agentCalls.length, 0)
    assert.equal(db.spent.length, 0)
    assert.equal(db.searches, 0)
    assert.equal(runs().at(-1)!.decision, "ceiling")
  })

  test("skipped, stopped and empty runs don't use up attempts", async () => {
    seed(machine({ dailyCap: 1 }))
    inbox()
    earlierRuns([
      { decision: "empty" },
      { decision: "deadline" },
      { decision: "capped" },
    ])
    await runMachines("https://x.test")
    assert.equal(db.agentCalls.length, 1)
  })

  test("dismissed and held posts leave the cap free", async () => {
    seed(machine({ dailyCap: 1 }))
    inbox()
    const today = new Date().toISOString()
    db.tables.comic_machine_drafts = [
      {
        machine_id: MACHINE,
        status: "dismissed",
        created_at: today,
        receipts: [],
        sources: [],
      },
      {
        machine_id: MACHINE,
        status: "new",
        held: "No",
        created_at: today,
        receipts: [],
        sources: [],
      },
    ]
    await runMachines("https://x.test")
    assert.equal(db.agentCalls.length, 1)
  })

  test("a post on the track fills the cap", async () => {
    seed(machine({ dailyCap: 1 }))
    inbox()
    db.tables.comic_machine_drafts = [
      {
        machine_id: MACHINE,
        status: "published",
        created_at: new Date().toISOString(),
        receipts: [],
        sources: [],
      },
    ]
    await runMachines("https://x.test")
    assert.equal(db.agentCalls.length, 0)
    assert.equal(runs().at(-1)!.decision, "capped")
  })

  test("the breaker goes listen-only and leaves the machine on", async () => {
    seed(machine({ maxCreditsPerDay: 50, feeds: [paidFeed] }))
    inbox()
    earlierRuns([{ decision: "filed", credits: 50 }])
    await runMachines("https://x.test")
    const row = db.tables.comic_machines![0]!
    assert.equal(db.agentCalls.length, 0)
    assert.equal(row.enabled, true)
    assert.equal(row.last_error, "budget")
    assert.equal(runs().at(-1)!.decision, "breaker")
    assert.equal(db.tables.comic_machine_items![0]!.status, "new")
  })

  test("renders count towards the breaker", async () => {
    seed(machine({ maxCreditsPerDay: 24 }))
    inbox()
    db.tables.comic_media_renditions = Array.from({ length: 2 }, () => ({
      machine_id: MACHINE,
      created_at: new Date().toISOString(),
    }))
    await runMachines("https://x.test")
    assert.equal(runs().at(-1)!.decision, "breaker")
  })

  test("linked X posts count towards the breaker, though nobody pays them", async () => {
    seed(machine({ maxCreditsPerDay: 20 }))
    inbox()
    db.tables.comic_machine_drafts = [
      {
        machine_id: MACHINE,
        status: "dismissed",
        link: "https://x.test",
        published_at: new Date().toISOString(),
        receipts: [{ platform: "twitter", postId: "p", error: null }],
        sources: [],
      },
    ]
    await runMachines("https://x.test")
    assert.equal(runs().at(-1)!.decision, "breaker")
  })

  test("the breaker leaves out a picture it can't afford, not the post", async () => {
    seed(machine({ maxCreditsPerDay: 12, image: true }))
    inbox()
    earlierRuns([{ decision: "passed", credits: 10 }])
    const result = filing("Revenue grew 40%")
    if (result.decision === "filed") result.filed.scene = "A rising arrow"
    db.agent = () => result
    await runMachines("https://x.test")
    assert.deepEqual(
      db.spent.map((s) => s.kind),
      ["machine_run"]
    )
    assert.equal(drafts()[0]!.image_url, null)
  })
})

describe("held posts", () => {
  const held = (hoursAgo: number, o: Row = {}) => ({
    id: `h${hoursAgo}`,
    machine_id: MACHINE,
    status: "new",
    held: "It states 45%.",
    receipts: [],
    sources: [],
    created_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    ...o,
  })

  test("expire after 48 hours, and only held ones", async () => {
    seed(machine())
    db.tables.comic_machine_drafts = [
      held(49),
      held(47),
      held(72, { id: "plain", held: null }),
      held(72, { id: "sent", status: "published" }),
    ]
    await runMachines("https://x.test")
    const status = Object.fromEntries(drafts().map((d) => [d.id, d.status]))
    assert.deepEqual(status, {
      h49: "expired",
      h47: "new",
      plain: "new",
      sent: "published",
    })
  })
})
