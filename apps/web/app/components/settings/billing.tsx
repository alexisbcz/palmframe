import * as React from "react"
import { useNavigate } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Coins01Icon,
  Crown02Icon,
  FlashIcon,
  Login03Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { Kbd } from "@workspace/ui/components/kbd"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"

import { useBalance } from "@/components/account/account-menu"
import { CreditsPill } from "@/components/account/credits-pill"
import { useLocale, useT } from "@/i18n/core"
import { COSTS, isActive, type PlanId } from "@/lib/credits"
import type { BillingData } from "@/routes/api.billing"
import { messages } from "@/routes/pricing.messages"

const POPULAR: PlanId = "creator"

// Billing endpoints answer with a redirect to Stripe, so this is a real
// form post that leaves the page, not a fetch.
function post(action: string, lookupKey?: string) {
  const form = document.createElement("form")
  form.method = "post"
  form.action = action
  if (lookupKey) {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = "lookupKey"
    input.value = lookupKey
    form.append(input)
  }
  document.body.append(form)
  form.submit()
}

// While the data loads.
export function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

function Tile({ icon, glow }: { icon: typeof SparklesIcon; glow?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 [&_svg]:size-4",
        glow
          ? "bg-brand text-brand-foreground ring-transparent"
          : "bg-muted text-foreground ring-foreground/15"
      )}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} />
    </span>
  )
}

// What each row does when chosen, shown under its price.
function Action({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground group-data-focused/command-item:text-foreground">
      {children}
      <Kbd className="hidden group-data-focused/command-item:inline-flex">
        ↵
      </Kbd>
    </span>
  )
}

// Balance, plans, packs, prices and history in one searchable list: the
// Settings dialog's billing section. `success` is a Stripe checkout return.
export function BillingPanel({
  data,
  success,
  onClose,
}: {
  data: BillingData
  success?: boolean
  onClose?: () => void
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const balance = useBalance()
  const [pending, setPending] = React.useState<string | null>(null)
  const { signedIn, available, subscription, plans, packs, history } = data
  const subscribed = isActive(subscription)
  const sub = "subscriptionId" in subscription ? subscription : null
  const currentPlan = subscribed ? (sub?.plan ?? null) : null
  const canBuy = signedIn && available
  const n = (x: number) => x.toLocaleString(locale)
  const money = (p: { amount: number; currency: string }) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: p.currency,
      minimumFractionDigits: p.amount % 100 ? 2 : 0,
    }).format(p.amount / 100)
  const date = (s: number) =>
    new Date(s * 1000).toLocaleDateString(locale, { dateStyle: "long" })

  const go = (key: string, action: string, lookupKey?: string) => {
    setPending(key)
    post(action, lookupKey)
  }

  const run = (key: React.Key) => {
    const k = String(key)
    const [kind, id] = k.split(":")
    if (kind === "signin") {
      onClose?.()
      return navigate("/login?next=/pricing")
    }
    if (!canBuy) return
    if (kind === "plan") {
      if (subscribed) return go(k, "/api/billing/portal")
      const plan = plans.find((p) => p.id === id)
      if (plan?.price) go(k, "/api/billing/checkout", plan.lookupKey)
    } else if (kind === "pack") {
      const pack = packs.find((p) => p.lookupKey === id)
      if (pack?.price) go(k, "/api/billing/checkout", pack.lookupKey)
    }
  }

  const item =
    "gap-3 rounded-lg! px-2.5 py-2 data-focused:bg-muted/80 data-disabled:opacity-80 [&>svg:last-child]:hidden"

  return (
    <Command className="rounded-none! bg-transparent p-0">
      <div className="border-b px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {t("balance")}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight text-foreground tabular-nums">
                {balance === null ? "–" : n(balance)}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("palette.credits")}
              </span>
            </span>
          </div>
          {signedIn && (
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-foreground/15">
              <HugeiconsIcon
                icon={currentPlan ? Crown02Icon : SparklesIcon}
                strokeWidth={2}
                className="size-3.5 text-brand-ink"
              />
              {currentPlan
                ? t("palette.subNow", { plan: t(`${currentPlan}.name`) })
                : t("palette.freeNow")}
              {sub?.currentPeriodEnd && subscribed && (
                <span className="text-muted-foreground">
                  ·{" "}
                  {sub.cancelAtPeriodEnd
                    ? t("ends", { date: date(sub.currentPeriodEnd) })
                    : t("renews", { date: date(sub.currentPeriodEnd) })}
                </span>
              )}
            </span>
          )}
        </div>
        {success && (
          <p
            role="status"
            className="relative mt-3 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            {t("success")}
          </p>
        )}
        {subscription.status === "past_due" && (
          <p
            role="alert"
            className="relative mt-3 flex items-center gap-2 text-xs text-destructive"
          >
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            {t("pastDue")}
          </p>
        )}
        {!available && (
          <p
            role="alert"
            className="relative mt-3 text-xs text-muted-foreground"
          >
            {t("unavailable")}
          </p>
        )}
      </div>

      {/* A ring when focused, like the app's other fields. */}
      <div className="px-2 pt-2 [&_[data-slot=input-group]]:has-[input:focus-visible]:border-ring [&_[data-slot=input-group]]:has-[input:focus-visible]:ring-3 [&_[data-slot=input-group]]:has-[input:focus-visible]:ring-ring/50 [&_input]:truncate">
        <CommandInput placeholder={t("palette.placeholder")} />
      </div>
      <CommandList
        onAction={run}
        aria-label={t("title")}
        className="max-h-none min-h-0 flex-1 px-1 pb-1"
        renderEmptyState={() => (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("palette.empty")}
          </p>
        )}
      >
        {!signedIn && (
          <CommandGroup>
            <CommandItem
              id="signin"
              textValue={t("palette.signIn")}
              className={item}
            >
              <Tile icon={Login03Icon} />
              <span className="font-medium">{t("palette.signIn")}</span>
              <span className="ms-auto">
                <Action>{t("signInLink")}</Action>
              </span>
            </CommandItem>
          </CommandGroup>
        )}

        <CommandGroup heading={t("palette.plans")}>
          <CommandItem
            id="plan:free"
            textValue={`${t("free.name")} ${t("free.credits")}`}
            isDisabled={!subscribed}
            className={item}
          >
            <Tile icon={Coins01Icon} />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{t("free.name")}</span>
              <span className="truncate text-xs text-muted-foreground">
                {t("free.credits")} · {t("free.note")}
              </span>
            </span>
            <span className="ms-auto flex shrink-0 flex-col items-end whitespace-nowrap">
              <span className="font-semibold tabular-nums">
                {t("free.price")}
              </span>
              {signedIn && !subscribed ? (
                <span className="text-[11px] text-muted-foreground">
                  {t("current")}
                </span>
              ) : (
                <Action>{t("switchPlan")}</Action>
              )}
            </span>
          </CommandItem>
          {plans.map((plan) => {
            const key = `plan:${plan.id}`
            const current = currentPlan === plan.id
            const popular = plan.id === POPULAR && !currentPlan
            return (
              <CommandItem
                key={plan.id}
                id={key}
                textValue={`${t(`${plan.id}.name`)} ${t("monthly", { count: plan.credits, n: n(plan.credits) })}`}
                isDisabled={signedIn && (!available || !plan.price)}
                className={cn(
                  item,
                  popular &&
                    "bg-brand/10 ring-1 ring-brand/40 data-focused:bg-brand/20",
                  current && "ring-1 ring-foreground/20"
                )}
              >
                <Tile
                  icon={plan.id === "pro" ? Crown02Icon : SparklesIcon}
                  glow={popular || current}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 font-medium">
                    {t(`${plan.id}.name`)}
                    {popular && (
                      <CreditsPill>{t("palette.popular")}</CreditsPill>
                    )}
                    {current && (
                      <CreditsPill className="bg-foreground text-background!">
                        {t("current")}
                      </CreditsPill>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t("monthly", { count: plan.credits, n: n(plan.credits) })}{" "}
                    · {t(`${plan.id}.note`)} · {t("rollover")}
                  </span>
                </span>
                <span className="ms-auto flex flex-col items-end">
                  <span className="font-semibold whitespace-nowrap tabular-nums">
                    {plan.price ? money(plan.price) : "–"}
                    {plan.price && (
                      <span className="ms-0.5 text-xs font-normal text-muted-foreground">
                        {t("perMonth")}
                      </span>
                    )}
                  </span>
                  {/* Nothing to do while payments are down. */}
                  {(!signedIn || canBuy) && (
                    <Action>
                      {pending === key && <Spinner className="size-3" />}
                      {current
                        ? t("manage")
                        : subscribed
                          ? t("switchPlan")
                          : t("subscribe")}
                    </Action>
                  )}
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>

        <CommandGroup heading={t("packs")}>
          {packs.map((pack) => {
            const key = `pack:${pack.lookupKey}`
            return (
              <CommandItem
                key={key}
                id={key}
                textValue={t("pack", {
                  count: pack.credits,
                  n: n(pack.credits),
                })}
                isDisabled={signedIn && (!available || !pack.price)}
                className={item}
              >
                <Tile icon={FlashIcon} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium tabular-nums">
                    {t("pack", { count: pack.credits, n: n(pack.credits) })}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {pack.price
                      ? t("perThousand", {
                          price: money({
                            amount: Math.round(
                              (pack.price.amount * 1000) / pack.credits
                            ),
                            currency: pack.price.currency,
                          }),
                        })
                      : t("packsNote")}
                  </span>
                </span>
                <span className="ms-auto flex flex-col items-end">
                  <span className="font-semibold tabular-nums">
                    {pack.price ? money(pack.price) : "–"}
                  </span>
                  {(!signedIn || canBuy) && (
                    <Action>
                      {pending === key && <Spinner className="size-3" />}
                      {t("buy")}
                    </Action>
                  )}
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>

        <CommandGroup heading={t("costs")}>
          {(Object.keys(COSTS) as (keyof typeof COSTS)[]).map((op) => (
            <CommandItem
              key={op}
              id={`cost:${op}`}
              textValue={t(`ops.${op}`)}
              className="gap-3 rounded-lg! px-2.5 py-1.5 [&>svg:last-child]:hidden"
            >
              <span className="min-w-0 truncate text-muted-foreground group-data-focused/command-item:text-foreground">
                {t(`ops.${op}`)}
              </span>
              <span className="ms-auto shrink-0 text-xs tabular-nums">
                {t("cost", { count: COSTS[op], n: n(COSTS[op]) })}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {signedIn && history.length > 0 && (
          <CommandGroup heading={t("history")}>
            {history.map((row, i) => (
              <CommandItem
                key={i}
                id={`log:${i}`}
                textValue={kindLabel(t, row.kind)}
                className="gap-3 rounded-lg! px-2.5 py-1.5 [&>svg:last-child]:hidden"
              >
                <HugeiconsIcon
                  icon={Clock01Icon}
                  strokeWidth={2}
                  className="text-muted-foreground"
                />
                <span className="min-w-0 truncate">
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
                <span
                  className={cn(
                    "ms-auto shrink-0 text-xs tabular-nums",
                    row.delta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  )}
                >
                  {row.delta > 0 ? "+" : "−"}
                  {n(Math.abs(row.delta))}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 pointer-coarse:hidden">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          {t("palette.keys.navigate")}
        </span>
        <span className="flex items-center gap-1 pointer-coarse:hidden">
          <Kbd>↵</Kbd>
          {t("palette.keys.select")}
        </span>
        <span className="flex items-center gap-1 pointer-coarse:hidden">
          <Kbd>esc</Kbd>
          {t("palette.keys.close")}
        </span>
        <span className="ms-auto">{t("refundNote")}</span>
      </div>
    </Command>
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
  "coverage",
  "story_plan",
  "translate",
  "panel_check",
  "continuity_check",
  "asset_idea",
  "edit",
  "vary",
  "inpaint",
  "erase",
  "outpaint",
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
