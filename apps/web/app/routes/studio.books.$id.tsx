import * as React from "react"
import { Link, data, useNavigate } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Delete02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { AssistantPanel } from "@/components/books/assistant"
import { ChecksPanel } from "@/components/books/checks"
import { EditorPanel } from "@/components/books/editor"
import { GlossaryPanel } from "@/components/books/glossary"
import { OutputPanel } from "@/components/books/output"
import { OverviewPanel } from "@/components/books/overview"
import { ScansPanel } from "@/components/books/scans"
import {
  ErrorNote,
  LanguagePair,
  useAction,
  useBookT,
} from "@/components/books/shared"
import {
  bookCall,
  isActive,
  usePolling,
  type JobView,
} from "@/lib/books/client"
import {
  bookStatus,
  chapters as loadChapters,
} from "@/lib/books/service.server"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio.books.$id"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, viewer } = await getViewer(request)
  // Row-level security: someone else's book simply isn't found.
  const { data: row } = await supabase
    .from("book_projects")
    .select("id")
    .eq("id", params.id)
    .maybeSingle()
  if (!row || !viewer) throw data("Not found", { status: 404 })
  const actor = { userId: viewer.id }
  const [status, chapters] = await Promise.all([
    bookStatus(actor, params.id),
    loadChapters(actor, params.id),
  ])
  return { status, chapters }
}

export type BookStatusData = Route.ComponentProps["loaderData"]["status"]
export type ChapterItem = Route.ComponentProps["loaderData"]["chapters"][number]

const STEPS = ["read", "glossary", "translate", "review", "export"] as const

function stepOf(status: BookStatusData) {
  const s = status.book.status
  if (["uploading", "parsing", "needs_ocr", "ocr", "failed"].includes(s))
    return 0
  if (s === "glossary" || s === "setup") return 1
  if (s === "translating") return 2
  return status.jobs.some(
    (j) => j.kind === "export" && j.status === "succeeded"
  )
    ? 4
    : 3
}

function Stepper({ status }: { status: BookStatusData }) {
  const t = useBookT()
  const at = stepOf(status)
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label={t("tabs.overview")}>
      {STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={i === at ? "step" : undefined}
          className="min-w-0"
        >
          <span
            className={cn(
              "block h-1 rounded-full transition-colors duration-300",
              i < at
                ? "bg-brand/60"
                : i === at
                  ? "bg-brand"
                  : "bg-foreground/10"
            )}
          />
          <span
            className={cn(
              "mt-1.5 block truncate text-xs",
              i === at ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {t(`steps.${step}`)}
          </span>
        </li>
      ))}
    </ol>
  )
}

const TAB_IDS = [
  "overview",
  "editor",
  "glossary",
  "checks",
  "scans",
  "assistant",
  "export",
] as const

export type BookTab = (typeof TAB_IDS)[number]

export interface OpenSegment {
  chapter: string
  segment: string
}

export default function StudioBook({ loaderData }: Route.ComponentProps) {
  const t = useBookT()
  const navigate = useNavigate()
  const id = loaderData.status.book.id
  const [tab, setTab] = React.useState<BookTab>("overview")
  const [chapters, setChapters] = React.useState(loaderData.chapters)
  const [open, setOpen] = React.useState<OpenSegment | null>(null)
  const [selection, setSelection] = React.useState<string[]>([])
  const [confirming, setConfirming] = React.useState(false)
  const remove = useAction()

  const { value, refresh } = usePolling<BookStatusData>(
    () => bookCall<BookStatusData>("status", { id }),
    (v) => !!v?.jobs.some(isActive as (j: unknown) => boolean),
    loaderData.status
  )
  const status = value ?? loaderData.status
  const { book } = status

  // A finished read or OCR pass changes the chapters underneath the page.
  const activeKinds = status.jobs.filter((j) => isActive(j as JobView)).length
  const seen = React.useRef(activeKinds)
  React.useEffect(() => {
    if (seen.current > 0 && activeKinds === 0)
      void bookCall<{ chapters: typeof chapters }>("chapters", { id })
        .then((r) => setChapters(r.chapters))
        .catch(() => {})
    seen.current = activeKinds
  }, [activeKinds, id])

  return (
    <>
      <div className="flex flex-col gap-4">
        <Link
          to="/studio/books"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="size-4 rtl:rotate-180"
          />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="studio-title text-3xl leading-[1.05] [overflow-wrap:anywhere] md:text-4xl">
              {book.title || book.file_name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
              {book.author && <span>{book.author}</span>}
              <LanguagePair
                source={book.source_lang}
                target={book.target_lang}
              />
            </p>
          </div>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{t("removeConfirm")}</span>
              <Button
                size="sm"
                variant="outline"
                onPress={() => setConfirming(false)}
              >
                {t("keep")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                isDisabled={remove.busy}
                onPress={() =>
                  remove
                    .run(() => bookCall("delete", { id }))
                    .then((ok) => ok && navigate("/studio/books"))
                }
              >
                {t("remove")}
              </Button>
            </div>
          ) : (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("remove")}
              onPress={() => setConfirming(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          )}
        </div>
        <ErrorNote code={remove.error} />
        <Stepper status={status} />
      </div>
      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => setTab(key as BookTab)}
        className="min-w-0"
      >
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList variant="line" className="w-max justify-start gap-3">
            {TAB_IDS.filter((k) => k !== "scans" || status.book.pages > 0).map(
              (key) => (
                <TabsTrigger key={key} id={key} className="flex-none">
                  {t(`tabs.${key}`)}
                </TabsTrigger>
              )
            )}
          </TabsList>
        </div>
        <TabsContent id="overview" className="pt-4">
          <OverviewPanel status={status} refresh={refresh} goTo={setTab} />
        </TabsContent>
        <TabsContent id="editor" className="pt-4">
          <EditorPanel
            book={book}
            chapters={chapters}
            open={open}
            selection={selection}
            setSelection={setSelection}
            askAssistant={() => setTab("assistant")}
          />
        </TabsContent>
        <TabsContent id="glossary" className="pt-4">
          <GlossaryPanel book={book} />
        </TabsContent>
        <TabsContent id="checks" className="pt-4">
          <ChecksPanel
            bookId={id}
            chapters={chapters}
            status={status}
            refresh={refresh}
            openSegment={(target) => {
              setOpen(target)
              setTab("editor")
            }}
          />
        </TabsContent>
        <TabsContent id="scans" className="pt-4">
          <ScansPanel book={book} />
        </TabsContent>
        <TabsContent id="assistant" className="pt-4">
          <AssistantPanel
            book={book}
            selection={selection}
            clearSelection={() => setSelection([])}
          />
        </TabsContent>
        <TabsContent id="export" className="pt-4">
          <OutputPanel
            bookId={id}
            jobs={status.jobs as JobView[]}
            refresh={refresh}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
