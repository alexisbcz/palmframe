import * as React from "react"
import { useFetcher, useSearchParams, useSubmit } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ApiIcon,
  CreditCardIcon,
  LockPasswordIcon,
  Logout01Icon,
  PaintBoardIcon,
  PlugSocketIcon,
  SearchIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"
import { Heading } from "react-aria-components"

import { Button } from "@workspace/ui/components/button"
import { Dialog } from "@workspace/ui/components/dialog"
import { Kbd } from "@workspace/ui/components/kbd"

import {
  Avatar,
  useBalance,
  useViewer,
} from "@/components/account/account-menu"
import { ApiKeys } from "@/components/account/api-keys"
import { messages as apiMessages } from "@/components/account/api-keys.messages"
import { OpenRouter } from "@/components/account/openrouter"
import { messages as openRouterMessages } from "@/components/account/openrouter.messages"
import { useLocale, useT } from "@/i18n/core"
import type { BillingData } from "@/routes/api.billing"
import { messages as billingMessages } from "@/routes/pricing.messages"

import { BillingPanel, BillingSkeleton } from "./billing"
import { AccountSection, PreferencesSection, ProfileSection } from "./sections"
import { messages } from "./settings.messages"

export type SettingsSection =
  "profile" | "account" | "prefs" | "billing" | "openrouter" | "api"

const SECTIONS: SettingsSection[] = [
  "profile",
  "account",
  "prefs",
  "billing",
  "openrouter",
  "api",
]
const isSection = (s: unknown): s is SettingsSection =>
  SECTIONS.includes(s as SettingsSection)

const OPEN = "palmframe:settings"
// Opens Settings from anywhere: menus, buttons, palettes. Without a section
// it opens where it was last left.
export const openSettings = (section?: SettingsSection) =>
  window.dispatchEvent(new CustomEvent(OPEN, { detail: section }))

const MAC =
  typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform)
export const SETTINGS_SHORTCUT = MAC ? "⌘⇧P" : "Ctrl+Shift+P"

const ICONS = {
  profile: UserCircleIcon,
  account: LockPasswordIcon,
  prefs: PaintBoardIcon,
  billing: CreditCardIcon,
  openrouter: PlugSocketIcon,
  api: ApiIcon,
} satisfies Record<SettingsSection, unknown>

const GROUPS = [
  { id: "you", sections: ["profile", "account", "prefs"] },
  { id: "billing", sections: ["billing"] },
  { id: "connections", sections: ["openrouter", "api"] },
] as const

// Folds accents and case, so "credits" finds "Crédits".
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

// Settings, billing and connections in one large dialog over the app:
// ⌘⇧P (Ctrl+Shift+P) or ⌘, anywhere, the account menu, the ⌘K palette, or
// an address with ?settings=<section> (what /settings and /pricing send to).
export function SettingsDialog() {
  const t = useT(messages)
  const tb = useT(billingMessages)
  const to = useT(openRouterMessages)
  const ta = useT(apiMessages)
  const { locale } = useLocale()
  const viewer = useViewer()
  const balance = useBalance()
  const submit = useSubmit()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = React.useState(false)
  const [section, setSection] = React.useState<SettingsSection>("profile")
  const [query, setQuery] = React.useState("")
  // How a trip away ended (Stripe checkout, OpenRouter sign-in), shown once.
  const [flash, setFlash] = React.useState<{
    status?: string | null
    openrouter?: string | null
  }>({})
  const billing = useFetcher<BillingData>()
  const { load } = billing

  const allowed = React.useMemo<SettingsSection[]>(
    () => (viewer ? SECTIONS : ["prefs", "billing"]),
    [viewer]
  )
  const show = React.useCallback(
    (next?: SettingsSection | null) => {
      setQuery("")
      setSection((s) => {
        const want = next ?? s
        return allowed.includes(want) ? want : allowed[0]!
      })
      setOpen(true)
    },
    [allowed]
  )

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault()
        if (open) setOpen(false)
        else show()
      } else if (e.key === "," && !e.shiftKey && viewer) {
        e.preventDefault()
        show("profile")
      }
    }
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail
      show(isSection(detail) ? detail : null)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN, onOpen)
    }
  }, [open, show, viewer])

  // ?settings=billing&status=success and the like: open there, then tidy
  // the address so a reload doesn't reopen it.
  const asked = params.get("settings")
  React.useEffect(() => {
    if (!asked) return
    setFlash({
      status: params.get("status"),
      openrouter: params.get("openrouter"),
    })
    show(isSection(asked) ? asked : null)
    setParams(
      (p) => {
        p.delete("settings")
        p.delete("status")
        p.delete("openrouter")
        return p
      },
      { replace: true, preventScrollReset: true }
    )
  }, [asked, params, setParams, show])

  React.useEffect(() => {
    if (open && section === "billing") void load("/api/billing")
  }, [open, section, load])

  // On phones the sections are a row of tabs; keep the current one in view.
  const navRef = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    navRef.current
      ?.querySelector("[aria-current=page]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [open, section])

  const label = (s: SettingsSection) =>
    s === "billing"
      ? tb("title")
      : s === "openrouter"
        ? to("title")
        : s === "api"
          ? ta("title")
          : t(`${s}.title`)
  const description = (s: SettingsSection) => t(`nav.${s}`)
  // Each section is found by its name, its description and what's in it.
  const keywords: Record<SettingsSection, string[]> = {
    profile: [t("profile.avatar"), t("profile.name")],
    account: [t("account.email"), t("account.password")],
    prefs: [t("prefs.theme"), t("prefs.language")],
    billing: [
      t("billing.title"),
      t("billing.balance"),
      tb("packs"),
      tb("costs"),
      tb("history"),
      t("billing.plans.creator"),
      t("billing.plans.pro"),
    ],
    openrouter: [to("pay"), to("imageModel"), to("textModel"), "key"],
    api: [ta("name"), "MCP", "key", "token"],
  }
  const q = fold(query.trim())
  const matches = allowed.filter(
    (s) =>
      !q ||
      [label(s), description(s), ...keywords[s]].some((w) =>
        fold(w).includes(q)
      )
  )

  const close = () => {
    setOpen(false)
    setFlash({})
  }

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      className="h-[min(46rem,calc(100svh-2rem))] gap-0 overflow-hidden p-0 sm:max-w-5xl"
    >
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <aside className="flex min-w-0 shrink-0 flex-col gap-3 border-b bg-muted/40 p-3 md:w-64 md:border-e md:border-b-0 dark:bg-background/40">
          <div className="flex items-center justify-between gap-2 px-1 pe-8 md:pe-1">
            <Heading slot="title" className="text-base font-semibold">
              {t("title")}
            </Heading>
            <span className="hidden items-center gap-0.5 md:flex">
              <Kbd>{SETTINGS_SHORTCUT}</Kbd>
            </span>
          </div>

          {viewer && (
            <button
              type="button"
              onClick={() => setSection("billing")}
              className="flex items-center gap-2.5 rounded-lg p-1.5 text-start outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50 max-md:hidden"
            >
              <Avatar viewer={viewer} className="size-9 text-sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {viewer.name}
                </span>
                <span className="truncate text-xs text-muted-foreground tabular-nums">
                  {balance === null
                    ? viewer.email
                    : tb("pack", {
                        count: balance,
                        n: balance.toLocaleString(locale),
                      })}
                </span>
              </span>
            </button>
          )}

          <label className="flex h-8 items-center gap-2 rounded-lg border border-input bg-background px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <input
              type="search"
              // Not on touch screens, where it would raise the keyboard.
              autoFocus={
                typeof window !== "undefined" &&
                matchMedia("(pointer: fine)").matches
              }
              value={query}
              placeholder={t("nav.search")}
              aria-label={t("nav.search")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) setSection(matches[0])
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
          </label>

          <nav
            ref={navRef}
            aria-label={t("title")}
            className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-1 md:flex-col md:gap-3 md:overflow-y-auto md:px-0"
          >
            {!matches.length && (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">
                {t("nav.empty")}
              </p>
            )}
            {GROUPS.map((g) => {
              const items = g.sections.filter((s) => matches.includes(s))
              if (!items.length) return null
              return (
                <div key={g.id} className="flex gap-1 md:flex-col md:gap-0.5">
                  <span className="hidden px-1.5 pb-1 text-[11px] font-medium text-muted-foreground md:block">
                    {t(`nav.groups.${g.id}`)}
                  </span>
                  {items.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-current={s === section ? "page" : undefined}
                      onClick={() => setSection(s)}
                      className={cn(
                        "flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-start text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        s === section
                          ? "bg-foreground/10 font-medium"
                          : "text-muted-foreground hover:bg-foreground/5"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md ring-1 [&_svg]:size-3.5",
                          s === "billing"
                            ? "bg-brand text-brand-foreground ring-transparent"
                            : "bg-muted text-foreground ring-foreground/15 dark:ring-foreground/20"
                        )}
                      >
                        <HugeiconsIcon icon={ICONS[s]} strokeWidth={2} />
                      </span>
                      {label(s)}
                    </button>
                  ))}
                </div>
              )
            })}
          </nav>

          {viewer && (
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-destructive max-md:hidden"
              onPress={() =>
                submit(null, { method: "post", action: "/logout" })
              }
            >
              <HugeiconsIcon
                icon={Logout01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("signOut")}
            </Button>
          )}
        </aside>

        <section
          key={section}
          aria-label={label(section)}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {section === "billing" ? (
            billing.data ? (
              <BillingPanel
                data={billing.data}
                success={flash.status === "success"}
                onClose={close}
              />
            ) : (
              <BillingSkeleton />
            )
          ) : (
            <>
              <header className="border-b px-6 pt-5 pb-4">
                <h3 className="text-lg font-semibold">{label(section)}</h3>
                <p className="text-sm text-muted-foreground">
                  {description(section)}
                </p>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <div className="max-w-xl">
                  {section === "profile" && viewer && (
                    <ProfileSection viewer={viewer} />
                  )}
                  {section === "account" && viewer && (
                    <AccountSection viewer={viewer} />
                  )}
                  {section === "prefs" && <PreferencesSection />}
                  {section === "openrouter" && (
                    <OpenRouter result={flash.openrouter} />
                  )}
                  {section === "api" && <ApiKeys />}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </Dialog>
  )
}
