import { Link, data } from "react-router"

import { Prose } from "@/components/newsroom/article"
import { Cover } from "@/components/newsroom/cover"
import { messages } from "@/components/newsroom/newsroom.messages"
import "@/components/newsroom/newsroom.css"
import "@/components/newsroom/publication.css"
import { Subscribe } from "@/components/newsroom/subscribe"
import { useLocale, useT } from "@/i18n/core"
import { safeHref } from "@/lib/media/markdown"
import { publicationPath } from "@/lib/newsroom/publication"
import { readPublishedStory } from "@/lib/newsroom/public.server"
import { templateById } from "@/lib/newsroom/templates"
import { seo } from "@/lib/seo"

import { Footer, Masthead, accentStyle } from "./n"
import type { Route } from "./+types/n.story"

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: "Not found" }]
  const { publication: p, story } = loaderData
  return seo({
    title: `${story.title} · ${p.name}`,
    description: story.dek,
    path: publicationPath(p.slug, story.slug!),
    noindex: !p.indexable,
    type: "article",
    ...(story.cover?.url && { image: story.cover.url }),
  })
}

export async function loader({ params }: Route.LoaderArgs) {
  const found = await readPublishedStory(params.slug, params.story)
  if (!found) throw data("Not found", { status: 404 })
  return found
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export default function PublicStory({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const { publication: p, story, more } = loaderData
  const cited = new Set(story.facts.map((f) => f.url))
  const sources = story.sources.filter((s) => cited.has(s.url))
  const tpl = templateById(story.template)
  return (
    <div className="nr np" style={accentStyle(p.accent)}>
      <div className="np-wrap">
        <Masthead slug={p.slug} name={p.name} tagline={p.tagline} />
        <article className="np-article">
          {story.cover?.url && (
            <Cover
              template={story.template}
              title={story.title}
              image={story.cover.url}
              bare
            />
          )}
          <span className="np-kicker">
            {tpl && t(`templates.${tpl.id}.tag`)}
          </span>
          <h1>{story.title}</h1>
          {story.dek && <p className="np-dek">{story.dek}</p>}
          <p className="np-byline">
            {t("public.byline")} ·{" "}
            <time dateTime={story.published_at!}>
              {new Date(story.published_at!).toLocaleDateString(locale, {
                dateStyle: "long",
              })}
            </time>
          </p>
          <Prose markdown={story.body} />
          {sources.length > 0 && (
            <section className="np-sources">
              <h2>{t("public.sources")}</h2>
              <ol>
                {sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={safeHref(s.url) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {s.title || host(s.url)}
                    </a>{" "}
                    <span>({host(s.url)})</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <p className="np-disclaimer">{t("story.disclaimer")}</p>
          <div style={{ marginTop: 32 }}>
            <Subscribe slug={p.slug} name={p.name} />
          </div>
        </article>
        {more.length > 0 && (
          <div className="np-grid">
            {more.map((s) => (
              <article key={s.id} className="np-item">
                <Link to={publicationPath(p.slug, s.slug!)}>
                  <Cover
                    template={s.template}
                    title={s.title}
                    image={s.cover?.url}
                  />
                  <h3>{s.title}</h3>
                  <p>{s.dek}</p>
                </Link>
              </article>
            ))}
          </div>
        )}
        <Footer />
      </div>
    </div>
  )
}
