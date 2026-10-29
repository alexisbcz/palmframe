import * as React from "react"
import { Form, Link, useNavigation } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { AccountMenu, useBalance } from "@/components/account/account-menu"
import { Logo, linkClass } from "@/components/auth/auth-ui"
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  useLocale,
  useT,
} from "@/i18n/core"
import {
  COSTS,
  PACKS,
  PLANS,
  isActive,
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

function useMoney() {
  const { locale } = useLocale()
  return React.useCallback(
    (price: { amount: number; currency: string }) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: price.currency,
        minimumFractionDigits: price.amount % 100 ? 2 : 0,
      }).format(price.amount / 100),
    [locale]
  )
}

// Posts to a billing endpoint, which answers with a redirect to Stripe.
function BillingButton({
  action,
  lookupKey,
  children,
  isDisabled,
}: {
  action: "/api/billing/checkout" | "/api/billing/portal"
  lookupKey?: string
  children: React.ReactNode
  isDisabled?: boolean
}) {
  const navigation = useNavigation()
  const pending =
    navigation.state !== "idle" &&
    navigation.formAction === action &&
    (navigation.formData?.get("lookupKey") ?? undefined) === lookupKey
  return (
    <Form method="post" action={action} reloadDocument>
      {lookupKey && <input type="hidden" name="lookupKey" value={lookupKey} />}
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        isDisabled={isDisabled || pending}
      >
        {pending && <Spinner />}
        {children}
      </Button>
    </Form>
  )
}

export default function Pricing({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const money = useMoney()
  const { locale } = useLocale()
  const balance = useBalance()
  const { signedIn, available, subscription, plans, packs, history } =
    loaderData
  const subscribed = isActive(subscription)
  // A live or past subscription (the cache stores {status: "none"} otherwise).
  const sub = "subscriptionId" in subscription ? subscription : null
  const currentPlan = sub?.plan ?? null
  const n = (x: number) => x.toLocaleString(locale)
  const date = (s: number) =>
    new Date(s * 1000).toLocaleDateString(locale, { dateStyle: "long" })
  const canBuy = signedIn && available

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between gap-2 border-b px-2.5">
        <Logo />
        <AccountMenu />
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-xl flex-col gap-1.5">
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {balance !== null && (
            <div className="flex flex-col rounded-xl border px-4 py-3 sm:items-end">
              <span className="text-xs text-muted-foreground">
                {t("balance")}
              </span>
              <span className="text-2xl font-semibold tabular-nums">
                {n(balance)}
              </span>
            </div>
          )}
        </div>

        {loaderData.success && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm"
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              className="size-4 text-emerald-600 dark:text-emerald-400"
            />
            {t("success")}
          </p>
        )}
        {!available && (
          <p
            role="alert"
            className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            {t("unavailable")}
          </p>
        )}
        {available && !signedIn && (
          <p className="text-sm text-muted-foreground">
            {t("signIn")}{" "}
            <Link to="/login?next=/pricing" className={linkClass}>
              {t("signInLink")}
            </Link>
          </p>
        )}
        {subscription.status === "past_due" && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="size-4"
            />
            {t("pastDue")}
          </p>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-3 rounded-xl border p-5">
            <h2 className="font-medium">{t("free.name")}</h2>
            <p className="text-3xl font-semibold">{t("free.price")}</p>
            <ul className="flex flex-1 flex-col gap-1 text-sm text-muted-foreground">
              <li>{t("free.credits")}</li>
              <li>{t("free.note")}</li>
            </ul>
            {signedIn && !subscribed && (
              <span className="text-center text-sm text-muted-foreground">
                {t("current")}
              </span>
            )}
          </div>
          {plans.map((plan) => {
            const current = subscribed && currentPlan === plan.id
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-5",
                  current && "border-foreground/40 ring-1 ring-foreground/20"
                )}
              >
                <h2 className="font-medium">{t(`${plan.id}.name`)}</h2>
                <p className="text-3xl font-semibold">
                  {plan.price ? money(plan.price) : "–"}
                  <span className="ms-1 text-sm font-normal text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </p>
                <ul className="flex flex-1 flex-col gap-1 text-sm text-muted-foreground">
                  <li>
                    {t("monthly", { count: plan.credits, n: n(plan.credits) })}
                  </li>
                  <li>{t(`${plan.id}.note`)}</li>
                  <li>{t("rollover")}</li>
                </ul>
                {current && sub?.currentPeriodEnd && (
                    <p className="text-xs text-muted-foreground">
                      {sub.cancelAtPeriodEnd
                        ? t("ends", {
                            date: date(sub.currentPeriodEnd),
                          })
                        : t("renews", {
                            date: date(sub.currentPeriodEnd),
                          })}
                    </p>
                  )}
                {current ? (
                  <BillingButton action="/api/billing/portal">
                    {t("manage")}
                  </BillingButton>
                ) : subscribed ? (
                  <BillingButton
                    action="/api/billing/portal"
                    isDisabled={!canBuy}
                  >
                    {t("switchPlan")}
                  </BillingButton>
                ) : (
                  <BillingButton
                    action="/api/billing/checkout"
                    lookupKey={plan.lookupKey}
                    isDisabled={!canBuy || !plan.price}
                  >
                    {t("subscribe")}
                  </BillingButton>
                )}
              </div>
            )
          })}
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("packs")}</h2>
            <p className="text-sm text-muted-foreground">{t("packsNote")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {packs.map((pack) => (
              <div
                key={pack.lookupKey}
                className="flex flex-col gap-2 rounded-xl border p-4"
              >
                <span className="font-medium">
                  {t("pack", { count: pack.credits, n: n(pack.credits) })}
                </span>
                <span className="text-2xl font-semibold">
                  {pack.price ? money(pack.price) : "–"}
                </span>
                {pack.price && (
                  <span className="text-xs text-muted-foreground">
                    {t("perThousand", {
                      price: money({
                        amount: Math.round(
                          (pack.price.amount * 1000) / pack.credits
                        ),
                        currency: pack.price.currency,
                      }),
                    })}
                  </span>
                )}
                <BillingButton
                  action="/api/billing/checkout"
                  lookupKey={pack.lookupKey}
                  isDisabled={!canBuy || !pack.price}
                >
                  {t("buy")}
                </BillingButton>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-8 md:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t("costs")}</h2>
            <dl className="divide-y rounded-xl border text-sm">
              {(Object.keys(COSTS) as (keyof typeof COSTS)[]).map((op) => (
                <div
                  key={op}
                  className="flex justify-between gap-4 px-4 py-2.5"
                >
                  <dt>{t(`ops.${op}`)}</dt>
                  <dd className="text-muted-foreground tabular-nums">
                    {t("cost", { count: COSTS[op], n: n(COSTS[op]) })}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">{t("refundNote")}</p>
          </section>

          {signedIn && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("history")}</h2>
              {history.length ? (
                <ul className="divide-y rounded-xl border text-sm">
                  {history.map((row, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-4 px-4 py-2.5"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {kindLabel(t, row.kind)}
                        </span>
                        <span
                          className="text-xs text-muted-foreground"
                          suppressHydrationWarning
                        >
                          {new Date(row.created_at).toLocaleString(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 tabular-nums",
                          row.delta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        )}
                      >
                        {row.delta > 0 ? "+" : "−"}
                        {n(Math.abs(row.delta))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("noHistory")}
                </p>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

type T = ReturnType<typeof useT<typeof messages.en>>
const KINDS = [
  "welcome",
  "subscription",
  "pack",
  "refund_clawback",
  "adjustment",
  "panel",
  "panel_ref",
  "portrait",
  "sheet",
  "story_plan",
  "upscale",
  "remove_bg",
  "face_fix",
  "restyle",
] as const

function kindLabel(t: T, kind: string) {
  const known = (k: string) => (KINDS as readonly string[]).includes(k)
  if (known(kind)) return t(`kinds.${kind as (typeof KINDS)[number]}`)
  const base = kind.replace(/_failed$/, "")
  if (kind.endsWith("_failed") && known(base))
    return t("kinds.refund", {
      kind: t(`kinds.${base as (typeof KINDS)[number]}`),
    })
  return kind
}
