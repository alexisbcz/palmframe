import * as React from "react"
import { Link, Outlet, data, useNavigation } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Cancel01Icon,
  FilterIcon,
  PlusSignIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Kbd } from "@workspace/ui/components/kbd"
import { Sheet, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

import { AccountMenu } from "@/components/account/account-menu"
import { Logo } from "@/components/auth/auth-ui"
import { AssetCard } from "@/components/catalog/card"
import { messages } from "@/components/catalog/catalog.messages"
import { FilterRail, useFilters } from "@/components/catalog/filters"
import {
  NO_FILTERS,
  PAGE_SIZE,
  SORTS,
  readFilters,
} from "@/components/catalog/model"
import { DEFAULT_LOCALE, isLocale, translate, useT } from "@/i18n/core"
import { packCards, searchCatalog } from "@/lib/catalog.server"
import { SITE, seo } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/catalog"

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0] as { loaderData?: { locale?: unknown } })
    ?.loaderData?.locale
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE
  const description = translate(messages, l, "meta.description")
  return [
    ...seo({
      title: `${translate(messages, l, "meta.title")} · Palmframe`,
      description,
      path: "/catalog",
      image: "/og/catalog.png",
      imageAlt: "The Palmframe catalog of characters, places and styles",
    }),
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Palmframe catalog",
        url: `${SITE}/catalog`,
        description,
      },
    },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  const filters = readFilters(new URL(request.url).searchParams)
  return data(
    {
      result: await searchCatalog(supabase, viewer?.id, filters),
      packs: packCards(),
    },
    { headers }
  )
}

// Opening an asset over the grid shouldn't search again.
export const shouldRevalidate = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: {
  currentUrl: URL
  nextUrl: URL
  formMethod?: string
  defaultShouldRevalidate: boolean
}) =>
  formMethod && formMethod !== "GET"
    ? defaultShouldRevalidate
    : currentUrl.search !== nextUrl.search

function SearchBox() {
  const t = useT(messages)
  const [f, set] = useFilters()
  const [text, setText] = React.useState(f.q)
  const input = React.useRef<HTMLInputElement>(null)
  const applied = React.useRef(f.q)
  // Back and forward change the query without typing.
  React.useEffect(() => {
    if (f.q !== applied.current) setText(f.q)
    applied.current = f.q
  }, [f.q])
  React.useEffect(() => {
    if (text === applied.current) return
    const timer = setTimeout(() => {
      applied.current = text
      set({ q: text })
    }, 220)
    return () => clearTimeout(timer)
  }, [text, set])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== "/" || el.closest("input, textarea, [contenteditable]"))
        return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="relative w-full max-w-xl">
      <HugeiconsIcon
        icon={Search01Icon}
        strokeWidth={2}
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={input}
        type="search"
        aria-label={t("search.label")}
        placeholder={t("search.placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="ps-8 pe-8 [&::-webkit-search-cancel-button]:hidden"
      />
      <Kbd className="absolute end-2 top-1/2 -translate-y-1/2 max-md:hidden">
        /
      </Kbd>
    </div>
  )
}

function Kits({
  packs,
}: {
  packs: Route.ComponentProps["loaderData"]["packs"]
}) {
  const t = useT(messages)
  return (
    <section aria-labelledby="kits" className="flex flex-col gap-3">
      <div>
        <h2 id="kits" className="font-semibold">
          {t("kits.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("kits.subtitle")}</p>
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {packs.map((p) => (
          <li key={p.id} className="w-64 shrink-0 snap-start sm:w-72">
            <Link
              to={`/catalog/kits/${p.id}`}
              preventScrollReset
              className="group block overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow outline-none hover:ring-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              <span className="grid h-32 grid-cols-4 gap-px">
                {p.covers.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                ))}
              </span>
              <span className="flex flex-col gap-0.5 p-3">
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {p.name}
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {t("kits.count", { count: p.assets.length })}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {p.blurb}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ActiveFilters() {
  const t = useT(messages)
  const [f, set] = useFilters()
  const chip = (label: string, clear: () => void) => (
    <button
      key={label}
      type="button"
      aria-label={t("filters.remove", { label })}
      className="flex h-7 cursor-pointer items-center gap-1 rounded-full bg-muted ps-2.5 pe-1.5 text-xs transition-colors outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/60"
      onClick={clear}
    >
      {label}
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
    </button>
  )
  const chips = [
    ...(f.q ? [chip(`“${f.q}”`, () => set({ q: "" }))] : []),
    ...f.genres.map((g) =>
      chip(t(`genres.${g}`), () =>
        set({ genres: f.genres.filter((x) => x !== g) })
      )
    ),
    ...(f.color
      ? [chip(t(`colors.${f.color}`), () => set({ color: null }))]
      : []),
    ...(f.source !== "all"
      ? [chip(t(`sources.${f.source}`), () => set({ source: "all" }))]
      : []),
    ...(f.refs ? [chip(t("filters.refs"), () => set({ refs: false }))] : []),
  ]
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips}
      <Button
        variant="ghost"
        size="sm"
        onPress={() =>
          set({ ...NO_FILTERS, sort: f.sort, group: f.group, kind: f.kind })
        }
      >
        {t("filters.clear")}
      </Button>
    </div>
  )
}

export default function Catalog({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { result, packs } = loaderData
  const [f, set] = useFilters()
  const navigation = useNavigation()
  const [filtering, setFiltering] = React.useState(false)
  const pending =
    navigation.state === "loading" &&
    navigation.location.pathname === "/catalog"
  const browsing =
    !f.q &&
    !f.kind &&
    !f.group &&
    !f.genres.length &&
    !f.color &&
    !f.refs &&
    f.source === "all"

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-3 backdrop-blur-md sm:px-4">
        <div className="shrink-0 max-sm:[&_a]:text-[0px]">
          <Logo />
        </div>
        <div className="flex flex-1 justify-center">
          <SearchBox />
        </div>
        <Link
          to="/catalog/create"
          className={cn(buttonVariants(), "shrink-0 max-sm:px-2")}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          <span className="max-sm:sr-only">{t("create.open")}</span>
        </Link>
        <AccountMenu />
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] flex-1">
        <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 border-e lg:block">
          <ScrollArea className="h-full p-3">
            <FilterRail result={result} />
          </ScrollArea>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 sm:px-6">
          {browsing && (
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {t("hero.title")}
              </h1>
              <p className="max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base">
                {t("hero.subtitle")}
              </p>
            </div>
          )}
          {browsing && <Kits packs={packs} />}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden"
                  onPress={() => setFiltering(true)}
                >
                  <HugeiconsIcon icon={FilterIcon} strokeWidth={2} />
                  {t("filters.open")}
                </Button>
                <p
                  aria-live="polite"
                  className="truncate text-sm text-muted-foreground tabular-nums"
                >
                  {t("results", { count: result.total })}
                </p>
              </div>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="sm">
                  {t(`sort.${f.sort}`)}
                </Button>
                <DropdownMenu
                  placement="bottom end"
                  className="w-max min-w-36"
                  selectionMode="single"
                  selectedKeys={[f.sort]}
                  onAction={(key) => set({ sort: key as typeof f.sort })}
                >
                  {SORTS.map((s) => (
                    <DropdownMenuItem key={s} id={s}>
                      {t(`sort.${s}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenu>
              </DropdownMenuTrigger>
            </div>
            <ActiveFilters />

            {result.assets.length ? (
              <div
                aria-busy={pending}
                className={cn(
                  "columns-2 gap-3 transition-opacity duration-150 sm:gap-4 md:columns-3 xl:columns-4 2xl:columns-5",
                  pending && "opacity-60"
                )}
              >
                {result.assets.map((a) => (
                  <AssetCard key={a.id} asset={a} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
                <p className="font-medium">{t("empty.title")}</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {t("empty.body")}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onPress={() => set({ ...NO_FILTERS })}
                  >
                    {t("filters.clear")}
                  </Button>
                  <Link
                    to={`/catalog/create${f.kind ? `?kind=${f.kind}` : ""}`}
                    className={buttonVariants()}
                  >
                    {t("empty.create")}
                  </Link>
                </div>
              </div>
            )}

            {result.total > result.assets.length && (
              <Button
                variant="outline"
                className="self-center"
                onPress={() => set({ limit: f.limit + PAGE_SIZE })}
              >
                {t("more")}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="rotate-90"
                />
              </Button>
            )}
          </div>
        </main>
      </div>

      <Sheet isOpen={filtering} onOpenChange={setFiltering} side="left">
        <SheetHeader>
          <SheetTitle>{t("filters.open")}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-3 pb-4">
          <FilterRail result={result} />
        </ScrollArea>
      </Sheet>
      <Outlet />
    </div>
  )
}
