import { exampleQuery } from "@/lib/civitai"
import { civitaiExamples } from "@/lib/civitai.server"

import type { Route } from "./+types/api.civitai.examples"

// Civitai's public gallery, filtered to safe images that share their prompt.
// The same for every visitor, so the CDN keeps each page for a few minutes and
// Civitai sees one request where many people browse.
export async function loader({ request }: Route.LoaderArgs) {
  const q = exampleQuery(new URL(request.url).searchParams)
  try {
    return Response.json(await civitaiExamples(q), {
      headers: {
        "cache-control": "public, max-age=60",
        "cdn-cache-control":
          "public, s-maxage=600, stale-while-revalidate=3600",
      },
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: { "cache-control": "no-store" } }
    )
  }
}
