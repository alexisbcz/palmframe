import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"

import { mock } from "bun:test"

import type { MachineRow } from "@/lib/database"

import type { AgentResult, Memory } from "./agent.logic"
import { DATASETS, selectable } from "./datasets"
import { DEFAULT_CREDITS_PER_DAY, type Item, type MachineConfig } from "./model"
import type { Line } from "./stance"

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
  feedStateBroken: false,
  dataset: [] as Item[],
  fetched: [] as string[],
  inboxes: [] as Item[][],
  agentCalls: [] as Memory[],
  agent: (() => passedResult("Nothing new")) as () => AgentResult,
  posted: [] as { text: string }[],
  postError: null as string | null,
  searches: 0,
  stories: 0,
  id: 0,
  desk: { verdict: "pass", rule: "none", part: "post", why: "" } as
    object | "down" | "refused",
  deskRequests: [] as string[],
  written: "",
  unpublished: [] as string[],
  unpublishError: false,
  discord: [] as { url: string; method: string; body?: string }[],
  discordAnswer: {
    status: 200,
    retryAfter: null as string | null,
    text: '{"id":"777"}',
  },
  discordDown: false,
}

const passedResult = (reason: string): AgentResult => ({
  decision: "passed",
  reason,
  prompt: "machine-editor@1",
})

class Query {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select"
  private conflict: string[] = []
  private ignore = false
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
  upsert(
    value: Row | Row[],
    options: { onConflict: string; ignoreDuplicates?: boolean }
  ) {
    this.op = "upsert"
    this.value = value
    this.conflict = options.onConflict.split(",")
    this.ignore = !!options.ignoreDuplicates
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
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== value)
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
  // Handles `column` and `column->>key`, where JSON null reads as null.
  not(column: string, _: string, __: null) {
    const [name, key] = column.split("->>") as [string, string?]
    this.filters.push((r) => {
      const value = r[name] as Row | null | undefined
      return (key ? value?.[key] : value) != null
    })
    return this
  }
  // Only the two shapes the publisher sends.
  or(filter: string) {
    assert.equal(filter, "desk.is.null,desk.in.(pass,hold)")
    this.filters.push(
      (r) => r.desk == null || ["pass", "hold"].includes(r.desk as string)
    )
    return this
  }
  lte(column: string, value: string) {
    this.filters.push((r) => String(r[column] ?? "") <= value)
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
    if (this.table === "comic_machine_feed_state" && db.feedStateBroken)
      return { data: null, error: { message: "unreachable" } }
    const rows = (db.tables[this.table] ??= [])
    if (this.op === "upsert") {
      const added: Row[] = []
      for (const row of [this.value].flat()) {
        const same = rows.find((r) =>
          this.conflict.every((c) => r[c] === row[c])
        )
        if (same && !this.ignore) Object.assign(same, row)
        if (!same) {
          const fresh = {
            id: `row-${++db.id}`,
            created_at: new Date().toISOString(),
            status: "new",
            ...row,
          }
          rows.push(fresh)
          added.push(fresh)
        }
      }
      return { data: added, error: null }
    }
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

const anthropic = await import("@anthropic-ai/sdk")
mock.module("@anthropic-ai/sdk", () => ({
  ...anthropic,
  default: class extends anthropic.default {
    // The hand-run writer.
    override beta = {
      messages: {
        create: async () => ({
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                post: true,
                text: db.written,
                scene: "",
                alt: "",
              }),
            },
          ],
        }),
      },
    } as never
    override messages = {
      create: async (request: unknown) => {
        db.deskRequests.push(JSON.stringify(request))
        if (db.desk === "down") throw new Error("overloaded")
        return db.desk === "refused"
          ? { stop_reason: "refusal", content: [] }
          : {
              stop_reason: "end_turn",
              content: [{ type: "text", text: JSON.stringify(db.desk) }],
            }
      },
    } as never
  },
}))
mock.module("@/lib/supabase-admin.server", () => ({
  supabaseAdmin: () => admin,
}))
mock.module("./agent.server", () => ({
  runAgent: async (
    _machine: unknown,
    _voice: string,
    inbox: Item[],
    memory: Memory
  ) => {
    db.agentCalls.push(memory)
    db.inboxes.push(inbox)
    return db.agent()
  },
}))
const realPipeline = { ...(await import("@/lib/media/pipeline.server")) }
mock.module("@/lib/media/pipeline.server", () => ({
  ...realPipeline,
  resumeStalled: async () => {},
  startMachineStory: async () => {
    db.stories++
    return true
  },
  afterStory: async () => {},
}))
const viewers = { ...(await import("@/lib/supabase.server")) }
mock.module("@/lib/supabase.server", () => ({
  ...viewers,
  getViewer: async () => ({
    supabase: admin,
    viewer: { id: USER, labs: { machines: true } },
    headers: new Headers(),
  }),
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
  connectBluesky: async () => {},
  profileFor: async () => "profile",
  instagramEnabled: () => true,
  existingProfile: async () => "profile",
  postToAccount: async (r: { text: string }) => {
    db.posted.push(r)
    return db.postError
      ? { postId: "p", url: null, error: db.postError }
      : { postId: "p", url: "https://x.test/p", error: null }
  },
  unpublishPost: async (r: { postId: string }) => {
    if (db.unpublishError) throw new Error("no")
    db.unpublished.push(r.postId)
  },
}))

// A copy, because the module namespace turns into the mock.
const realFeeds = { ...(await import("./feeds.server")) }
mock.module("./feeds.server", () => ({
  ...realFeeds,
  // No network: an open dataset's rows come from `db.dataset`. Everything else
  // takes the real path, whose refusals come before any request.
  readFeed: async (
    feed: Parameters<typeof realFeeds.readFeed>[0],
    now: number,
    signal?: AbortSignal
  ) => {
    if (feed.kind !== "dataset" || !selectable(DATASETS[feed.preset]))
      return realFeeds.readFeed(feed, now, signal)
    db.fetched.push(feed.preset)
    return db.dataset
  },
  // No Discord here: this fixture's requests stop at this list. Mocks outlive this
  // file, so anything else takes the real path, whose refusals fetch.test.ts checks.
  sendPublic: async (
    url: string,
    o: Parameters<typeof realFeeds.sendPublic>[1]
  ) => {
    if (!url.startsWith("https://discord.com/api/webhooks/12345678901234"))
      return realFeeds.sendPublic(url, o)
    db.discord.push({ url, method: o.method, body: o.body })
    if (db.discordDown) throw new Error("socket hang up")
    return { global: false, ...db.discordAnswer }
  },
}))

const { runMachines } = await import("./run.server")
const { publishDraft, retractDraft } = await import("./publish.server")
const { UNREAD_REASON, approvalCheck } = await import("./standards.server")
const { action } = await import("@/routes/api.machines")
const { loader: rss } = await import("@/routes/machine.rss")
const { publicMachine } = await import("./feed-page.server")
const {
  carryToDiscord,
  connectDiscord,
  deliverDiscord,
  discordOutputs,
  flushDiscord,
  removeDiscord,
  testDiscord,
  withdrawDiscord,
} = await import("./discord.server")
const { parseWebhook } = await import("./discord")

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
  line: null,
  style: "plain",
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

const filing = (text: string, take = ""): AgentResult => {
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
      take,
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
    feedStateBroken: false,
    dataset: [],
    fetched: [],
    inboxes: [],
    agentCalls: [],
    agent: () => passedResult("Nothing new"),
    posted: [],
    postError: null,
    searches: 0,
    stories: 0,
    desk: { verdict: "pass", rule: "none", part: "post", why: "" },
    deskRequests: [],
    written: "",
    unpublished: [],
    unpublishError: false,
    discord: [],
    discordAnswer: { status: 200, retryAfter: null, text: '{"id":"777"}' },
    discordDown: false,
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
    earlierRuns([
      { decision: "running" },
      { decision: "passed" },
      { decision: "passed" },
      { decision: "passed" },
      { decision: "passed" },
    ])
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
    earlierRuns([
      { decision: "passed" },
      { decision: "passed" },
      { decision: "passed" },
      { decision: "passed" },
      { decision: "passed" },
    ])
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

const LINE: Line = {
  stance: "left",
  arena: "fr",
  publisher: "Norvia Press",
  contact: "desk@example.com",
  scrutiny: [],
}

const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString()

// A reviewed calendar with no election in it, unless a test adds one.
const calendar = (windows: Row[] = []) => {
  db.tables.comic_arena_calendars = [
    { arena: "fr", reviewed_until: hours(24 * 90), windows },
  ]
}

const lineMachine = (
  c: Partial<MachineConfig> = {},
  o: Partial<MachineRow> = {}
) => machine({ line: LINE, ...c }, { publish_mode: "review", ...o })

const fired = async (m: MachineRow, result: AgentResult) => {
  seed(m)
  inbox()
  db.agent = () => result
  await runMachines("https://x.test")
  return drafts()[0]!
}

describe("a plain machine", () => {
  test("never reaches the desk, and ignores a stray take", async () => {
    const draft = await fired(machine(), filing("Revenue grew 40%.", "Bold."))
    assert.equal(db.deskRequests.length, 0)
    assert.equal(draft.text, "Revenue grew 40%.")
    assert.equal(draft.desk, null)
    assert.equal(draft.status, "published")
  })
})

describe("election calendar", () => {
  test("no reviewed calendar means no run and no model call", async () => {
    seed(lineMachine())
    inbox()
    await runMachines("https://x.test")
    assert.equal(db.agentCalls.length, 0)
    assert.equal(runs()[0]!.decision, "no_calendar")
    assert.equal(db.tables.comic_machines![0]!.last_error, "no_calendar")
  })

  test("an expired review counts as none", async () => {
    calendar()
    db.tables.comic_arena_calendars![0]!.reviewed_until = hours(-1)
    seed(lineMachine())
    inbox()
    await runMachines("https://x.test")
    assert.equal(runs()[0]!.decision, "no_calendar")
  })

  test("a window skips the edition before any model call", async () => {
    calendar([{ from: hours(-1), to: hours(1), label: "Vote" }])
    seed(lineMachine())
    inbox()
    await runMachines("https://x.test")
    assert.equal(db.agentCalls.length, 0)
    assert.equal(runs()[0]!.decision, "frozen")
  })

  test("publishDraft refuses in a window, so approving can't get past it", async () => {
    calendar([{ from: hours(-1), to: hours(1), label: "Vote" }])
    const m = lineMachine({}, { outputs: [ACCOUNT] })
    seed(m)
    db.tables.comic_machine_drafts = [
      {
        id: "d1",
        machine_id: MACHINE,
        status: "approved",
        desk: "pass",
        text: "Fact.",
        receipts: [],
        created_at: hours(-1),
      },
    ]
    const result = await publishDraft("d1", m)
    assert.equal(result?.stopped, "frozen")
    assert.equal(drafts()[0]!.status, "approved")
    assert.equal(db.posted.length, 0)
  })

  test("publishDraft refuses with no calendar, and a broken one", async () => {
    const m = lineMachine()
    const row = { id: "d1", machine_id: MACHINE, status: "approved" }
    db.tables.comic_machine_drafts = [{ ...row, desk: "pass", receipts: [] }]
    assert.equal((await publishDraft("d1", m))?.stopped, "no_calendar")
    db.tables.comic_arena_calendars = [{ arena: "fr", windows: "soon" }]
    assert.equal((await publishDraft("d1", m))?.stopped, "no_calendar")
  })

  test("a line without its public page doesn't publish", async () => {
    calendar()
    const m = lineMachine({}, { public: false })
    assert.equal((await publishDraft("d1", m))?.stopped, "not_public")
  })

  test("what a freeze held back expires instead of going out late", async () => {
    calendar()
    const m = lineMachine({}, { outputs: [ACCOUNT] })
    seed(m)
    db.tables.comic_machine_drafts = [
      {
        id: "d1",
        machine_id: MACHINE,
        status: "approved",
        desk: "pass",
        text: "Fact.",
        receipts: [],
        created_at: hours(-49),
      },
    ]
    await publishDraft("d1", m)
    assert.equal(drafts()[0]!.status, "expired")
    assert.equal(db.posted.length, 0)
  })
})

describe("line machines", () => {
  test("a far stance stays in review even if the row says auto", async () => {
    calendar()
    const m = lineMachine(
      { line: { ...LINE, stance: "far-right" } },
      { publish_mode: "auto" }
    )
    const draft = await fired(m, filing("Revenue grew 40%."))
    assert.equal(draft.status, "new")
    assert.equal(draft.held, null)
  })

  test("center can run by itself once a row says auto", async () => {
    calendar()
    const m = lineMachine(
      { line: { ...LINE, stance: "center" } },
      { publish_mode: "auto" }
    )
    assert.equal(
      (await fired(m, filing("Revenue grew 40%."))).status,
      "published"
    )
  })

  test("the take goes out with the fact", async () => {
    calendar()
    const draft = await fired(
      lineMachine(),
      filing("Revenue grew 40%.", "We think that should worry you.")
    )
    assert.equal(
      draft.text,
      "Revenue grew 40%. We think that should worry you."
    )
    assert.equal(draft.take, "We think that should worry you.")
  })

  test("a take with a made-up number costs the take, not the post", async () => {
    calendar()
    const draft = await fired(
      lineMachine(),
      filing("Revenue grew 40%.", "That's 77% too much.")
    )
    assert.equal(draft.text, "Revenue grew 40%.")
    assert.equal(draft.held, null)
    assert.match(String(draft.take_note), /77%/)
  })

  test("a take that doesn't fit is dropped", async () => {
    calendar()
    const draft = await fired(
      lineMachine(),
      filing("Revenue grew 40%.", "x ".repeat(120).trim())
    )
    assert.equal(draft.text, "Revenue grew 40%.")
    assert.equal(draft.take_note, "The take didn't fit.")
  })

  test("the desk can cost just the take", async () => {
    calendar()
    db.desk = {
      verdict: "hold",
      rule: "cause_as_fact",
      part: "take",
      why: "No.",
    }
    const draft = await fired(
      lineMachine({}, { publish_mode: "auto" }),
      filing("Revenue grew 40%.", "Greed did this.")
    )
    assert.equal(draft.text, "Revenue grew 40%.")
    assert.equal(draft.take_note, "No.")
    assert.equal(draft.desk, "pass")
    assert.equal(draft.held, null)
  })

  test("Stories never start, whatever the row says", async () => {
    calendar()
    await fired(
      lineMachine({
        media: { enabled: true, formats: ["x_thread"], storiesPerDay: 1 },
      }),
      filing("Revenue grew 40%.")
    )
    assert.equal(db.stories, 0)
  })
})

describe("the standards desk", () => {
  test("is never told the stance, publisher or brief", async () => {
    calendar()
    await fired(
      lineMachine({ mission: "Secret brief", voice: "Secret voice" }),
      filing("Revenue grew 40%.", "We think so.")
    )
    assert.equal(db.deskRequests.length, 1)
    const sent = db.deskRequests[0]!
    for (const word of ["left", "Norvia", "Secret", "Desk\\"]) {
      assert.equal(sent.includes(word), false, word)
    }
    assert.match(sent, /We think so/)
  })

  test("fails closed when it is down", async () => {
    calendar()
    db.desk = "down"
    const draft = await fired(
      lineMachine(
        { line: { ...LINE, stance: "center" } },
        { publish_mode: "auto" }
      ),
      filing("Revenue grew 40%.")
    )
    assert.equal(draft.status, "new")
    assert.equal(draft.desk, "unread")
    assert.notEqual(draft.held, null)
  })

  test("fails closed on a refusal and on a malformed answer", async () => {
    calendar()
    db.desk = "refused"
    const refused = await fired(lineMachine(), filing("Revenue grew 40%."))
    assert.equal(refused.desk, "unread")
    db.tables.comic_machine_drafts = []
    db.desk = { verdict: "block", rule: "made_up", part: "post", why: "x" }
    const odd = await fired(lineMachine(), filing("Revenue grew 40%."))
    assert.equal(odd.desk, "unread")
  })

  test("publishDraft won't send words the desk hasn't passed", async () => {
    calendar()
    const m = lineMachine({}, { outputs: [ACCOUNT] })
    seed(m)
    for (const desk of [null, "unread", "block"]) {
      db.tables.comic_machine_drafts = [
        {
          id: "d1",
          machine_id: MACHINE,
          status: "approved",
          desk,
          text: "Fact.",
          receipts: [],
          created_at: hours(-1),
        },
      ]
      assert.equal(await publishDraft("d1", m), null)
      assert.equal(drafts()[0]!.status, "new")
      assert.equal(drafts()[0]!.held, UNREAD_REASON)
    }
    assert.equal(db.posted.length, 0)
  })

  test("a block is shown, off the cap, remembered and costs no picture", async () => {
    calendar()
    db.desk = {
      verdict: "block",
      rule: "hate",
      part: "post",
      why: "It's hate.",
    }
    const draft = await fired(
      machine({ style: "deadpan", image: true }, { publish_mode: "auto" }),
      filing("Revenue grew 40%.")
    )
    assert.equal(draft.status, "blocked")
    assert.equal(draft.block_rule, "hate")
    assert.equal(draft.held, "It's hate.")
    assert.equal(draft.image_url, null)
    assert.equal(runs().at(-1)!.decision, "blocked")
    assert.deepEqual(
      (await import("./gate")).PUBLISHED_TRACK.includes("blocked" as never),
      false
    )
  })

  test("a slur stops the post in code, even in a dropped take", async () => {
    calendar()
    const draft = await fired(
      lineMachine(),
      filing("Revenue grew 40%.", "Those globalists again, up 77%.")
    )
    assert.equal(draft.status, "blocked")
    assert.equal(db.deskRequests.length, 0)
  })

  test("funny machines get the same desk, without a calendar", async () => {
    const draft = await fired(
      machine({ style: "deadpan" }),
      filing("Revenue grew 40%.", "A quiet year.")
    )
    assert.equal(db.deskRequests.length, 1)
    assert.equal(draft.text, "Revenue grew 40%. A quiet year.")
    assert.equal(draft.status, "published")
  })

  test("a funny machine fails closed too", async () => {
    db.desk = "down"
    const draft = await fired(
      machine({ style: "wry" }),
      filing("Revenue grew 40%.")
    )
    assert.equal(draft.status, "new")
    assert.equal(draft.desk, "unread")
  })
})

describe("retracting", () => {
  const published = (receipts: Row[]) => {
    db.tables.comic_machine_drafts = [
      { id: "d1", machine_id: MACHINE, status: "published", receipts },
    ]
  }
  const sent = (platform: string, postId: string) => ({
    accountId: platform,
    platform,
    username: "u",
    url: "https://x.test/p",
    postId,
    error: null,
  })

  test("takes a post down where it can and says where it can't", async () => {
    published([sent("bluesky", "b1"), sent("instagram", "i1")])
    const result = await retractDraft("d1", machine(), "error")
    const [draft] = drafts()
    assert.equal(draft!.status, "retracted")
    assert.equal(draft!.retract_reason, "error")
    assert.deepEqual(db.unpublished, ["b1"])
    assert.deepEqual(
      (draft!.receipts as { retraction: string }[]).map((r) => r.retraction),
      ["removed", "manual"]
    )
    assert.equal(result?.manual.length, 1)
  })

  test("a failed takedown is left for a person, not hidden", async () => {
    db.unpublishError = true
    published([sent("twitter", "t1")])
    const result = await retractDraft("d1", machine(), "source")
    assert.equal(result?.manual.length, 1)
    assert.equal(drafts()[0]!.status, "retracted")
  })

  test("works during a halt, and only on a published post", async () => {
    db.tables.comic_machines_control = [{ id: true, halted: true }]
    published([])
    assert.notEqual(await retractDraft("d1", machine(), "owner"), null)
    assert.equal(await retractDraft("d1", machine(), "owner"), null)
  })
})

describe("approving", () => {
  const draft = (desk: "pass" | "hold" | "block" | "unread" | null) => ({
    text: "Revenue grew 40%.",
    scene: "",
    alt: "",
    evidence: "Revenue grew 40% in 2026.",
    sources: [{ title: "x", url: "https://x.test", source: "x" }],
    signal: null,
    desk,
  })
  const check = (text: string, d: ReturnType<typeof draft>, desk = true) =>
    approvalCheck(text, d, "en", desk, AbortSignal.timeout(1000))
  const SAME = "Revenue grew 40%."

  test("the same words the desk passed need no second read", async () => {
    assert.deepEqual(await check(SAME, draft("pass")), {
      held: null,
      desk: "pass",
    })
    assert.equal(db.deskRequests.length, 0)
  })

  test("a person can overrule a hold with the same words", async () => {
    assert.equal((await check(SAME, draft("hold"))).held, null)
  })

  test("a person can't overrule a block, however they ask", async () => {
    assert.notEqual((await check(SAME, draft("block"))).held, null)
  })

  test("changed words are read again", async () => {
    db.desk = { verdict: "block", rule: "hate", part: "post", why: "Stop." }
    const r = await check("Revenue grew 40% again.", draft("pass"))
    assert.deepEqual(r, { held: "Stop.", desk: "block" })
    assert.equal(db.deskRequests.length, 1)
  })

  test("a slur written by the person stops in code", async () => {
    const r = await check(
      "Revenue grew 40%, thanks to globalists.",
      draft("pass")
    )
    assert.equal(r.desk, "block")
    assert.equal(db.deskRequests.length, 0)
  })

  test("words the desk never read are read now, and fail closed", async () => {
    db.desk = "down"
    const r = await check(SAME, draft("unread"))
    assert.equal(r.desk, "unread")
    assert.notEqual(r.held, null)
    assert.equal((await check(SAME, draft(null))).desk, "unread")
  })

  test("an edit the gate holds can't keep the old pass", async () => {
    const r = await check("Revenue grew 90%.", draft("pass"))
    assert.notEqual(r.held, null)
    assert.equal(r.desk, "unread")
  })

  test("a plain machine only meets the gate", async () => {
    const r = await check("Revenue grew 40% again.", draft(null), false)
    assert.deepEqual(r, { held: null, desk: null })
    assert.equal(db.deskRequests.length, 0)
  })
})

describe("dataset feeds", () => {
  const feeds: MachineConfig["feeds"] = [
    { kind: "dataset", preset: "rejectedBin" },
  ]
  const row = (id: number): Item => ({
    key: `dataset:rejectedBin:${id}@irrelevant`,
    source: "UK Parliament",
    title: `Petition ${id}`,
    summary: "A petition to the UK Parliament.",
    url: `https://petition.parliament.uk/petitions/${id}`,
    at: Date.now(),
  })
  const items = () => db.tables.comic_machine_items ?? []
  const state = () => db.tables.comic_machine_feed_state ?? []
  const again = () => {
    db.tables.comic_machines![0]!.next_run_at = null
    return runMachines("https://palmframe.test")
  }

  test("a first read is remembered as history and pays for nothing", async () => {
    db.dataset = [row(1), row(2)]
    seed(machine({ feeds }))
    await runMachines("https://palmframe.test")
    assert.equal(items().length, 0)
    assert.equal(db.spent.length, 0)
    assert.deepEqual(state()[0]!.seen, [row(1).key, row(2).key])
    assert.equal(state()[0]!.outcome, "ok")
  })

  test("after that only new rows reach the inbox", async () => {
    db.dataset = [row(1)]
    seed(machine({ feeds }))
    await runMachines("https://palmframe.test")
    db.dataset = [row(2), row(1)]
    await again()
    assert.deepEqual(
      items().map((i) => i.key),
      [row(2).key]
    )
    assert.equal(db.inboxes[0]!.length, 1)
  })

  test("a row isn't news again once the inbox has been pruned", async () => {
    db.dataset = [row(1)]
    seed(machine({ feeds }))
    await runMachines("https://palmframe.test")
    db.dataset = [row(2), row(1)]
    await again()
    db.tables.comic_machine_items = []
    await again()
    assert.equal(items().length, 0)
  })

  test("a save doesn't make it read its backlog as news", async () => {
    db.dataset = [row(1)]
    seed(machine({ feeds }))
    await runMachines("https://palmframe.test")
    // What the route does to a machine on every save.
    db.tables.comic_machines![0]!.state = {}
    await again()
    assert.equal(items().length, 0)
  })

  test("a row in a new state counts as new", async () => {
    db.dataset = [row(1)]
    seed(machine({ feeds }))
    await runMachines("https://palmframe.test")
    db.dataset = [{ ...row(1), key: "dataset:rejectedBin:1@duplicate" }]
    await again()
    assert.equal(items().length, 1)
  })

  test("without its state it reads nothing, so nothing old comes back", async () => {
    db.dataset = [row(1)]
    db.feedStateBroken = true
    seed(machine({ feeds }))
    await runMachines("https://palmframe.test")
    assert.equal(items().length, 0)
    assert.deepEqual(db.fetched, [])
  })

  test("a closed dataset is refused before any request, and says so", async () => {
    seed(machine({ feeds: [{ kind: "dataset", preset: "sweetOdor" }] }))
    await runMachines("https://palmframe.test")
    const stored = db.tables.comic_machines![0]!
    assert.equal(stored.last_error, "refused:sweetOdor")
    assert.equal(stored.enabled, true)
    assert.equal(stored.failures, 0)
    assert.equal(state()[0]!.outcome, "unreadable")
  })

  test("a profile feed already on a machine is refused the same way", async () => {
    const url = "https://bsky.app/profile/someone.bsky.social/rss"
    seed(machine({ feeds: [{ kind: "rss", url }] }))
    await runMachines("https://palmframe.test")
    assert.equal(db.tables.comic_machines![0]!.last_error, `refused:${url}`)
  })

  test("the public page credits it, with the date a licence asks for", async () => {
    db.dataset = [row(1)]
    seed(machine({ feeds: [{ kind: "dataset", preset: "rappelConso" }] }))
    await runMachines("https://palmframe.test")
    const page = await publicMachine("desk")
    assert.equal(page?.credits[0]?.source, "RappelConso")
    assert.equal(page?.credits[0]?.updated, state()[0]!.last_ok_at)
  })

  test("a post ends with its source's credit, and the room is taken first", async () => {
    db.dataset = [row(1)]
    seed(machine({ feeds }, { publish_mode: "auto", outputs: [ACCOUNT] }))
    await runMachines("https://palmframe.test")
    db.dataset = [row(2), row(1)]
    db.agent = () => {
      const result = filing("Petition 2 was rejected.")
      assert.equal(result.decision, "filed")
      if (result.decision === "filed")
        result.filed.sources = [{ ...row(2), key: "item-1" }]
      return result
    }
    await again()
    assert.match(db.posted[0]!.text, /AI-written · UK Parliament/)
  })
})

describe("rival outlets", () => {
  const RIVAL = "00000000-0000-4000-8000-000000000002"
  const deadpan = { style: "deadpan" as const }
  const rivalRow = (o: Partial<Row> = {}) =>
    ({
      id: RIVAL,
      user_id: USER,
      name: "The Other Desk",
      slug: "other-desk",
      public: true,
      enabled: false,
      config: {},
      ...o,
    }) as Row
  const post = (o: Partial<Row> = {}) => ({
    id: "post-1",
    machine_id: RIVAL,
    text: "Rival claims 90 sightings.",
    status: "published",
    sources: [],
    published_at: new Date().toISOString(),
    ...o,
  })
  const feud = (m: MachineRow) => {
    db.tables.comic_machines = [m as unknown as Row, rivalRow()]
  }
  const feeds: MachineConfig["feeds"] = [{ kind: "rival", machine: RIVAL }]
  const inboxKeys = () =>
    (db.tables.comic_machine_items ?? []).map((i) => i.key)

  test("a rival's post arrives as a foil", async () => {
    db.tables.comic_machine_drafts = [post()]
    feud(machine({ feeds, ...deadpan }))
    await runMachines("https://palmframe.test")
    const item = db.tables.comic_machine_items![0]!
    assert.equal(item.role, "foil")
    assert.equal(item.url, "https://palmframe.test/m/other-desk")
    assert.equal(db.inboxes[0]![0]!.role, "foil")
  })

  test("nothing is read from a rival without a public page", async () => {
    db.tables.comic_machine_drafts = [post()]
    db.tables.comic_machines = [
      machine({ feeds, ...deadpan }) as unknown as Row,
      rivalRow({ public: false }),
    ]
    await runMachines("https://palmframe.test")
    assert.deepEqual(inboxKeys(), [])
    assert.match(String(db.tables.comic_machines![0]!.last_error), /^refused:/)
  })

  test("nothing is read while this machine has no public page", async () => {
    db.tables.comic_machine_drafts = [post()]
    feud(machine({ feeds, ...deadpan }, { public: false }))
    await runMachines("https://palmframe.test")
    assert.deepEqual(inboxKeys(), [])
  })

  test("another owner's machine can't be read", async () => {
    db.tables.comic_machine_drafts = [post()]
    db.tables.comic_machines = [
      machine({ feeds, ...deadpan }) as unknown as Row,
      rivalRow({ user_id: "someone-else" }),
    ]
    await runMachines("https://palmframe.test")
    assert.deepEqual(inboxKeys(), [])
  })

  test("a post that answered a rival isn't read in turn", async () => {
    db.tables.comic_machine_drafts = [
      post({
        sources: [
          { title: "x", url: "https://e.com", source: "y", role: "foil" },
        ],
      }),
    ]
    feud(machine({ feeds, ...deadpan }))
    await runMachines("https://palmframe.test")
    assert.deepEqual(inboxKeys(), [])
  })

  test("both public pages say they have the same owner", async () => {
    db.tables.comic_machines = [
      machine({ feeds, ...deadpan }) as unknown as Row,
      rivalRow(),
    ]
    assert.deepEqual((await publicMachine("desk"))?.sameOwner, [
      { name: "The Other Desk", slug: "other-desk" },
    ])
    assert.deepEqual((await publicMachine("other-desk"))?.sameOwner, [
      { name: "Desk", slug: "desk" },
    ])
  })

  test("an unrelated outlet of the same owner isn't named", async () => {
    db.tables.comic_machines = [
      machine({ ...deadpan }) as unknown as Row,
      rivalRow(),
    ]
    assert.deepEqual((await publicMachine("desk"))?.sameOwner, [])
  })

  test("a number from a foil isn't evidence, so the post is held", async () => {
    const foil: Item = {
      key: "rival:x:1",
      source: "The Other Desk",
      title: "Rival claims 90 sightings.",
      summary: "",
      url: "https://palmframe.test/m/other-desk",
      at: Date.now(),
      role: "foil",
    }
    inbox()
    feud(machine({ ...deadpan }, { publish_mode: "auto", outputs: [ACCOUNT] }))
    db.agent = () => {
      const result = filing("There were 90 sightings in 2026.")
      if (result.decision === "filed") result.filed.sources.push(foil)
      return result
    }
    await runMachines("https://palmframe.test")
    const draft = drafts()[0]!
    assert.notEqual(draft.held, null)
    assert.equal(draft.status, "new")
    assert.deepEqual(
      (draft.sources as { role?: string }[]).map((s) => s.role),
      [undefined, "foil"]
    )
  })

  test("a post standing on foils alone is held", async () => {
    const foil: Item = {
      key: "rival:x:1",
      source: "The Other Desk",
      title: "Rival claims 90 sightings.",
      summary: "",
      url: "https://palmframe.test/m/other-desk",
      at: Date.now(),
      role: "foil",
    }
    inbox()
    feud(machine({ ...deadpan }, { publish_mode: "auto", outputs: [ACCOUNT] }))
    db.agent = () => {
      const result = filing("Nothing to see.")
      if (result.decision === "filed") {
        result.filed.sources = [foil]
        result.filed.link = null
      }
      return result
    }
    await runMachines("https://palmframe.test")
    assert.notEqual(drafts()[0]!.held, null)
    assert.equal(db.posted.length, 0)
  })
})

describe("the Discord route", () => {
  // Made up: the right shape, and no webhook anywhere.
  const HOOK =
    "https://discord.com/api/webhooks/123456789012345678/not-a-real-token_not-a-real-token_not-a-real-token"
  const FAR: Line = { ...LINE, stance: "far-left" }
  const PASS = { verdict: "pass", rule: "none", part: "post", why: "" }

  beforeEach(() => {
    process.env.OPENROUTER_KEY_SECRET = "a-test-secret"
    process.env.SUPABASE_SECRET_KEY = "a-test-key"
  })

  const connect = () =>
    connectDiscord({ id: MACHINE, user_id: USER }, parseWebhook(HOOK)!)
  const row = () => db.tables.comic_machine_discord?.[0] as Row
  const sent = () => db.discord.filter((c) => c.method === "POST")
  const draftOf = (o: Row = {}) => {
    db.tables.comic_machine_drafts = [
      {
        id: "d1",
        machine_id: MACHINE,
        user_id: USER,
        text: "Revenue grew 40% in 2026.",
        link: "https://example.com/a",
        sources: [],
        status: "new",
        held: null,
        desk: null,
        created_at: new Date().toISOString(),
        discord_status: "pending",
        discord_attempts: 0,
        discord_next_at: new Date(0).toISOString(),
        receipts: [],
        ...o,
      },
    ]
    return db.tables.comic_machine_drafts[0]!
  }
  // Waits are measured from now, so a later tick is a row made due again.
  const due = () => {
    drafts()[0]!.discord_next_at = new Date(0).toISOString()
    if (db.tables.comic_machine_discord?.[0])
      db.tables.comic_machine_discord[0].retry_at = null
  }

  test("the webhook is stored sealed, and no page can get it back", async () => {
    await connect()
    assert.ok(!JSON.stringify(row()).includes("not-a-real-token"))
    assert.equal(row().webhook_hint, "5678")
    const outputs = await discordOutputs(USER)
    assert.deepEqual(outputs, [
      { machine_id: MACHINE, state: "active", hint: "5678" },
    ])
  })

  test("a post goes with its signature, and no ping can go with it", async () => {
    inbox()
    seed(machine({}, { publish_mode: "review" }))
    await connect()
    db.agent = () => filing("Revenue grew 40% in 2026.")
    await runMachines("https://palmframe.test")
    assert.equal(sent().length, 1)
    assert.ok(sent()[0]!.url.startsWith(`${HOOK}?wait=true`))
    const body = JSON.parse(sent()[0]!.body!)
    assert.deepEqual(body.allowed_mentions, { parse: [] })
    assert.match(body.embeds[0].description, /AI-written/)
    assert.equal(drafts()[0]!.discord_status, "sent")
    assert.equal(drafts()[0]!.discord_message_id, "777")
    // In a channel, waiting for a person, is not published.
    assert.equal(drafts()[0]!.status, "new")
    assert.deepEqual(drafts()[0]!.receipts, [])
  })

  test("a far stance reaches Discord and still can't publish", async () => {
    await connect()
    draftOf({ desk: "pass" })
    calendar()
    const far = machine({ line: FAR }, { publish_mode: "review" })
    assert.equal(await deliverDiscord("d1", far), "sent")
    assert.equal(drafts()[0]!.status, "new")
    assert.equal(db.posted.length, 0)
  })

  test("a held post doesn't go", async () => {
    inbox()
    seed(machine({}, { publish_mode: "review" }))
    await connect()
    db.agent = () => filing("Revenue grew 75% in 2026.")
    await runMachines("https://palmframe.test")
    assert.notEqual(drafts()[0]!.held, null)
    assert.equal(drafts()[0]!.discord_status ?? null, null)
    assert.equal(sent().length, 0)
  })

  test("the desk's block and the desk's silence both keep a post out", async () => {
    for (const desk of [
      { verdict: "block", rule: "hate", part: "post", why: "no" },
      "down" as const,
    ]) {
      db.tables.comic_machine_drafts = []
      db.discord = []
      db.tables.comic_machine_runs = []
      inbox()
      seed(machine({ style: "deadpan" }, { publish_mode: "review" }))
      await connect()
      db.desk = desk
      db.agent = () => filing("Revenue grew 40% in 2026.")
      await runMachines("https://palmframe.test")
      assert.equal(drafts().length, 1)
      assert.equal(drafts()[0]!.discord_status ?? null, null)
      assert.equal(sent().length, 0)
    }
  })

  test("a desk machine's post goes once the desk has passed it", async () => {
    inbox()
    seed(machine({ style: "deadpan" }, { publish_mode: "review" }))
    await connect()
    db.desk = PASS
    db.agent = () => filing("Revenue grew 40% in 2026.")
    await runMachines("https://palmframe.test")
    assert.equal(drafts()[0]!.desk, "pass")
    assert.equal(sent().length, 1)
  })

  test("what changed since it was queued is looked at again", async () => {
    await connect()
    const m = machine()
    for (const change of [
      { status: "dismissed" },
      { status: "blocked" },
      { status: "retracted" },
      { held: "A number no source states." },
    ]) {
      draftOf(change)
      assert.equal(await deliverDiscord("d1", m), "skipped")
      assert.equal(drafts()[0]!.discord_status, "withdrawn")
    }
    draftOf({ desk: "hold" })
    await deliverDiscord("d1", machine({ style: "deadpan" }))
    assert.equal(drafts()[0]!.discord_status, "withdrawn")
    assert.equal(sent().length, 0)
  })

  test("a halt stops it, and it goes once the halt lifts", async () => {
    await connect()
    draftOf()
    db.tables.comic_machines_control = [{ id: true, halted: true }]
    assert.equal(await deliverDiscord("d1", machine()), "busy")
    assert.equal(await testDiscord(machine()), "halted")
    assert.equal(db.discord.length, 0)
    db.tables.comic_machines_control = [{ id: true, halted: false }]
    assert.equal(await flushDiscord([machine()], Date.now() + 1000), 1)
  })

  test("a freeze stops it", async () => {
    await connect()
    draftOf({ desk: "pass" })
    calendar([{ from: hours(-1), to: hours(1), label: "Vote" }])
    const far = machine({ line: FAR }, { publish_mode: "review" })
    assert.equal(await deliverDiscord("d1", far), "skipped")
    assert.equal(sent().length, 0)
    assert.equal(drafts()[0]!.discord_status, "pending")
  })

  test("a machine that's off keeps its queue", async () => {
    await connect()
    draftOf()
    assert.equal(await flushDiscord([], Date.now() + 1000), 0)
    assert.equal(sent().length, 0)
  })

  test("429 waits out Retry-After and doesn't count as a failed try", async () => {
    await connect()
    draftOf()
    db.discordAnswer = { status: 429, retryAfter: "120", text: "" }
    const before = Date.now()
    await flushDiscord([machine()], Date.now() + 1000)
    assert.equal(drafts()[0]!.discord_status, "pending")
    assert.equal(drafts()[0]!.discord_attempts, 0)
    const next = Date.parse(drafts()[0]!.discord_next_at as string)
    assert.ok(next >= before + 120_000)
    assert.ok(Date.parse(row().retry_at as string) >= before + 120_000)

    // Nothing goes to that webhook before then, not even a test.
    drafts()[0]!.discord_next_at = new Date(0).toISOString()
    await flushDiscord([machine()], Date.now() + 1000)
    assert.equal(sent().length, 1)
    const waited = await testDiscord(machine())
    assert.ok(typeof waited === "object" && waited.wait > 100)

    due()
    db.discordAnswer = { status: 200, retryAfter: null, text: '{"id":"8"}' }
    await flushDiscord([machine()], Date.now() + 1000)
    assert.equal(drafts()[0]!.discord_status, "sent")
  })

  test("404 turns the output off, and a new webhook turns it on", async () => {
    await connect()
    draftOf()
    db.discordAnswer = { status: 404, retryAfter: null, text: '{"code":10015}' }
    await flushDiscord([machine()], Date.now() + 1000)
    assert.equal(row().state, "disabled")
    assert.equal(drafts()[0]!.discord_status, "failed")
    draftOf({ id: "d1" })
    assert.equal(await deliverDiscord("d1", machine()), "skipped")
    assert.equal(sent().length, 1)
    await connect()
    assert.equal(row().state, "active")
  })

  test("a failing server is retried, then given up on", async () => {
    await connect()
    draftOf()
    db.discordDown = true
    for (let i = 0; i < 5; i++) {
      due()
      await flushDiscord([machine()], Date.now() + 1000)
    }
    assert.equal(sent().length, 5)
    assert.equal(drafts()[0]!.discord_status, "failed")
  })

  test("a logged failure holds neither the URL nor the error", async () => {
    const logged: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => void logged.push(args)
    try {
      await connect()
      draftOf()
      db.discordDown = true
      await flushDiscord([machine()], Date.now() + 1000)
    } finally {
      console.error = original
    }
    assert.ok(logged.length)
    assert.ok(!JSON.stringify(logged).includes("not-a-real-token"))
  })

  test("a post too old to be news doesn't go", async () => {
    await connect()
    draftOf({ created_at: new Date(Date.now() - 49 * 3_600_000).toISOString() })
    assert.equal(await deliverDiscord("d1", machine()), "skipped")
    assert.equal(drafts()[0]!.discord_status, "failed")
    assert.equal(sent().length, 0)
  })

  test("what's stored is checked again before any request", async () => {
    await connect()
    draftOf()
    const { sealSecret } = await import("@/lib/secret-box.server")
    row().webhook_ciphertext = sealSecret("https://evil.test/api/webhooks/1/2")
    await deliverDiscord("d1", machine())
    assert.equal(db.discord.length, 0)
    assert.equal(row().state, "disabled")
  })

  test("an overlapping run can't send a post twice", async () => {
    await connect()
    draftOf()
    await Promise.all([
      deliverDiscord("d1", machine()),
      deliverDiscord("d1", machine()),
    ])
    assert.equal(sent().length, 1)
  })

  test("retracting takes the message down", async () => {
    await connect()
    draftOf({
      status: "published",
      discord_status: "sent",
      discord_webhook_id: "123456789012345678",
      discord_message_id: "777",
    })
    await retractDraft("d1", { id: MACHINE, user_id: USER }, "error")
    assert.equal(db.discord[0]!.method, "DELETE")
    assert.equal(db.discord[0]!.url, `${HOOK}/messages/777`)
    assert.equal(drafts()[0]!.discord_status, "withdrawn")
  })

  test("a message that won't come down is left for a person", async () => {
    await connect()
    draftOf({
      discord_status: "sent",
      discord_message_id: "777",
      discord_webhook_id: "123456789012345678",
    })
    db.discordAnswer = { status: 500, retryAfter: null, text: "" }
    await withdrawDiscord("d1")
    assert.equal(drafts()[0]!.discord_status, "left")
  })

  test("a message already deleted counts as removed", async () => {
    await connect()
    draftOf({
      discord_status: "sent",
      discord_message_id: "777",
      discord_webhook_id: "123456789012345678",
    })
    db.discordAnswer = { status: 404, retryAfter: null, text: '{"code":10008}' }
    await withdrawDiscord("d1")
    assert.equal(drafts()[0]!.discord_status, "withdrawn")
  })

  test("a queued post is taken back without a request", async () => {
    await connect()
    draftOf()
    await withdrawDiscord("d1")
    assert.equal(drafts()[0]!.discord_status, "withdrawn")
    assert.equal(db.discord.length, 0)
  })

  test("removing the webhook drops what was queued", async () => {
    await connect()
    draftOf()
    await removeDiscord(MACHINE)
    assert.equal(row(), undefined)
    assert.equal(drafts()[0]!.discord_status, "withdrawn")
  })

  test("after a person's edit, the new words go", async () => {
    await connect()
    draftOf({ discord_status: "withdrawn" })
    await carryToDiscord("d1", machine())
    assert.equal(drafts()[0]!.discord_status, "sent")
    assert.equal(sent().length, 1)
    await carryToDiscord("d1", machine())
    assert.equal(sent().length, 1)
  })

  test("a test message goes out, once in a while", async () => {
    await connect()
    assert.equal(await testDiscord(machine()), "sent")
    assert.deepEqual(JSON.parse(sent()[0]!.body!).allowed_mentions, {
      parse: [],
    })
    assert.equal(sent()[0]!.url, HOOK)
    const again = await testDiscord(machine())
    assert.ok(typeof again === "object" && again.wait > 0)
    assert.equal(sent().length, 1)
  })

  test("a test that finds the webhook gone turns the output off", async () => {
    await connect()
    db.discordAnswer = { status: 404, retryAfter: null, text: "" }
    assert.equal(await testDiscord(machine()), "gone")
    assert.equal(row().state, "disabled")
    assert.equal(await testDiscord(machine()), "missing")
  })
})

describe("confirmed fixes", () => {
  const HOOK =
    "https://discord.com/api/webhooks/123456789012345678/not-a-real-token_not-a-real-token_not-a-real-token"
  const OTHER_HOOK =
    "https://discord.com/api/webhooks/123456789012349999/not-a-real-token_not-a-real-token_not-a-real-token"
  const FIXED_LINE = {
    stance: "left",
    arena: "fr",
    publisher: "Pub",
    contact: "desk@example.com",
    scrutiny: [],
  } as unknown as Line
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
  const reviewed = (windows: object[] = []) => {
    db.tables.comic_arena_calendars = [
      {
        arena: "fr",
        reviewed_until: ago(-1000),
        reviewed_by: "t",
        windows,
      },
    ]
  }
  const row = (o: Row = {}): Row => ({
    id: "d1",
    machine_id: MACHINE,
    user_id: USER,
    status: "approved",
    desk: null,
    held: null,
    text: "Revenue grew 40%",
    link: null,
    sources: [],
    receipts: [],
    evidence: "Revenue grew 40%",
    signal: null,
    scene: "",
    alt: "",
    created_at: ago(1),
    ...o,
  })
  const call = (body: object) =>
    action({
      request: new Request("https://x.test/api/machines", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    } as never) as Promise<Response>
  const secrets = () => {
    process.env.OPENROUTER_KEY_SECRET = "a-test-secret"
    process.env.SUPABASE_SECRET_KEY = "a-test-key"
  }

  describe("a hold with no reason", () => {
    test("counts as unread, so an auto machine can't publish it", async () => {
      seed(machine({ style: "deadpan" }, { outputs: [ACCOUNT] }))
      inbox()
      db.agent = () => filing("Revenue grew 40%")
      db.desk = { verdict: "hold", rule: "harm", part: "post", why: "   " }
      const result = await runMachines("https://x.test")
      assert.equal(result.published, 0)
      assert.equal(drafts()[0]!.status, "new")
      assert.equal(drafts()[0]!.desk, "unread")
      assert.equal(db.posted.length, 0)
    })

    test("can't approve edited words on the first press", async () => {
      db.desk = { verdict: "block", rule: "hate", part: "post", why: "" }
      const r = await approvalCheck(
        "Revenue grew 40% again.",
        {
          text: "Revenue grew 40%.",
          evidence: "Revenue grew 40%",
          sources: [{}],
          signal: null,
          scene: "",
          alt: "",
          desk: "pass",
        },
        "en",
        true,
        AbortSignal.timeout(1000)
      )
      assert.equal(r.desk, "unread")
      assert.equal(r.held, UNREAD_REASON)
    })
  })

  describe("a hand-run draft", () => {
    const UUID = "11111111-1111-4111-8111-111111111111"
    const signal = {
      id: "s1",
      source: "crypto",
      title: "BTC",
      facts: "BTC rose 5% in 10 minutes.",
      samples: [],
      url: "https://example.com/s",
      at: 1,
      measure: { type: "move", from: 1, to: 2, change: 5, minutes: 10 },
    }

    test("goes through the gate, and a hold stays out of Discord", async () => {
      secrets()
      seed(machine({}, { id: UUID, publish_mode: "review" }))
      await connectDiscord({ id: UUID, user_id: USER }, parseWebhook(HOOK)!)
      db.written = "BTC rose 90% in 10 minutes."
      const res = await call({ intent: "draft", id: UUID, signal })
      assert.equal(res.status, 200)
      assert.match(String(drafts()[0]!.held), /90%/)
      assert.equal(db.discord.length, 0)
    })

    test("that passes still reaches Discord", async () => {
      secrets()
      seed(machine({}, { id: UUID, publish_mode: "review" }))
      await connectDiscord({ id: UUID, user_id: USER }, parseWebhook(HOOK)!)
      db.written = "BTC rose 5% in 10 minutes."
      await call({ intent: "draft", id: UUID, signal })
      assert.equal(drafts()[0]!.held, null)
      assert.equal(db.discord.length, 1)
    })
  })

  describe("the draft's own record decides, not the machine's settings", () => {
    test("words the desk stopped don't publish once it's saved plain", async () => {
      for (const desk of ["block", "unread"]) {
        db.tables.comic_machine_drafts = [row({ desk })]
        assert.equal(await publishDraft("d1", machine()), null)
        assert.equal(drafts()[0]!.status, "new")
      }
      assert.equal(db.posted.length, 0)
    })

    test("settings that don't parse send it back, line or no line", async () => {
      db.tables.comic_machine_drafts = [row()]
      const broken = { ...machine(), config: { keywords: "nope" } } as never
      const result = await publishDraft("d1", broken)
      assert.equal(result?.published, false)
      assert.equal(drafts()[0]!.status, "new")
      assert.ok(drafts()[0]!.held)
    })

    test("a person's approve still meets the desk on a plain machine", async () => {
      db.desk = "down"
      const r = await approvalCheck(
        "Revenue grew 40%",
        {
          text: "Revenue grew 40%",
          evidence: "",
          sources: [],
          signal: null,
          scene: "",
          alt: "",
          desk: "unread",
        },
        "en",
        false,
        AbortSignal.timeout(1000)
      )
      assert.equal(r.held, UNREAD_REASON)
    })

    test("a blocked draft can't be approved after the style is dropped", async () => {
      const r = await approvalCheck(
        "Revenue grew 40%",
        {
          text: "Revenue grew 40%",
          evidence: "",
          sources: [],
          signal: null,
          scene: "",
          alt: "",
          desk: "block",
        },
        "en",
        false,
        AbortSignal.timeout(1000)
      )
      assert.notEqual(r.held, null)
    })

    test("dropping a line doesn't walk a draft past a freeze", async () => {
      db.tables.comic_machine_line_notes = [
        { machine_id: MACHINE, to_stance: null, created_at: ago(1) },
      ]
      db.tables.comic_machine_drafts = [row({ desk: "pass" })]
      const m = machine({}, { outputs: [ACCOUNT] })
      assert.equal((await publishDraft("d1", m))?.stopped, "line_left")
      assert.equal(drafts()[0]!.status, "approved")
      assert.equal(db.posted.length, 0)
    })

    test("and what it left behind expires once that wait is over", async () => {
      db.tables.comic_machine_line_notes = [
        { machine_id: MACHINE, to_stance: null, created_at: ago(49) },
      ]
      db.tables.comic_machine_drafts = [
        row({ desk: "pass", created_at: ago(60) }),
      ]
      await publishDraft("d1", machine({}, { outputs: [ACCOUNT] }))
      assert.equal(drafts()[0]!.status, "expired")
      assert.equal(db.posted.length, 0)
    })

    test("a machine that never had a line isn't held up", async () => {
      db.tables.comic_machine_drafts = [row({ created_at: ago(60) })]
      assert.equal((await publishDraft("d1", machine()))?.published, true)
    })

    test("Discord won't carry words the desk stopped on a plain machine", async () => {
      secrets()
      await connectDiscord({ id: MACHINE, user_id: USER }, parseWebhook(HOOK)!)
      db.tables.comic_machine_drafts = [
        row({
          status: "new",
          desk: "unread",
          discord_status: "pending",
          discord_attempts: 0,
        }),
      ]
      await deliverDiscord("d1", machine())
      assert.equal(db.discord.length, 0)
      assert.equal(drafts()[0]!.discord_status, "withdrawn")
    })
  })

  describe("the publish queue", () => {
    test("stuck rows don't fill it for everyone else", async () => {
      const other = machine({}, { id: "machine-2", outputs: [] })
      const stuck = machine({ style: "wry" }, {})
      db.tables.comic_machines = [stuck, other] as unknown as Row[]
      db.tables.comic_machine_drafts = [
        ...Array.from({ length: 20 }, (_, i) =>
          row({ id: `s${i}`, desk: null })
        ),
        row({ id: "ok", machine_id: "machine-2" }),
      ]
      for (const m of db.tables.comic_machines!) m.next_run_at = ago(-1)
      const result = await runMachines("https://x.test")
      assert.equal(result.published, 1)
      assert.equal(drafts().filter((d) => d.status === "new").length, 20)
    })

    test("a frozen machine's backlog can't fill it either", async () => {
      reviewed([{ from: ago(1), to: ago(-1), label: "Vote" }])
      const other = machine({}, { id: "machine-2" })
      const frozen = machine({ line: FIXED_LINE }, { publish_mode: "review" })
      db.tables.comic_machines = [frozen, other] as unknown as Row[]
      db.tables.comic_machine_drafts = [
        ...Array.from({ length: 20 }, (_, i) =>
          row({ id: `f${i}`, desk: "pass" })
        ),
        row({ id: "ok", machine_id: "machine-2" }),
      ]
      for (const m of db.tables.comic_machines!) m.next_run_at = ago(-1)
      const result = await runMachines("https://x.test")
      assert.equal(result.published, 1)
      assert.equal(drafts().filter((d) => d.status === "approved").length, 20)
    })
  })

  describe("a Story on a machine the desk reads", () => {
    const story = {
      article: { body: "Revenue grew 40% in 2026." },
      facts: [],
      sources: [
        {
          title: "A",
          url: "https://example.com/a",
          text: "Revenue grew 40% in 2026.",
        },
      ],
      lead: "https://example.com/a",
    }
    const rendition = { parts: [{ text: "Revenue grew 40% in 2026." }] }
    const file = (m: MachineRow) => {
      seed(m)
      return realPipeline.afterRendition(
        {
          id: "r1",
          machine_id: MACHINE,
          format: "linkedin",
          user_id: USER,
          status: "done",
          problems: [],
        } as never,
        rendition as never,
        story as never
      )
    }

    test("is filed for the desk, and can't sit approved forever", async () => {
      await file(
        machine(
          { style: "deadpan" },
          { outputs: [{ ...ACCOUNT, platform: "linkedin" }] }
        )
      )
      assert.equal(drafts().length, 1)
      assert.equal(drafts()[0]!.status, "new")
      assert.equal(drafts()[0]!.desk, "unread")
      assert.equal(drafts()[0]!.held, UNREAD_REASON)
    })

    test("a plain machine's still goes straight out", async () => {
      await file(
        machine({}, { outputs: [{ ...ACCOUNT, platform: "linkedin" }] })
      )
      assert.equal(drafts()[0]!.status, "approved")
      assert.equal(drafts()[0]!.desk, null)
    })
  })

  describe("a message already in a Discord channel", () => {
    const sentDraft = (o: Row = {}) => {
      db.tables.comic_machine_drafts = [
        row({
          status: "new",
          discord_status: "sent",
          discord_message_id: "777",
          discord_webhook_id: "123456789012345678",
          ...o,
        }),
      ]
    }
    const DELETES = () => db.discord.filter((c) => c.method === "DELETE")

    test("comes out when a freeze starts, on a machine that's off too", async () => {
      secrets()
      reviewed([{ from: ago(1), to: ago(-1), label: "Vote" }])
      seed(
        machine(
          { line: FIXED_LINE },
          { enabled: false, publish_mode: "review" }
        )
      )
      await connectDiscord({ id: MACHINE, user_id: USER }, parseWebhook(HOOK)!)
      sentDraft()
      await runMachines("https://x.test")
      assert.equal(DELETES().length, 1)
      assert.equal(drafts()[0]!.discord_status, "withdrawn")
    })

    test("comes out when it goes stale, and not before", async () => {
      secrets()
      reviewed()
      seed(
        machine(
          { line: FIXED_LINE },
          { enabled: false, publish_mode: "review" }
        )
      )
      await connectDiscord({ id: MACHINE, user_id: USER }, parseWebhook(HOOK)!)
      sentDraft()
      await runMachines("https://x.test")
      assert.equal(DELETES().length, 0)
      sentDraft({ created_at: ago(49) })
      await runMachines("https://x.test")
      assert.equal(DELETES().length, 1)
    })

    test("a plain machine's messages stay up", async () => {
      secrets()
      seed(machine({}, { enabled: false }))
      await connectDiscord({ id: MACHINE, user_id: USER }, parseWebhook(HOOK)!)
      sentDraft({ created_at: ago(100) })
      await runMachines("https://x.test")
      assert.equal(DELETES().length, 0)
    })

    test("dropping the line doesn't leave them up", async () => {
      secrets()
      db.tables.comic_machine_line_notes = [
        { machine_id: MACHINE, to_stance: null, created_at: ago(1) },
      ]
      seed(machine({}, { enabled: false }))
      await connectDiscord({ id: MACHINE, user_id: USER }, parseWebhook(HOOK)!)
      sentDraft()
      await runMachines("https://x.test")
      assert.equal(DELETES().length, 1)
    })

    test("is only taken back through the webhook that sent it", async () => {
      secrets()
      await connectDiscord(
        { id: MACHINE, user_id: USER },
        parseWebhook(OTHER_HOOK)!
      )
      sentDraft()
      // What the new webhook might say, and must never be asked.
      db.discordAnswer = {
        status: 404,
        retryAfter: null,
        text: '{"code":10008}',
      }
      await withdrawDiscord("d1")
      assert.equal(db.discord.length, 0)
      assert.equal(drafts()[0]!.discord_status, "left")
      assert.equal(drafts()[0]!.discord_message_id, "777")
    })

    test("records which webhook sent it", async () => {
      secrets()
      await connectDiscord({ id: MACHINE, user_id: USER }, parseWebhook(HOOK)!)
      db.tables.comic_machine_drafts = [
        row({ status: "new", discord_status: "pending", discord_attempts: 0 }),
      ]
      await deliverDiscord("d1", machine())
      assert.equal(drafts()[0]!.discord_webhook_id, "123456789012345678")
    })
  })

  test("RSS says a machine wrote it, with or without a line", async () => {
    seed(machine({ style: "wry" }, { slug: "desk" }))
    db.tables.comic_machine_drafts = [
      row({ status: "published", published_at: ago(1) }),
    ]
    const res = (await rss({
      params: { slug: "desk" },
      request: new Request("https://x.test/m/desk/rss"),
    } as never)) as Response
    const body = await res.text()
    assert.match(body, /<description>Revenue grew 40%\n\nAI-written/)
    assert.match(body, /<channel>[\s\S]*?<description>AI-written/)
  })
})
