import * as React from "react"
import { Link, useRevalidator } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  PauseIcon,
  PlayIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import { AgentCard, call, Feed } from "@/components/autopilot/parts"
import type { AgentEventRow } from "@/lib/autopilot/database"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/autopilot.home"
import { useFleet } from "./autopilot"

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [events, posted, runs] = await Promise.all([
    supabase
      .from("comic_autopilot_events")
      .select("id, user_id, agent_id, kind, label, created_at")
      .order("id", { ascending: false })
      .limit(40),
    supabase
      .from("comic_autopilot_posts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    supabase
      .from("comic_autopilot_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "run_start")
      .gte("created_at", weekAgo),
  ])
  return {
    events: (events.data ?? []) as AgentEventRow[],
    postsThisWeek: posted.count ?? 0,
    runsThisWeek: runs.count ?? 0,
  }
}

export default function Fleet({ loaderData }: Route.ComponentProps) {
  const { agents, drafts, now } = useFleet()
  const revalidator = useRevalidator()
  const [squad, setSquad] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const squads = [...new Set(agents.map((a) => a.squad).filter(Boolean))]
  const shown =
    squad === null ? agents : agents.filter((a) => a.squad === squad)
  const working = agents.filter((a) => a.state === "running").length
  const on = agents.filter((a) => a.enabled).length

  const fleet = async (turnOn: boolean) => {
    setBusy(true)
    try {
      await call({
        intent: "fleet",
        on: turnOn,
        ...(squad !== null && { squad }),
      })
      await revalidator.revalidate()
    } finally {
      setBusy(false)
    }
  }

  if (!agents.length)
    return (
      <div className="nr-page">
        <header className="nr-page-head">
          <h1>Autopilot</h1>
          <p>
            A fleet of AI agents that research X, Reddit, TikTok and the web on
            a schedule, then write posts for your accounts. Each one has a job,
            a voice and a memory. They run while you sleep, and a run cut off
            halfway picks up exactly where it stopped.
          </p>
        </header>
        <div className="ap-roles" style={{ maxWidth: 760 }}>
          <Link to="/autopilot/squad" className="ap-role">
            <b>Spawn a squad</b>
            <span>
              Describe your niche. Autopilot designs up to 12 agents that don't
              overlap and starts them.
            </span>
          </Link>
          <Link to="/autopilot/new" className="ap-role">
            <b>Hire one agent</b>
            <span>
              Pick a job (trend surfer, thought leader, meme desk…) and tune its
              brief.
            </span>
          </Link>
        </div>
      </div>
    )

  return (
    <div className="nr-page">
      <header className="ap-head">
        <div className="nr-page-head">
          <h1>Fleet</h1>
          <p>
            {working
              ? `${working} agent${working > 1 ? "s" : ""} working right now.`
              : `${on} of ${agents.length} agents on duty.`}{" "}
            Every agent is a durable session: crashes and timeouts resume, they
            never restart.
          </p>
        </div>
        <div className="ap-head-actions">
          <button
            type="button"
            className="nr-button"
            disabled={busy}
            onClick={() => void fleet(false)}
          >
            <HugeiconsIcon icon={PauseIcon} size={15} strokeWidth={2} />
            Pause {squad ?? "all"}
          </button>
          <button
            type="button"
            className="nr-button"
            disabled={busy}
            onClick={() => void fleet(true)}
          >
            <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={2} />
            Resume {squad ?? "all"}
          </button>
          <Link to="/autopilot/squad" className="nr-button">
            <HugeiconsIcon
              icon={UserMultiple02Icon}
              size={15}
              strokeWidth={2}
            />
            Spawn a squad
          </Link>
          <Link to="/autopilot/new" className="nr-button" data-primary>
            <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={2} />
            New agent
          </Link>
        </div>
      </header>

      <section className="ap-stats" aria-label="This week">
        <div className="ap-stat">
          <small>On duty</small>
          <b>{on}</b>
          <span>of {agents.length} agents</span>
        </div>
        <div className="ap-stat">
          <small>Runs</small>
          <b>{loaderData.runsThisWeek}</b>
          <span>this week</span>
        </div>
        <div className="ap-stat">
          <small>Posts written</small>
          <b>{loaderData.postsThisWeek}</b>
          <span>this week</span>
        </div>
        <div className="ap-stat">
          <small>To review</small>
          <b>{drafts}</b>
          <span>
            <Link to="/autopilot/queue" className="nr-link">
              Open the queue
            </Link>
          </span>
        </div>
      </section>

      <div className="ap-split">
        <section>
          {squads.length > 0 && (
            <div className="ap-toolbar" role="group" aria-label="Squads">
              <button
                type="button"
                className="ap-chip"
                aria-pressed={squad === null}
                onClick={() => setSquad(null)}
              >
                Everyone · {agents.length}
              </button>
              {squads.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ap-chip"
                  aria-pressed={squad === s}
                  onClick={() => setSquad(s)}
                >
                  {s} · {agents.filter((a) => a.squad === s).length}
                </button>
              ))}
            </div>
          )}
          <div className="ap-grid">
            {shown.map((a) => (
              <AgentCard key={a.id} agent={a} now={now} />
            ))}
          </div>
        </section>
        <aside className="nr-panel">
          <h2>Live</h2>
          <Feed events={loaderData.events} agents={agents} now={now} />
        </aside>
      </div>
    </div>
  )
}
