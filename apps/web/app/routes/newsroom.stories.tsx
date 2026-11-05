import { Link } from "react-router"

import { Cover } from "@/components/newsroom/cover"
import { messages } from "@/components/newsroom/newsroom.messages"
import { useLocale, useT } from "@/i18n/core"
import { templateById } from "@/lib/newsroom/templates"

import { useStories } from "./newsroom"

export default function NewsroomStories() {
  const t = useT(messages)
  const { locale } = useLocale()
  const stories = useStories()
  return (
    <div className="nr-page">
      <header className="nr-page-head">
        <h1>{t("stories.title")}</h1>
      </header>
      {stories.length ? (
        <div className="nr-grid">
          {stories.map((s) => (
            <Link key={s.id} to={`/newsroom/${s.id}`} className="nr-card">
              <Cover
                template={s.template}
                title={s.title || s.lead}
                image={s.cover?.url}
              />
              <div className="nr-card-copy">
                <small>
                  <span>{templateById(s.template)?.name}</span>
                  <time dateTime={s.created_at}>
                    {new Date(s.created_at).toLocaleDateString(locale)}
                  </time>
                </small>
                <b>{s.title || s.lead}</b>
                <div className="nr-card-foot">
                  <span className="nr-badge" data-status={s.status}>
                    {t(`status.${s.status}`)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="nr-empty">
          <p>{t("stories.empty")}</p>
          <Link to="/newsroom" className="nr-button" data-primary>
            {t("stories.start")}
          </Link>
        </div>
      )}
    </div>
  )
}
