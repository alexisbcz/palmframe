import { COSTS } from "@/lib/credits"
import {
  PostprocessError,
  enhanceFaces,
  imageBytes,
  removeBackground,
  restyle,
  upscale,
  type PostprocessOp,
  type PostprocessRequest,
} from "@/lib/postprocess.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.postprocess"

const OPS: PostprocessOp[] = ["upscale", "remove_bg", "face_fix", "restyle"]

function parse(body: unknown): PostprocessRequest | null {
  const b = body as Partial<PostprocessRequest>
  if (!OPS.includes(b?.op as PostprocessOp) || typeof b?.image !== "string")
    return null
  const strength =
    typeof b.strength === "number" && Number.isFinite(b.strength)
      ? Math.min(0.95, Math.max(0.1, b.strength))
      : b.op === "restyle"
        ? 0.7
        : 0.4
  return {
    op: b.op!,
    image: b.image,
    scale: b.scale === 4 ? 4 : 2,
    strength,
    prompt: typeof b.prompt === "string" ? b.prompt : "",
    negative: typeof b.negative === "string" ? b.negative : "",
    seed:
      typeof b.seed === "number" && Number.isFinite(b.seed)
        ? Math.abs(Math.round(b.seed)) % 2 ** 32
        : Math.floor(Math.random() * 2 ** 32),
  }
}

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

// Same billing as api.generate: charged before, refunded on failure.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const r = parse(await request.json().catch(() => null))
  if (!r)
    return error(
      `Invalid request: op (${OPS.join(", ")}) and image are required.`,
      400
    )
  if (r.op === "restyle" && !r.prompt.trim())
    return error("Restyle needs a prompt.", 400)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) {
    if (process.env.VERCEL) return error("Sign in to edit images.", 401)
    return runOp(r, request)
  }

  const job = crypto.randomUUID()
  const spent = await supabase.rpc("spend_credits", {
    p_cost: COSTS[r.op],
    p_kind: r.op,
    p_job: job,
  })
  if (spent.error)
    return spent.error.code === "P0402"
      ? Response.json(
          { error: spent.error.message, code: "insufficient_credits" },
          { status: 402 }
        )
      : error(`Could not charge credits: ${spent.error.message}`, 500)

  const res = await runOp(r, request)
  if (res.ok) {
    res.headers.set("x-credits", String(spent.data))
    return res
  }
  const refunded = await supabase.rpc("refund_credits", { p_job: job })
  if (!refunded.error) res.headers.set("x-credits", String(refunded.data))
  return res
}

async function runOp(r: PostprocessRequest, request: Request) {
  const t0 = performance.now()
  const headers: Record<string, string> = {
    "content-type": "image/png",
    "cache-control": "no-store",
  }
  try {
    let png: Buffer
    if (r.op === "upscale")
      png = await upscale(await imageBytes(r.image), r.scale, request.signal)
    else if (r.op === "remove_bg")
      png = await removeBackground(await imageBytes(r.image), request.signal)
    else if (r.op === "face_fix") {
      const result = await enhanceFaces(r, request.signal)
      png = result.png
      headers["x-faces"] = String(result.faces)
    } else png = await restyle(r, request.signal)
    headers["x-render-ms"] = String(Math.round(performance.now() - t0))
    return new Response(new Uint8Array(png), { headers })
  } catch (e) {
    if (e instanceof PostprocessError) return error(e.message, e.status)
    return error(e instanceof Error ? e.message : String(e), 500)
  }
}
