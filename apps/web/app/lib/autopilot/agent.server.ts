// One Autopilot agent is one durable pi conversation (@earendil-works/pi-durable).
// Its whole life (every model turn, tool call and result) is committed to a
// SQLite file before anything shows, and that file lives in the private
// `autopilot` bucket between runs. A worker leases the agent, downloads the
// file, lets the Harness pick up exactly where the last worker stopped, and
// uploads it again. A function that times out mid-run loses nothing: the next
// tick reopens the file and the Harness resumes the run.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context"
import { createModels } from "@earendil-works/pi-ai"
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic"
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  section,
} from "@earendil-works/pi-durable"
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node"
import { arr, int, obj, oneOf, opt, str } from "@earendil-works/pi-schema"

import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { AgentRow } from "./database"
import {
  PLATFORM_LIMIT,
  PLATFORM_NAME,
  roleOf,
  type Platform,
  type TranscriptItem,
} from "./model"
import { publishPost } from "./publish.server"
import {
  readPage,
  searchReddit,
  searchTikTok,
  searchWeb,
  searchX,
  type Found,
} from "./research.server"

export const MODEL = {
  provider: "anthropic",
  modelId: "claude-sonnet-5-5",
} as const
const BUCKET = "autopilot"

const fileOf = (a: Pick<AgentRow, "user_id" | "id">) =>
  `${a.user_id}/${a.id}.sqlite`

export async function logEvent(
  agent: Pick<AgentRow, "id" | "user_id">,
  kind: string,
  label: string
) {
  await supabaseAdmin()
    .from("comic_autopilot_events")
    .insert({
      agent_id: agent.id,
      user_id: agent.user_id,
      kind,
      label: label.slice(0, 300),
    })
}

function persona(agent: AgentRow) {
  const role = roleOf(agent.role)
  const today = new Date().toISOString().slice(0, 10)
  return [
    `You are ${agent.name}${agent.handle ? ` (@${agent.handle})` : ""}, an autonomous social media agent working for one creator on Palmframe Autopilot. Your job is a "${role.name}": ${role.pitch}`,
    `Today is ${today}.`,
    `The creator's brief:\n${agent.brief}`,
    agent.voice && `Voice:\n${agent.voice}`,
    agent.topics.length && `Niche and topics: ${agent.topics.join(", ")}.`,
    `You post on: ${agent.platforms.map((p) => `${PLATFORM_NAME[p]} (max ${PLATFORM_LIMIT[p]} characters)`).join(", ")}.`,
    `How you work each run:
1. Call recent_posts first so you never repeat yourself.
2. Research with the search tools (prefer ${role.research.join(", ")}). Look for what is new, specific and gaining traction this week. Read a page when a result looks worth citing.
3. File posts with file_post. Each post must say one specific thing a reader didn't know, in the voice above. Never invent facts, numbers or quotes: everything checkable must come from something you read this run, and its link goes in sources.
4. Keep notes for your future self with remember: what worked, angles used, accounts worth watching.
5. End with one short line saying what you posted and why.
If the creator messages you, answer briefly and adjust: their instructions override the brief.`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function tools(agent: AgentRow, filed: { count: number }) {
  const found = (r: Found) => ({
    output: [{ type: "text" as const, text: r.text }],
  })
  const log = (label: string) => logEvent(agent, "tool", label)
  const query = str({
    description: "Search words, as a person would type them",
    minLength: 2,
    maxLength: 200,
  })

  return [
    defineTool({
      name: "search_x",
      description:
        "Search recent posts on X (Twitter). Returns posts with likes, views and links.",
      parameters: obj({ query }),
      replay: "safe",
      execute: async (a) => (
        await log(`Searched X for “${a.query}”`),
        found(await searchX(a.query))
      ),
    }),
    defineTool({
      name: "search_reddit",
      description:
        "Search Reddit's top posts for a period. Good for questions people keep asking and frustrations.",
      parameters: obj({
        query,
        timeframe: opt(oneOf(["day", "week", "month"] as const)),
      }),
      replay: "safe",
      execute: async (a) => (
        await log(`Searched Reddit for “${a.query}”`),
        found(await searchReddit(a.query, a.timeframe ?? "week"))
      ),
    }),
    defineTool({
      name: "search_web",
      description:
        "Search Google. Good for news, sources and numbers you can cite.",
      parameters: obj({ query }),
      replay: "safe",
      execute: async (a) => (
        await log(`Searched the web for “${a.query}”`),
        found(await searchWeb(a.query))
      ),
    }),
    defineTool({
      name: "search_tiktok",
      description:
        "Search this week's TikTok videos by keyword. Good for formats and jokes that are spreading.",
      parameters: obj({ query }),
      replay: "safe",
      execute: async (a) => (
        await log(`Searched TikTok for “${a.query}”`),
        found(await searchTikTok(a.query))
      ),
    }),
    defineTool({
      name: "read_page",
      description:
        "Read a web page as text, to check a fact or find the detail worth posting.",
      parameters: obj({ url: str({ description: "An https link" }) }),
      replay: "safe",
      execute: async (a) => (
        await log(`Read ${new URL(a.url).hostname}`),
        found(await readPage(a.url))
      ),
    }),
    defineTool({
      name: "recent_posts",
      description: "Your last 15 posts, so you don't repeat an angle.",
      parameters: obj({}),
      replay: "safe",
      execute: async () => {
        const { data } = await supabaseAdmin()
          .from("comic_autopilot_posts")
          .select("platform, text, status, created_at")
          .eq("agent_id", agent.id)
          .order("created_at", { ascending: false })
          .limit(15)
        const text = (data ?? [])
          .map(
            (p) =>
              `${p.created_at.slice(0, 10)} · ${p.platform} · ${p.status}\n${p.text}`
          )
          .join("\n\n")
        return {
          output: [{ type: "text", text: text || "You haven't posted yet." }],
        }
      },
    }),
    defineTool({
      name: "file_post",
      description: `File one finished post for one network. In review mode it waits for the creator's approval; on autopilot it goes out. You may file at most ${agent.posts_per_run} posts per run.`,
      parameters: obj({
        platform: oneOf(agent.platforms as unknown as readonly Platform[]),
        text: str({ minLength: 1, maxLength: 3000 }),
        angle: str({
          description: "One sentence: why this, why now",
          maxLength: 300,
        }),
        sources: opt(
          arr(
            obj({
              title: str({ maxLength: 200 }),
              url: str({ maxLength: 500 }),
            }),
            { maxItems: 5 }
          )
        ),
        post_in_minutes: opt(
          int({
            minimum: 0,
            maximum: 10080,
            description: "Delay before it goes out, to space posts; 0 is now",
          })
        ),
      }),
      // Writes a row: never run twice after a crash.
      replay: "unsafe",
      execute: async (a) => {
        const limit = PLATFORM_LIMIT[a.platform]
        if ([...a.text].length > limit)
          throw new Error(
            `That's ${[...a.text].length} characters; ${PLATFORM_NAME[a.platform]} allows ${limit}. Shorten it and file again.`
          )
        if (filed.count >= agent.posts_per_run)
          throw new Error(
            `You've filed ${agent.posts_per_run} posts this run, the limit. Stop here and sum up.`
          )
        filed.count++
        const scheduled_for = a.post_in_minutes
          ? new Date(Date.now() + a.post_in_minutes * 60_000).toISOString()
          : null
        const { data: post, error } = await supabaseAdmin()
          .from("comic_autopilot_posts")
          .insert({
            user_id: agent.user_id,
            agent_id: agent.id,
            platform: a.platform,
            text: a.text,
            angle: a.angle,
            sources: (a.sources ?? []).filter((s) =>
              /^https?:\/\//.test(s.url)
            ),
            scheduled_for,
          })
          .select("*")
          .single()
        if (error || !post) throw new Error("Couldn't save the post.")
        await logEvent(
          agent,
          "post",
          `Filed a post for ${PLATFORM_NAME[a.platform]}: ${a.text.slice(0, 120)}`
        )
        if (agent.mode === "autopilot") {
          const status = await publishPost(post)
          return { output: [{ type: "text", text: `Filed and ${status}.` }] }
        }
        return {
          output: [
            {
              type: "text",
              text: "Filed. It waits in the creator's review queue.",
            },
          ],
        }
      },
    }),
    defineTool({
      name: "remember",
      description:
        "Replace your notes to your future self (max 4000 characters). They're shown to you every run.",
      parameters: obj({ notes: str({ maxLength: 4000 }) }),
      replay: "safe",
      execute: async (a) => {
        await supabaseAdmin()
          .from("comic_autopilot_agents")
          .update({ memory: a.notes })
          .eq("id", agent.id)
        agent.memory = a.notes
        await log("Updated its notes")
        return { output: [{ type: "text", text: "Saved." }] }
      },
    }),
  ]
}

function registryFor(agent: AgentRow, filed: { count: number }) {
  const registry = createRegistry()
  registry.install(
    defineExtension({
      name: "autopilot",
      sections: [
        section("persona", () => persona(agent), { tag: false }),
        // Rendered every request, so the notes it saved last run are here.
        section("notes", () => agent.memory || "No notes yet."),
      ],
      tools: tools(agent, filed),
    })
  )
  return registry
}

function models() {
  const m = createModels()
  m.setProvider(anthropicProvider())
  return m
}

async function download(agent: AgentRow, path: string) {
  for (const p of [path, `${path}-wal`, `${path}-shm`])
    await rm(p, { force: true })
  const { data } = await supabaseAdmin()
    .storage.from(BUCKET)
    .download(fileOf(agent))
  if (data) await writeFile(path, Buffer.from(await data.arrayBuffer()))
  return !!data
}

async function upload(agent: AgentRow, path: string) {
  const { error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .upload(fileOf(agent), await readFile(path), {
      upsert: true,
      contentType: "application/vnd.sqlite3",
    })
  if (error)
    throw new Error(`Couldn't save the agent's session: ${error.message}`)
}

const workDir = async () => {
  const dir = join(tmpdir(), "autopilot")
  await mkdir(dir, { recursive: true })
  return dir
}

export type Wake =
  | { kind: "run"; slot: string; note?: string }
  | { kind: "messages"; items: { id: string; text: string }[] }
  | { kind: "resume" }

// Opens the agent's session, hands it the input (if any), lets it work for at
// most `budgetMs`, then stores the session. "idle" means the run finished;
// "pending" means work is left for the next worker.
export async function work(agent: AgentRow, wake: Wake, budgetMs: number) {
  const path = join(await workDir(), `${agent.id}.sqlite`)
  await download(agent, path)
  const filed = { count: 0 }
  const harness = await Harness.open(
    await openNodeSqliteStorage(path),
    {
      models: models(),
      registry: registryFor(agent, filed),
      identity: {
        attribution: {
          name: "Palmframe Autopilot",
          url: "https://www.palmframe.com",
        },
      },
      settings: {
        retry: { maxRetries: 2 },
        afterFailedRun: "continue",
        compaction: { reserveTokens: 16384, keepRecentTokens: 12000 },
      },
      onReport: (r) =>
        console.warn("autopilot report", agent.id, r.kind, r.error),
    },
    ctx
  )
  let outcome: "idle" | "pending" = "pending"
  let unmirror: (() => Promise<void>) | null = null
  try {
    const root = await harness.root(ctx, {
      agent: { model: MODEL, maxTurns: 24 },
    })
    unmirror = await mirror(agent, root as never).catch(() => null)
    if (wake.kind === "run") {
      await root.submit(
        {
          type: "input",
          content: `Run ${agent.runs + 1}, ${new Date().toUTCString()}. Research what's happening in your niche now and file up to ${agent.posts_per_run} post${agent.posts_per_run > 1 ? "s" : ""}.${wake.note ? `\n\n${wake.note}` : ""}`,
          requestId: `run:${wake.slot}`,
        },
        ctx
      )
    } else if (wake.kind === "messages") {
      // A message steers a run that's going, or starts a short one.
      for (const m of wake.items)
        await root.submit(
          {
            type: "input",
            content: m.text,
            requestId: `msg:${m.id}`,
            whenBusy: "steer",
          },
          ctx
        )
    }
    harness.resume()

    const done = root.waitForIdle(ctx).then(() => "idle" as const)
    const late = new Promise<"pending">((r) =>
      setTimeout(() => r("pending"), budgetMs).unref?.()
    )
    outcome = await Promise.race([done, late])
    const usage = await harness.usage(ctx)
    const spend = Object.values(usage.models).reduce(
      (s, u) => s + (u.cost?.total ?? 0),
      0
    )
    await supabaseAdmin()
      .from("comic_autopilot_agents")
      .update({ spend })
      .eq("id", agent.id)
  } finally {
    await unmirror?.().catch(() => {})
    // Closing stops whatever still runs; the next open picks it up.
    await harness.close(ctx)
  }
  await upload(agent, path)
  await rm(path, { force: true })
  return { outcome, filed: filed.count }
}

type Entry = {
  id: string
  kind: string
  createdAt?: number
  model?: {
    role: string
    content: unknown
    toolName?: string
    isError?: boolean
  }[]
}
type Part = { type: string; text?: string; name?: string; arguments?: unknown }

// Transcript lines from durable entries, as the agent page shows them.
function toItems(entries: Entry[]) {
  const items: TranscriptItem[] = []
  for (const e of entries) {
    const at = e.createdAt ?? 0
    for (const [i, m] of (e.model ?? []).entries()) {
      const id = `${e.id}:${i}`
      const parts: Part[] = Array.isArray(m.content)
        ? (m.content as Part[])
        : [{ type: "text", text: String(m.content ?? "") }]
      const text = () =>
        parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("\n")
      if (m.role === "user") {
        if (text()) items.push({ id, kind: "user", text: text(), at })
      } else if (m.role === "assistant") {
        parts.forEach((p, j) => {
          if (p.type === "text" && p.text?.trim())
            items.push({
              id: `${id}:${j}`,
              kind: "assistant",
              text: p.text,
              at,
            })
          if (p.type === "toolCall")
            items.push({
              id: `${id}:${j}`,
              kind: "tool",
              name: p.name ?? "",
              args: JSON.stringify(p.arguments ?? {}),
              at,
            })
        })
      } else if (m.role === "toolResult") {
        items.push({
          id,
          kind: "result",
          name: m.toolName ?? "",
          text: text().slice(0, 1200),
          error: !!m.isError,
          at,
        })
      }
    }
  }
  return items
}

// Mirrors the conversation's newest entries into the agent row while this
// worker runs it, so the page can follow a run that isn't stored as a file yet.
async function mirror(
  agent: AgentRow,
  root: { watch: (c: typeof ctx) => Promise<unknown> }
) {
  const watch = (await root.watch(ctx)) as {
    value: { entries: Entry[] }
    start: (
      fn: (call: {
        kind: string
        value: { entries: Entry[] }
      }) => Promise<void> | void
    ) => void
    stop: () => Promise<unknown>
  }
  let latest = watch.value.entries
  let timer: ReturnType<typeof setTimeout> | null = null
  let writing = Promise.resolve()
  const flush = () => {
    timer = null
    const live = toItems(latest).slice(-80)
    writing = writing
      .then(async () => {
        await supabaseAdmin()
          .from("comic_autopilot_agents")
          .update({ live })
          .eq("id", agent.id)
      })
      .catch(() => {})
  }
  watch.start((call) => {
    if (call.kind !== "value") return
    latest = call.value.entries
    timer ??= setTimeout(flush, 1200)
  })
  return async () => {
    if (timer) clearTimeout(timer)
    flush()
    await writing
    await watch.stop()
  }
}

// The agent's transcript, read from its durable session without running it.
export async function transcript(
  agent: AgentRow,
  limit = 120
): Promise<TranscriptItem[]> {
  const path = join(
    await workDir(),
    `${agent.id}.read-${crypto.randomUUID().slice(0, 8)}.sqlite`
  )
  if (!(await download(agent, path))) return []
  const harness = await Harness.open(
    await openNodeSqliteStorage(path),
    { models: models(), registry: createRegistry(), readOnly: true },
    ctx
  )
  try {
    const root = await harness.root(ctx)
    const page = await root.entries(
      { order: "descending" } as never,
      limit,
      undefined,
      ctx
    )
    return toItems([...(page.items as unknown as Entry[])].reverse())
  } finally {
    await harness.close(ctx)
    for (const p of [path, `${path}-wal`, `${path}-shm`])
      await rm(p, { force: true })
  }
}

export async function forget(agent: Pick<AgentRow, "id" | "user_id">) {
  await supabaseAdmin()
    .storage.from(BUCKET)
    .remove([fileOf(agent)])
}
