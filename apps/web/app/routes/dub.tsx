import { data, redirect } from "react-router"

import { Lobby, Plug } from "@/components/dub/lobby"
import { useBoothLink } from "@/components/dub/use-booth"
import "@/components/novel/novel.css"
import "@/components/dub/dub.css"
import { seo } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/dub"

export const meta: Route.MetaFunction = () =>
  seo({
    title: "The Booth",
    description: "Dub existing episodes on your own Mac.",
    path: "/dub",
  })

export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/dub", { headers })
  if (!viewer.labs.dub) throw redirect("/projects?settings=labs", { headers })
  return data(null, { headers })
}

export default function Dub() {
  const { link, status, check } = useBoothLink()
  return (
    <div className="nv dub">
      {link === "ready" && status ? (
        <Lobby status={status} />
      ) : (
        <Plug link={link} onPaired={() => void check()} />
      )}
    </div>
  )
}
