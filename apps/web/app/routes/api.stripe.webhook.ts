import type Stripe from "stripe"

import { syncStripeCustomer } from "@/lib/billing.server"
import { stripe } from "@/lib/stripe.server"

import type { Route } from "./+types/api.stripe.webhook"

// Events that can change a customer's subscription or credits. Each one only
// triggers a full sync of that customer; the payload itself isn't trusted.
const EVENTS = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.marked_uncollectible",
  "invoice.payment_succeeded",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
])

const idOf = (x: unknown) =>
  typeof x === "string" ? x : ((x as { id?: string } | null)?.id ?? null)

// Disputes and fraud warnings point at a charge; everything else names the customer.
async function customerOf(event: Stripe.Event) {
  const object = event.data.object as { customer?: unknown; charge?: unknown }
  const customer = idOf(object.customer)
  if (customer) return customer
  const charge = idOf(object.charge)
  if (!charge) return null
  return idOf((await stripe().charges.retrieve(charge)).customer)
}

export async function action({ request }: Route.ActionArgs) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  const signature = request.headers.get("stripe-signature")
  if (!secret || !signature)
    return new Response("Missing signature", { status: 400 })

  // The raw body: signature checks fail on anything re-serialised.
  let event: Stripe.Event
  try {
    event = await stripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      secret
    )
  } catch {
    return new Response("Invalid signature", { status: 400 })
  }
  if (!EVENTS.has(event.type))
    return Response.json({ received: true, ignored: true })

  try {
    const customer = await customerOf(event)
    if (customer) await syncStripeCustomer(customer)
    return Response.json({ received: true })
  } catch (e) {
    // A 500 makes Stripe retry, and the sync is safe to repeat.
    console.error(`[stripe] ${event.type} ${event.id}`, e)
    return new Response("Sync failed", { status: 500 })
  }
}
