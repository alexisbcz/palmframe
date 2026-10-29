import { redirect } from "react-router"

import { getSupabase } from "@/lib/supabase.server"

import type { Route } from "./+types/logout"

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = getSupabase(request)
  await supabase.auth.signOut({ scope: "local" })
  throw redirect("/", { headers })
}

export const loader = () => redirect("/")
