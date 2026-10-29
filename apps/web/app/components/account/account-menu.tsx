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
  CommandIcon,
  Moon02Icon,
  Settings01Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
import { openBilling } from "@/components/billing/billing-palette"
import { setCredits, useCredits } from "@/lib/credits-store"
import type { PlanId } from "@/lib/credits"
import type { Viewer } from "@/lib/database"
import { messages } from "./account.messages"

const MOD =
  typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform)
    ? "⌘"
    : "Ctrl "
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

// True when the person's OpenRouter account pays for renders, edits and
// story plans; credits then only pay for the local tools.
export function useOpenRouter() {
  return !!useRouteLoaderData("root")?.openrouter
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
      style={viewer.avatarUrl ? undefined : avatarStyle(viewer.id)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-foreground/10 [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]",
        className
      )}
    >
      {viewer.avatarUrl ? (
        <img
          src={viewer.avatarUrl}
          alt=""
          className="size-full rounded-full object-cover"
        />
      ) : (
        initials(viewer.name)
      )}
    </span>
  )
}

// The balance as a slanted badge, Higgsfield-style, in the app's amber.
function CreditsPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="ms-auto inline-flex shrink-0 -skew-x-[8deg] items-center rounded-[5px] bg-amber-400 px-1.5 py-px text-xs font-extrabold whitespace-nowrap text-amber-950! italic tabular-nums">
      {children}
    </span>
  )
}

// Menu icons sit in small tiles, Higgsfield-style.
function Tile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground ring-1 ring-foreground/15 dark:ring-foreground/20 [&_svg]:size-3.5">
      {children}
    </span>
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
        // Roomier rows than the default menu: this one is read, not scanned.
        className="w-80 max-w-[calc(100vw-2rem)] **:data-[slot=dropdown-menu-item]:gap-2.5 **:data-[slot=dropdown-menu-item]:py-2 **:data-[slot=dropdown-menu-sub-trigger]:gap-2.5 **:data-[slot=dropdown-menu-sub-trigger]:py-2 **:[[role=menu]]:flex **:[[role=menu]]:flex-col **:[[role=menu]]:gap-0.5"
        onAction={(key) => {
          if (key === "projects") navigate("/projects")
          if (key === "billing") openBilling()
          if (key === "settings") navigate("/settings")
          if (key === "commands")
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true })
            )
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
          <DropdownMenuItem id="billing" textValue={t("account.billing")}>
            <Tile>
              <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} />
            </Tile>
            <span className="min-w-0 truncate">{t("account.billing")}</span>
            {balance !== null && (
              <CreditsPill>
                {t("credits.balance", {
                  count: balance,
                  n: balance.toLocaleString(locale),
                })}
              </CreditsPill>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem id="projects" textValue={t("account.projects")}>
            <Tile>
              <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} />
            </Tile>
            {t("account.projects")}
          </DropdownMenuItem>
          <DropdownMenuItem id="settings" textValue={t("account.settings")}>
            <Tile>
              <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
            </Tile>
            {t("account.settings")}
            <DropdownMenuShortcut>{MOD},</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem id="commands" textValue={t("account.commands")}>
            <Tile>
              <HugeiconsIcon icon={CommandIcon} strokeWidth={2} />
            </Tile>
            {t("account.commands")}
            <DropdownMenuShortcut>{MOD}K</DropdownMenuShortcut>
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
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-destructive/10 ring-1 ring-destructive/25 [&_svg]:size-3.5">
            <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
          </span>
          {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}
