import { Link } from "react-router"

import { Logo } from "@/components/auth/auth-ui"
import { DEFAULT_LOCALE, isLocale, translate, useT } from "@/i18n/core"

import type { Route } from "./+types/docs.api"
import { messages } from "./docs.api.messages"

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0] as { loaderData?: { locale?: unknown } })
    ?.loaderData?.locale
  const title = translate(
    messages,
    isLocale(locale) ? locale : DEFAULT_LOCALE,
    "meta"
  )
  return [{ title: `${title} · Palmframe` }]
}

export function loader({ request }: Route.LoaderArgs) {
  return { origin: new URL(request.url).origin }
}

const flow = (o: string) => `KEY=pf_live_…

# 1. Estimate (free). Returns estimate_id, credits and page_version.
curl -X POST ${o}/api/v1/estimates \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"project_id": "…", "panel_id": "…", "prompt": "rooftop chase at night"}'

# 2. Start: charges the estimate. Retrying with the same key is safe.
curl -X POST ${o}/api/v1/generations \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"estimate_id": "…", "page_version": 12, "max_credits": 20}'

# 3. Poll until succeeded (result.image_url), failed or cancelled.
curl ${o}/api/v1/operations/OPERATION_ID -H "Authorization: Bearer $KEY"

# Cancel and refund a queued or running render.
curl -X POST ${o}/api/v1/operations/OPERATION_ID/cancel \\
  -H "Authorization: Bearer $KEY"`

const reads = (
  o: string
) => `curl ${o}/api/v1 -H "Authorization: Bearer $KEY"            # prices, limits
curl ${o}/api/v1/credits -H "Authorization: Bearer $KEY"
curl ${o}/api/v1/projects -H "Authorization: Bearer $KEY"
curl ${o}/api/v1/projects/PROJECT_ID -H "Authorization: Bearer $KEY"`

const mcp = (
  o: string
) => `claude mcp add --transport http palmframe ${o}/mcp \\
  --header "Authorization: Bearer $KEY"

# Tools: get_capabilities, get_credit_balance, list_projects, get_project,
# estimate_panel_generation, start_panel_generation, get_operation,
# cancel_operation`

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  )
}

export default function ApiDocs({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const o = loaderData.origin
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center border-b px-2.5">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">{t("auth.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("auth.body")}{" "}
            <Link to="/settings" className="underline underline-offset-4">
              {t("auth.settings")}
            </Link>
          </p>
          <Code>{`Authorization: Bearer pf_live_…`}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">{t("flow.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("flow.body")}</p>
          <Code>{flow(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">{t("read.title")}</h2>
          <Code>{reads(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">{t("mcp.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("mcp.body")}</p>
          <Code>{mcp(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">{t("limits.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("limits.body")}</p>
        </section>
      </main>
    </div>
  )
}
