import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { useRouteLoaderData } from "react-router"

import type { Database } from "./database"

export type Supabase = SupabaseClient<Database>

let client: Supabase | null = null

// One browser client, keeping the session in cookies the server can read.
export function useSupabase(): Supabase {
  const env = useRouteLoaderData("root")?.supabase as
    { url: string; key: string } | undefined
  if (!client) {
    if (!env) throw new Error("Supabase is not configured.")
    client = createBrowserClient<Database>(env.url, env.key)
  }
  return client
}

// Where auth emails send people back: through the callback, then on to `next`.
export function callbackUrl(next: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
}
