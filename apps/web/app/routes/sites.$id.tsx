import * as React from "react"
import { Link, data, redirect, useNavigate, useRevalidator } from "react-router"

import { messages } from "@/components/sites/frontage.messages"
import { SitePreview } from "@/components/sites/preview"
import { useLocale, useT } from "@/i18n/core"
import type { ComicSiteSubmissionRow } from "@/lib/database"
import { money, toSite } from "@/lib/sites/model"
import { useSupabase } from "@/lib/supabase.browser"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/sites.$id"

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect(`/login?next=/sites/${params.id}`, { headers })
  const { data: row } = await supabase
    .from("comic_sites")
    .select("id, name, data, updated_at")
    .eq("id", params.id)
    .maybeSingle()
  if (!row) throw data("Not found", { status: 404 })
  const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10)
  const [release, submissions, views, versions] = await Promise.all([
    supabase
      .from("comic_site_releases")
      .select("slug, version, published_at")
      .eq("site_id", row.id)
      .maybeSingle(),
    supabase
      .from("comic_site_submissions")
      .select("*")
      .eq("site_id", row.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("comic_site_views")
      .select("day, path, views")
      .eq("site_id", row.id)
      .gte("day", since),
    supabase
      .from("comic_site_versions")
      .select("version, created_at")
      .eq("site_id", row.id)
      .order("version", { ascending: false })
      .limit(20),
  ])
  return {
    site: { ...row, data: toSite(row.data) },
    release: release.data,
    submissions: submissions.data ?? [],
    views: views.data ?? [],
    versions: versions.data ?? [],
  }
}

function Trend({ views }: { views: { day: string; views: number }[] }) {
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 864e5)
      .toISOString()
      .slice(0, 10)
    return {
      day,
      views: views
        .filter((v) => v.day === day)
        .reduce((n, v) => n + v.views, 0),
    }
  })
  const top = Math.max(1, ...days.map((d) => d.views))
  return (
    <div className="fr-bars" role="img" aria-label="Views, last 30 days">
      {days.map((d) => (
        <i
          key={d.day}
          title={`${d.day}: ${d.views}`}
          style={{ height: `${Math.max(3, (d.views / top) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function describe(row: ComicSiteSubmissionRow, locale: string) {
  const d = row.data as Record<string, never>
  if (row.kind === "order") {
    const items = (d.items ?? []) as unknown as {
      name: string
      qty: number
    }[]
    return {
      who: `${d.name} · ${d.email}`,
      what: items.map((i) => `${i.qty} × ${i.name}`).join(", "),
      extra: `${money(d.total, d.currency, locale)}${d.address ? ` · ${d.address}` : ""}`,
    }
  }
  if (row.kind === "booking")
    return {
      who: `${d.name} · ${d.email}`,
      what: `${d.service}`,
      extra: `${d.when}`,
    }
  if (row.kind === "rsvp")
    return { who: `${d.name} · ${d.email}`, what: `${d.title}`, extra: "" }
  const values = (d.values ?? {}) as Record<string, string>
  return {
    who: values.Email ?? values.Name ?? Object.values(values)[0] ?? "",
    what: Object.entries(values)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    extra: "",
  }
}

const TABS = ["overview", "inbox", "versions"] as const

export default function SiteDashboard({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const supabase = useSupabase()
  const { site, release, submissions, views, versions } = loaderData
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("overview")
  const [filter, setFilter] = React.useState<string | null>(null)
  const [origin, setOrigin] = React.useState("")
  React.useEffect(() => setOrigin(window.location.origin), [])
  const preview = React.useCallback(() => site.data, [site.data])

  const call = async (body: object) => {
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    return (await res.json()) as { id?: string; error?: string }
  }
  const total = views.reduce((n, v) => n + v.views, 0)
  const pages = Object.entries(
    views.reduce<Record<string, number>>((all, v) => {
      all[v.path] = (all[v.path] ?? 0) + v.views
      return all
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const fresh = submissions.filter((s) => s.status === "new").length
  const orders = submissions.filter((s) => s.kind === "order")
  const revenue = orders.reduce(
    (n, o) => n + Number((o.data as { total?: number }).total ?? 0),
    0
  )
  const shown = submissions.filter((s) => !filter || s.kind === filter)
  const setStatus = async (
    id: string,
    status: ComicSiteSubmissionRow["status"]
  ) => {
    await supabase
      .from("comic_site_submissions")
      .update({ status })
      .eq("id", id)
    await revalidator.revalidate()
  }
  const url = release ? `${origin}/s/${release.slug}` : null

  return (
    <div className="fr-page">
      <header className="fr-page-head">
        <div>
          <h1>{site.name || t("untitled")}</h1>
          <p>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer">
                {url.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              t("mine.draft")
            )}
          </p>
        </div>
        <div className="fr-actions">
          <button
            type="button"
            className="fr-ghost"
            onClick={async () => {
              const r = await call({ intent: "duplicate", id: site.id })
              if (r.id) navigate(`/sites/${r.id}`)
            }}
          >
            {t("site.duplicate")}
          </button>
          <button
            type="button"
            className="fr-ghost"
            onClick={async () => {
              if (!window.confirm(t("site.confirmDelete"))) return
              await supabase.from("comic_sites").delete().eq("id", site.id)
              navigate("/sites/mine")
            }}
          >
            {t("site.delete")}
          </button>
          <Link to={`/sites/${site.id}/edit`} className="fr-primary">
            {t("site.edit")}
          </Link>
        </div>
      </header>

      <div className="fr-tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {t(`site.${id}`)}
            {id === "inbox" && fresh > 0 && <b>{fresh}</b>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="fr-overview">
          <div className="fr-shot">
            <SitePreview make={preview} eager />
          </div>
          <div className="fr-stats">
            <div>
              <small>{t("site.views")}</small>
              <b>{total}</b>
              <Trend views={views} />
            </div>
            <div>
              <small>{t("site.messages")}</small>
              <b>{submissions.length}</b>
            </div>
            <div>
              <small>{t("site.orders")}</small>
              <b>{orders.length}</b>
              {orders.length > 0 && (
                <span>
                  {money(revenue, site.data.settings.currency, locale)}
                </span>
              )}
            </div>
            <div className="fr-toppages">
              <small>{t("site.topPages")}</small>
              {pages.length ? (
                <ul>
                  {pages.map(([path, n]) => (
                    <li key={path}>
                      <span>{path.replace(/^\/s\/[^/]+/, "") || "/"}</span>
                      <b>{n}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("site.noViews")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "inbox" && (
        <>
          <div className="fr-filter">
            {[null, "form", "order", "booking", "rsvp", "newsletter"].map(
              (k) => (
                <button
                  key={k ?? "all"}
                  type="button"
                  className="fr-mini"
                  aria-pressed={filter === k}
                  onClick={() => setFilter(k)}
                >
                  {t(`kinds.${(k ?? "all") as "all"}`)}
                </button>
              )
            )}
          </div>
          {shown.length ? (
            <ul className="fr-inbox">
              {shown.map((s) => {
                const d = describe(s, locale)
                return (
                  <li key={s.id} data-new={s.status === "new" || null}>
                    <header>
                      <span>{t(`kinds.${s.kind}`)}</span>
                      <b>{d.who}</b>
                      <time>
                        {new Date(s.created_at).toLocaleString(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </header>
                    <p>{d.what}</p>
                    {d.extra && <p>{d.extra}</p>}
                    <footer>
                      {s.status === "new" && (
                        <button
                          type="button"
                          onClick={() => void setStatus(s.id, "read")}
                        >
                          {t("site.markRead")}
                        </button>
                      )}
                      {s.status !== "done" && s.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => void setStatus(s.id, "done")}
                        >
                          {t("site.markDone")}
                        </button>
                      )}
                      {s.status !== "cancelled" &&
                        (s.kind === "booking" ||
                          s.kind === "order" ||
                          s.kind === "rsvp") && (
                          <button
                            type="button"
                            onClick={() => void setStatus(s.id, "cancelled")}
                          >
                            {t("site.cancel")}
                          </button>
                        )}
                      {(s.status === "done" || s.status === "cancelled") && (
                        <span>{t(`site.status.${s.status}`)}</span>
                      )}
                    </footer>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="fr-empty">{t("site.inboxEmpty")}</p>
          )}
        </>
      )}

      {tab === "versions" &&
        (versions.length ? (
          <ul className="fr-rows">
            {versions.map((v) => (
              <li key={v.version}>
                <div>
                  <b>{t("site.version", { n: v.version })}</b>
                  <span>
                    {release?.version === v.version ? t("site.live") : ""}
                  </span>
                  <time>
                    {new Date(v.created_at).toLocaleString(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                  <button
                    type="button"
                    className="fr-ghost"
                    onClick={async () => {
                      if (!window.confirm(t("site.confirmRestore"))) return
                      await call({
                        intent: "restore",
                        id: site.id,
                        version: v.version,
                      })
                      navigate(`/sites/${site.id}/edit`)
                    }}
                  >
                    {t("site.restore")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fr-empty">{t("site.noVersions")}</p>
        ))}
    </div>
  )
}
