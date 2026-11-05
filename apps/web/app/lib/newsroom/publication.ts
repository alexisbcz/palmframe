// A person's publication: where their filed stories are hosted, at /n/:slug.
// Shared by server and browser.
import { z } from "zod"

const RESERVED =
  /^(admin|api|app|assets|auth|login|logout|new|newsroom|palmframe|rss|settings|signup|static|www)$/

export const isPublicationSlug = (slug: string) =>
  /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) && !RESERVED.test(slug)

export const publicationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase().refine(isPublicationSlug),
  tagline: z.string().trim().max(200).default(""),
  accent: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/)
    .default("#3d7bff"),
  live: z.boolean().default(false),
  indexable: z.boolean().default(false),
})

export type PublicationInput = z.infer<typeof publicationSchema>

export function slugify(s: string, max = 80) {
  const full = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (full.length <= max) return full
  // Cut at a word, unless that would leave almost nothing.
  const cut = full.slice(0, max)
  const word = cut.lastIndexOf("-")
  return (word > max / 2 ? cut.slice(0, word) : cut).replace(/-+$/, "")
}

// A first suggestion for someone who hasn't set one up.
export function suggestSlug(name: string) {
  const s = slugify(name, 40)
  return isPublicationSlug(s)
    ? s
    : `newsroom-${Math.random().toString(36).slice(2, 8)}`
}

export const emailSchema = z.email().max(254)

export const publicationPath = (slug: string, story?: string) =>
  story ? `/n/${slug}/${story}` : `/n/${slug}`
