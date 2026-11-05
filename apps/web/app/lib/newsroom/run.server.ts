import { MACHINE_IMAGES_BUCKET } from "@/lib/database"
import type { DeskRules } from "@/lib/deepdive/tools.server"
import { withPruna } from "@/lib/machines/image.server"
import { generateImage, payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { DESKS, deskProblems, deskRules, deskSystem } from "./desks.server"
import { readOptions } from "./styles"
import { templateById } from "./templates"

const COVER_MS = 90_000

// The brief and rules a Newsroom story runs under. Studio's own stories have
// no template and keep the house style.
export function newsroomDesk(
  template: string | null | undefined,
  rawOptions?: unknown
) {
  const t = templateById(template)
  if (!t) return undefined
  const options = readOptions(rawOptions)
  // Japanese has no spaces between words, so length is counted in characters,
  // about two per English word.
  const cjk = options.language === "ja"
  const rules: DeskRules = {
    limits: cjk
      ? { ...t.limits, minWords: 0, maxWords: Number.MAX_SAFE_INTEGER }
      : t.limits,
    vale: deskRules(t.id, options.language),
    shape: (body) => {
      const problems = deskProblems(t.id, body, options.language)
      if (cjk) {
        const chars = body.replace(/\s/g, "").length
        if (chars < t.limits.minWords * 2)
          problems.push(`${chars} characters, need ${t.limits.minWords * 2}.`)
        if (chars > t.limits.maxWords * 2.5)
          problems.push(
            `${chars} characters, cut to ${Math.round(t.limits.maxWords * 2.5)}.`
          )
      }
      return problems
    },
  }
  return { name: t.name, system: deskSystem(t.id, options), rules }
}

// The person's OpenRouter account draws it when connected, otherwise our image
// key does, if this server has one. With neither, the story keeps its
// typographic cover. Part of the story's price either way.
export async function drawCover(
  row: { id: string; user_id: string; template: string | null; cover: any },
  scene: string
) {
  const t = templateById(row.template)
  if (!t) return
  const prompt = `Editorial cover image for a news story: ${scene}\n\n${DESKS[t.id].art}`
  const abort = AbortSignal.timeout(COVER_MS)
  const connection = await payingConnection(row.user_id)
  if (!connection && !process.env.PRUNA_API_KEY?.trim()) return
  const image = connection
    ? await generateImage(
        connection,
        { prompt, width: 1536, height: 864, refs: [] },
        abort
      )
    : await withPruna(prompt, abort, "16:9")
  const type = image.type.split(";")[0]!
  const extension =
    type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"
  const path = `${row.user_id}/newsroom/${row.id}.${extension}`
  const bucket = supabaseAdmin().storage.from(MACHINE_IMAGES_BUCKET)
  const { error } = await bucket.upload(path, image.bytes, {
    contentType: type,
    upsert: true,
  })
  if (error) throw new Error(error.message)
  const url = bucket.getPublicUrl(path).data.publicUrl
  await supabaseAdmin()
    .from("comic_deep_dives")
    .update({ cover: { ...(row.cover ?? {}), scene, url } })
    .eq("id", row.id)
}
