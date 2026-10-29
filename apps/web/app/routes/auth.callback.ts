import type { EmailOtpType } from "@supabase/supabase-js"
import { redirect } from "react-router"

import { getSupabase, safeNext } from "@/lib/supabase.server"

import type { Route } from "./+types/auth.callback"

// Auth emails land here. PKCE links carry `code`, whose verifier sits in a
// cookie of the browser that asked; `token_hash` links work anywhere.
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const next = safeNext(url.searchParams.get("next"))
  const code = url.searchParams.get("code")
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null
  const { supabase, headers } = getSupabase(request)

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error(url.searchParams.get("error_description") ?? "") }

  if (error) {
    const reason = /code verifier/i.test(error.message) ? "browser" : "expired"
    const back = next === "/projects" ? "" : `&next=${encodeURIComponent(next)}`
    throw redirect(`/login?error=${reason}${back}`, { headers })
  }
  throw redirect(next, { headers })
}
