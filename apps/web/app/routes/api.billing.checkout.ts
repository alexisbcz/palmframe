import { data, redirect } from "react-router"

import { creditsFor, isActive, planOf } from "@/lib/credits"
import { detectLocale } from "@/i18n/core"
import { ensureCustomer, syncStripeCustomer } from "@/lib/billing.server"
import { billingEnabled, prices, stripe } from "@/lib/stripe.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.billing.checkout"

// Tags these sessions in the Dashboard (Stripe asks for 8 random letters).
const INTEGRATION = "palmframe-credits-qmvhtkzr"

export async function action({ request }: Route.ActionArgs) {
  if (!billingEnabled())
    throw data("Billing is not configured.", { status: 503 })
  const { viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/pricing", { headers })

  const lookupKey = String((await request.formData()).get("lookupKey") ?? "")
  const price = (await prices()).get(lookupKey)
  if (!price || !creditsFor(lookupKey))
    throw data("Unknown price.", { status: 400 })

  // The customer exists before checkout, always (Theo's rule).
  const customer = await ensureCustomer(viewer)
  const origin = new URL(request.url).origin
  const subscription = !!planOf(lookupKey)

  // One subscription per customer: changing plan happens in the portal.
  if (subscription && isActive(await syncStripeCustomer(customer)))
    throw redirect("/api/billing/portal", { headers })

  const session = await stripe().checkout.sessions.create({
    mode: subscription ? "subscription" : "payment",
    customer,
    client_reference_id: viewer.id,
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    locale: detectLocale(request),
    customer_update: { name: "auto", address: "auto" },
    billing_address_collection: "auto",
    success_url: `${origin}/billing/success`,
    cancel_url: `${origin}/pricing`,
    integration_identifier: INTEGRATION,
  })
  if (!session.url)
    throw data("Stripe returned no checkout URL.", { status: 502 })
  throw redirect(session.url, { headers })
}
