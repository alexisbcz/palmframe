import * as React from "react"

import {
  CADENCES,
  PLATFORM_NAME,
  PLATFORMS,
  ROLES,
  roleOf,
  type Mode,
  type Platform,
} from "@/lib/autopilot/model"

export interface AgentDraft {
  name: string
  handle: string
  role: string
  squad: string
  brief: string
  voice: string
  topics: string[]
  platforms: Platform[]
  cadence: number
  posts_per_run: number
  mode: Mode
  max_credits_per_week: number
}

export const draftFromRole = (id: string): AgentDraft => {
  const r = roleOf(id)
  return {
    name: r.name,
    handle: "",
    role: r.id,
    squad: "",
    brief: r.brief,
    voice: r.voice,
    topics: [],
    platforms: r.platforms,
    cadence: r.cadence,
    posts_per_run: 1,
    mode: "review",
    max_credits_per_week: 120,
  }
}

export function RolePicker({
  value,
  onPick,
}: {
  value: string
  onPick: (id: string) => void
}) {
  return (
    <div className="ap-roles" role="group" aria-label="Job">
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          className="ap-role"
          aria-pressed={value === r.id}
          onClick={() => onPick(r.id)}
        >
          <b>{r.name}</b>
          <span>{r.pitch}</span>
        </button>
      ))}
    </div>
  )
}

export function Networks({
  value,
  onChange,
}: {
  value: Platform[]
  onChange: (v: Platform[]) => void
}) {
  return (
    <div className="ap-checks">
      {PLATFORMS.map((p) => (
        <label key={p}>
          <input
            type="checkbox"
            checked={value.includes(p)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, p]
                  : value.length > 1
                    ? value.filter((x) => x !== p)
                    : value
              )
            }
          />
          {PLATFORM_NAME[p]}
        </label>
      ))}
    </div>
  )
}

export function ModeSwitch({
  value,
  onChange,
}: {
  value: Mode
  onChange: (m: Mode) => void
}) {
  return (
    <div className="ap-seg" role="group" aria-label="Publishing">
      <button
        type="button"
        aria-pressed={value === "review"}
        onClick={() => onChange("review")}
      >
        I review each post
      </button>
      <button
        type="button"
        aria-pressed={value === "autopilot"}
        onClick={() => onChange("autopilot")}
      >
        Full autopilot
      </button>
    </div>
  )
}

export function CadenceSelect({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {!CADENCES.some((c) => c.minutes === value) && (
        <option value={value}>Every {value} min</option>
      )}
      {CADENCES.map((c) => (
        <option key={c.minutes} value={c.minutes}>
          {c.label}
        </option>
      ))}
    </select>
  )
}

export function AgentFields({
  draft,
  set,
}: {
  draft: AgentDraft
  set: (patch: Partial<AgentDraft>) => void
}) {
  const [topics, setTopics] = React.useState(draft.topics.join(", "))
  return (
    <>
      <div className="ap-row">
        <label>
          Name
          <input
            value={draft.name}
            maxLength={60}
            required
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label>
          <span>
            Handle <small>optional, how it signs</small>
          </span>
          <input
            value={draft.handle}
            maxLength={40}
            placeholder="trendsurfer"
            onChange={(e) =>
              set({ handle: e.target.value.replace(/[^a-z0-9_]/gi, "") })
            }
          />
        </label>
        <label>
          <span>
            Squad <small>optional group</small>
          </span>
          <input
            value={draft.squad}
            maxLength={40}
            placeholder="Launch week"
            onChange={(e) => set({ squad: e.target.value })}
          />
        </label>
      </div>
      <label>
        <span>
          Brief <small>what it looks for and what it posts</small>
        </span>
        <textarea
          value={draft.brief}
          maxLength={2000}
          required
          onChange={(e) => set({ brief: e.target.value })}
        />
      </label>
      <label>
        Voice
        <textarea
          value={draft.voice}
          maxLength={600}
          style={{ minHeight: 64 }}
          onChange={(e) => set({ voice: e.target.value })}
        />
      </label>
      <label>
        <span>
          Niche and topics <small>comma separated, up to 8</small>
        </span>
        <input
          value={topics}
          placeholder="AI agents, developer tools, open source"
          onChange={(e) => {
            setTopics(e.target.value)
            set({
              topics: e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 8),
            })
          }}
        />
      </label>
      <label>
        Networks
        <Networks
          value={draft.platforms}
          onChange={(platforms) => set({ platforms })}
        />
      </label>
      <div className="ap-row">
        <label>
          Runs
          <CadenceSelect
            value={draft.cadence}
            onChange={(cadence) => set({ cadence })}
          />
        </label>
        <label>
          Posts per run
          <select
            value={draft.posts_per_run}
            onChange={(e) => set({ posts_per_run: Number(e.target.value) })}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weekly credit cap
          <input
            type="number"
            min={0}
            max={5000}
            value={draft.max_credits_per_week}
            onChange={(e) =>
              set({
                max_credits_per_week: Math.max(
                  0,
                  Math.min(5000, Number(e.target.value) || 0)
                ),
              })
            }
          />
        </label>
      </div>
      <label>
        Publishing
        <ModeSwitch value={draft.mode} onChange={(mode) => set({ mode })} />
        <small>
          {draft.mode === "review"
            ? "Posts wait in your review queue."
            : "Posts go straight to your connected accounts. Pick this once you trust the agent."}
        </small>
      </label>
    </>
  )
}
