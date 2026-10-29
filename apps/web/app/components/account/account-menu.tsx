import { Link, useNavigate, useRouteLoaderData, useSubmit } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import {
  ComputerIcon,
  CreditCardIcon,
  FolderLibraryIcon,
  LanguageSkillIcon,
  Logout01Icon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useTheme } from "@workspace/ui/components/theme-provider"

import { Flag } from "@/components/flag"
import { GitHubIcon, REPO } from "@/components/github-button"
import { messages as toggles } from "@/components/toggles.messages"
import { LOCALES, LOCALE_NAMES, isLocale, useLocale, useT } from "@/i18n/core"
import { setCredits, useCredits } from "@/lib/credits-store"
import { PLANS, type PlanId } from "@/lib/credits"
import type { Viewer } from "@/lib/database"
import { messages } from "./account.messages"

const FLAG = "h-3 w-[1.125rem] rounded-[2px] ring-1 ring-foreground/15"
const THEMES = [
  { id: "light", icon: Sun03Icon },
  { id: "dark", icon: Moon02Icon },
  { id: "system", icon: ComputerIcon },
] as const

// The balance from the last page load, kept current by renders afterwards.
export function useBalance() {
  const loaded = useRouteLoaderData("root")?.credits as
    number | null | undefined
  React.useEffect(() => setCredits(loaded ?? null), [loaded])
  return useCredits() ?? loaded ?? null
}

export function usePlan() {
  return (useRouteLoaderData("root")?.plan ?? "free") as PlanId | "free"
}

export function useViewer() {
  return (useRouteLoaderData("root")?.viewer ?? null) as Viewer | null
}

// A stable two-tone gradient per account, so the avatar is recognisable.
function avatarStyle(id: string): React.CSSProperties {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${h} 80% 62%), hsl(${(h + 50) % 360} 75% 48%))`,
  }
}

export function Avatar({
  viewer,
  className,
}: {
  viewer: Viewer
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={avatarStyle(viewer.id)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-foreground/10 [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]",
        className
      )}
    >
      {initials(viewer.name)}
    </span>
  )
}

// Menu icons sit in small tiles, Higgsfield-style.
function Tile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground ring-1 ring-foreground/5 [&_svg]:size-3.5">
      {children}
    </span>
  )
}

// Balance, plan and the next step, as one menu item.
function CreditsCard({
  balance,
  plan,
}: {
  balance: number | null
  plan: PlanId | "free"
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const allowance = plan === "free" ? 100 : PLANS[plan].credits
  const fill =
    balance === null ? 0 : Math.min(1, Math.max(0, balance / allowance))
  const n = (x: number) => x.toLocaleString(locale)
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border bg-muted/40 p-3 transition-colors group-data-focused/dropdown-menu-item:border-foreground/25 group-data-focused/dropdown-menu-item:bg-muted/70">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {t("credits.label")}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-wide uppercase italic",
            plan === "free"
              ? "bg-foreground/10 text-muted-foreground"
              : "bg-gradient-to-r from-amber-300 to-orange-500 text-black"
          )}
        >
          {t(`credits.plans.${plan}`)}
        </span>
      </div>
      <span className="text-2xl leading-none font-semibold tabular-nums">
        {balance === null ? "–" : n(balance)}
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500"
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </span>
      <span className="text-xs text-muted-foreground">
        {plan === "free"
          ? t("credits.allowanceFree")
          : t("credits.allowance", { n: n(allowance) })}
      </span>
      <span
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full bg-background"
        )}
      >
        {plan === "free" ? t("credits.upgrade") : t("credits.buy")}
      </span>
    </div>
  )
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  )
}

export function AccountMenu() {
  const t = useT(messages)
  const tt = useT(toggles)
  const viewer = useViewer()
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const balance = useBalance()
  const plan = usePlan()
  const navigate = useNavigate()
  const submit = useSubmit()

  if (!viewer)
    return (
      <Link
        to="/login?next=/projects"
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        {t("account.signIn")}
      </Link>
    )

  return (
    <DropdownMenuTrigger>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${t("account.label")}: ${viewer.name}`}
        className="rounded-full p-0"
      >
        <Avatar viewer={viewer} className="size-8 text-xs" />
      </Button>
      <DropdownMenu
        placement="bottom end"
        className="w-72 max-w-[calc(100vw-2rem)]"
        onAction={(key) => {
          if (key === "projects") navigate("/projects")
          if (key === "billing" || key === "pricing") navigate("/pricing")
          if (key === "github") window.open(REPO, "_blank", "noreferrer")
          if (key === "logout")
            submit(null, { method: "post", action: "/logout" })
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 px-1.5 py-2">
            <Avatar viewer={viewer} className="size-9 text-sm" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm text-foreground">
                {viewer.name}
              </span>
              <span className="truncate font-normal">{viewer.email}</span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuItem
            id="billing"
            textValue={`${t("account.billing")}: ${
              balance === null
                ? ""
                : t("credits.balance", {
                    count: balance,
                    n: balance.toLocaleString(locale),
                  })
            }`}
            className="mb-1 p-0 focus:bg-transparent"
          >
            <CreditsCard balance={balance} plan={plan} />
          </DropdownMenuItem>
          <DropdownMenuItem id="pricing" textValue={t("account.billing")}>
            <Tile>
              <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} />
            </Tile>
            {t("account.billing")}
          </DropdownMenuItem>
          <DropdownMenuItem id="projects" textValue={t("account.projects")}>
            <Tile>
              <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} />
            </Tile>
            {t("account.projects")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* Signed in, these replace the header's theme, language and GitHub buttons. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger textValue={tt("theme.label")}>
            <Tile>
              <HugeiconsIcon
                icon={theme === "dark" ? Moon02Icon : Sun03Icon}
                strokeWidth={2}
              />
            </Tile>
            {tt("theme.label")}
            <span className="ms-auto ps-3 text-xs text-muted-foreground">
              {tt(
                `theme.${theme === "light" || theme === "dark" ? theme : "system"}`
              )}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="w-36"
            selectionMode="single"
            selectedKeys={theme ? [theme] : []}
            onAction={(key) => setTheme(String(key))}
          >
            {THEMES.map(({ id, icon }) => (
              <DropdownMenuItem key={id} id={id}>
                <HugeiconsIcon icon={icon} strokeWidth={2} />
                {tt(`theme.${id}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger textValue={tt("language")}>
            <Tile>
              <HugeiconsIcon icon={LanguageSkillIcon} strokeWidth={2} />
            </Tile>
            {tt("language")}
            <span className="ms-auto ps-3 text-xs text-muted-foreground">
              {LOCALE_NAMES[locale]}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="w-40"
            selectionMode="single"
            selectedKeys={[locale]}
            onAction={(key) => isLocale(key) && setLocale(key)}
          >
            {LOCALES.map((l) => (
              <DropdownMenuItem key={l} id={l} textValue={LOCALE_NAMES[l]}>
                <Flag locale={l} className={FLAG} />
                <span lang={l}>{LOCALE_NAMES[l]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem id="github" textValue={tt("github")}>
          <Tile>
            <GitHubIcon />
          </Tile>
          {tt("github")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem id="logout" variant="destructive">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-destructive/10 [&_svg]:size-3.5">
            <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
          </span>
          {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}
