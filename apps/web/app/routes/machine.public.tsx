import { HugeiconsIcon } from "@hugeicons/react"
import { RssIcon } from "@hugeicons/core-free-icons"

import { useLocale, useT } from "@/i18n/core"
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

export default function MachinePublic({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const { name, mission, slug, posts } = loaderData
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
        </header>
        {posts.length ? (
          <ol className="flex flex-col gap-3">
            {posts.map((p) => (
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
                  {p.text}
                </p>
                <p className="text-xs text-muted-foreground">
                  <time dateTime={p.published_at ?? undefined}>
                    {new Date(p.published_at!).toLocaleString(locale, {
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
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("page.empty")}</p>
        )}
      </main>
    </div>
  )
}
