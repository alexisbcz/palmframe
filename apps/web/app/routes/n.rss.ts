import { publicationPath } from "@/lib/newsroom/publication"
import { readPublication } from "@/lib/newsroom/public.server"

import type { Route } from "./+types/n.rss"

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

export async function loader({ request, params }: Route.LoaderArgs) {
  const found = await readPublication(params.slug)
  if (!found) return new Response("Not found", { status: 404 })
  const origin = new URL(request.url).origin
  const { publication: p, stories } = found
  const home = `${origin}${publicationPath(p.slug)}`
  const items = stories
    .slice(0, 50)
    .map((s) => {
      const link = `${origin}${publicationPath(p.slug, s.slug!)}`
      return `<item><title>${escape(s.title)}</title><link>${link}</link><guid>${link}</guid><pubDate>${new Date(s.published_at!).toUTCString()}</pubDate><description>${escape(s.dek)}</description></item>`
    })
    .join("")
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escape(p.name)}</title><link>${home}</link><description>${escape(p.tagline || p.name)}</description>${items}</channel></rss>`,
    {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    }
  )
}
