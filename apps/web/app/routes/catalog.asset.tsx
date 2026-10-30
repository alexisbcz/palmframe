import { data } from "react-router"

import { AssetDetail } from "@/components/catalog/detail"
import { getAssets, relatedTo } from "@/lib/catalog.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/catalog.asset"

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: "Palmframe" }]
  const { asset, origin } = loaderData
  const image = asset.image?.startsWith("/")
    ? `${origin}${asset.image}`
    : asset.image
  return [
    { title: `${asset.name} · Palmframe` },
    { name: "description", content: asset.description },
    { property: "og:title", content: asset.name },
    { property: "og:description", content: asset.description },
    ...(image ? [{ property: "og:image", content: image }] : []),
  ]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  const [asset] = await getAssets(supabase, viewer?.id, [params.id])
  if (!asset) throw data("Not found", { status: 404, headers })
  return data(
    {
      asset,
      related: relatedTo(asset),
      origin: new URL(request.url).origin,
    },
    { headers }
  )
}

export default function CatalogAsset({ loaderData }: Route.ComponentProps) {
  return <AssetDetail key={loaderData.asset.id} {...loaderData} />
}
