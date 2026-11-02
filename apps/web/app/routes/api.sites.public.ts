import { isbot } from "isbot"

import { readRelease } from "@/lib/sites/public.server"
import { checkSubmission } from "@/lib/sites/submit"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { Route } from "./+types/api.sites.public"

const fail = (status: number, code = "failed") =>
  Response.json({ ok: false, code }, { status })

// What visitors of a published site send. Everything goes through here, with the
// server's own key, because the functions behind it aren't open to browsers.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return fail(405)
  const type = request.headers.get("content-type") ?? ""
  if (!type.startsWith("application/json")) return fail(415)
  const raw = await request.text()
  if (raw.length > 32_768) return fail(413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return fail(400)
  }
  const slug = params.slug
  const admin = supabaseAdmin()

  if (body.kind === "view") {
    if (isbot(request.headers.get("user-agent") ?? ""))
      return new Response(null, { status: 204 })
    const path = typeof body.path === "string" ? body.path.slice(0, 200) : ""
    if (!/^\/[\w\-/]*$/.test(path)) return fail(400)
    await admin.rpc("comic_site_viewed", { p_slug: slug, p_path: path })
    return Response.json({ ok: true })
  }

  // A filled-in trap is a bot. It gets the same answer as anyone else.
  if (body.website) return Response.json({ ok: true })

  const release = await readRelease(slug)
  if (!release) return fail(404)
  const checked = checkSubmission(release.data, body, new Date())
  if ("error" in checked) return fail(checked.status, checked.code)

  if (checked.kind === "rsvp") {
    const event = release.data.events.find((e) => e.id === checked.data.event)
    const { count } = await admin
      .from("comic_site_submissions")
      .select("id", { count: "exact", head: true })
      .eq("site_id", release.site_id)
      .eq("kind", "rsvp")
      .eq("data->>event", String(checked.data.event))
      .neq("status", "cancelled")
    if (event?.capacity && (count ?? 0) >= event.capacity)
      return fail(409, "full")
  }

  const { data: result, error } = await admin.rpc("comic_site_submit", {
    p_slug: slug,
    p_kind: checked.kind,
    p_data: checked.data,
    p_slot: checked.slot ?? null,
  })
  if (error) return fail(500)
  if (result === "taken") return fail(409, "taken")
  if (result !== "ok") return fail(429, "limited")
  return Response.json({ ok: true, redirect: checked.redirect })
}
