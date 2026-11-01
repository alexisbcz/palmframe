import { Link, NavLink, Outlet, data } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import { buttonVariants } from "@workspace/ui/components/button"

import { AccountMenu } from "@/components/account/account-menu"
import { messages } from "@/components/tools/tools.messages"
import { useT } from "@/i18n/core"
import { PRIVATE } from "@/lib/seo"
import { requireAnyTool } from "@/lib/tools.server"
import { toolPath } from "@/lib/tools/catalog"

import type { Route } from "./+types/tools"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request }: Route.LoaderArgs) {
  const { enabled, headers } = await requireAnyTool(request)
  return data({ enabled }, { headers })
}

export default function Tools({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between gap-2 border-b px-2.5">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            to="/projects"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              strokeWidth={2}
              data-icon="inline-start"
              className="rtl:rotate-180"
            />
            {t("backToProjects")}
          </Link>
          <nav
            aria-label={t("title")}
            className="flex min-w-0 items-center gap-1 overflow-x-auto"
          >
            {loaderData.enabled.map((id) => (
              <NavLink
                key={id}
                to={toolPath(id)}
                className={({ isActive }) =>
                  cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "shrink-0",
                    isActive && "bg-muted"
                  )
                }
              >
                {t(`${id}.name`)}
              </NavLink>
            ))}
          </nav>
        </div>
        <AccountMenu />
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <Outlet />
      </main>
      <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
        <a
          href="https://desertant.com"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {t("credit")}
        </a>
      </footer>
    </div>
  )
}
