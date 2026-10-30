import { redirect } from "react-router"

import { ComicCanvasEditor } from "@/components/comic-canvas/editor"
import {
  DEFAULT_DESCRIPTION,
  REPOSITORY,
  SITE,
  SITE_NAME,
  seo,
} from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"
import { instagramEnabled } from "@/lib/instagram.server"

import type { Route } from "./+types/home"

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE,
  description: DEFAULT_DESCRIPTION,
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  sameAs: [REPOSITORY],
}

export function meta() {
  return [
    ...seo({
      title: "Palmframe: Make comics with AI",
      path: "/",
      imageAlt: "Palmframe: Make comics with AI, with three example comics",
      video: "/og/palmframe.mp4",
    }),
    { "script:ld+json": STRUCTURED_DATA },
  ]
}

// Signed in, carousels live in the account; signed out, the canvas keeps one
// in this browser. `?project=` files still open locally either way.
// The posting key never leaves the server: the page only learns whether it is set.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  if (viewer && !new URL(request.url).searchParams.has("project"))
    throw redirect("/projects", { headers })
  return { instagram: instagramEnabled() }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className="sr-only">Palmframe: Make comics with AI</h1>
      <ComicCanvasEditor instagram={loaderData.instagram} />
    </>
  )
}
