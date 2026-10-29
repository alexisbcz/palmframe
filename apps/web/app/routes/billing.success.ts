import { redirect } from "react-router"

import { customerIdOf, syncStripeCustomer } from "@/lib/billing.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/billing.success"

// People usually get back before the webhook does: sync now, so the credits
// are there when the page loads. The webhook runs the same sync later.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/pricing", { headers })
  const customer = await customerIdOf(viewer.id)
  if (customer)
    await syncStripeCustomer(customer).catch((e) =>
      console.error("[billing] sync after checkout", e)
    )
  throw redirect("/pricing?status=success", { headers })
}
