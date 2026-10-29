import { redirect } from "react-router"

import { exchangeCode, saveKey } from "@/lib/openrouter.server"
import { getViewer } from "@/lib/supabase.server"

import { VERIFIER_COOKIE } from "./api.openrouter.connect"
import type { Route } from "./+types/api.openrouter.callback"

// OpenRouter sends the browser back with a code; the code and the verifier
// buy a key, which is stored encrypted. Settings shows how it went.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/settings", { headers })
  headers.append(
    "set-cookie",
    `${VERIFIER_COOKIE}=; Path=/api/openrouter; Max-Age=0; HttpOnly; SameSite=Lax`
  )
  const code = new URL(request.url).searchParams.get("code")
  const verifier = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${VERIFIER_COOKIE}=`))
    ?.slice(VERIFIER_COOKIE.length + 1)
  if (!code || !verifier)
    throw redirect("/settings?openrouter=failed", { headers })
  try {
    await saveKey(viewer.id, await exchangeCode(code, verifier))
  } catch {
    throw redirect("/settings?openrouter=failed", { headers })
  }
  throw redirect("/settings?openrouter=connected", { headers })
}
