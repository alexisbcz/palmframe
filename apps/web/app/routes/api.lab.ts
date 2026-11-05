import {
  allowed,
  cancelRender,
  installed,
  render,
  renderFile,
  startComfy,
} from "@/lib/lab/comfy.server"
import { toRequest } from "@/lib/lab/model"

import type { Route } from "./+types/api.lab"

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

export async function loader({ request }: Route.LoaderArgs) {
  if (!allowed(request)) return fail("Not found", 404)
  const file = new URL(request.url).searchParams.get("file")
  if (file) {
    const body = renderFile(file)
    return body
      ? new Response(body, {
          headers: {
            "content-type": "image/png",
            "cache-control": "private, max-age=31536000, immutable",
          },
        })
      : fail("Not found", 404)
  }
  const { running } = await installed()
  return Response.json({ running })
}

export async function action({ request }: Route.ActionArgs) {
  if (!allowed(request)) return fail("Not found", 404)
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!body) return fail("Invalid request.", 400)
  if (body.intent === "start")
    return startComfy()
      ? Response.json({ ok: true })
      : fail("ComfyUI isn't installed in ~/ComfyUI.", 501)
  if (body.intent === "cancel") {
    await cancelRender()
    return Response.json({ ok: true })
  }
  const r = toRequest(body)
  if (!r.prompt.trim()) return fail("Write a prompt first.", 400)
  try {
    return Response.json(await render(r))
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 502)
  }
}
