import { MACHINE_IMAGES_BUCKET } from "@/lib/database"
import {
  generateImage,
  type OpenRouterConnection,
} from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

const PRUNA = "https://api.pruna.ai/v1"
const STYLE =
  "One panel of a black and white European comic, thick confident brush ink, large areas of solid black, fine cross-hatching. No readable text, no letters, no logos, no signature, no speech bubbles, no panel borders."

export const imageAvailable = (connection: OpenRouterConnection | null) =>
  !!connection || !!process.env.PRUNA_API_KEY?.trim()

async function withPruna(prompt: string, abort: AbortSignal) {
  const key = process.env.PRUNA_API_KEY!.trim()
  const json = async (res: Response) => {
    if (!res.ok) throw new Error(`Pruna ${res.status}`)
    return (await res.json()) as {
      id?: string
      status?: string
      get_url?: string
      generation_url?: string | string[]
    }
  }
  let body = await json(
    await fetch(`${PRUNA}/predictions`, {
      method: "POST",
      signal: abort,
      headers: {
        apikey: key,
        "content-type": "application/json",
        Model: "p-image",
        "Try-Sync": "true",
      },
      body: JSON.stringify({ input: { prompt, aspect_ratio: "4:3" } }),
    })
  )
  while (body.status !== "succeeded") {
    if (body.status === "failed" || body.status === "canceled")
      throw new Error("Pruna failed")
    await new Promise((r) => setTimeout(r, 500))
    const url = body.get_url ?? `${PRUNA}/predictions/status/${body.id}`
    body = {
      ...(await json(
        await fetch(url, { headers: { apikey: key }, signal: abort })
      )),
      get_url: url,
    }
  }
  const url = [body.generation_url].flat()[0]
  if (!url) throw new Error("Pruna returned no image")
  const res = await fetch(url, { headers: { apikey: key }, signal: abort })
  if (!res.ok) throw new Error(`Pruna image ${res.status}`)
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get("content-type") ?? "image/jpeg",
  }
}

// Stored in a public bucket: social platforms fetch it, and so does the page.
export async function drawPost(
  userId: string,
  draftKey: string,
  scene: string,
  connection: OpenRouterConnection | null,
  abort: AbortSignal
) {
  const prompt = `${scene}\n\n${STYLE}`
  const image = connection
    ? await generateImage(
        connection,
        { prompt, width: 1200, height: 900, refs: [] },
        abort
      )
    : await withPruna(prompt, abort)
  const type = image.type.split(";")[0]!
  const extension =
    type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"
  const path = `${userId}/${draftKey}.${extension}`
  const bucket = supabaseAdmin().storage.from(MACHINE_IMAGES_BUCKET)
  const { error } = await bucket.upload(path, image.bytes, {
    contentType: type,
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return bucket.getPublicUrl(path).data.publicUrl
}
