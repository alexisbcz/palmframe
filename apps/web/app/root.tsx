import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  data,
  isRouteErrorResponse,
  useRouteLoaderData,
} from "react-router"

import { ThemeProvider } from "@workspace/ui/components/theme-provider"

import type { Route } from "./+types/root"
import { DEFAULT_LOCALE, I18nProvider, detectLocale } from "./i18n/core"
import { CommandPalette } from "./components/command-palette"
import { isActive, type PlanId } from "./lib/credits"
import { payingConnection } from "./lib/openrouter.server"
import { getViewer, supabaseEnv } from "./lib/supabase.server"
import "@workspace/ui/globals.css"

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/icon.svg", type: "image/svg+xml", sizes: "any" },
]

// The publishable key is meant for browsers; row-level security guards the data.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, supabase, headers } = await getViewer(request)
  // Balance and plan for the account menu; one round trip each, in parallel.
  const [credits, billing, openrouter] = viewer
    ? await Promise.all([
        supabase.rpc("my_credits").then((r) => r.data ?? null),
        supabase
          .from("billing_customers")
          .select("subscription")
          .eq("user_id", viewer.id)
          .maybeSingle()
          .then((r) => r.data?.subscription ?? null),
        // Whether the person's OpenRouter account pays instead of credits.
        payingConnection(viewer.id)
          .then((c) => !!c)
          .catch(() => false),
      ])
    : [null, null, false]
  const plan: PlanId | "free" =
    billing && isActive(billing) && "plan" in billing && billing.plan
      ? billing.plan
      : "free"

  return data(
    {
      locale: detectLocale(request),
      supabase: supabaseEnv(),
      viewer,
      credits,
      plan,
      openrouter,
    },
    { headers }
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  const locale =
    useRouteLoaderData<typeof loader>("root")?.locale ?? DEFAULT_LOCALE
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider initialLocale={locale}>{children}</I18nProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return (
    <>
      <Outlet />
      <CommandPalette />
    </>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error"
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
