import { data } from "react-router"

import { AssetDetail } from "@/components/catalog/detail"
import { getAssets, relatedTo } from "@/lib/catalog.server"
import { absolute, seo } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/catalog.asset"

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: "Palmframe" }]
  const { asset } = loaderData
  const path = `/catalog/${asset.id}`
  const name = `${asset.name} · Palmframe catalog`
  return [
    ...seo({
      title: name,
      description: asset.description,
      path,
      image: asset.image ?? "/og/catalog.png",
      imageAlt: asset.name,
      type: "article",
      // Someone's private asset, or one under review.
      noindex: !asset.official && (!asset.isPublic || asset.hidden),
    }),
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        name: asset.name,
        description: asset.description,
        url: absolute(path),
        ...(asset.image && { image: absolute(asset.image) }),
        isPartOf: { "@type": "CollectionPage", url: absolute("/catalog") },
      },
    },
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
    },
    { headers }
  )
}

export default function CatalogAsset({ loaderData }: Route.ComponentProps) {
  return <AssetDetail key={loaderData.asset.id} {...loaderData} />
}
