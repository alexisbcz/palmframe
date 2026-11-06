import * as React from "react"
import { Link, NavLink, useRevalidator } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AirplaneTakeOff01Icon,
  Cancel01Icon,
  InboxIcon,
  PencilEdit02Icon,
  RoboticIcon,
  SidebarLeft01Icon,
  Tick02Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import { AccountMenu, useBalance } from "@/components/account/account-menu"
import { CreditsPill } from "@/components/account/credits-pill"
import type {
  AgentEventRow,
  AgentPostRow,
  AgentRow,
} from "@/lib/autopilot/database"
import {
  PLATFORM_LIMIT,
  PLATFORM_NAME,
  type AgentState,
} from "@/lib/autopilot/model"

export type AgentCardRow = Pick<
  AgentRow,
  | "id"
  | "name"
  | "handle"
  | "role"
  | "squad"
  | "brief"
  | "platforms"
  | "cadence"
  | "mode"
  | "hue"
  | "enabled"
  | "state"
  | "next_run_at"
  | "last_run_at"
  | "last_error"
  | "runs"
>

export const initials = (name: string) =>
  name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

export function Avatar({
  agent,
  size = 40,
}: {
  agent: Pick<AgentRow, "name" | "hue" | "state">
  size?: number
}) {
  return (
    <i
      className="ap-avatar"
      data-state={agent.state}
      style={{ "--h": agent.hue, "--s": `${size}px` } as React.CSSProperties}
      aria-hidden
    >
      {initials(agent.name)}
    </i>
  )
}

const rtf = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
  style: "short",
})

export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "never"
  const s = Math.round((new Date(iso).getTime() - now) / 1000)
  const abs = Math.abs(s)
  if (abs < 45) return s >= 0 ? "in a moment" : "just now"
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour")
  return rtf.format(Math.round(s / 86400), "day")
}

export const STATE_LABEL: Record<AgentState, string> = {
  idle: "Paused",
  running: "Working",
  sleeping: "Scheduled",
  failed: "Needs attention",
}

// Re-reads the loaders while anything in the fleet is working, so cards, feed
// and transcript move without a refresh.
export function useLive(active: boolean, ms = 4000) {
  const revalidator = useRevalidator()
  const ref = React.useRef(revalidator)
  ref.current = revalidator
  React.useEffect(() => {
    const id = setInterval(
      () => {
        if (
          document.visibilityState === "visible" &&
          ref.current.state === "idle"
        )
          void ref.current.revalidate()
      },
      active ? ms : ms * 4
    )
    return () => clearInterval(id)
  }, [active, ms])
}

export async function call(body: unknown) {
  const res = await fetch("/api/autopilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const out = (await res.json().catch(() => ({}))) as {
    error?: string
  } & Record<string, unknown>
  if (!res.ok) throw new Error(out.error ?? "Something went wrong.")
  return out
}

const NAV = [
  {
    to: "/autopilot",
    label: "Fleet",
    icon: AirplaneTakeOff01Icon,
    tone: "t",
    end: true,
  },
  {
    to: "/autopilot/queue",
    label: "Review queue",
    icon: InboxIcon,
    tone: "c",
    badge: true,
  },
  { to: "/autopilot/new", label: "New agent", icon: Add01Icon, tone: "a" },
  {
    to: "/autopilot/squad",
    label: "Spawn a squad",
    icon: UserMultiple02Icon,
    tone: "v",
  },
] as const

export function Shell({
  agents,
  drafts,
  children,
}: {
  agents: AgentCardRow[]
  drafts: number
  children: React.ReactNode
}) {
  const balance = useBalance()
  const [rail, setRail] = React.useState(false)
  return (
    <div className="nr ap nr-shell" data-rail={rail || null}>
      <aside className="nr-side">
        <div className="nr-brand">
          <Link to="/autopilot" className="nr-switch">
            <i className="nr-mark" aria-hidden>
              <HugeiconsIcon icon={RoboticIcon} size={16} strokeWidth={2} />
            </i>
            <span>Autopilot</span>
          </Link>
          <button
            type="button"
            className="nr-square"
            aria-label="Collapse sidebar"
            aria-pressed={rail}
            onClick={() => setRail(!rail)}
          >
            <HugeiconsIcon icon={SidebarLeft01Icon} size={16} strokeWidth={2} />
          </button>
        </div>
        <nav className="nr-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={"end" in n} prefetch="intent">
              <i data-tone={n.tone}>
                <HugeiconsIcon icon={n.icon} size={15} strokeWidth={2} />
              </i>
              <span>{n.label}</span>
              {"badge" in n && drafts > 0 && (
                <em className="ap-count">{drafts}</em>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="nr-recent">
          <h2>Agents · {agents.length}</h2>
          {agents.slice(0, 40).map((a) => (
            <NavLink
              key={a.id}
              to={`/autopilot/a/${a.id}`}
              className="nr-item"
              title={a.name}
            >
              <span
                className="ap-dot"
                data-state={a.enabled ? a.state : "idle"}
              />
              <span>{a.name}</span>
            </NavLink>
          ))}
        </div>
        <footer className="nr-side-foot">
          <CreditsPill>{(balance ?? 0).toLocaleString("en")}</CreditsPill>
          <AccountMenu />
        </footer>
      </aside>
      <main className="nr-main">
        <nav className="ap-mobile-nav" aria-label="Autopilot">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={"end" in n}>
              {n.label}
              {"badge" in n && drafts > 0 ? ` · ${drafts}` : ""}
            </NavLink>
          ))}
        </nav>
        {children}
      </main>
    </div>
  )
}

export function AgentCard({
  agent,
  now,
}: {
  agent: AgentCardRow
  now: number
}) {
  const state = agent.enabled ? agent.state : "idle"
  return (
    <Link
      to={`/autopilot/a/${agent.id}`}
      className="ap-agent"
      data-off={!agent.enabled || undefined}
    >
      <div className="ap-agent-top">
        <Avatar agent={{ ...agent, state }} />
        <div>
          <b>{agent.name}</b>
          <small>
            {agent.handle ? `@${agent.handle}` : agent.role.replace(/_/g, " ")}
            {agent.squad ? ` · ${agent.squad}` : ""}
          </small>
        </div>
      </div>
      <p>{agent.brief}</p>
      <div className="ap-agent-foot">
        <span>
          <span className="ap-dot" data-state={state} />
          {state === "running"
            ? "Working now"
            : state === "failed"
              ? "Needs attention"
              : agent.enabled
                ? `Next ${ago(agent.next_run_at, now)}`
                : "Paused"}
        </span>
        <span className="ap-nets">
          {agent.platforms.map((p) => (
            <em key={p} className="ap-net">
              {p === "linkedin" ? "in" : p === "bluesky" ? "bsky" : p}
            </em>
          ))}
        </span>
      </div>
    </Link>
  )
}

export function Feed({
  events,
  agents,
  now,
}: {
  events: AgentEventRow[]
  agents: Pick<AgentRow, "id" | "name" | "hue" | "state">[]
  now: number
}) {
  const byId = new Map(agents.map((a) => [a.id, a]))
  if (!events.length)
    return (
      <p className="nr-muted">
        Nothing yet. Agents report here as they research and post.
      </p>
    )
  return (
    <ol className="ap-feed">
      {events.map((e) => {
        const a = byId.get(e.agent_id)
        return (
          <li key={e.id} data-kind={e.kind}>
            {a ? (
              <Avatar agent={{ ...a, state: "idle" }} size={26} />
            ) : (
              <span />
            )}
            <div>
              <p>
                <b>{a?.name ?? "Agent"}</b>{" "}
                {e.kind === "message" ? `← you: “${e.label}”` : e.label}
              </p>
              <time dateTime={e.created_at}>{ago(e.created_at, now)}</time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function PostCard({
  post,
  agent,
  onChange,
}: {
  post: AgentPostRow
  agent?: Pick<AgentRow, "id" | "name" | "hue" | "state" | "handle">
  onChange?: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [text, setText] = React.useState(post.text)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  React.useEffect(() => setText(post.text), [post.text])
  const limit = PLATFORM_LIMIT[post.platform]
  const length = [...text].length

  const act = async (action: "approve" | "reject" | "edit") => {
    setBusy(true)
    setError("")
    try {
      await call({
        intent: "post",
        id: post.id,
        action,
        ...(text !== post.text && { text }),
      })
      setEditing(false)
      onChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't do that.")
    } finally {
      setBusy(false)
    }
  }

  const open = post.status === "draft" || post.status === "failed"
  return (
    <article className="ap-post">
      <header>
        {agent && <Avatar agent={{ ...agent, state: "idle" }} size={34} />}
        <div>
          <b>
            {agent ? (
              <Link to={`/autopilot/a/${agent.id}`}>{agent.name}</Link>
            ) : (
              PLATFORM_NAME[post.platform]
            )}
          </b>
          <small>
            {PLATFORM_NAME[post.platform]} · {ago(post.created_at)}
            {post.scheduled_for && post.status !== "published"
              ? ` · for ${new Date(post.scheduled_for).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}`
              : ""}
          </small>
        </div>
        <span className="ap-status" data-status={post.status}>
          {post.status === "draft"
            ? "Waiting for you"
            : post.status[0]!.toUpperCase() + post.status.slice(1)}
          {post.provider === "zernio-mock" && post.status !== "draft"
            ? " (simulated)"
            : ""}
        </span>
      </header>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Post text"
          autoFocus
        />
      ) : (
        <p className="ap-post-text">{post.text}</p>
      )}
      {post.angle && <p className="ap-angle">{post.angle}</p>}
      {post.sources.length > 0 && (
        <div className="ap-sources">
          {post.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              title={s.url}
            >
              {s.title || new URL(s.url).hostname}
            </a>
          ))}
        </div>
      )}
      {post.error && <p className="nr-error">{post.error}</p>}
      {open && (
        <footer>
          <button
            type="button"
            className="nr-button"
            data-primary
            disabled={busy || length > limit}
            onClick={() => void act("approve")}
          >
            <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={2} />
            {post.scheduled_for ? "Approve & schedule" : "Approve & post"}
          </button>
          {editing ? (
            <button
              type="button"
              className="nr-button"
              disabled={busy || length > limit}
              onClick={() => void act("edit")}
            >
              Save
            </button>
          ) : (
            <button
              type="button"
              className="nr-button"
              onClick={() => setEditing(true)}
            >
              <HugeiconsIcon
                icon={PencilEdit02Icon}
                size={15}
                strokeWidth={2}
              />
              Edit
            </button>
          )}
          <button
            type="button"
            className="nr-button"
            data-danger
            disabled={busy}
            onClick={() => void act("reject")}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={2} />
            Reject
          </button>
          <span className="ap-len" data-over={length > limit || undefined}>
            {length}/{limit}
          </span>
        </footer>
      )}
      {error && (
        <p role="alert" className="nr-error">
          {error}
        </p>
      )}
    </article>
  )
}
