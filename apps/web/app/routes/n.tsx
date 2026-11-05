import type * as React from "react"
import { Link, data } from "react-router"

import { Cover } from "@/components/newsroom/cover"
import { messages } from "@/components/newsroom/newsroom.messages"
import "@/components/newsroom/newsroom.css"
import "@/components/newsroom/publication.css"
import { Subscribe } from "@/components/newsroom/subscribe"
import { useLocale, useT } from "@/i18n/core"
import { publicationPath } from "@/lib/newsroom/publication"
import { readPublication } from "@/lib/newsroom/public.server"
import { templateById } from "@/lib/newsroom/templates"
import { seo } from "@/lib/seo"

import type { Route } from "./+types/n"

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: "Not found" }]
  const { publication: p, stories } = loaderData
  const image = stories.find((s) => s.cover?.url)?.cover?.url
  return [
    ...seo({
      title: p.name,
      description: p.tagline || p.name,
      path: publicationPath(p.slug),
      noindex: !p.indexable,
      ...(image && { image }),
    }),
    {
      tagName: "link",
      rel: "alternate",
      type: "application/rss+xml",
      title: p.name,
      href: `${publicationPath(p.slug)}/rss.xml`,
    },
  ]
}

export async function loader({ params }: Route.LoaderArgs) {
  const found = await readPublication(params.slug)
  if (!found) throw data("Not found", { status: 404 })
  return { publication: found.publication, stories: found.stories }
}

export type PublicStory = Route.ComponentProps["loaderData"]["stories"][number]

export const accentStyle = (accent: string) =>
  ({ "--np-accent": accent }) as React.CSSProperties

export function Masthead({
  slug,
  name,
  tagline,
}: {
  slug: string
  name: string
  tagline: string
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  return (
    <>
      <header className="np-mast">
        <Link to={publicationPath(slug)}>{name}</Link>
        {tagline && <p>{tagline}</p>}
      </header>
      <div className="np-strip">
        <span>
          {new Date().toLocaleDateString(locale, { dateStyle: "full" })}
        </span>
        <a href={`${publicationPath(slug)}/rss.xml`}>{t("public.rss")}</a>
      </div>
    </>
  )
}

export function Footer() {
  const t = useT(messages)
  return (
    <footer className="np-foot">
      <a href="/newsroom" rel="nofollow">
        {t("public.madeWith")}
      </a>
    </footer>
  )
}

function Card({ slug, s }: { slug: string; s: PublicStory }) {
  const t = useT(messages)
  return (
    <article className="np-item">
      <Link to={publicationPath(slug, s.slug!)}>
        <Cover template={s.template} title={s.title} image={s.cover?.url} />
        <span className="np-kicker">
          {templateById(s.template) &&
            t(`templates.${s.template!}.tag` as never)}
        </span>
        <h3>{s.title}</h3>
        <p>{s.dek}</p>
      </Link>
    </article>
  )
}

export default function Publication({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { publication: p, stories } = loaderData
  const [lead, ...rest] = stories
  return (
    <div className="nr np" style={accentStyle(p.accent)}>
      <div className="np-wrap">
        <Masthead slug={p.slug} name={p.name} tagline={p.tagline} />
        {lead ? (
          <>
            <div className="np-front">
              <article className="np-lead">
                <Link to={publicationPath(p.slug, lead.slug!)}>
                  <Cover
                    template={lead.template}
                    title={lead.title}
                    image={lead.cover?.url}
                  />
                  <span className="np-kicker">
                    {templateById(lead.template) &&
                      t(`templates.${lead.template!}.tag` as never)}
                  </span>
                  <h2>{lead.title}</h2>
                  <p>{lead.dek}</p>
                </Link>
              </article>
              <div className="np-side">
                <Subscribe slug={p.slug} name={p.name} />
                {rest.slice(0, 2).map((s) => (
                  <Card key={s.id} slug={p.slug} s={s} />
                ))}
              </div>
            </div>
            {rest.length > 2 && (
              <div className="np-grid">
                {rest.slice(2).map((s) => (
                  <Card key={s.id} slug={p.slug} s={s} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="np-front">
            <p className="np-empty">{t("public.empty")}</p>
            <Subscribe slug={p.slug} name={p.name} />
          </div>
        )}
        <Footer />
      </div>
    </div>
  )
}
