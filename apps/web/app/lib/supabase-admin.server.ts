import { createClient } from "@supabase/supabase-js"

import type { Database } from "./database"
import { supabaseEnv } from "./supabase.server"

// Bypasses row-level security: only for work no signed-in user drives,
// like Stripe webhooks granting credits. Never send it to a browser.
let admin: ReturnType<typeof createClient<Database>> | null = null

export function supabaseAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!key) throw new Error("SUPABASE_SECRET_KEY must be set.")
  admin ??= createClient<Database>(supabaseEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return admin
}
