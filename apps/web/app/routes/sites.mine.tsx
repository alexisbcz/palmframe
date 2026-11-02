import { Link } from "react-router"

import { messages } from "@/components/sites/frontage.messages"
import { useT, useLocale } from "@/i18n/core"

import { useSites } from "./sites"

export default function SitesMine() {
  const t = useT(messages)
  const { locale } = useLocale()
  const sites = useSites()
  return (
    <div className="fr-page">
      <header className="fr-page-head">
        <div>
          <h1>{t("mine.title")}</h1>
          <p>{t("mine.lead", { count: sites.length })}</p>
        </div>
        <Link to="/sites/templates" className="fr-primary">
          {t("nav.new")}
        </Link>
      </header>
      {sites.length ? (
        <ul className="fr-rows">
          {sites.map((s) => (
            <li key={s.id}>
              <Link to={`/sites/${s.id}`}>
                <b>{s.name || t("untitled")}</b>
                <span data-live={s.slug ? true : undefined}>
                  {s.slug ? `/s/${s.slug}` : t("mine.draft")}
                </span>
                <time>
                  {new Date(s.updated_at).toLocaleDateString(locale, {
                    day: "numeric",
                    month: "short",
                  })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fr-empty">{t("mine.empty")}</p>
      )}
    </div>
  )
}
