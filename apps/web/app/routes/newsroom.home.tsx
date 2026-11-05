import * as React from "react"
import { Link, useSearchParams } from "react-router"

import { Composer } from "@/components/newsroom/composer"
import { Cover } from "@/components/newsroom/cover"
import { messages } from "@/components/newsroom/newsroom.messages"
import { SampleGrid } from "@/components/newsroom/sample-grid"
import { useT } from "@/i18n/core"
import { SAMPLES } from "@/lib/newsroom/samples"
import { isTemplateId } from "@/lib/newsroom/templates"

export default function NewsroomHome() {
  const t = useT(messages)
  const [params] = useSearchParams()
  const wanted = params.get("template")
  const fan = SAMPLES.filter((s) => s.cover).slice(0, 5)
  const [front, setFront] = React.useState(0)
  React.useEffect(() => {
    if (fan.length < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => setFront((f) => f + 1), 3800)
    return () => clearInterval(timer)
  }, [fan.length])
  return (
    <div className="nr-home">
      {fan.length > 0 && (
        <div className="nr-fan">
          {fan.map((s, i) => (
            <Link
              key={s.slug}
              to={`/newsroom/samples/${s.slug}`}
              data-slot={(i - (front % fan.length) + fan.length) % fan.length}
              tabIndex={-1}
              aria-hidden
            >
              <Cover template={s.template} title={s.title} image={s.cover} />
            </Link>
          ))}
        </div>
      )}
      <h1>{t("home.title")}</h1>
      <Composer initial={isTemplateId(wanted) ? wanted : undefined} />
      {SAMPLES.length > 0 && (
        <section className="nr-section">
          <h2>{t("home.samples")}</h2>
          <p>{t("home.samplesHint")}</p>
          <SampleGrid />
        </section>
      )}
    </div>
  )
}
