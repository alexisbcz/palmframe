import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database"
import { supabaseEnv } from "@/lib/supabase.server"

import { toSite } from "./model"

export function anon() {
  const { url, key } = supabaseEnv()
  return createClient<Database>(url, key, { auth: { persistSession: false } })
}

// A release by its address, for anyone, signed in or not.
export async function readRelease(slug: string) {
  const { data } = await anon().rpc("comic_site_release", { p_slug: slug })
  const row = data?.[0]
  return row ? { ...row, data: toSite(row.data) } : null
}
