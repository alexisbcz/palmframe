import { messages } from "@/components/newsroom/newsroom.messages"
import { SampleGrid } from "@/components/newsroom/sample-grid"
import { useT } from "@/i18n/core"

export default function NewsroomSamples() {
  const t = useT(messages)
  return (
    <div className="nr-page">
      <header className="nr-page-head">
        <h1>{t("home.samples")}</h1>
        <p>{t("home.samplesHint")}</p>
      </header>
      <SampleGrid />
    </div>
  )
}
