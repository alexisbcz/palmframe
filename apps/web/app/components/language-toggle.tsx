import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { LOCALES, LOCALE_NAMES, isLocale, useLocale, useT } from "@/i18n/core"
import { Flag } from "./flag"
import { messages } from "./toggles.messages"

const FLAG = "h-3 w-[1.125rem] rounded-[2px] ring-1 ring-foreground/15"

export function LanguageToggle() {
  const { locale, setLocale } = useLocale()
  const t = useT(messages)

  return (
    <DropdownMenuTrigger>
      <Button
        variant="outline"
        size="icon"
        aria-label={`${t("language")}: ${LOCALE_NAMES[locale]}`}
      >
        <Flag locale={locale} className={FLAG} />
      </Button>
      <DropdownMenu
        placement="bottom end"
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
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}
