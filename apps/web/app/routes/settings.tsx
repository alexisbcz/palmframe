import { redirect } from "react-router"

import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/settings"

// Settings is a dialog over the app; this address opens it, so links and the
// OpenRouter sign-in return keep working.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/settings", { headers })
  const openrouter = new URL(request.url).searchParams.get("openrouter")
  const to = new URLSearchParams(
    openrouter
      ? { settings: "openrouter", openrouter }
      : { settings: "profile" }
  )
  throw redirect(`/projects?${to}`, { headers })
}
