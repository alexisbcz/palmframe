import * as React from "react"
import {
  data,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  PauseIcon,
  PlayIcon,
  SentIcon,
} from "@hugeicons/core-free-icons"

import { AgentFields, type AgentDraft } from "@/components/autopilot/agent-form"
import {
  ago,
  Avatar,
  call,
  Feed,
  PostCard,
  STATE_LABEL,
} from "@/components/autopilot/parts"
import { transcript } from "@/lib/autopilot/agent.server"
import type {
  AgentEventRow,
  AgentPostRow,
  AgentRow,
} from "@/lib/autopilot/database"
import {
  cadenceLabel,
  PLATFORM_NAME,
  roleOf,
  type TranscriptItem,
} from "@/lib/autopilot/model"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/autopilot.$id"

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers } = await getViewer(request)
  const { data: agent } = await supabase
    .from("comic_autopilot_agents")
    .select("*")
    .eq("id", params.id)
    .maybeSingle()
  if (!agent) throw data("Not found", { status: 404, headers })
  const [posts, events, items] = await Promise.all([
    supabase
      .from("comic_autopilot_posts")
      .select("*")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("comic_autopilot_events")
      .select("id, user_id, agent_id, kind, label, created_at")
      .eq("agent_id", agent.id)
      .order("id", { ascending: false })
      .limit(30),
    transcript(agent as AgentRow).catch((e) => {
      console.error("Transcript failed", agent.id, e)
      return [] as TranscriptItem[]
    }),
  ])
  // The stored session holds the history; while a worker runs it, the newest
  // lines come from its live mirror.
  const live = ((agent as AgentRow).live ?? []) as TranscriptItem[]
  const seen = new Set(items.map((i) => i.id))
  const merged =
    agent.state === "running"
      ? [...items, ...live.filter((i) => !seen.has(i.id))]
      : items
  return {
    agent: agent as AgentRow,
    posts: (posts.data ?? []) as AgentPostRow[],
    events: (events.data ?? []) as AgentEventRow[],
    items: merged,
    now: Date.now(),
  }
}

const TABS = ["live", "posts", "settings", "memory"] as const

const TOOL_LABEL: Record<string, string> = {
  search_x: "Searched X",
  search_reddit: "Searched Reddit",
  search_web: "Searched the web",
  search_tiktok: "Searched TikTok",
  read_page: "Read a page",
  recent_posts: "Checked its recent posts",
  file_post: "Filed a post",
  remember: "Updated its notes",
}

function argSummary(name: string, raw: string) {
  try {
    const a = JSON.parse(raw) as Record<string, unknown>
    if (typeof a.query === "string") return `“${a.query}”`
    if (typeof a.url === "string") return a.url
    if (name === "file_post")
      return `${PLATFORM_NAME[a.platform as "x"] ?? a.platform}: ${String(a.text ?? "").slice(0, 80)}`
  } catch {}
  return ""
}

function Transcript({
  items,
  running,
}: {
  items: TranscriptItem[]
  running: boolean
}) {
  const end = React.useRef<HTMLDivElement>(null)
  const results = new Map<string, TranscriptItem & { kind: "result" }>()
  // Pair each call with the result that follows it.
  const pending: (TranscriptItem & { kind: "tool" })[] = []
  const pairs = new Map<string, TranscriptItem & { kind: "result" }>()
  for (const it of items) {
    if (it.kind === "tool") pending.push(it)
    if (it.kind === "result") {
      const i = pending.findIndex((p) => p.name === it.name)
      if (i >= 0) pairs.set(pending.splice(i, 1)[0]!.id, it)
      else results.set(it.id, it)
    }
  }
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" })
  }, [items.length])

  if (!items.length)
    return (
      <p className="nr-empty">
        {running
          ? "Starting its first run…"
          : "No runs yet. Start one, or send it a message."}
      </p>
    )
  return (
    <div className="ap-transcript">
      {items.map((it) => {
        if (it.kind === "user") {
          const fromRun = /^Run \d+, /.test(it.text)
          return fromRun ? (
            <p key={it.id} className="ap-durable">
              <span className="ap-dot" data-state="sleeping" />{" "}
              {it.text.split(".")[0]}
            </p>
          ) : (
            <p key={it.id} className="ap-msg" data-kind="user">
              {it.text}
            </p>
          )
        }
        if (it.kind === "assistant")
          return (
            <p key={it.id} className="ap-msg" data-kind="assistant">
              {it.text}
            </p>
          )
        if (it.kind === "tool") {
          const result = pairs.get(it.id)
          return (
            <details
              key={it.id}
              className="ap-call"
              data-error={result?.error || undefined}
            >
              <summary>
                <b>{TOOL_LABEL[it.name] ?? it.name}</b>
                <span>{argSummary(it.name, it.args)}</span>
                {!result && running && (
                  <span className="ap-dot" data-state="running" />
                )}
              </summary>
              <pre>{result ? result.text : "Working…"}</pre>
            </details>
          )
        }
        return null
      })}
      {running && (
        <p className="ap-durable">
          <span className="ap-dot" data-state="running" /> Working · every step
          is saved as it happens
        </p>
      )}
      <div ref={end} />
    </div>
  )
}

export default function AgentPage({ loaderData }: Route.ComponentProps) {
  const { agent, posts, events, items, now } = loaderData
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "")
    ? params.get("tab")!
    : "live"
  const [message, setMessage] = React.useState("")
  const [busy, setBusy] = React.useState("")
  const [error, setError] = React.useState("")
  const [draft, setDraft] = React.useState<AgentDraft>(agent)
  const [saved, setSaved] = React.useState(false)
  React.useEffect(() => setDraft(agent), [agent.id, agent.updated_at])

  const state = agent.enabled
    ? agent.state
    : agent.state === "running"
      ? "running"
      : "idle"
  const running = agent.state === "running"

  // Faster while it works, so the transcript feels live.
  React.useEffect(() => {
    const id = setInterval(
      () => {
        if (
          document.visibilityState === "visible" &&
          revalidator.state === "idle"
        )
          void revalidator.revalidate()
      },
      running || busy === "run" ? 2500 : 8000
    )
    return () => clearInterval(id)
  }, [running, busy, revalidator])

  const act = async (
    name: string,
    body: Record<string, unknown>,
    after?: () => void
  ) => {
    setBusy(name)
    setError("")
    try {
      await call(body)
      after?.()
      await revalidator.revalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setBusy("")
    }
  }

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const text = message.trim()
    if (!text) return
    void act("message", { intent: "message", id: agent.id, text }, () =>
      setMessage("")
    )
  }

  const drafts = posts.filter((p) => p.status === "draft").length

  return (
    <div className="nr-page">
      <header className="ap-profile">
        <Avatar agent={{ ...agent, state }} size={64} />
        <div>
          <h1>{agent.name}</h1>
          <p>
            {agent.handle && `@${agent.handle} · `}
            {roleOf(agent.role).name} · {cadenceLabel(agent.cadence)} ·{" "}
            {agent.mode === "autopilot" ? "Full autopilot" : "Review mode"}
          </p>
        </div>
        <div className="ap-head-actions">
          <button
            type="button"
            className="nr-button"
            data-primary
            disabled={running || !!busy}
            onClick={() => void act("run", { intent: "run", id: agent.id })}
          >
            <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={2} />
            {running ? "Working…" : busy === "run" ? "Starting…" : "Run now"}
          </button>
          <button
            type="button"
            className="nr-button"
            disabled={!!busy}
            onClick={() =>
              void act("enable", {
                intent: "enable",
                id: agent.id,
                on: !agent.enabled,
              })
            }
          >
            <HugeiconsIcon
              icon={agent.enabled ? PauseIcon : PlayIcon}
              size={15}
              strokeWidth={2}
            />
            {agent.enabled ? "Pause" : "Resume schedule"}
          </button>
        </div>
      </header>

      {agent.last_error && agent.state === "failed" && (
        <p className="nr-error">{agent.last_error}</p>
      )}

      <div className="ap-split">
        <section>
          <div className="ap-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() =>
                  setParams(t === "live" ? {} : { tab: t }, { replace: true })
                }
              >
                {t === "live"
                  ? "Live"
                  : t === "posts"
                    ? `Posts${drafts ? ` · ${drafts}` : ""}`
                    : t === "settings"
                      ? "Brief & settings"
                      : "Memory"}
              </button>
            ))}
          </div>

          <div style={{ paddingTop: 18 }}>
            {tab === "live" && (
              <>
                <Transcript items={items} running={running || busy === "run"} />
                <form className="ap-compose" onSubmit={send}>
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      running
                        ? "Steer it mid-run: “skip crypto today”"
                        : "Tell it something: “be funnier”, “cover the Apple event”"
                    }
                    aria-label={`Message ${agent.name}`}
                    maxLength={2000}
                  />
                  <button
                    type="submit"
                    className="nr-button"
                    data-primary
                    disabled={!message.trim() || busy === "message"}
                  >
                    <HugeiconsIcon icon={SentIcon} size={15} strokeWidth={2} />
                    Send
                  </button>
                </form>
              </>
            )}
            {tab === "posts" && (
              <div className="ap-posts">
                {!posts.length && <p className="nr-empty">No posts yet.</p>}
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onChange={() => void revalidator.revalidate()}
                  />
                ))}
              </div>
            )}
            {tab === "settings" && (
              <form
                className="nr-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void act(
                    "save",
                    { intent: "update", id: agent.id, agent: draft },
                    () => setSaved(true)
                  )
                }}
                onChange={() => setSaved(false)}
              >
                <AgentFields
                  draft={draft}
                  set={(patch) => (
                    setDraft((d) => ({ ...d, ...patch })),
                    setSaved(false)
                  )}
                />
                <div className="ap-head-actions">
                  <button
                    type="submit"
                    className="nr-button"
                    data-primary
                    disabled={!!busy}
                  >
                    {busy === "save" ? "Saving…" : saved ? "Saved" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="nr-button"
                    data-danger
                    disabled={!!busy || running}
                    onClick={() =>
                      void act(
                        "delete",
                        { intent: "delete", id: agent.id },
                        () => navigate("/autopilot")
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      size={15}
                      strokeWidth={2}
                    />
                    Retire this agent
                  </button>
                </div>
              </form>
            )}
            {tab === "memory" && (
              <div className="nr-panel">
                <h2>What it remembers</h2>
                <p
                  className="ap-msg"
                  style={{ color: agent.memory ? undefined : "var(--mute)" }}
                >
                  {agent.memory ||
                    "Nothing yet. After each run it writes notes to its future self: angles used, accounts worth watching, what landed."}
                </p>
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="nr-error">
              {error}
            </p>
          )}
        </section>

        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="nr-panel">
            <h2>Status</h2>
            <dl className="ap-kv">
              <dt>State</dt>
              <dd>
                <span className="ap-dot" data-state={state} />{" "}
                {STATE_LABEL[state]}
              </dd>
              <dt>Next run</dt>
              <dd>
                {agent.enabled && !running ? ago(agent.next_run_at, now) : "—"}
              </dd>
              <dt>Last run</dt>
              <dd>{ago(agent.last_run_at, now)}</dd>
              <dt>Runs</dt>
              <dd>{agent.runs}</dd>
              <dt>Posts</dt>
              <dd>{posts.length}</dd>
              <dt>Model spend</dt>
              <dd>${Number(agent.spend).toFixed(3)}</dd>
              <dt>Networks</dt>
              <dd>{agent.platforms.map((p) => PLATFORM_NAME[p]).join(", ")}</dd>
            </dl>
          </div>
          <div className="nr-panel">
            <h2>Activity</h2>
            <Feed events={events} agents={[agent]} now={now} />
          </div>
        </aside>
      </div>
    </div>
  )
}
