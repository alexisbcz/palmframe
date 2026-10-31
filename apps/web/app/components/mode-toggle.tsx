import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { useTheme } from "@workspace/ui/components/theme-provider"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { useT } from "@/i18n/core"
import { messages } from "./toggles.messages"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const t = useT(messages)

  return (
    <DropdownMenuTrigger>
      <TooltipTrigger>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("theme.toggle")}
          className="relative"
        >
          <HugeiconsIcon
            icon={Sun03Icon}
            strokeWidth={2}
            className="scale-100 rotate-0 transition-[scale,rotate] duration-150 ease-out dark:scale-0 dark:-rotate-90"
          />
          <HugeiconsIcon
            icon={Moon02Icon}
            strokeWidth={2}
            className="absolute scale-0 rotate-90 transition-[scale,rotate] duration-150 ease-out dark:scale-100 dark:rotate-0"
          />
        </Button>
        <Tooltip>{t("theme.toggle")}</Tooltip>
      </TooltipTrigger>
      <DropdownMenu
        placement="bottom end"
        className="w-36"
        selectionMode="single"
        selectedKeys={theme ? [theme] : []}
        onAction={(key) => setTheme(String(key))}
      >
        <DropdownMenuItem id="light">
          <HugeiconsIcon icon={Sun03Icon} strokeWidth={2} />
          {t("theme.light")}
        </DropdownMenuItem>
        <DropdownMenuItem id="dark">
          <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} />
          {t("theme.dark")}
        </DropdownMenuItem>
        <DropdownMenuItem id="system">
          <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} />
          {t("theme.system")}
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}
