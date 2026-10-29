import { AccountMenu } from "@/components/account/account-menu"
import { Logo } from "@/components/auth/auth-ui"
import { BillingPanel } from "@/components/billing/billing-palette"
import { DEFAULT_LOCALE, isLocale, translate } from "@/i18n/core"
import {
  PACKS,
  PLANS,
  type PlanId,
  type SubscriptionCache,
} from "@/lib/credits"
import { billingEnabled, prices } from "@/lib/stripe.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/pricing"
import { messages } from "./pricing.messages"

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0] as { loaderData?: { locale?: unknown } })
    ?.loaderData?.locale
  const title = translate(
    messages,
    isLocale(locale) ? locale : DEFAULT_LOCALE,
    "meta"
  )
  return [{ title: `${title} · Palmframe` }]
}

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
    success: new URL(request.url).searchParams.get("status") === "success",
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

// The same panel as the ⌘⇧P palette, as a page, for links and sign-in returns.
export default function Pricing({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between gap-2 border-b px-2.5">
        <Logo />
        <AccountMenu />
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
        <div className="overflow-hidden rounded-2xl bg-popover shadow-lg ring-1 ring-foreground/10">
          <BillingPanel data={loaderData} />
        </div>
      </main>
    </div>
  )
}
