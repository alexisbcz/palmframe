import { redirect } from "react-router"

import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/pricing"

// Plans and credits live in the Settings dialog; this address opens it, so
// links, Stripe returns and sign-in redirects keep working.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  const to = new URLSearchParams({ settings: "billing" })
  const status = new URL(request.url).searchParams.get("status")
  if (status) to.set("status", status)
  throw redirect(`${viewer ? "/projects" : "/"}?${to}`, { headers })
}
