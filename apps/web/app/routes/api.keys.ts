import { newKey } from "@/lib/api.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.keys"

// The signed-in person's developer API keys, for Settings. Rows go through
// their own session, so row-level security keeps them to their keys.
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

const MAX_KEYS = 10

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) return error("Sign in.", 401)
  const { data, error: e } = await supabase
    .from("api_keys")
    .select("id, name, prefix, last_used_at, created_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
  if (e) return error(e.message, 500)
  return Response.json({ keys: data }, { headers })
}

// POST { name } creates a key and returns it, the only time it's shown.
// DELETE ?id= revokes one.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) return error("Sign in.", 401)

  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id") ?? ""
    const { error: e } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .is("revoked_at", null)
    if (e) return error(e.message, 500)
    return Response.json({ ok: true }, { headers })
  }
  if (request.method !== "POST") return error("Method not allowed", 405)

  const body = (await request.json().catch(() => null)) as {
    name?: unknown
  } | null
  const name =
    typeof body?.name === "string" ? body.name.trim().slice(0, 60) : ""
  const { count } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null)
  if ((count ?? 0) >= MAX_KEYS) return error("too_many_keys", 409)
  const { key, prefix, hash } = newKey()
  const { data, error: e } = await supabase
    .from("api_keys")
    .insert({ name, prefix, hash })
    .select("id, name, prefix, last_used_at, created_at")
    .single()
  if (e) return error(e.message, 500)
  headers.set("cache-control", "no-store")
  return Response.json({ key, ...data }, { status: 201, headers })
}
