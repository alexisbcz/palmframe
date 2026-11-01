import { OFFICIAL, PACKS } from "@/components/catalog/seed"
import { SITE, absolute } from "@/lib/seo"

const PAGES = ["/", "/catalog", "/docs/api", "/terms", "/privacy"]

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const entry = (path: string, image?: string | null) =>
  `<url><loc>${escape(`${SITE}${path}`)}</loc>${
    image
      ? `<image:image><image:loc>${escape(absolute(image))}</image:loc></image:image>`
      : ""
  }</url>`

// The official catalog. Community assets stay out until they're reviewed.
export function loader() {
  const urls = [
    ...PAGES.map((p) => entry(p)),
    ...PACKS.map((p) => entry(`/catalog/kits/${p.id}`)),
    ...OFFICIAL.map((a) => entry(`/catalog/${a.id}`, a.image)),
  ]
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join("")}</urlset>`,
    {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    }
  )
}
