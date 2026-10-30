import { data, redirect } from "react-router"

import { CreateAsset } from "@/components/catalog/create"
import { messages } from "@/components/catalog/catalog.messages"
import { isKind } from "@/components/catalog/model"
import { DEFAULT_LOCALE, isLocale, translate } from "@/i18n/core"
import { getAssets } from "@/lib/catalog.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/catalog.create"

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0] as { loaderData?: { locale?: unknown } })
    ?.loaderData?.locale
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE
  return [{ title: `${translate(messages, l, "create.title")} · Palmframe` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  const url = new URL(request.url)
  if (!viewer)
    throw redirect(
      `/login?next=${encodeURIComponent(url.pathname + url.search)}`,
      { headers }
    )
  const remixId = url.searchParams.get("remix")
  const kind = url.searchParams.get("kind")
  const [remix] = remixId ? await getAssets(supabase, viewer.id, [remixId]) : []
  return data(
    {
      userId: viewer.id,
      kind: isKind(kind) ? kind : (remix?.kind ?? "character"),
      remix: remix ?? null,
    },
    { headers }
  )
}

export default function CatalogCreate({ loaderData }: Route.ComponentProps) {
  return <CreateAsset {...loaderData} />
}
