import { Link, data, useLocation, useNavigate } from "react-router"

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { messages } from "@/components/catalog/catalog.messages"
import { UseMenu } from "@/components/catalog/use-menu"
import { useT } from "@/i18n/core"
import { getAssets, getPack } from "@/lib/catalog.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/catalog.kit"

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.pack.name ?? "Kit"} · Palmframe` },
  { name: "description", content: loaderData?.pack.blurb ?? "" },
]

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  const pack = getPack(params.id)
  if (!pack) throw data("Not found", { status: 404, headers })
  return data(
    { pack, assets: await getAssets(supabase, viewer?.id, pack.assets) },
    { headers }
  )
}

export default function CatalogKit({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const navigate = useNavigate()
  const { search } = useLocation()
  const { pack, assets } = loaderData
  return (
    <Dialog
      isOpen
      onOpenChange={(open) =>
        !open && navigate(`/catalog${search}`, { preventScrollReset: true })
      }
      className="sm:max-w-3xl"
    >
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold">{pack.name}</DialogTitle>
        <DialogDescription>{pack.blurb}</DialogDescription>
      </DialogHeader>
      <ul className="grid max-h-[55svh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {assets.map((a) => (
          <li key={a.id}>
            <Link to={`/catalog/${a.id}`} className="group block outline-none">
              <span className="block aspect-[3/4] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition-shadow group-hover:ring-foreground/30 group-focus-visible:ring-3 group-focus-visible:ring-ring/60">
                {a.image && (
                  <img
                    src={a.image}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
              </span>
              <span className="mt-1 block truncate text-xs font-medium">
                {a.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {t(`kinds.${a.kind}`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <UseMenu
        ids={assets.map((a) => a.id)}
        label={t("kits.use", { count: assets.length })}
      />
    </Dialog>
  )
}
