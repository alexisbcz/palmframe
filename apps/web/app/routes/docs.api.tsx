import { Link } from "react-router"

import { Logo } from "@/components/auth/auth-ui"
import { openSettings } from "@/components/settings/settings-dialog"
import { DEFAULT_LOCALE, isLocale, translate, useT } from "@/i18n/core"
import { seo } from "@/lib/seo"

import type { Route } from "./+types/docs.api"
import { messages as bookMessages } from "./docs.api.books.messages"
import { messages } from "./docs.api.messages"

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0] as { loaderData?: { locale?: unknown } })
    ?.loaderData?.locale
  const title = translate(
    messages,
    isLocale(locale) ? locale : DEFAULT_LOCALE,
    "meta"
  )
  return seo({
    title: `${title} · Palmframe`,
    description:
      "The Palmframe developer API and MCP server: create carousels, generate panels and track credits from your own tools.",
    path: "/docs/api",
  })
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
# cancel_operation, and for books: list_books, create_book, ingest_book,
# get_book_status, estimate_translation, start_translation, read_segments,
# edit_segment, get_glossary, add_glossary_term, export_book, get_export_url`

const books = (
  o: string
) => `# 1. Create the book. rights_confirmed must be true.
curl -X POST ${o}/api/v1/books \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"file_name": "novel.epub", "size_bytes": 1048576, "rights_confirmed": true,
       "source_lang": "en", "target_lang": "fr"}'
# Returns book_id and upload_url.

# 2. Upload straight to storage, then read it in. Free.
curl -X PUT "$UPLOAD_URL" --data-binary @novel.epub
curl -X POST ${o}/api/v1/books/$BOOK/ingest -H "Authorization: Bearer $KEY"

# 3. Scanned pages, if any, then names and terms. Both are optional.
curl -X POST ${o}/api/v1/books/$BOOK/ocr -H "Authorization: Bearer $KEY"
curl -X POST ${o}/api/v1/books/$BOOK/extract -H "Authorization: Bearer $KEY"

# 4. See the price, then start. mode is standard, or economy for the Batch API.
curl ${o}/api/v1/books/$BOOK/estimate -H "Authorization: Bearer $KEY"
curl -X POST ${o}/api/v1/books/$BOOK/translate \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"mode": "standard", "max_credits": 1200}'

# 5. Follow it, stop it, then build a file: epub, pdf, docx or md.
curl ${o}/api/v1/books/$BOOK -H "Authorization: Bearer $KEY"
curl -X POST ${o}/api/v1/books/$BOOK/jobs/$JOB/cancel -H "Authorization: Bearer $KEY"
curl -X POST ${o}/api/v1/books/$BOOK/exports \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"format": "epub", "bilingual": false}'
curl ${o}/api/v1/books/$BOOK/exports/$JOB -H "Authorization: Bearer $KEY"`

const bookData = (
  o: string
) => `# Segments, by chapter, status or text. PATCH needs the version you read.
curl "${o}/api/v1/books/$BOOK/segments?status=machine&q=harbour" \\
  -H "Authorization: Bearer $KEY"
curl -X PATCH ${o}/api/v1/books/$BOOK/segments/$SEGMENT \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"target": "Le port", "version": 3}'

# A book's own glossary, then its terms.
curl ${o}/api/v1/books/$BOOK/glossary -H "Authorization: Bearer $KEY"
curl -X POST ${o}/api/v1/books/glossaries/$GLOSSARY/terms \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"source": "harbour", "target": "port"}'
curl -X PATCH ${o}/api/v1/books/terms/$TERM \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"target": "havre"}'
curl -X DELETE ${o}/api/v1/books/terms/$TERM -H "Authorization: Bearer $KEY"

# CSV or TBX, and reusable glossaries.
curl -X POST ${o}/api/v1/books/glossaries/$GLOSSARY/import \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"format": "csv", "body": "source,target\\nharbour,port\\n"}'
curl "${o}/api/v1/books/glossaries/$GLOSSARY/export?format=tbx&source=en&target=fr" \\
  -H "Authorization: Bearer $KEY"`

const hooks = (o: string) => `curl -X POST ${o}/api/v1/books/webhooks \\
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"url": "https://example.com/hook", "events": ["job.succeeded"]}'

# Node: check a delivery.
const [t, v1] = header.split(",").map((p) => p.split("=")[1])
const want = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex")
const good = timingSafeEqual(Buffer.from(want), Buffer.from(v1))`

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  )
}

export default function ApiDocs({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const b = useT(bookMessages)
  const o = loaderData.origin
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center border-b px-2.5">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
        <div>
          <h1 className="studio-title text-4xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{t("auth.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("auth.body")}{" "}
            <Link
              to="/settings"
              className="underline underline-offset-4"
              onClick={(e) => {
                e.preventDefault()
                openSettings("api")
              }}
            >
              {t("auth.settings")}
            </Link>
          </p>
          <Code>{`Authorization: Bearer pf_live_…`}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{t("access.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("access.body")}</p>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{t("flow.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("flow.body")}</p>
          <Code>{flow(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{t("read.title")}</h2>
          <Code>{reads(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{t("mcp.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("mcp.body")}</p>
          <Code>{mcp(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{t("limits.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("limits.body")}</p>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{b("title")}</h2>
          <p className="text-sm text-muted-foreground">{b("body")}</p>
          <Code>{books(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{b("glossary.title")}</h2>
          <p className="text-sm text-muted-foreground">{b("glossary.body")}</p>
          <Code>{bookData(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{b("webhooks.title")}</h2>
          <p className="text-sm text-muted-foreground">{b("webhooks.body")}</p>
          <Code>{hooks(o)}</Code>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="studio-title text-lg">{b("limits.title")}</h2>
          <p className="text-sm text-muted-foreground">{b("limits.body")}</p>
        </section>
      </main>
    </div>
  )
}
