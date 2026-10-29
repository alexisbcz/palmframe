import { redirect } from "react-router"

import { authUrl, openRouterAvailable, pkce } from "@/lib/openrouter.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.openrouter.connect"

export const VERIFIER_COOKIE = "or_pkce"

// Sends the browser to OpenRouter's sign-in. The PKCE verifier waits in a
// short-lived cookie for the callback.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/settings", { headers })
  if (!openRouterAvailable())
    throw redirect("/settings?openrouter=unavailable", { headers })
  const { verifier, challenge } = pkce()
  const url = new URL(request.url)
  const callback = new URL("/api/openrouter/callback", url.origin).href
  headers.append(
    "set-cookie",
    `${VERIFIER_COOKIE}=${verifier}; Path=/api/openrouter; Max-Age=600; HttpOnly; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`
  )
  return redirect(authUrl(callback, challenge), { headers })
}
