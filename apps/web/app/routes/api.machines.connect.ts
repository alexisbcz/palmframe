import { redirect } from "react-router"

import {
  connectPlatformUrl,
  errorResponse,
  requireProfile,
} from "@/lib/instagram.server"
import { OUTPUT_PLATFORMS, type OutputPlatform } from "@/lib/machines/model"

import type { Route } from "./+types/api.machines.connect"

// Sends the browser to a platform's login, then back to the machines page.
// Bluesky has no login page: it takes an app password in the machines form.
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const platform = url.searchParams.get("platform") as OutputPlatform
  if (!OUTPUT_PLATFORMS.includes(platform) || platform === "bluesky")
    return new Response("Not found", { status: 404 })
  try {
    const { profileId, headers } = await requireProfile(request)
    return redirect(
      await connectPlatformUrl(
        profileId,
        platform,
        new URL("/machines?connected=1", url.origin).href
      ),
      { headers }
    )
  } catch (e) {
    if (e instanceof Response && e.status === 401)
      return redirect("/login?next=/machines")
    return errorResponse(e)
  }
}
