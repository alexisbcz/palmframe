import { DEFAULT_LOCALE, isLocale, translate } from "@/i18n/core"
import { publicMachine } from "@/lib/machines/feed-page.server"
import { LINE_NOTE } from "@/lib/machines/masthead"
import { signatureFor } from "@/lib/machines/signature"

import type { Route } from "./+types/machine.rss"
import { messages } from "./machines.messages"

const xml = (s: string) =>
  s
    // Characters XML 1.0 can't hold at all.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

export async function loader({ params, request }: Route.LoaderArgs) {
  const machine = await publicMachine(params.slug)
  if (!machine) return new Response("Not found", { status: 404 })
  const page = new URL(`/m/${params.slug}`, request.url).href
  const locale = isLocale(machine.language) ? machine.language : DEFAULT_LOCALE
  const t = (
    path: Parameters<typeof translate<(typeof messages)["en"]>>[2],
    vars?: Record<string, string | number>
  ) => translate(messages, locale, path, vars)
  const day = (at: string) => at.slice(0, 10)
  const signature = signatureFor(machine.language)
  const { masthead } = machine
  const declared = masthead
    ? [
        `${t("page.stance")}: ${t(`stances.${masthead.stance}`)}`,
        `${t("page.arena")}: ${t(`arenas.${masthead.arena}`)}`,
        `${t("page.publisher")}: ${masthead.publisher}`,
        `${t("page.contact")}: ${masthead.contact}`,
        signature,
        ...masthead.changes.map((c) =>
          t(`page.${LINE_NOTE(c)}`, {
            from: c.from_stance ? t(`stances.${c.from_stance}`) : "",
            to: c.to_stance ? t(`stances.${c.to_stance}`) : "",
            date: day(c.created_at),
          })
        ),
      ].join(" · ")
    : ""
  const items = machine.posts
    .map((p) => {
      if (p.retracted) {
        const note = t("page.retracted", {
          date: day(p.retracted.at),
          reason: t(`retractReasons.${p.retracted.reason}`),
        })
        return `<item>
<title>${xml(note)}</title>
<description>${xml(note)}</description>
<link>${xml(page)}</link>
<guid isPermaLink="false">${p.id}</guid>
<pubDate>${new Date(p.retracted.at).toUTCString()}</pubDate>
</item>`
      }
      return `<item>
<title>${xml(p.text.slice(0, 120))}</title>
<description>${xml(masthead ? `${p.text}\n\n${signature}` : p.text)}</description>
<link>${xml(p.link ?? page)}</link>
<guid isPermaLink="false">${p.id}</guid>
<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
</item>`
    })
    .join("\n")
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${xml(machine.name)}</title>
<link>${xml(page)}</link>
<description>${xml([declared, machine.mission || machine.name].filter(Boolean).join(" — "))}</description>
<language>${machine.language}</language>
${masthead ? `<category>${xml(t(`stances.${masthead.stance}`))}</category>\n` : ""}${items}
</channel></rss>`,
    {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    }
  )
}
