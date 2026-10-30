import type { MetaDescriptor } from "react-router"

// One place for a page's metadata, so its title, canonical and og:url agree.
export const SITE = "https://www.palmframe.com"
export const SITE_NAME = "Palmframe"
export const REPOSITORY = "https://github.com/alexisbcz/palmframe"
export const DEFAULT_DESCRIPTION =
  "Make comics with AI. Write the story, keep your characters on model from panel to panel, and post carousels to Instagram. Open source."

const OG_IMAGE = "/og/default.png"
const OG_SIZE = { width: 1200, height: 630 }

export const absolute = (path: string) =>
  path.startsWith("http") ? path : `${SITE}${path}`

export function seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image = OG_IMAGE,
  imageAlt = title,
  type = "website",
  video,
  noindex = false,
}: {
  title: string
  description?: string
  path: string
  image?: string
  imageAlt?: string
  type?: "website" | "article"
  video?: string
  noindex?: boolean
}): MetaDescriptor[] {
  const url = absolute(path)
  const picture = absolute(image)
  // Only our own cards have a known size.
  const sized = image.startsWith("/og/")
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    ...(noindex ? [{ name: "robots", content: "noindex" }] : []),
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: picture },
    { property: "og:image:alt", content: imageAlt },
    ...(sized
      ? [
          { property: "og:image:width", content: String(OG_SIZE.width) },
          { property: "og:image:height", content: String(OG_SIZE.height) },
        ]
      : []),
    ...(video
      ? [
          { property: "og:video", content: absolute(video) },
          { property: "og:video:secure_url", content: absolute(video) },
          { property: "og:video:type", content: "video/mp4" },
          { property: "og:video:width", content: String(OG_SIZE.width) },
          { property: "og:video:height", content: String(OG_SIZE.height) },
        ]
      : []),
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: picture },
    { name: "twitter:image:alt", content: imageAlt },
  ]
}

// Pages that only make sense signed in, or that nobody should land on.
export const PRIVATE: MetaDescriptor = { name: "robots", content: "noindex" }
