import { absolute } from "@/lib/seo"
import { readRelease } from "@/lib/sites/public.server"

import type { Route } from "./+types/s.rss"

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

export async function loader({ params }: Route.LoaderArgs) {
  const release = await readRelease(params.slug)
  if (!release) return new Response("Not found", { status: 404 })
  const { data: site, slug } = release
  const base = absolute(`/s/${slug}`)
  const items = site.posts
    .filter((p) => !p.draft)
    .map(
      (p) =>
        `<item><title>${esc(p.title)}</title><link>${esc(`${base}/blog/${p.slug}`)}</link><guid>${esc(`${base}/blog/${p.slug}`)}</guid><description>${esc(p.excerpt)}</description><pubDate>${new Date(p.date).toUTCString()}</pubDate></item>`
    )
    .join("")
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(site.name)}</title><link>${esc(base)}</link><description>${esc(site.settings.description || site.name)}</description>${items}</channel></rss>`,
    {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=600",
      },
    }
  )
}
