import { errorResponse, getPost, requireProfile } from "@/lib/instagram.server"

import type { Route } from "./+types/api.instagram.posts.$id"

export async function loader({ request, params }: Route.LoaderArgs) {
  try {
    const { profileId, headers } = await requireProfile(request)
    return Response.json(await getPost(profileId, params.id), { headers })
  } catch (e) {
    return errorResponse(e)
  }
}
