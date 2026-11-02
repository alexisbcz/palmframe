import * as React from "react"
import { useNavigate } from "react-router"

import { messages } from "@/components/sites/frontage.messages"
import { TemplateGrid } from "@/components/sites/template-grid"
import { useT } from "@/i18n/core"

export default function SitesTemplates() {
  const t = useT(messages)
  const navigate = useNavigate()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const create = async (template: string | null) => {
    setBusy(template ?? "blank")
    setError(null)
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "create", template }),
    })
    const json = (await res.json().catch(() => ({}))) as { id?: string }
    if (json.id) return navigate(`/sites/${json.id}/edit`)
    setBusy(null)
    setError(t("failed"))
  }
  return (
    <div className="fr-page">
      <header className="fr-page-head">
        <div>
          <h1>{t("templates.title")}</h1>
          <p>{t("templates.lead")}</p>
        </div>
        <button
          type="button"
          className="fr-ghost"
          onClick={() => void create(null)}
        >
          {t("templates.blank")}
        </button>
      </header>
      {error && (
        <p className="fr-error" role="alert">
          {error}
        </p>
      )}
      <TemplateGrid
        pickLabel={t("templates.use")}
        busy={busy}
        onPick={(id) => void create(id)}
      />
    </div>
  )
}
