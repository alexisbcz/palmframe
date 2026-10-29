import type Stripe from "stripe"

import { creditsFor, planOf, type SubscriptionCache } from "./credits"
import type { Viewer } from "./database"
import { prices, stripe } from "./stripe.server"
import { supabaseAdmin } from "./supabase-admin.server"

// Billing follows Theo's "How I stay sane implementing Stripe": the customer
// exists before checkout, and one function, syncStripeCustomer, reads the
// truth back from Stripe. Webhooks and the success page only say "sync this
// customer"; no event payload is trusted. Credits go into the ledger under
// keys derived from Stripe IDs, so syncing twice grants nothing new.

export async function customerIdOf(userId: string) {
  const { data } = await supabaseAdmin()
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle()
  return data?.stripe_customer_id ?? null
}

// The viewer's Stripe customer, created on first need. The idempotency key
// makes two simultaneous first clicks create one customer, not two.
export async function ensureCustomer(viewer: Viewer) {
  const existing = await customerIdOf(viewer.id)
  if (existing) return existing
  const customer = await stripe().customers.create(
    {
      email: viewer.email,
      name: viewer.name,
      metadata: { userId: viewer.id },
    },
    { idempotencyKey: `customer:${viewer.id}` }
  )
  await supabaseAdmin()
    .from("billing_customers")
    .upsert(
      { user_id: viewer.id, stripe_customer_id: customer.id },
      { onConflict: "user_id", ignoreDuplicates: true }
    )
  return (await customerIdOf(viewer.id)) ?? customer.id
}

async function userOf(customerId: string) {
  const db = supabaseAdmin()
  const { data } = await db
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle()
  if (data) return data.user_id
  // Fallback for a customer whose binding was lost: the metadata set at creation.
  const customer = await stripe().customers.retrieve(customerId)
  const userId = customer.deleted ? null : customer.metadata?.userId
  if (!userId) return null
  await db
    .from("billing_customers")
    .upsert(
      { user_id: userId, stripe_customer_id: customerId },
      { onConflict: "user_id", ignoreDuplicates: true }
    )
  return userId
}

async function grant(
  userId: string,
  delta: number,
  kind: string,
  ref: string,
  idem: string
) {
  if (!delta) return
  const { error } = await supabaseAdmin().rpc("grant_credits", {
    p_user: userId,
    p_delta: delta,
    p_kind: kind,
    p_ref: ref,
    p_idem: idem,
  })
  if (error) throw error
}

const id = (x: string | { id: string } | null | undefined) =>
  typeof x === "string" ? x : (x?.id ?? null)

// The subscription that matters: a live one if any, else the latest.
function pickSubscription(subs: Stripe.Subscription[]) {
  const live = ["active", "trialing", "past_due", "unpaid", "incomplete"]
  return subs.find((s) => live.includes(s.status)) ?? subs[0] ?? null
}

async function syncSubscription(
  customerId: string
): Promise<SubscriptionCache> {
  const list = await stripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
    expand: ["data.default_payment_method"],
  })
  const sub = pickSubscription(list.data)
  if (!sub) return { status: "none" }
  const item = sub.items.data[0]
  const pm = sub.default_payment_method
  return {
    status: sub.status,
    subscriptionId: sub.id,
    plan: planOf(item?.price.lookup_key),
    priceId: item?.price.id ?? null,
    currentPeriodEnd: item?.current_period_end ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    paymentMethod:
      pm && typeof pm !== "string"
        ? { brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null }
        : null,
  }
}

// Each paid subscription invoice grants its month of credits. A mid-cycle
// upgrade grants the prorated share of the new plan; credits already given
// for the old plan stay.
async function grantInvoices(userId: string, customerId: string) {
  const catalog = await prices()
  const byId = new Map([...catalog.values()].map((p) => [p.id, p]))
  for await (const invoice of stripe().invoices.list({
    customer: customerId,
    status: "paid",
    limit: 100,
    expand: ["data.payments"],
  })) {
    if (!invoice.id || invoice.parent?.type !== "subscription_details") continue
    let credits = 0
    for (const line of invoice.lines.data) {
      const price = byId.get(id(line.pricing?.price_details?.price) ?? "")
      const monthly = creditsFor(price?.lookupKey)
      if (!price || !monthly) continue
      credits += line.parent?.subscription_item_details?.proration
        ? Math.round((monthly * Math.max(0, line.amount)) / price.amount)
        : monthly * (line.quantity ?? 1)
    }
    const paymentIntent = id(invoice.payments?.data[0]?.payment.payment_intent)
    await grant(
      userId,
      credits,
      "subscription",
      paymentIntent ?? invoice.id,
      `stripe_invoice:${invoice.id}`
    )
  }
}

async function grantPacks(userId: string, customerId: string) {
  for await (const session of stripe().checkout.sessions.list({
    customer: customerId,
    status: "complete",
    limit: 100,
    expand: ["data.line_items"],
  })) {
    if (session.mode !== "payment" || session.payment_status !== "paid")
      continue
    const credits = (session.line_items?.data ?? []).reduce(
      (sum, line) =>
        sum + creditsFor(line.price?.lookup_key) * (line.quantity ?? 1),
      0
    )
    await grant(
      userId,
      credits,
      "pack",
      id(session.payment_intent) ?? session.id,
      `stripe_session:${session.id}`
    )
  }
}

// Refunded or disputed payments take back the credits they bought, in
// proportion. Grants are found through the payment intent they reference.
async function clawBack(userId: string, customerId: string) {
  const db = supabaseAdmin()
  for await (const charge of stripe().charges.list({
    customer: customerId,
    limit: 100,
  })) {
    const pi = id(charge.payment_intent)
    if (!pi || (!charge.amount_refunded && !charge.disputed)) continue
    const { data: rows } = await db
      .from("credit_ledger")
      .select("delta, kind")
      .eq("user_id", userId)
      .eq("ref", pi)
    const granted = (rows ?? [])
      .filter((r) => r.delta > 0)
      .reduce((s, r) => s + r.delta, 0)
    const taken = -(rows ?? [])
      .filter((r) => r.kind === "refund_clawback")
      .reduce((s, r) => s + r.delta, 0)
    const target = charge.disputed
      ? granted
      : Math.round((granted * charge.amount_refunded) / charge.amount)
    if (target > taken)
      await grant(
        userId,
        -(target - taken),
        "refund_clawback",
        pi,
        `clawback:${charge.id}:${target}`
      )
  }
}

export async function syncStripeCustomer(customerId: string) {
  const userId = await userOf(customerId)
  if (!userId)
    throw new Error(`No Palmframe user for Stripe customer ${customerId}`)
  const subscription = await syncSubscription(customerId)
  await grantInvoices(userId, customerId)
  await grantPacks(userId, customerId)
  await clawBack(userId, customerId)
  const { error } = await supabaseAdmin()
    .from("billing_customers")
    .update({ subscription, synced_at: new Date().toISOString() })
    .eq("stripe_customer_id", customerId)
  if (error) throw error
  return subscription
}
