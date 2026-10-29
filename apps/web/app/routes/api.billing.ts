import {
  PACKS,
  PLANS,
  type PlanId,
  type SubscriptionCache,
} from "@/lib/credits"
import { billingEnabled, prices } from "@/lib/stripe.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.billing"

export type BillingData = Awaited<ReturnType<typeof loader>>

// What the Settings dialog's billing section shows: plans and packs with
// their Stripe prices, the subscription, and recent credit activity.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, supabase } = await getViewer(request)
  // Prices come from Stripe by lookup key; without them nothing can be bought.
  const catalog = billingEnabled()
    ? await prices().catch((e) => (console.error("[billing] prices", e), null))
    : null
  const priceOf = (key: string) => {
    const p = catalog?.get(key)
    return p ? { amount: p.amount, currency: p.currency } : null
  }
  let subscription: SubscriptionCache = { status: "none" }
  let history: { delta: number; kind: string; created_at: string }[] = []
  if (viewer) {
    const [billing, ledger] = await Promise.all([
      supabase
        .from("billing_customers")
        .select("subscription")
        .eq("user_id", viewer.id)
        .maybeSingle(),
      supabase
        .from("credit_ledger")
        .select("delta, kind, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
    ])
    subscription = billing.data?.subscription ?? subscription
    history = ledger.data ?? []
  }
  return {
    signedIn: !!viewer,
    available: !!catalog,
    subscription,
    history,
    plans: (Object.keys(PLANS) as PlanId[]).map((id) => ({
      id,
      ...PLANS[id],
      price: priceOf(PLANS[id].lookupKey),
    })),
    packs: PACKS.map((p) => ({ ...p, price: priceOf(p.lookupKey) })),
  }
}
