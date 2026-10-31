import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr"
import type { User } from "@supabase/supabase-js"

import type { Database, Viewer } from "./database"

export function supabaseEnv() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key)
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set.")
  return { url, key }
}

// A client acting as the visitor, from their session cookies. Refreshed
// tokens land in `headers`: return them with the response.
export function getSupabase(request: Request) {
  const { url, key } = supabaseEnv()
  const headers = new Headers()
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () =>
        parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({
          name: c.name,
          value: c.value ?? "",
        })),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies)
          headers.append(
            "set-cookie",
            serializeCookieHeader(name, value, options)
          )
      },
    },
  })
  return { supabase, headers }
}

export function toViewer(user: User): Viewer {
  const meta = user.user_metadata ?? {}
  const email = user.email ?? ""
  return {
    id: user.id,
    email,
    name:
      String(meta.name ?? meta.full_name ?? "").trim() || email.split("@")[0]!,
    // Only our own bucket: metadata is user-editable, so never trust any URL.
    avatarUrl:
      typeof meta.avatar_url === "string" &&
      meta.avatar_url.startsWith(
        `${supabaseEnv().url}/storage/v1/object/public/avatars/`
      )
        ? meta.avatar_url
        : null,
    labs: { machines: meta.labs?.machines === true },
  }
}

export async function getViewer(request: Request) {
  const { supabase, headers } = getSupabase(request)
  const { data } = await supabase.auth.getUser()
  return { supabase, headers, viewer: data.user ? toViewer(data.user) : null }
}

export { safeNext } from "./next"
