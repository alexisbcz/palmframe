import * as React from "react"
import { data as respond, useNavigate, useRevalidator } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Building03Icon,
  CheckmarkBadge01Icon,
  Delete02Icon,
  Globe02Icon,
  NewTwitterIcon,
  News01Icon,
  Note01Icon,
  PlayCircleIcon,
  RedditIcon,
  Search01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"

import { Article } from "@/components/newsroom/article"
import { Distribute } from "@/components/newsroom/distribute"
import { messages } from "@/components/newsroom/newsroom.messages"
import { useT } from "@/i18n/core"
import { PRIVATE } from "@/lib/seo"
import { templateById } from "@/lib/newsroom/templates"
import { zernioLive } from "@/lib/newsroom/zernio.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/newsroom.$id"

export const meta: Route.MetaFunction = () => [PRIVATE]

const POLL_MS = 3_000

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const [{ data: story }, { data: publication }, { data: posts }] =
    await Promise.all([
      supabase
        .from("comic_deep_dives")
        .select(
          "id, lead, status, template, cover, title, dek, body, log, facts, sources, findings, problems, slug, published_at, created_at, updated_at"
        )
        .eq("id", params.id)
        .not("template", "is", null)
        .maybeSingle(),
      supabase.from("comic_newsrooms").select("id, slug, live").maybeSingle(),
      supabase
        .from("comic_newsroom_posts")
        .select("platform, text, status, scheduled_for, error, provider")
        .eq("story_id", params.id),
    ])
  if (!story) throw respond(null, { status: 404 })
  const { count: subscribers } = publication
    ? await supabase
        .from("comic_newsroom_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("newsroom_id", publication.id)
        .eq("status", "subscribed")
    : { count: 0 }
  // Polled every few seconds, so the pages the agent read stay on the server.
  return {
    publication: publication
      ? { slug: publication.slug, live: publication.live }
      : null,
    posts: posts ?? [],
    subscribers: subscribers ?? 0,
    zernioMock: !zernioLive(),
    story: {
      ...story,
      sources: story.sources.map(({ url, title }) => ({ url, title })),
      log: story.log.slice(-60),
    },
  }
}

const LOG_ICONS: Record<string, typeof Search01Icon> = {
  post: NewTwitterIcon,
  profile: UserIcon,
  search: Search01Icon,
  news: News01Icon,
  page: Globe02Icon,
  video: PlayCircleIcon,
  social: RedditIcon,
  thread: RedditIcon,
  brand: Building03Icon,
  fact: Note01Icon,
  factcheck: CheckmarkBadge01Icon,
  check: CheckmarkBadge01Icon,
}

const LOGGED = [
  "post",
  "profile",
  "search",
  "news",
  "page",
  "video",
  "social",
  "thread",
  "brand",
  "fact",
  "factcheck",
  "check",
] as const

export default function NewsroomStory({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { story } = loaderData
  const revalidator = useRevalidator()
  const navigate = useNavigate()
  const open = story.status === "queued" || story.status === "running"

  React.useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      if (
        revalidator.state === "idle" &&
        document.visibilityState === "visible"
      )
        void revalidator.revalidate()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [open, revalidator])

  const [confirming, setConfirming] = React.useState(false)
  const remove = async () => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 4_000)
      return
    }
    const res = await fetch("/api/newsroom", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "remove", id: story.id }),
    })
    if (res.ok) navigate("/newsroom/stories")
  }

  if (open || (!story.body && story.status !== "failed")) {
    const tpl = templateById(story.template)
    return (
      <div className="nr-desk">
        <header className="nr-desk-lead">
          <small>
            {tpl?.name} · {t(`status.${story.status}`)}
          </small>
          <h1>{story.lead}</h1>
          <p>{t("story.deskHint")}</p>
          <div className="nr-stats">
            <span className="nr-badge" data-status="running">
              {t("story.read", { count: story.sources.length })}
            </span>
            <span className="nr-badge">
              {t("story.recorded", { count: story.facts.length })}
            </span>
          </div>
        </header>
        <section className="nr-panel">
          <h2>{t("story.desk")}</h2>
          <ol className="nr-log" aria-live="polite">
            {story.log.map((l, i) => {
              const kind = LOGGED.find((k) => k === l.tool)
              return (
                <li key={`${l.at}-${i}`}>
                  <i>
                    <HugeiconsIcon
                      icon={LOG_ICONS[l.tool] ?? Search01Icon}
                      size={12}
                      strokeWidth={2}
                    />
                  </i>
                  <span>
                    <em>{kind ? t(`log.${kind}`) : l.tool}</em> {l.label}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
        <div className="nr-skeleton" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} style={{ width: `${70 + ((i * 37) % 30)}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const alert =
    story.status === "failed" ? (
      <div className="nr-alert" data-failed role="alert">
        {t("story.failed")}
        {story.problems.length > 0 && (
          <ul>
            {story.problems.slice(0, 8).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    ) : story.status === "review" ? (
      <div className="nr-alert" role="note" style={{ marginBottom: 24 }}>
        {t("story.review")}
        <ul>
          {story.problems.slice(0, 8).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>
    ) : null

  return (
    <Article
      story={{
        template: story.template,
        title: story.title || story.lead,
        dek: story.dek,
        body: story.body,
        lead: story.lead,
        cover: story.cover?.url ?? null,
        filed: story.updated_at,
        sources: story.sources,
        facts: story.facts,
        findings: story.findings,
      }}
      badge={
        <span className="nr-badge" data-status={story.status}>
          {t(`status.${story.status}`)}
        </span>
      }
      alert={alert}
      panel={
        story.status !== "failed" ? (
          <Distribute
            storyId={story.id}
            slug={story.slug}
            publishedAt={story.published_at}
            publication={loaderData.publication}
            subscribers={loaderData.subscribers}
            posts={loaderData.posts}
            zernioMock={loaderData.zernioMock}
          />
        ) : null
      }
      actions={
        <button
          type="button"
          className="nr-button"
          data-danger
          onClick={() => void remove()}
        >
          <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
          {confirming ? t("story.confirmRemove") : t("story.remove")}
        </button>
      }
    />
  )
}
