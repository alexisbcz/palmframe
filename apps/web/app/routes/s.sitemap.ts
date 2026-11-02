import { absolute } from "@/lib/seo"
import { readRelease } from "@/lib/sites/public.server"

import type { Route } from "./+types/s.sitemap"

// Empty until the owner lets search engines in.
export async function loader({ params }: Route.LoaderArgs) {
  const release = await readRelease(params.slug)
  if (!release?.indexable) return new Response("Not found", { status: 404 })
  const site = release.data
  const base = absolute(`/s/${release.slug}`)
  const urls = [
    ...site.pages.map((p) => (p.slug ? `${base}/${p.slug}` : base)),
    ...site.posts.filter((p) => !p.draft).map((p) => `${base}/blog/${p.slug}`),
    ...site.products.map((p) => `${base}/shop/${p.slug}`),
  ]
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${encodeURI(u)}</loc></url>`).join("")}</urlset>`,
    {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    }
  )
}
