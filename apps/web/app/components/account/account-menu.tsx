import { Link, useNavigate, useRouteLoaderData, useSubmit } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ComputerIcon,
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
import type { Viewer } from "@/lib/database"
import { messages } from "./account.messages"

const FLAG = "h-3 w-[1.125rem] rounded-[2px] ring-1 ring-foreground/15"
const THEMES = [
  { id: "light", icon: Sun03Icon },
  { id: "dark", icon: Moon02Icon },
  { id: "system", icon: ComputerIcon },
] as const

export function useViewer() {
  return (useRouteLoaderData("root")?.viewer ?? null) as Viewer | null
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
        variant="outline"
        size="icon"
        aria-label={`${t("account.label")}: ${viewer.name}`}
        className="rounded-full text-xs"
      >
        {initials(viewer.name)}
      </Button>
      <DropdownMenu
        placement="bottom end"
        className="w-max max-w-[calc(100vw-2rem)] min-w-52"
        onAction={(key) => {
          if (key === "projects") navigate("/projects")
          if (key === "github") window.open(REPO, "_blank", "noreferrer")
          if (key === "logout")
            submit(null, { method: "post", action: "/logout" })
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col py-1.5">
            <span className="truncate text-sm text-foreground">
              {viewer.name}
            </span>
            <span className="truncate font-normal">{viewer.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem id="projects">
            <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} />
            {t("account.projects")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* Signed in, these replace the header's theme, language and GitHub buttons. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger textValue={tt("theme.label")}>
            <HugeiconsIcon
              icon={theme === "dark" ? Moon02Icon : Sun03Icon}
              strokeWidth={2}
            />
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
            <HugeiconsIcon icon={LanguageSkillIcon} strokeWidth={2} />
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
          <GitHubIcon className="size-4" />
          {tt("github")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem id="logout" variant="destructive">
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
          {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}
