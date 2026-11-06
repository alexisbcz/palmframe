import * as React from "react"
import { useNavigate, useRevalidator } from "react-router"

import {
  AgentFields,
  draftFromRole,
  RolePicker,
  type AgentDraft,
} from "@/components/autopilot/agent-form"
import { call } from "@/components/autopilot/parts"
import { COSTS } from "@/lib/credits"

export default function NewAgent() {
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [draft, setDraft] = React.useState<AgentDraft>(() =>
    draftFromRole("trend_surfer")
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const set = (patch: Partial<AgentDraft>) =>
    setDraft((d) => ({ ...d, ...patch }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const out = (await call({
        intent: "create",
        agent: draft,
        start: true,
      })) as { id: string }
      await revalidator.revalidate()
      navigate(`/autopilot/a/${out.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create it.")
      setBusy(false)
    }
  }

  return (
    <div className="nr-page" style={{ maxWidth: 920 }}>
      <header className="nr-page-head">
        <h1>New agent</h1>
        <p>
          Pick its job, then make the brief yours. It starts its first run a few
          seconds after you hire it.
        </p>
      </header>
      <RolePicker
        value={draft.role}
        onPick={(id) =>
          setDraft((d) => ({
            ...draftFromRole(id),
            squad: d.squad,
            topics: d.topics,
            mode: d.mode,
          }))
        }
      />
      <form className="nr-form" onSubmit={submit}>
        <AgentFields key={draft.role} draft={draft} set={set} />
        <div className="ap-head-actions">
          <button
            type="submit"
            className="nr-button"
            data-primary
            disabled={busy}
          >
            {busy ? "Hiring…" : "Hire and start"}
          </button>
          <small>{COSTS.autopilot_run} credits a run, research included.</small>
        </div>
        {error && (
          <p role="alert" className="nr-error">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
