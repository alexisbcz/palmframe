import * as React from "react"
import { useRevalidator } from "react-router"

import { messages } from "@/components/newsroom/newsroom.messages"
import { useLocale, useT } from "@/i18n/core"
import {
  isPublicationSlug,
  publicationPath,
  suggestSlug,
} from "@/lib/newsroom/publication"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/newsroom.publication"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer } = await getViewer(request)
  const { data: pub } = await supabase
    .from("comic_newsrooms")
    .select("*")
    .maybeSingle()
  const [{ data: subscribers }, { data: issues }] = pub
    ? await Promise.all([
        supabase
          .from("comic_newsroom_subscribers")
          .select("id, email, status, created_at, unsubscribed_at")
          .eq("newsroom_id", pub.id)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("comic_newsroom_issues")
          .select("id, subject, status, recipients, error, created_at, sent_at")
          .eq("newsroom_id", pub.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
    : [{ data: [] }, { data: [] }]
  return {
    pub,
    suggestion: suggestSlug(viewer?.name || "newsroom"),
    viewerName: viewer?.name ?? "",
    subscribers: subscribers ?? [],
    issues: issues ?? [],
  }
}

export default function Publication({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const revalidator = useRevalidator()
  const { pub, subscribers, issues } = loaderData
  const [form, setForm] = React.useState({
    name:
      pub?.name ??
      (loaderData.viewerName
        ? `${loaderData.viewerName}'s Newsroom`
        : "My Newsroom"),
    slug: pub?.slug ?? loaderData.suggestion,
    tagline: pub?.tagline ?? "",
    accent: pub?.accent ?? "#3d7bff",
    live: pub?.live ?? false,
    indexable: pub?.indexable ?? false,
  })
  const [state, setState] = React.useState<
    "idle" | "busy" | "saved" | "taken" | "failed"
  >("idle")
  const slugOk = isPublicationSlug(form.slug)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setState("idle")
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slugOk || !form.name.trim()) return
    setState("busy")
    const res = await fetch("/api/newsroom/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "publication", publication: form }),
    }).catch(() => null)
    setState(res?.ok ? "saved" : res?.status === 409 ? "taken" : "failed")
    if (res?.ok) void revalidator.revalidate()
  }
  const exportCsv = () => {
    const rows = [
      "email,status,subscribed_at,unsubscribed_at",
      ...subscribers.map((s) =>
        [s.email, s.status, s.created_at, s.unsubscribed_at ?? ""].join(",")
      ),
    ]
    const url = URL.createObjectURL(
      new Blob([rows.join("\n")], { type: "text/csv" })
    )
    const a = document.createElement("a")
    a.href = url
    a.download = `${pub?.slug ?? "subscribers"}-subscribers.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  const active = subscribers.filter((s) => s.status === "subscribed").length

  return (
    <div className="nr-page">
      <header className="nr-page-head">
        <h1>{t("publication.title")}</h1>
        <p>{t("publication.text")}</p>
      </header>
      <div className="nr-split">
        <form className="nr-panel nr-form" onSubmit={save}>
          <label>
            <span>{t("publication.name")}</span>
            <input
              value={form.name}
              maxLength={80}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </label>
          <label>
            <span>{t("publication.slug")}</span>
            <div className="nr-prefix">
              <em>palmframe.com/n/</em>
              <input
                value={form.slug}
                maxLength={40}
                onChange={(e) => set("slug", e.target.value.toLowerCase())}
                aria-invalid={!slugOk || state === "taken" || undefined}
                aria-describedby="slug-hint"
                spellCheck={false}
                autoCapitalize="off"
                required
              />
            </div>
            <small
              id="slug-hint"
              data-error={!slugOk || state === "taken" || undefined}
            >
              {state === "taken"
                ? t("publication.taken")
                : t("publication.invalidSlug")}
            </small>
          </label>
          <label>
            <span>{t("publication.tagline")}</span>
            <input
              value={form.tagline}
              maxLength={200}
              onChange={(e) => set("tagline", e.target.value)}
            />
          </label>
          <label className="nr-inline">
            <span>{t("publication.accent")}</span>
            <input
              type="color"
              value={form.accent}
              onChange={(e) => set("accent", e.target.value)}
            />
          </label>
          <label className="nr-inline">
            <input
              type="checkbox"
              checked={form.live}
              onChange={(e) => set("live", e.target.checked)}
            />
            <span>
              {t("publication.live")} <small>{t("publication.liveHint")}</small>
            </span>
          </label>
          <label className="nr-inline">
            <input
              type="checkbox"
              checked={form.indexable}
              onChange={(e) => set("indexable", e.target.checked)}
            />
            <span>{t("publication.indexable")}</span>
          </label>
          <div className="nr-card-foot">
            <button
              type="submit"
              className="nr-button"
              data-primary
              disabled={state === "busy" || !slugOk}
            >
              {state === "saved"
                ? t("publication.saved")
                : t("publication.save")}
            </button>
            {pub?.live && (
              <a
                className="nr-button"
                href={publicationPath(pub.slug)}
                target="_blank"
                rel="noreferrer"
              >
                {t("publication.open")}
              </a>
            )}
            {state === "failed" && (
              <span className="nr-error" role="alert">
                {t("errors.generic")}
              </span>
            )}
          </div>
        </form>
        <aside className="nr-aside">
          <section className="nr-panel">
            <h2>
              {t("publication.subscribers")} <span>{active}</span>
            </h2>
            {subscribers.length ? (
              <>
                <ul>
                  {subscribers.slice(0, 30).map((s) => (
                    <li key={s.id}>
                      <span style={{ overflowWrap: "anywhere" }}>
                        {s.email}
                      </span>
                      <small>
                        {new Date(s.created_at).toLocaleDateString(locale)}
                        {s.status === "unsubscribed" &&
                          ` · ${t("publication.unsubscribed")}`}
                      </small>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="nr-button"
                  style={{ marginTop: 12 }}
                  onClick={exportCsv}
                >
                  {t("publication.export")}
                </button>
              </>
            ) : (
              <p className="nr-muted">{t("publication.subscribersEmpty")}</p>
            )}
          </section>
          <section className="nr-panel">
            <h2>{t("publication.issues")}</h2>
            {issues.length ? (
              <ul>
                {issues.map((i) => (
                  <li key={i.id}>
                    <span>{i.subject}</span>
                    <small>
                      {new Date(i.created_at).toLocaleDateString(locale)} ·{" "}
                      {t("publication.recipients", { count: i.recipients })}
                      {i.error ? ` · ${i.error}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nr-muted">{t("publication.issuesEmpty")}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
