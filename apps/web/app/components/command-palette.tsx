import * as React from "react"
import { useNavigate, useSubmit } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ComputerIcon,
  CreditCardIcon,
  FileAddIcon,
  FolderLibraryIcon,
  GridViewIcon,
  Login03Icon,
  Logout01Icon,
  Moon02Icon,
  Settings01Icon,
  Sun03Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons"

import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@workspace/ui/components/command"
import { useTheme } from "@workspace/ui/components/theme-provider"

import { useViewer } from "@/components/account/account-menu"
import { Flag } from "@/components/flag"
import { GitHubIcon, REPO } from "@/components/github-button"
import {
  SETTINGS_SHORTCUT,
  openSettings,
} from "@/components/settings/settings-dialog"
import { messages as toggles } from "@/components/toggles.messages"
import { LOCALES, LOCALE_NAMES, isLocale, useLocale, useT } from "@/i18n/core"
import { messages } from "./command-palette.messages"

const FLAG = "h-3 w-[1.125rem] rounded-[2px] ring-1 ring-foreground/15"

// ⌘K (or Ctrl+K, with or without Shift) anywhere.
export function CommandPalette() {
  const t = useT(messages)
  const tt = useT(toggles)
  const viewer = useViewer()
  const navigate = useNavigate()
  const submit = useSubmit()
  const { setTheme } = useTheme()
  const { setLocale } = useLocale()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const run = (key: React.Key) => {
    setOpen(false)
    const k = String(key)
    if (k.startsWith("theme:")) return setTheme(k.slice(6))
    if (k.startsWith("lang:")) {
      const lang = k.slice(5)
      return isLocale(lang) && setLocale(lang)
    }
    switch (k) {
      case "pricing":
        return openSettings("billing")
      case "settings":
        return openSettings()
      case "projects":
        return navigate("/projects")
      case "catalog":
        return navigate("/catalog")
      case "new":
        return viewer
          ? submit({ intent: "new" }, { method: "post", action: "/projects" })
          : navigate("/")
      case "github":
        return void window.open(REPO, "_blank", "noreferrer")
      case "signin":
        return navigate("/login")
      case "signup":
        return navigate("/signup")
      case "signout":
        return submit(null, { method: "post", action: "/logout" })
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("title")}
      description={t("description")}
      className="sm:max-w-lg"
    >
      <Command>
        <CommandInput placeholder={t("placeholder")} />
        <CommandList
          onAction={run}
          className="max-h-96"
          renderEmptyState={() => (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          )}
        >
          <CommandGroup heading={t("groups.go")}>
            {viewer && (
              <CommandItem id="projects" textValue={t("projects")}>
                <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} />
                {t("projects")}
              </CommandItem>
            )}
            <CommandItem id="catalog" textValue={t("catalog")}>
              <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
              {t("catalog")}
            </CommandItem>
            <CommandItem id="new" textValue={t("newCarousel")}>
              <HugeiconsIcon icon={FileAddIcon} strokeWidth={2} />
              {t("newCarousel")}
            </CommandItem>
            <CommandItem id="pricing" textValue={t("pricing")}>
              <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} />
              {t("pricing")}
            </CommandItem>
            {viewer && (
              <CommandItem id="settings" textValue={t("settings")}>
                <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
                {t("settings")}
                <CommandShortcut>{SETTINGS_SHORTCUT}</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem id="github" textValue={t("github")}>
              <GitHubIcon className="size-4" />
              {t("github")}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t("groups.prefs")}>
            {(
              [
                ["light", Sun03Icon],
                ["dark", Moon02Icon],
                ["system", ComputerIcon],
              ] as const
            ).map(([id, icon]) => (
              <CommandItem
                key={id}
                id={`theme:${id}`}
                textValue={t("theme", { name: tt(`theme.${id}`) })}
              >
                <HugeiconsIcon icon={icon} strokeWidth={2} />
                {t("theme", { name: tt(`theme.${id}`) })}
              </CommandItem>
            ))}
            {LOCALES.map((l) => (
              <CommandItem
                key={l}
                id={`lang:${l}`}
                textValue={`${t("language", { name: LOCALE_NAMES[l] })} ${l}`}
              >
                <Flag locale={l} className={FLAG} />
                {t("language", { name: LOCALE_NAMES[l] })}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading={t("groups.account")}>
            {viewer ? (
              <CommandItem
                id="signout"
                textValue={t("signOut")}
                className="text-destructive"
              >
                <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
                {t("signOut")}
              </CommandItem>
            ) : (
              <>
                <CommandItem id="signin" textValue={t("signIn")}>
                  <HugeiconsIcon icon={Login03Icon} strokeWidth={2} />
                  {t("signIn")}
                </CommandItem>
                <CommandItem id="signup" textValue={t("signUp")}>
                  <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} />
                  {t("signUp")}
                </CommandItem>
              </>
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
