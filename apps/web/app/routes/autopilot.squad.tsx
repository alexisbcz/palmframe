import * as React from "react"
import { useNavigate, useRevalidator } from "react-router"

import {
  CadenceSelect,
  ModeSwitch,
  Networks,
} from "@/components/autopilot/agent-form"
import { Avatar, call } from "@/components/autopilot/parts"
import {
  PLATFORM_NAME,
  roleOf,
  type Mode,
  type Platform,
} from "@/lib/autopilot/model"
import type { SquadAgent } from "@/lib/autopilot/squad.server"
import { COSTS } from "@/lib/credits"

const hueOf = (s: string) =>
  [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export default function Squad() {
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [niche, setNiche] = React.useState("")
  const [product, setProduct] = React.useState("")
  const [count, setCount] = React.useState(6)
  const [platforms, setPlatforms] = React.useState<Platform[]>([
    "x",
    "linkedin",
  ])
  const [cadence, setCadence] = React.useState(360)
  const [mode, setMode] = React.useState<Mode>("review")
  const [name, setName] = React.useState("")
  const [agents, setAgents] = React.useState<SquadAgent[] | null>(null)
  const [busy, setBusy] = React.useState<"" | "design" | "spawn">("")
  const [error, setError] = React.useState("")

  const design = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("design")
    setError("")
    try {
      const out = (await call({
        intent: "squad",
        niche,
        product: product || undefined,
        count,
        platforms,
      })) as {
        agents: SquadAgent[]
      }
      setAgents(out.agents)
      if (!name) setName(niche.slice(0, 40))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't design it.")
    } finally {
      setBusy("")
    }
  }

  const spawn = async () => {
    if (!agents?.length) return
    setBusy("spawn")
    setError("")
    try {
      await call({
        intent: "spawn",
        squad: name.slice(0, 40),
        cadence,
        mode,
        agents: agents.map((a) => ({
          ...a,
          squad: name.slice(0, 40),
          posts_per_run: 1,
          max_credits_per_week: 120,
        })),
      })
      await revalidator.revalidate()
      navigate("/autopilot")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start them.")
      setBusy("")
    }
  }

  return (
    <div className="nr-page" style={{ maxWidth: 1080 }}>
      <header className="nr-page-head">
        <h1>Spawn a squad</h1>
        <p>
          Describe your niche. Autopilot designs a squad of agents that don't
          step on each other, each with its own job, angle and voice. Check
          them, then start them all at once.
        </p>
      </header>
      <form className="nr-form" onSubmit={design}>
        <label>
          Niche
          <input
            value={niche}
            required
            minLength={3}
            maxLength={300}
            placeholder="AI coding agents and developer tools"
            onChange={(e) => setNiche(e.target.value)}
          />
        </label>
        <label>
          <span>
            What you sell or build{" "}
            <small>optional; agents mention it only when it fits</small>
          </span>
          <input
            value={product}
            maxLength={300}
            placeholder="Palmframe, an AI comic and content studio"
            onChange={(e) => setProduct(e.target.value)}
          />
        </label>
        <div className="ap-row">
          <label>
            Agents
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Each runs
            <CadenceSelect value={cadence} onChange={setCadence} />
          </label>
        </div>
        <label>
          Networks
          <Networks value={platforms} onChange={setPlatforms} />
        </label>
        <label>
          Publishing
          <ModeSwitch value={mode} onChange={setMode} />
        </label>
        <div className="ap-head-actions">
          <button
            type="submit"
            className="nr-button"
            data-primary={!agents || undefined}
            disabled={!!busy}
          >
            {busy === "design"
              ? "Designing the squad…"
              : agents
                ? "Design again"
                : "Design the squad"}
          </button>
          <small>{COSTS.autopilot_squad} credits to design it.</small>
        </div>
      </form>

      {agents && (
        <section className="nr-form" aria-label="Your squad">
          <div className="ap-head">
            <label style={{ flex: 1, minWidth: 220 }}>
              Squad name
              <input
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="nr-button"
              data-primary
              disabled={!!busy}
              onClick={() => void spawn()}
            >
              {busy === "spawn" ? "Starting…" : `Start all ${agents.length}`}
            </button>
          </div>
          <div className="ap-squad">
            {agents.map((a, i) => (
              <article
                key={`${a.name}-${i}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="ap-agent-top">
                  <Avatar
                    agent={{ name: a.name, hue: hueOf(a.name), state: "idle" }}
                  />
                  <div>
                    <b>{a.name}</b>
                    <small>
                      @{a.handle} · {roleOf(a.role).name}
                    </small>
                  </div>
                </div>
                <p>{a.brief}</p>
                <i>{a.voice}</i>
                <div className="ap-nets">
                  {a.platforms.map((p) => (
                    <em key={p} className="ap-net">
                      {PLATFORM_NAME[p]}
                    </em>
                  ))}
                </div>
                <button
                  type="button"
                  className="nr-button"
                  data-danger
                  onClick={() => setAgents(agents.filter((_, j) => j !== i))}
                >
                  Leave out
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="nr-error">
          {error}
        </p>
      )}
    </div>
  )
}
