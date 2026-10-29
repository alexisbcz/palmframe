import * as React from "react"

// A small typed i18n: each feature keeps its messages next to its code
// (`defineMessages`), English is the source of truth, and the type checker
// refuses a locale that misses or adds a key.
export const LOCALES = ["en", "fr", "es", "de", "it"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_COOKIE = "palmframe-lang"

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
}

// A leaf is a string with optional {placeholders}, or plural forms picked
// with Intl.PluralRules from the `count` variable.
export type Plural = { zero?: string; one?: string; other: string }
type Leaf = string | Plural
export type Dict = { [key: string]: Leaf | Dict }

type Shape<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Plural
      ? Plural
      : Shape<T[K]>
}

export type MessagePath<T> = {
  [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${MessagePath<T[K]>}`
}[keyof T & string]

export type Messages<T extends Dict> = { en: T } & {
  [L in Exclude<Locale, "en">]: Shape<T>
}

export function defineMessages<const T extends Dict>(messages: Messages<T>) {
  return messages
}

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale)
}

// Cookie first (the user's choice), then the browser's Accept-Language.
export function detectLocale(request: Request): Locale {
  const cookie = request.headers.get("cookie") ?? ""
  const chosen = cookie.match(new RegExp(`${LOCALE_COOKIE}=([a-z]{2})`))?.[1]
  if (isLocale(chosen)) return chosen
  const accepted = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=")
      return { lang: tag!.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)
  return accepted.map((a) => a.lang).find(isLocale) ?? DEFAULT_LOCALE
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const I18nContext = React.createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
})

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = React.useState(initialLocale)
  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = next
  }, [])
  const value = React.useMemo(
    () => ({ locale, setLocale }),
    [locale, setLocale]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useLocale() {
  return React.useContext(I18nContext)
}

const pluralRules = new Map<Locale, Intl.PluralRules>()

export function translate<T extends Dict>(
  messages: Messages<T>,
  locale: Locale,
  path: MessagePath<T>,
  vars?: Record<string, string | number>
): string {
  const find = (dict: Dict) =>
    path
      .split(".")
      .reduce<Leaf | Dict | undefined>(
        (node, key) =>
          node && typeof node === "object" && !("other" in node)
            ? (node as Dict)[key]
            : undefined,
        dict
      )
  let leaf = find(messages[locale] as Dict) ?? find(messages.en)
  if (leaf && typeof leaf === "object") {
    const plural = leaf as Plural
    const count = Number(vars?.count ?? 0)
    if (count === 0 && plural.zero !== undefined) leaf = plural.zero
    else {
      let rules = pluralRules.get(locale)
      if (!rules)
        pluralRules.set(locale, (rules = new Intl.PluralRules(locale)))
      const form = rules.select(count) as keyof Plural
      leaf = plural[form] ?? plural.other
    }
  }
  if (typeof leaf !== "string") return path
  return vars
    ? leaf.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match
      )
    : leaf
}

// `const t = useT(messages)` then `t("menu.open")` or `t("slides", { count })`.
export function useT<T extends Dict>(messages: Messages<T>) {
  const { locale } = useLocale()
  return React.useCallback(
    (path: MessagePath<T>, vars?: Record<string, string | number>) =>
      translate(messages, locale, path, vars),
    [messages, locale]
  )
}

export type Translate<T extends Dict> = ReturnType<typeof useT<T>>
