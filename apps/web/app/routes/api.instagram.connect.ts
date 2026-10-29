import { redirect } from "react-router"

import {
  connectUrl,
  errorResponse,
  requireProfile,
} from "@/lib/instagram.server"
import { safeNext } from "@/lib/next"

import type { Route } from "./+types/api.instagram.connect"

// Sends the browser to Instagram's login. `popup=1` when opened from the
// publish dialog; otherwise the callback returns to `next`.
export async function loader({ request }: Route.LoaderArgs) {
  try {
    const { profileId, headers } = await requireProfile(request)
    const url = new URL(request.url)
    const back = new URL("/api/instagram/callback", url.origin)
    if (url.searchParams.get("popup") === "1")
      back.searchParams.set("popup", "1")
    back.searchParams.set("next", safeNext(url.searchParams.get("next"), "/"))
    return redirect(await connectUrl(profileId, back.href), { headers })
  } catch (e) {
    if (e instanceof Response && e.status === 401)
      return redirect(
        `/login?next=${encodeURIComponent(
          safeNext(new URL(request.url).searchParams.get("next"), "/projects")
        )}`
      )
    return errorResponse(e)
  }
}
