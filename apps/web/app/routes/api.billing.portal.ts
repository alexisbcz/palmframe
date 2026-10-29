import { data, redirect } from "react-router"

import { ensureCustomer } from "@/lib/billing.server"
import {
  billingEnabled,
  portalConfigurationId,
  stripe,
} from "@/lib/stripe.server"
import { getViewer } from "@/lib/supabase.server"
import { detectLocale } from "@/i18n/core"

import type { Route } from "./+types/api.billing.portal"

// Stripe's Customer Portal: change plan, update the card, cancel, invoices.
async function open(request: Request) {
  if (!billingEnabled())
    throw data("Billing is not configured.", { status: 503 })
  const { viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/pricing", { headers })
  const session = await stripe().billingPortal.sessions.create({
    customer: await ensureCustomer(viewer),
    return_url: `${new URL(request.url).origin}/pricing`,
    configuration: (await portalConfigurationId()) ?? undefined,
    locale: detectLocale(request),
  })
  throw redirect(session.url, { headers })
}

export const action = ({ request }: Route.ActionArgs) => open(request)
// The checkout route redirects existing subscribers here.
export const loader = ({ request }: Route.LoaderArgs) => open(request)
