import * as React from "react"
import { Link, useRevalidator } from "react-router"

import { useT } from "@/i18n/core"
import { setCredits } from "@/lib/credits-store"
import type { Platform, PostRow } from "@/lib/newsroom/database"
import { publicationPath } from "@/lib/newsroom/publication"
import {
  PLATFORMS,
  PLATFORM_INFO,
  postLength,
  postProblems,
} from "@/lib/newsroom/social"

import { messages } from "./newsroom.messages"

export interface DistributeProps {
  storyId: string
  slug: string | null
  publishedAt: string | null
  publication: { slug: string; live: boolean } | null
  subscribers: number
  posts: Pick<
    PostRow,
    "platform" | "text" | "status" | "scheduled_for" | "error" | "provider"
  >[]
  // Mocked until Zernio is connected for real.
  zernioMock: boolean
}

async function call(body: unknown) {
  const res = await fetch("/api/newsroom/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null)
  const json = (await res?.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: !!res?.ok, json }
}

function PostEditor({
  storyId,
  platform,
  post,
}: {
  storyId: string
  platform: Platform
  post: DistributeProps["posts"][number] | undefined
}) {
  const t = useT(messages)
  const [text, setText] = React.useState(post?.text ?? "")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => setText(post?.text ?? ""), [post?.text])
  const info = PLATFORM_INFO[platform]
  const locked = post?.status === "scheduled" || post?.status === "published"
  const problems = postProblems(platform, text)
  const dirty = text !== (post?.text ?? "")
  const save = async () => {
    setSaving(true)
    await call({ intent: "save-post", id: storyId, platform, text })
    setSaving(false)
  }
  return (
    <div className="nr-post" data-locked={locked || undefined}>
      <div className="nr-post-head">
        <b>{info.name}</b>
        {post && (
          <span
            className="nr-badge"
            data-status={
              post.status === "published"
                ? "done"
                : post.status === "scheduled"
                  ? "running"
                  : post.status === "failed"
                    ? "failed"
                    : undefined
            }
          >
            {t(`distribute.state.${post.status}`)}
            {post.scheduled_for &&
              ` · ${new Date(post.scheduled_for).toLocaleString()}`}
          </span>
        )}
        <small data-error={problems.length > 0 || undefined}>
          {t("distribute.chars", {
            count: postLength(text),
            limit: info.limit,
          })}
        </small>
      </div>
      <textarea
        value={text}
        rows={platform === "linkedin" || platform === "facebook" ? 7 : 4}
        readOnly={locked}
        aria-label={info.name}
        onChange={(e) => setText(e.target.value)}
      />
      {post?.error && <p className="nr-error">{post.error}</p>}
      {dirty && !locked && (
        <button
          type="button"
          className="nr-button"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? t("distribute.saving") : t("distribute.save")}
        </button>
      )}
    </div>
  )
}

export function Distribute(p: DistributeProps) {
  const t = useT(messages)
  const revalidator = useRevalidator()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [when, setWhen] = React.useState("")
  const published = !!p.publishedAt && !!p.slug
  const byPlatform = Object.fromEntries(p.posts.map((x) => [x.platform, x]))
  const open = PLATFORMS.filter((x) => {
    const s = byPlatform[x]?.status
    return s === "draft" || s === "failed"
  })

  const run = async (
    key: string,
    body: unknown,
    done?: (json: Record<string, unknown>) => string | null
  ) => {
    setBusy(key)
    setNote(null)
    const { ok, json } = await call(body)
    if (typeof json.balance === "number") setCredits(json.balance)
    setNote(ok ? (done?.(json) ?? null) : t("errors.generic"))
    setBusy(null)
    await revalidator.revalidate()
  }

  return (
    <section className="nr-panel nr-distribute">
      <h2>{t("distribute.title")}</h2>
      {!p.publication ? (
        <p className="nr-muted">
          {t("distribute.needsPublication")}{" "}
          <Link to="/newsroom/publication" className="nr-link">
            {t("distribute.setUp")}
          </Link>
        </p>
      ) : (
        <div className="nr-row">
          {published ? (
            <>
              <span className="nr-badge" data-status="done">
                {t("distribute.published")}
              </span>
              {p.publication.live && (
                <a
                  className="nr-link"
                  href={publicationPath(p.publication.slug, p.slug!)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("distribute.view")}
                </a>
              )}
              <button
                type="button"
                className="nr-button"
                disabled={!!busy}
                onClick={() =>
                  void run("publish", {
                    intent: "publish",
                    id: p.storyId,
                    on: false,
                  })
                }
              >
                {t("distribute.unpublish")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="nr-button"
              data-primary
              disabled={!!busy}
              onClick={() =>
                void run("publish", {
                  intent: "publish",
                  id: p.storyId,
                  on: true,
                })
              }
            >
              {t("distribute.publish")}
            </button>
          )}
        </div>
      )}

      <h3>{t("distribute.newsletter")}</h3>
      {published && p.publication?.live ? (
        <div className="nr-row">
          <button
            type="button"
            className="nr-button"
            disabled={!!busy || p.subscribers === 0}
            onClick={() =>
              void run(
                "newsletter",
                { intent: "newsletter", id: p.storyId },
                (json) =>
                  json.status === "held"
                    ? t("distribute.held")
                    : t("distribute.sent")
              )
            }
          >
            {t("distribute.send")} ({p.subscribers})
          </button>
        </div>
      ) : (
        <p className="nr-muted">{t("distribute.needsLive")}</p>
      )}

      <h3>{t("distribute.social")}</h3>
      {!published ? (
        <p className="nr-muted">{t("distribute.needsPublish")}</p>
      ) : (
        <>
          {p.zernioMock && <p className="nr-muted">{t("distribute.mock")}</p>}
          <div className="nr-row">
            <button
              type="button"
              className="nr-button"
              data-primary={p.posts.length === 0 || undefined}
              disabled={!!busy}
              onClick={() =>
                void run("draft", { intent: "draft-posts", id: p.storyId })
              }
            >
              {busy === "draft"
                ? t("distribute.drafting")
                : p.posts.length
                  ? t("distribute.redraft")
                  : t("distribute.draft")}
            </button>
          </div>
          {p.posts.length > 0 && (
            <>
              {PLATFORMS.map((x) => (
                <PostEditor
                  key={x}
                  storyId={p.storyId}
                  platform={x}
                  post={byPlatform[x]}
                />
              ))}
              {open.length > 0 && (
                <div className="nr-row">
                  <label className="nr-when">
                    <span>{t("distribute.when")}</span>
                    <input
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="nr-button"
                    data-primary
                    disabled={!!busy}
                    onClick={() =>
                      void run("schedule", {
                        intent: "schedule-posts",
                        id: p.storyId,
                        platforms: open,
                        at: when ? new Date(when).toISOString() : null,
                      })
                    }
                  >
                    {when ? t("distribute.schedule") : t("distribute.now")}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {note && (
        <p className="nr-muted" role="status">
          {note}
        </p>
      )}
    </section>
  )
}
