import * as React from "react"
import { Link, useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { SearchIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { PageTitle } from "@/components/studio/ui"
import { useLocale, useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import { type MediaError, mediaPost } from "@/lib/media/client"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio.media"
import { messages } from "./media.messages"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const { data } = await supabase
    .from("comic_deep_dives")
    .select("id, lead, status, title, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
  return { stories: data ?? [] }
}

export default function StudioMedia({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const [lead, setLead] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<MediaError | null>(null)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })

  return (
    <>
      <PageTitle title={t("title")} intro={t("intro")} />
      <form
        className="flex max-w-2xl flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          const r = await mediaPost("/api/deep-dives", { lead: lead.trim() })
          if ("id" in r) navigate(`/studio/media/${r.id}`)
          else {
            setError(r.error)
            setBusy(false)
          }
        }}
      >
        <ButtonGroup className="w-full">
<Input
          value={lead}
          required
          aria-label={t("form.lead")}
          placeholder={t("form.placeholder")}
          onChange={(e) => setLead(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" isDisabled={busy}>
          {t("form.run", { cost: COSTS.deep_dive })}
          {busy ? (<Spinner />) : (<HugeiconsIcon icon={SearchIcon} strokeWidth={2} data-icon="inline-end" />)}
        </Button>
</ButtonGroup>
</form>
      {error && (
        <p
          role="alert"
          className="max-w-2xl rounded-lg bg-pink-600/15 px-3 py-2 text-sm text-pink-300"
        >
          {t(`errors.${error}`)}
        </p>
      )}
      {loaderData.stories.length ? (
        <ul className="flex flex-col gap-2">
          {loaderData.stories.map((s) => (
            <li key={s.id}>
              <Link
                to={`/studio/media/${s.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl bg-card p-4 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {s.title || s.lead}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {date.format(new Date(s.created_at))}
                    {s.title ? ` · ${s.lead}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(`status.${s.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl bg-card p-8 text-center">
          <h2 className="studio-title text-xl">{t("empty.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("empty.text")}
          </p>
        </div>
      )}
    </>
  )
}
