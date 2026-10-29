import { ZernioError, getPost, zernioEnabled } from "@/lib/zernio.server"

import type { Route } from "./+types/api.zernio.posts.$id"

export async function loader({ params }: Route.LoaderArgs) {
  if (!zernioEnabled()) return new Response("Not found", { status: 404 })
  try {
    return Response.json(await getPost(params.id))
  } catch (e) {
    const status = e instanceof ZernioError ? e.status : 500
    return Response.json({ error: (e as Error).message }, { status })
  }
}
