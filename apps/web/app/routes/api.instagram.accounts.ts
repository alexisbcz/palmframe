import {
  disconnectAccount,
  errorResponse,
  listInstagramAccounts,
  requireProfile,
} from "@/lib/instagram.server"

import type { Route } from "./+types/api.instagram.accounts"

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const { profileId, headers } = await requireProfile(request)
    return Response.json(
      { accounts: await listInstagramAccounts(profileId) },
      { headers }
    )
  } catch (e) {
    return errorResponse(e)
  }
}

// DELETE ?id= disconnects one of the user's accounts.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "DELETE")
    return Response.json({ error: "Method not allowed" }, { status: 405 })
  try {
    const { profileId, headers } = await requireProfile(request)
    const id = new URL(request.url).searchParams.get("id")
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 })
    await disconnectAccount(profileId, id)
    return Response.json(
      { accounts: await listInstagramAccounts(profileId) },
      { headers }
    )
  } catch (e) {
    return errorResponse(e)
  }
}
