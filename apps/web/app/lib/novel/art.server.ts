import { COSTS } from "@/lib/credits"
import { kleinAvailable } from "@/lib/klein.server"
import { withPruna } from "@/lib/machines/image.server"
import { imageResponse, payingConnection } from "@/lib/openrouter.server"
import { comfyAvailable, render } from "@/lib/generate.server"
import type { Viewer } from "@/lib/database"
import type { getSupabase } from "@/lib/supabase.server"

import { flatSvg } from "./paper"

type Supabase = ReturnType<typeof getSupabase>["supabase"]

export interface ArtRequest {
  prompt: string
  width: number
  height: number
  seed: number
  // Earlier art of the same character, so it stays the same person.
  refs: string[]
}

export const artFake = () => !process.env.VERCEL && !!process.env.NOVELS_AI_FAKE
const prunaKey = () => !!process.env.PRUNA_API_KEY?.trim()
const localArt = () => comfyAvailable() || kleinAvailable()

export type ArtRoute = "openrouter" | "credits" | null

// Who pays for a picture here, if anyone can draw one at all.
export async function artRoute(viewer: Viewer | null): Promise<ArtRoute> {
  if (artFake()) return "credits"
  if (viewer && (await payingConnection(viewer.id))) return "openrouter"
  if (prunaKey()) return "credits"
  return localArt() ? "credits" : null
}

const RATIOS: [string, number][] = [
  ["16:9", 16 / 9],
  ["3:2", 3 / 2],
  ["4:3", 4 / 3],
  ["1:1", 1],
  ["3:4", 3 / 4],
  ["2:3", 2 / 3],
  ["9:16", 9 / 16],
]

export function nearestAspect(width: number, height: number) {
  const target = width / height
  return RATIOS.reduce((best, r) =>
    Math.abs(r[1] - target) < Math.abs(best[1] - target) ? r : best
  )[0]
}

export function parseArt(body: unknown): ArtRequest | null {
  const b = body as Partial<ArtRequest> | null
  if (typeof b?.prompt !== "string" || !b.prompt.trim()) return null
  if (b.prompt.length > 4_000) return null
  const side = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(1536, Math.max(256, Math.round(v)))
      : 1024
  return {
    prompt: b.prompt,
    width: side(b.width),
    height: side(b.height),
    seed:
      typeof b.seed === "number" && Number.isFinite(b.seed)
        ? Math.abs(Math.round(b.seed)) % 2 ** 32
        : Math.floor(Math.random() * 2 ** 32),
    // Passed on to the model, never fetched here unless a local model needs it.
    refs: (Array.isArray(b.refs) ? b.refs : [])
      .filter(
        (r): r is string =>
          typeof r === "string" && /^(https:\/\/|data:image\/)/.test(r)
      )
      .slice(0, 4),
  }
}

async function draw(r: ArtRequest, request: Request): Promise<Response> {
  if (artFake()) {
    const svg = flatSvg("harbor", "dusk", r.seed % 100)
    return new Response(svg, {
      headers: { "content-type": "image/svg+xml", "x-model": "fake" },
    })
  }
  if (prunaKey() && !localArt()) {
    const image = await withPruna(
      r.prompt,
      request.signal,
      nearestAspect(r.width, r.height)
    )
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "content-type": image.type,
        "x-model": "Pruna p-image",
        "cache-control": "no-store",
      },
    })
  }
  return render(
    {
      prompt: r.prompt,
      negative: "text, watermark, signature, lowres",
      width: Math.round(r.width / 64) * 64,
      height: Math.round(r.height / 64) * 64,
      seed: r.seed,
      steps: 12,
      engine: kleinAvailable() && r.refs.length ? "klein" : "anima",
      refs: kleinAvailable() ? r.refs : [],
    },
    request
  )
}

// The person's OpenRouter account pays when connected. Otherwise a picture is
// charged in credits first and refunded if it fails, like every other render.
export async function makeArt(
  r: ArtRequest,
  request: Request,
  supabase: Supabase,
  viewer: Viewer | null
): Promise<Response> {
  const openrouter = viewer ? await payingConnection(viewer.id) : null
  if (openrouter && !artFake())
    return imageResponse(
      openrouter,
      {
        prompt: r.prompt,
        width: r.width,
        height: r.height,
        refs: r.refs,
        seed: r.seed,
      },
      request.signal
    )
  if ((await artRoute(viewer)) === null)
    return Response.json(
      {
        error: "Connect an OpenRouter account in Settings to draw art here.",
        code: "needs_openrouter",
      },
      { status: 501 }
    )
  if (!viewer) return draw(r, request)

  const job = crypto.randomUUID()
  const spent = await supabase.rpc("spend_credits", {
    p_cost: COSTS.novel_art,
    p_kind: "novel_art",
    p_job: job,
  })
  if (spent.error)
    return spent.error.code === "P0402"
      ? Response.json(
          { error: spent.error.message, code: "insufficient_credits" },
          { status: 402 }
        )
      : Response.json({ error: spent.error.message }, { status: 500 })
  let res: Response
  try {
    res = await draw(r, request)
  } catch (e) {
    res = Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
  if (res.ok) {
    res.headers.set("x-credits", String(spent.data))
    return res
  }
  const refunded = await supabase.rpc("refund_credits", { p_job: job })
  if (!refunded.error) res.headers.set("x-credits", String(refunded.data))
  return res
}
