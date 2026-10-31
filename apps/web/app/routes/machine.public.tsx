import { HugeiconsIcon } from "@hugeicons/react"
import { RssIcon } from "@hugeicons/core-free-icons"

import { useLocale, useT } from "@/i18n/core"
import { LINE_NOTE } from "@/lib/machines/masthead"
import { publicMachine } from "@/lib/machines/feed-page.server"
import { PRIVATE } from "@/lib/seo"

import type { Route } from "./+types/machine.public"
import { messages } from "./machines.messages"

// `PRIVATE` keeps these out of search: they're written by machines, for people
// who already have the link.
export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? `${loaderData.name} · Palmframe` : "Palmframe" },
  PRIVATE,
]

export async function loader({ params }: Route.LoaderArgs) {
  const machine = await publicMachine(params.slug)
  if (!machine) throw new Response("Not found", { status: 404 })
  return machine
}

// A person may have rewritten the post, and then it's all one piece of text.
const factOf = (text: string, take: string) =>
  take && text.endsWith(take) ? text.slice(0, -take.length).trimEnd() : text

export default function MachinePublic({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const { name, mission, slug, posts, masthead, credits, sameOwner } =
    loaderData
  const when = (at: string) =>
    new Date(at).toLocaleDateString(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    })
  return (
    <div className="dark studio min-h-dvh bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="studio-title text-4xl break-words">{name}</h1>
          {mission && (
            <p className="text-sm text-muted-foreground">{mission}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{t("page.byline")}</span>
            <a
              href={`/m/${slug}/rss.xml`}
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              <HugeiconsIcon
                icon={RssIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("page.rss")}
            </a>
          </div>
          {sameOwner.length > 0 && (
            <p className="rounded-xl border p-4 text-sm">
              <span className="text-muted-foreground">
                {t("page.sameOwner")}:
              </span>{" "}
              {sameOwner.map((o, i) => (
                <span key={o.slug}>
                  {i > 0 && ", "}
                  <a
                    href={`/m/${o.slug}`}
                    className="underline underline-offset-2"
                  >
                    {o.name}
                  </a>
                </span>
              ))}
            </p>
          )}
          {masthead && (
            <div className="flex flex-col gap-2 rounded-xl border p-4 text-sm">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">{t("page.stance")}</dt>
                <dd>{t(`stances.${masthead.stance}`)}</dd>
                <dt className="text-muted-foreground">{t("page.arena")}</dt>
                <dd>{t(`arenas.${masthead.arena}`)}</dd>
                <dt className="text-muted-foreground">{t("page.publisher")}</dt>
                <dd className="[overflow-wrap:anywhere]">
                  {masthead.publisher}
                </dd>
                <dt className="text-muted-foreground">{t("page.contact")}</dt>
                <dd className="[overflow-wrap:anywhere]">
                  <a
                    href={
                      masthead.contact.startsWith("https://")
                        ? masthead.contact
                        : `mailto:${masthead.contact}`
                    }
                    rel="noreferrer nofollow ugc"
                    className="underline underline-offset-2"
                  >
                    {masthead.contact}
                  </a>
                </dd>
                <dt className="text-muted-foreground">{t("page.aiWritten")}</dt>
                <dd>{t("page.byline")}</dd>
              </dl>
              {masthead.changes.length > 0 && (
                <div className="flex flex-col gap-1 border-t pt-2">
                  <h2 className="text-xs font-medium">{t("page.changes")}</h2>
                  <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {masthead.changes.map((c) => (
                      <li key={c.created_at}>
                        {t(`page.${LINE_NOTE(c)}`, {
                          from: c.from_stance
                            ? t(`stances.${c.from_stance}`)
                            : "",
                          to: c.to_stance ? t(`stances.${c.to_stance}`) : "",
                          date: when(c.created_at),
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </header>
        {posts.length ? (
          <ol className="flex flex-col gap-3">
            {posts.map((p) =>
              p.retracted ? (
                <li
                  key={p.id}
                  className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
                >
                  {t("page.retracted", {
                    date: when(p.retracted.at),
                    reason: t(`retractReasons.${p.retracted.reason}`),
                  })}
                </li>
              ) : (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-xl border p-4"
                >
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.alt}
                      width={1200}
                      height={900}
                      loading="lazy"
                      className="h-auto w-full rounded-lg"
                    />
                  )}
                  <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                    {factOf(p.text, p.take)}
                  </p>
                  {p.take && p.text.endsWith(p.take) && (
                    <p className="text-sm [overflow-wrap:anywhere] text-muted-foreground">
                      <span className="font-medium">{t("page.take")}</span>{" "}
                      {p.take}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={p.published_at ?? undefined}>
                      {new Date(p.published_at).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "UTC",
                      })}{" "}
                      UTC
                    </time>
                    {p.link && (
                      <>
                        {" · "}
                        <a
                          href={p.link}
                          target="_blank"
                          rel="noreferrer nofollow ugc"
                          className="underline underline-offset-2"
                        >
                          {p.sources[0]?.source ?? t("drafts.source")}
                        </a>
                      </>
                    )}
                  </p>
                </li>
              )
            )}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("page.empty")}</p>
        )}
        {credits.length > 0 && (
          <footer className="flex flex-col gap-1 border-t pt-4 text-xs text-muted-foreground">
            <h2 className="font-medium text-foreground">{t("page.sources")}</h2>
            <ul className="flex flex-col gap-1">
              {credits.map((c) => (
                <li key={c.id}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {c.source}
                  </a>
                  {" · "}
                  {c.statement}{" "}
                  <a
                    href={c.licenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {c.licence}
                  </a>
                  {c.updated &&
                    ` · ${t("page.updated", { date: when(c.updated) })}`}
                </li>
              ))}
            </ul>
          </footer>
        )}
      </main>
    </div>
  )
}
