import { Link } from "react-router"

import { useT } from "@/i18n/core"
import { SAMPLES } from "@/lib/newsroom/samples"
import { templateById } from "@/lib/newsroom/templates"

import { Cover } from "./cover"
import { messages } from "./newsroom.messages"

export function SampleGrid() {
  const t = useT(messages)
  return (
    <div className="nr-grid">
      {SAMPLES.map((s) => (
        <Link
          key={s.slug}
          to={`/newsroom/samples/${s.slug}`}
          className="nr-card"
        >
          <Cover template={s.template} title={s.title} image={s.cover} />
          <div className="nr-card-copy">
            <small>
              <span>{templateById(s.template)?.name}</span>
              <span>{t(`templates.${s.template}.tag`)}</span>
            </small>
            <b>{s.title}</b>
            <p>{s.dek}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}
