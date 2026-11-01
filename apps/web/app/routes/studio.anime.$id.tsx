import { data } from "react-router"

import { Director } from "@/components/anime/director"
import { status, AnimeError } from "@/lib/anime/service.server"
import { videoModels } from "@/lib/anime/provider.server"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio.anime.$id"

export const handle = { bleed: true }

export const meta: Route.MetaFunction = () => [
  { title: "Anime · Palmframe" },
  PRIVATE,
]

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) throw data("Not found", { status: 404 })
  try {
    const [initial, models] = await Promise.all([
      status({ id: viewer.id, supabase }, params.id),
      videoModels(),
    ])
    return { initial, models }
  } catch (e) {
    if (e instanceof AnimeError) throw data("Not found", { status: 404 })
    throw e
  }
}

export default function Episode({ loaderData }: Route.ComponentProps) {
  return <Director key={loaderData.initial.episode.id} {...loaderData} />
}
