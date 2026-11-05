import { data as respond } from "react-router"

import { Article } from "@/components/newsroom/article"
import { messages } from "@/components/newsroom/newsroom.messages"
import { useT } from "@/i18n/core"
import { sampleBySlug } from "@/lib/newsroom/samples"

import type { Route } from "./+types/newsroom.samples.$slug"

export function loader({ params }: Route.LoaderArgs) {
  const sample = sampleBySlug(params.slug)
  if (!sample) throw respond(null, { status: 404 })
  return { sample }
}

export default function NewsroomSample({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { sample } = loaderData
  return (
    <Article
      story={sample}
      back="/newsroom/samples"
      badge={<span className="nr-badge">{t("story.sample")}</span>}
    />
  )
}
