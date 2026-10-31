import * as React from "react"
import { useSearchParams } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { SearchIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import {
  Failure,
  PageTitle,
  PlanButton,
  Thumb,
  useCompact,
} from "@/components/studio/ui"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import { PRIVATE } from "@/lib/seo"
import { useStudioCall } from "@/lib/studio/client"
import { type Video, engagement } from "@/lib/studio/model"

import type { Route } from "./+types/studio.teardown"
import { messages } from "./studio.messages"

export const meta: Route.MetaFunction = () => [PRIVATE]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="studio-title text-2xl text-brand-ink">{value}</dd>
    </div>
  )
}

export default function StudioTeardown() {
  const t = useT(messages)
  const compact = useCompact()
  const [params] = useSearchParams()
  const { busy, error, call } = useStudioCall()
  const [url, setUrl] = React.useState(params.get("url") ?? "")
  const [video, setVideo] = React.useState<Video | null>(null)
  const rate = video && engagement(video)

  return (
    <>
      <PageTitle title={t("teardown.title")} intro={t("teardown.intro")} />
      <form
        className="flex max-w-2xl flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setVideo(null)
          const r = await call<{ video: Video }>("video", {
            intent: "video",
            url: url.trim(),
          })
          if (r) setVideo(r.video)
        }}
      >
        <ButtonGroup className="w-full">
<Input
          type="url"
          value={url}
          required
          aria-label={t("teardown.url")}
          placeholder={t("teardown.url")}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          isDisabled={busy !== null}
          className="bg-white text-black hover:bg-white/90"
        >
          {t("teardown.read", { cost: COSTS.studio_lookup })}
          {busy ? (<Spinner />) : (<HugeiconsIcon icon={SearchIcon} strokeWidth={2} data-icon="inline-end" />)}
        </Button>
</ButtonGroup>
</form>
      <Failure code={error} />
      {video && (
        <article className="flex flex-wrap gap-6 rounded-2xl border p-5">
          <Thumb src={video.thumbnail} className="aspect-[4/5] w-44" />
          <div className="flex min-w-64 flex-1 flex-col gap-4">
            <div>
              <h2 className="studio-title text-xl">
                {video.title || `@${video.author}`}
              </h2>
              <p className="text-sm text-muted-foreground">@{video.author}</p>
            </div>
            <dl className="flex flex-wrap gap-8">
              <Stat label={t("teardown.views")} value={compact(video.views)} />
              <Stat label={t("teardown.likes")} value={compact(video.likes)} />
              <Stat
                label={t("teardown.engagement")}
                value={rate === null ? "—" : `${rate.toFixed(1)}%`}
              />
            </dl>
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">
                {t("teardown.transcript")}
              </h3>
              <p className="max-h-40 overflow-y-auto text-sm text-muted-foreground">
                {video.transcript || t("teardown.noTranscript")}
              </p>
            </section>
            <div>
              <PlanButton source={{ kind: "video", video }} white />
            </div>
          </div>
        </article>
      )}
    </>
  )
}
