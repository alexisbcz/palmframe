import { publicMachine } from "@/lib/machines/feed-page.server"

import type { Route } from "./+types/machine.rss"

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
  const items = machine.posts
    .map(
      (p) => `<item>
<title>${xml(p.text.slice(0, 120))}</title>
<description>${xml(p.text)}</description>
<link>${xml(p.link ?? page)}</link>
<guid isPermaLink="false">${p.id}</guid>
<pubDate>${new Date(p.published_at!).toUTCString()}</pubDate>
</item>`
    )
    .join("\n")
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${xml(machine.name)}</title>
<link>${xml(page)}</link>
<description>${xml(machine.mission || machine.name)}</description>
<language>${machine.language}</language>
${items}
</channel></rss>`,
    {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    }
  )
}
