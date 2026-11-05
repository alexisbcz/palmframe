import * as React from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons"

import { useLocale, useT } from "@/i18n/core"
import type { Fact, Finding } from "@/lib/deepdive/model"
import { type Inline, parseMarkdown, safeHref } from "@/lib/media/markdown"
import { templateById } from "@/lib/newsroom/templates"

import { Cover, lookStyle } from "./cover"
import { messages } from "./newsroom.messages"

function Text({ inline }: { inline: Inline[] }) {
  return inline.map((n, i) => {
    if (n.kind === "strong") return <strong key={i}>{n.text}</strong>
    if (n.kind === "em") return <em key={i}>{n.text}</em>
    if (n.kind === "link") {
      const href = safeHref(n.href)
      return href ? (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer">
          {n.text}
        </a>
      ) : (
        <span key={i}>{n.text}</span>
      )
    }
    return <span key={i}>{n.text}</span>
  })
}

export function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="nr-prose">
      {parseMarkdown(markdown).map((b, i) => {
        if (b.kind === "heading")
          return b.level === 2 ? (
            <h2 key={i}>
              <Text inline={b.text} />
            </h2>
          ) : (
            <h3 key={i}>
              <Text inline={b.text} />
            </h3>
          )
        if (b.kind === "quote")
          return (
            <blockquote key={i}>
              <Text inline={b.text} />
            </blockquote>
          )
        if (b.kind === "list") {
          const List = b.ordered ? "ol" : "ul"
          return (
            <List key={i}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <Text inline={item} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <p key={i}>
            <Text inline={b.text} />
          </p>
        )
      })}
    </div>
  )
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export interface StoryView {
  template: string | null
  title: string
  dek: string
  body: string
  lead: string
  cover: string | null
  filed: string
  sources: { url: string; title: string }[]
  facts: Fact[]
  findings: Finding[]
}

export function Article({
  story,
  badge,
  actions,
  alert,
}: {
  story: StoryView
  badge?: React.ReactNode
  actions?: React.ReactNode
  alert?: React.ReactNode
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const tpl = templateById(story.template)
  const [copied, setCopied] = React.useState(false)
  const markdown = `# ${story.title}\n\n_${story.dek}_\n\n${story.body}\n\n## ${t("story.sources")}\n\n${story.sources.map((s) => `- [${s.title || host(s.url)}](${s.url})`).join("\n")}\n`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1_600)
    } catch {
      // Clipboard blocked; the download still works.
    }
  }
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown" })
    )
    const a = document.createElement("a")
    a.href = url
    a.download = `${
      story.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 60) || "story"
    }.md`
    a.click()
    URL.revokeObjectURL(url)
  }
  const notes = story.findings.filter((f) => f.rule !== "ValeSkipped")
  // Sources the facts lean on come first; the rest were read or searched.
  const cited = new Set(story.facts.map((f) => f.url))
  const sources = [...story.sources].sort(
    (a, b) => Number(cited.has(b.url)) - Number(cited.has(a.url))
  )

  return (
    <div className="nr-story" style={lookStyle(tpl)}>
      <div className="nr-story-bar">
        <Link to="/newsroom/stories" className="nr-button">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
          {t("story.back")}
        </Link>
        <div>
          {badge}
          <button type="button" className="nr-button" onClick={copy}>
            <HugeiconsIcon
              icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
              size={16}
              strokeWidth={2}
            />
            {copied ? t("story.copied") : t("story.copy")}
          </button>
          <button type="button" className="nr-button" onClick={download}>
            <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={2} />
            {t("story.download")}
          </button>
          {actions}
        </div>
      </div>
      <article className="nr-paper">
        <Cover
          template={story.template}
          title={story.title}
          image={story.cover}
        />
        <div className="nr-paper-body">
          {alert}
          <p className="nr-kicker">
            <span>{tpl?.name}</span>
            <span aria-hidden>·</span>
            <span>{tpl && t(`templates.${tpl.id}.tag`)}</span>
          </p>
          <h1>{story.title}</h1>
          {story.dek && <p className="nr-dek">{story.dek}</p>}
          <p className="nr-byline">
            <span>{t("story.byline")}</span>
            <time dateTime={story.filed}>
              {new Date(story.filed).toLocaleDateString(locale, {
                dateStyle: "long",
              })}
            </time>
          </p>
          <Prose markdown={story.body} />
          <p className="nr-disclaimer">{t("story.disclaimer")}</p>
        </div>
      </article>
      <aside className="nr-aside">
        <section className="nr-panel">
          <h2>{t("story.lead")}</h2>
          <p style={{ fontSize: 13, overflowWrap: "anywhere" }}>{story.lead}</p>
        </section>
        <section className="nr-panel">
          <h2>
            {t("story.sources")} <span>{sources.length}</span>
          </h2>
          <ol>
            {sources.slice(0, 40).map((s) => (
              <li key={s.url}>
                <a
                  href={safeHref(s.url) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.title || host(s.url)}
                </a>
                <small>
                  {host(s.url)}
                  {cited.has(s.url) ? " · ✓" : ""}
                </small>
              </li>
            ))}
          </ol>
        </section>
        <section className="nr-panel">
          <h2>
            {t("story.facts")} <span>{story.facts.length}</span>
          </h2>
          <ol>
            {story.facts.slice(0, 40).map((f, i) => (
              <li key={i} className="nr-fact">
                {f.claim}{" "}
                <a
                  href={safeHref(f.url) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {host(f.url)}
                </a>
              </li>
            ))}
          </ol>
        </section>
        <section className="nr-panel">
          <h2>{t("story.notes")}</h2>
          {notes.length ? (
            <ul>
              {notes.slice(0, 20).map((f, i) => (
                <li key={i} className="nr-note" data-level={f.level}>
                  <b>
                    {f.rule} · L{f.line}
                  </b>
                  <br />
                  {f.message}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 13, color: "var(--mute)" }}>
              {t("story.noNotes")}
            </p>
          )}
        </section>
      </aside>
    </div>
  )
}
