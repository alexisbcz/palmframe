import { z } from "zod"

import { emailSchema } from "@/lib/newsroom/publication"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { Route } from "./+types/api.newsroom.public"

const fail = (status: number, code = "failed") =>
  Response.json({ ok: false, code }, { status })

const body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("subscribe"),
    email: emailSchema,
    // A trap field people never see; bots fill it in.
    website: z.string().max(200).optional(),
  }),
  z.object({ kind: z.literal("unsubscribe"), token: z.uuid() }),
])

async function unsubscribe(slug: string, token: string) {
  const admin = supabaseAdmin()
  const { data: pub } = await admin
    .from("comic_newsrooms")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()
  if (!pub) return false
  const { data } = await admin
    .from("comic_newsroom_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    })
    .eq("newsroom_id", pub.id)
    .eq("token", token)
    .select("id")
  return !!data?.length
}

// Readers' side of a publication: subscribing, and leaving. Mail clients'
// one-click unsubscribe posts here with the token in the query.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return fail(405)
  const oneClick = new URL(request.url).searchParams.get("unsubscribe")
  if (oneClick) {
    if (!z.uuid().safeParse(oneClick).success) return fail(400)
    await unsubscribe(params.slug, oneClick)
    return Response.json({ ok: true })
  }
  const raw = await request.text()
  if (raw.length > 4_096) return fail(413)
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return fail(400)
  }
  const parsed = body.safeParse(json)
  if (!parsed.success) return fail(400, "invalid")
  const r = parsed.data

  if (r.kind === "unsubscribe") {
    const done = await unsubscribe(params.slug, r.token)
    return done ? Response.json({ ok: true }) : fail(404)
  }

  // Bots get the same answer as people, so the trap stays hidden.
  if (r.website) return Response.json({ ok: true })
  const admin = supabaseAdmin()
  const { data: pub } = await admin
    .from("comic_newsrooms")
    .select("id")
    .eq("slug", params.slug)
    .eq("live", true)
    .maybeSingle()
  if (!pub) return fail(404)
  const email = r.email.trim().toLowerCase()
  // Coming back resubscribes; either way the answer doesn't reveal whether
  // the address was already on the list.
  const { error } = await admin.from("comic_newsroom_subscribers").upsert(
    {
      newsroom_id: pub.id,
      email,
      status: "subscribed",
      unsubscribed_at: null,
    },
    { onConflict: "newsroom_id,email" }
  )
  if (error) return fail(500)
  return Response.json({ ok: true })
}
