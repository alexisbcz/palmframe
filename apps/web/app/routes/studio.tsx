import * as React from "react"
import {
  Link,
  NavLink,
  Outlet,
  redirect,
  useMatches,
  useRouteLoaderData,
} from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  BookOpen02Icon,
  CheckmarkCircle02Icon,
  FilmRoll01Icon,
  Fire02Icon,
  Home01Icon,
  MegaphoneIcon,
  NewsIcon,
  PaintBoardIcon,
  RadioIcon,
  ShoppingBag01Icon,
  SidebarLeft01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"

import { AccountMenu, useBalance } from "@/components/account/account-menu"
import { CreditsPill } from "@/components/account/credits-pill"
import { openSettings } from "@/components/settings/settings-dialog"
import { useLocale, useT } from "@/i18n/core"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio"
import { messages } from "./studio.messages"

export const handle = { studio: true }

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  const next = new URL(request.url).pathname
  if (!viewer) throw redirect(`/login?next=${next}`, { headers })
  // The switch lives in Settings: without it, Studio isn't there.
  if (!viewer.labs.machines)
    throw redirect("/projects?settings=labs", { headers })
  const count = (
    table: "comic_brand_kits" | "comic_studio_boards" | "comic_machines"
  ) =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .then((r) => r.count ?? 0)
  const [brands, boards, machines, comics] = await Promise.all([
    count("comic_brand_kits"),
    count("comic_studio_boards"),
    count("comic_machines"),
    supabase
      .from("comic_studio_boards")
      .select("id", { count: "exact", head: true })
      .not("project_id", "is", null)
      .then((r) => r.count ?? 0),
  ])
  const rail = /(?:^|;\s*)studio_rail=1(?:;|$)/.test(
    request.headers.get("cookie") ?? ""
  )
  return { progress: { brands, boards, machines, comics }, rail }
}

export type StudioData = Awaited<ReturnType<typeof loader>>

export const useStudio = () =>
  useRouteLoaderData("routes/studio") as StudioData | undefined

const NAV = [
  { to: "/studio", key: "home", icon: Home01Icon, end: true },
  { to: "/studio/brand", key: "brand", icon: PaintBoardIcon },
  { to: "/studio/ads", key: "ads", icon: MegaphoneIcon },
  { to: "/studio/trends", key: "trends", icon: Fire02Icon },
  { to: "/studio/teardown", key: "teardown", icon: Video01Icon },
  { to: "/studio/product", key: "product", icon: ShoppingBag01Icon },
  { to: "/studio/media", key: "media", icon: NewsIcon },
  { to: "/studio/books", key: "books", icon: BookOpen02Icon },
  { to: "/studio/anime", key: "anime", icon: FilmRoll01Icon },
  { to: "/machines", key: "machines", icon: RadioIcon },
] as const

// In a cookie, so the server renders the sidebar as it was left.
function useRail(initial: boolean) {
  const [rail, setRail] = React.useState(initial)
  const toggle = () => {
    const next = !rail
    setRail(next)
    document.cookie = `studio_rail=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`
  }
  return [rail, toggle] as const
}

function GetStarted({ progress }: { progress: StudioData["progress"] }) {
  const t = useT(messages)
  const steps = [
    { key: "brand", done: progress.brands > 0 },
    { key: "board", done: progress.boards > 0 },
    { key: "comic", done: progress.comics > 0 },
    { key: "machine", done: progress.machines > 0 },
  ] as const
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null
  return (
    <div className="rounded-xl bg-background/60 p-3 max-md:hidden">
      <div className="flex items-center justify-between gap-2 text-sm font-medium">
        {t("start.title")}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {t("start.count", { done, total: steps.length })}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5 text-xs">
        {steps.map((s) => (
          <li
            key={s.key}
            className={cn(
              "flex items-center gap-2",
              s.done && "text-muted-foreground line-through"
            )}
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              className={cn(
                "size-4 shrink-0",
                s.done ? "text-brand" : "text-muted-foreground/40"
              )}
            />
            {t(`start.${s.key}`)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Balance() {
  const t = useT(messages)
  const { locale } = useLocale()
  const balance = useBalance()
  return (
    <div className="rounded-xl bg-linear-to-b from-background/60 to-brand/25 p-3 max-md:hidden">
      <p className="flex items-center justify-between gap-2 text-sm font-medium">
        {t("balance")}
        {balance !== null && (
          <CreditsPill>{balance.toLocaleString(locale)}</CreditsPill>
        )}
      </p>
      <Button
        size="sm"
        onPress={() => openSettings("billing")}
        className="mt-2 w-full bg-white text-black hover:bg-white/90"
      >
        {t("topUp")}
      </Button>
    </div>
  )
}

export default function Studio({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const [rail, toggleRail] = useRail(loaderData.rail)
  const railLabel = rail ? t("expand") : t("collapse")
  // A workspace that needs the whole pane asks for it from its route.
  const bleed = useMatches().some(
    (m) => (m.handle as { bleed?: boolean } | undefined)?.bleed
  )
  return (
    <div className="dark studio flex min-h-svh flex-col gap-2 p-2 md:h-svh md:flex-row">
      <aside
        className={cn(
          "flex min-w-0 shrink-0 flex-col gap-3 overflow-hidden rounded-2xl bg-card p-3 transition-[width] duration-200 ease-out motion-reduce:transition-none",
          rail ? "md:w-16" : "md:w-64"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-1",
            rail && "md:flex-col-reverse md:px-0"
          )}
        >
          <Link
            to="/studio"
            className={cn(
              "studio-title -my-2 py-2 text-xl",
              rail && "md:hidden"
            )}
          >
            {t("brandName")}
          </Link>
          <div
            className={cn(
              "flex items-center gap-1",
              rail && "md:flex-col-reverse md:gap-2"
            )}
          >
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={railLabel}
              aria-expanded={!rail}
              onPress={toggleRail}
              className="max-md:hidden"
            >
              <HugeiconsIcon
                icon={SidebarLeft01Icon}
                strokeWidth={2}
                className="rtl:-scale-x-100"
              />
            </Button>
            <AccountMenu />
          </div>
        </div>
        <nav
          aria-label={t("brandName")}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-1 md:flex-col md:overflow-y-auto md:px-0"
        >
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={"end" in n}
              title={rail ? t(`nav.${n.key}`) : undefined}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-foreground/10 font-medium"
                    : "text-muted-foreground hover:bg-foreground/5"
                )
              }
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground ring-1 ring-foreground/15 [&_svg]:size-4">
                <HugeiconsIcon icon={n.icon} strokeWidth={2} />
              </span>
              <span className={cn(rail && "md:sr-only")}>
                {t(`nav.${n.key}`)}
              </span>
            </NavLink>
          ))}
        </nav>
        {!rail && (
          <>
            <Balance />
            <GetStarted progress={loaderData.progress} />
          </>
        )}
        <Link
          to="/projects"
          aria-label={t("back")}
          title={rail ? t("back") : undefined}
          className={cn(
            "flex items-center gap-2 px-1.5 py-2 text-sm text-muted-foreground hover:text-foreground max-md:hidden",
            rail && "justify-center"
          )}
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="size-4 rtl:rotate-180"
          />
          <span className={cn(rail && "sr-only")}>{t("back")}</span>
        </Link>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto rounded-2xl bg-background">
        {bleed ? (
          <Outlet />
        ) : (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-10">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  )
}
