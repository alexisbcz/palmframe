import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { LOCALES, LOCALE_NAMES, isLocale, useLocale, useT } from "@/i18n/core"
import { FLAG_CLASS, Flag } from "./flag"
import { messages } from "./toggles.messages"

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
        <Flag locale={locale} className={FLAG_CLASS} />
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
            <Flag locale={l} className={FLAG_CLASS} />
            <span lang={l}>{LOCALE_NAMES[l]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}
