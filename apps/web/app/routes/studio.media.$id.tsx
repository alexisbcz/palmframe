import * as React from "react"
import { Link, data as respond, useFetcher, useLocation } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import {
  CopyButton,
  FormatPanel,
  Panel,
  Problems,
  type RenditionView,
} from "@/components/media/format-panel"
import { Prose } from "@/components/media/prose"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import type { MediaRenditionRow } from "@/lib/database"
import { type MediaError, isOpen, mediaPost } from "@/lib/media/client"
import { availableFormats } from "@/lib/media/formats"
import { safeHref } from "@/lib/media/markdown"
import type { FormatId, Rendition } from "@/lib/media/model"
import { MAX_ATTEMPTS, renditionMarkdown } from "@/lib/media/render"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio.media.$id"
import { messages } from "./media.messages"

export const meta: Route.MetaFunction = () => [PRIVATE]

const POLL_MS = 3_000

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const [{ data: dive }, { data: renditions }] = await Promise.all([
    supabase
      .from("comic_deep_dives")
      .select(
        "id, lead, status, title, dek, body, log, facts, sources, findings, problems, created_at"
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("comic_media_renditions")
      .select(
        "id, format, status, title, parts, meta, problems, attempts, created_at"
      )
      .eq("deep_dive_id", params.id)
      .order("created_at", { ascending: true }),
  ])
  if (!dive) throw respond(null, { status: 404 })
  // Polled every few seconds, so the pages the agent read stay on the server.
  const sources = dive.sources.map(({ url, title }) => ({ url, title }))
  return {
    dive: { ...dive, sources },
    // The latest try of each format wins.
    renditions: Object.fromEntries(
      (renditions ?? []).map((r) => [r.format, r])
    ) as Partial<Record<FormatId, RenditionView>>,
    formats: availableFormats(),
  }
}

export default function StudioMediaStory({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { pathname } = useLocation()
  const fetcher = useFetcher<typeof loader>()
  const fresh = fetcher.data?.dive.id === loaderData.dive.id
  const { dive, renditions, formats } = fresh ? fetcher.data! : loaderData

  const live =
    isOpen(dive.status) ||
    Object.values(renditions).some((r) => r && isOpen(r.status))
  const load = React.useRef(fetcher.load)
  load.current = fetcher.load
  React.useEffect(() => {
    if (!live) return
    const timer = setInterval(() => load.current(pathname), POLL_MS)
    return () => clearInterval(timer)
  }, [live, pathname])

  const markdown = `# ${dive.title}\n\n${dive.dek}\n\n${dive.body}`
  const lines = dive.log.slice(-40)

  return (
    <>
      <Link
        to="/studio/media"
        className="-my-2 flex inline-block w-fit items-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="size-4 rtl:rotate-180"
        />
        {t("detail.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl min-w-0">
          <h1 className="studio-title text-4xl">
            {dive.title || t("detail.untitled")}
          </h1>
          {dive.dek && (
            <p className="mt-2 text-sm text-muted-foreground">{dive.dek}</p>
          )}
          <p className="mt-2 truncate text-xs text-muted-foreground">
            {t(`status.${dive.status}`)} · {dive.lead}
          </p>
        </div>
        {dive.body && <CopyButton text={markdown} />}
      </div>

      <Tabs>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger id="story">{t("detail.story")}</TabsTrigger>
          {formats.map((f) => (
            <TabsTrigger key={f} id={f}>
              {t(`formats.${f}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent id="story" className="flex flex-col gap-4 pt-2">
          <Problems items={dive.problems} />
          {isOpen(dive.status) && (
            <Panel title={t("detail.log")}>
              <ol
                aria-live="polite"
                className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm text-muted-foreground"
              >
                {lines.length === 0 && <li>{t("detail.logEmpty")}</li>}
                {lines.map((l, i) => (
                  <li key={i} className="truncate">
                    <span className="me-2 text-foreground">{l.tool}</span>
                    {l.label}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <article className="rounded-2xl bg-card p-6">
              {dive.body ? (
                <Prose markdown={dive.body} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("detail.waiting")}
                </p>
              )}
            </article>
            <div className="flex min-w-0 flex-col gap-4">
              <Panel title={t("detail.sources")}>
                {dive.sources.length ? (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {dive.sources.map((s) => {
                      const href = safeHref(s.url)
                      return (
                        <li key={s.url} className="truncate">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline-offset-2 hover:underline"
                            >
                              {s.title || s.url}
                            </a>
                          ) : (
                            s.title || s.url
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("detail.noSources")}
                  </p>
                )}
              </Panel>
              <Panel title={t("detail.facts")}>
                {dive.facts.length ? (
                  <ul className="flex flex-col gap-2 text-sm">
                    {dive.facts.map((f, i) => (
                      <li key={i}>
                        {f.claim}
                        {safeHref(f.url) && (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-xs text-muted-foreground hover:underline"
                          >
                            {f.url}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("detail.noFacts")}
                  </p>
                )}
              </Panel>
            </div>
          </div>
        </TabsContent>
        {formats.map((f) => (
          <TabsContent key={f} id={f} className="pt-2">
            <FormatPanel
              diveId={dive.id}
              diveStatus={dive.status}
              format={f}
              row={renditions[f]}
              onStarted={() => load.current(pathname)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}
