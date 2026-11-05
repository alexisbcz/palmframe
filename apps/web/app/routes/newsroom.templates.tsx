import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"

import { SOURCE_ICONS } from "@/components/newsroom/composer"
import { Cover } from "@/components/newsroom/cover"
import { messages } from "@/components/newsroom/newsroom.messages"
import { useT } from "@/i18n/core"
import { SAMPLES } from "@/lib/newsroom/samples"
import { TEMPLATES } from "@/lib/newsroom/templates"

export default function NewsroomTemplates() {
  const t = useT(messages)
  return (
    <div className="nr-page">
      <header className="nr-page-head">
        <h1>{t("templates.title")}</h1>
        <p>{t("templates.text")}</p>
      </header>
      <div className="nr-grid">
        {TEMPLATES.map((x) => {
          const sample = SAMPLES.find((s) => s.template === x.id)
          return (
            <div key={x.id} className="nr-card">
              <Cover
                template={x.id}
                title={sample?.title ?? x.name}
                image={sample?.cover}
              />
              <div className="nr-card-copy">
                <small>{t(`templates.${x.id}.tag`)}</small>
                <b>{x.name}</b>
                <p>{t(`templates.${x.id}.blurb`)}</p>
                <div className="nr-card-foot">
                  <span className="nr-badge">
                    {t("composer.words", {
                      min: x.limits.minWords,
                      max: x.limits.maxWords,
                    })}
                  </span>
                  {x.sources.map((s) => (
                    <span
                      key={s}
                      className="nr-badge"
                      title={t(`source.${s}`)}
                      aria-label={t(`source.${s}`)}
                    >
                      <HugeiconsIcon
                        icon={SOURCE_ICONS[s]}
                        size={12}
                        strokeWidth={2}
                      />
                    </span>
                  ))}
                </div>
                <div className="nr-card-foot">
                  <Link
                    to={`/newsroom?template=${x.id}`}
                    className="nr-button"
                    data-primary
                  >
                    {t("templates.use")}
                  </Link>
                  {sample && (
                    <Link
                      to={`/newsroom/samples/${sample.slug}`}
                      className="nr-button"
                    >
                      {t("story.sample")}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
