import { newKey } from "@/lib/api.server"
import {
  API_SCOPES,
  MAX_KEY_CREDIT_LIMIT,
  MAX_KEY_PROJECTS,
  isApiScope,
} from "@/lib/api-scopes"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.keys"

// The signed-in person's developer API keys, for Settings. Rows go through
// their own session, so row-level security keeps them to their keys. Only
// PATCH uses the secret key: a policy can't tell a change of access from
// undoing a revocation.
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

const MAX_KEYS = 10
const COLUMNS =
  "id, name, prefix, scopes, credit_limit, credits_spent, project_ids, last_used_at, created_at"
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

// The access fields a request sets, or null if any is invalid. An unknown
// scope is refused, not dropped, so a typo can't make a different key than
// the one asked for. A field left out stays as it is, or at its full-access
// default on a new key.
function accessFrom(body: Record<string, unknown> | null) {
  const { scopes, credit_limit: limit, project_ids: projects } = body ?? {}
  const access: {
    scopes?: string[]
    credit_limit?: number | null
    project_ids?: string[] | null
  } = {}
  if (scopes !== undefined) {
    if (!Array.isArray(scopes) || !scopes.length || !scopes.every(isApiScope))
      return null
    access.scopes = API_SCOPES.filter((s) => scopes.includes(s))
  }
  if (limit !== undefined) {
    if (
      limit !== null &&
      !(
        typeof limit === "number" &&
        Number.isInteger(limit) &&
        limit >= 0 &&
        limit <= MAX_KEY_CREDIT_LIMIT
      )
    )
      return null
    access.credit_limit = limit
  }
  if (projects !== undefined) {
    if (projects === null) access.project_ids = null
    else {
      if (
        !Array.isArray(projects) ||
        !projects.length ||
        projects.length > MAX_KEY_PROJECTS ||
        !projects.every((id) => typeof id === "string" && UUID.test(id))
      )
        return null
      access.project_ids = [
        ...new Set(projects.map((id: string) => id.toLowerCase())),
      ]
    }
  }
  return access
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) return error("Sign in.", 401)
  const [keys, projects] = await Promise.all([
    supabase
      .from("api_keys")
      .select(COLUMNS)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("comic_projects")
      .select("id, title")
      .order("updated_at", { ascending: false }),
  ])
  const e = keys.error ?? projects.error
  if (e) return error(e.message, 500)
  return Response.json(
    { keys: keys.data, projects: projects.data },
    { headers }
  )
}

// POST { name, scopes?, credit_limit?, project_ids? } creates a key and
// returns it, the only time it's shown. PATCH ?id= changes a key's access.
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
  if (request.method !== "POST" && request.method !== "PATCH")
    return error("Method not allowed", 405)

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const access = accessFrom(body)
  if (!access) return error("invalid_access", 400)

  if (request.method === "PATCH") {
    const id = new URL(request.url).searchParams.get("id") ?? ""
    if (!UUID.test(id) || !Object.keys(access).length)
      return error("invalid_access", 400)
    const { data, error: e } = await supabaseAdmin()
      .from("api_keys")
      .update(access)
      .eq("id", id)
      .eq("user_id", viewer.id)
      .is("revoked_at", null)
      .select(COLUMNS)
    if (e) return error(e.message, 500)
    if (!data.length) return error("Not found", 404)
    return Response.json(data[0], { headers })
  }

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
    .insert({ name, prefix, hash, ...access })
    .select(COLUMNS)
    .single()
  if (e) return error(e.message, 500)
  headers.set("cache-control", "no-store")
  return Response.json({ key, ...data }, { status: 201, headers })
}
