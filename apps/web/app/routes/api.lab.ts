import { allowed, installed, render, startComfy } from "@/lib/lab/comfy.server"
import { toRequest } from "@/lib/lab/model"

import type { Route } from "./+types/api.lab"

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

export async function loader({ request }: Route.LoaderArgs) {
  if (!allowed(request)) return fail("Not found", 404)
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
  const r = toRequest(body)
  if (!r.prompt.trim()) return fail("Write a prompt first.", 400)
  try {
    const { file, name, ms } = await render(r, request.signal)
    return new Response(file.body, {
      headers: {
        "content-type": file.headers.get("content-type") ?? "image/png",
        "x-render-ms": String(ms),
        "x-file": name,
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    return fail(
      e instanceof Error ? e.message : String(e),
      request.signal.aborted ? 499 : 502
    )
  }
}
