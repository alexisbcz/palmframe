import * as React from "react"
import { cn } from "cn"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { bookCall, isActive, type JobView } from "@/lib/books/client"
import { BOOK_RATES, type IssueKind, type Severity } from "@/lib/books/model"
import type {
  BookStatusData,
  ChapterItem,
  OpenSegment,
} from "@/routes/studio.books.$id"

import { EmptyState, ErrorNote, Panel, useAction, useBookT } from "./shared"

interface IssueItem {
  id: string
  chapter_id: string
  segment_id: string
  kind: IssueKind
  severity: Severity
  detail: Record<string, string | number>
}

const DETAILED = [
  "numbers",
  "glossary",
  "names",
  "length",
  "back_check",
] as const

export function ChecksPanel({
  bookId,
  chapters,
  status,
  refresh,
  openSegment,
}: {
  bookId: string
  chapters: ChapterItem[]
  status: BookStatusData
  refresh: () => Promise<unknown>
  openSegment: (target: OpenSegment) => void
}) {
  const t = useBookT()
  const [issues, setIssues] = React.useState<IssueItem[] | null>(null)
  const action = useAction()
  const jobs = status.jobs as JobView[]
  const running = jobs.some((j) => j.kind === "qa" && isActive(j))
  const ran = jobs.some((j) => j.kind === "qa" && j.status === "succeeded")

  const load = React.useCallback(async () => {
    const r = await bookCall<{ issues: IssueItem[] }>("issues", { id: bookId })
    setIssues(r.issues)
  }, [bookId])

  React.useEffect(() => {
    void action.run(load)
  }, [load, action.run, running])

  const start = (backcheck: boolean) =>
    action
      .run(() => bookCall("checks", { id: bookId, backcheck }))
      .then(refresh)

  const scored = chapters.filter((c) => c.score !== null)
  const detail = (issue: IssueItem) =>
    (DETAILED as readonly string[]).includes(issue.kind)
      ? t(
          `checks.details.${issue.kind as (typeof DETAILED)[number]}`,
          issue.detail
        )
      : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("checks.intro")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            isDisabled={running || action.busy}
            onPress={() => start(false)}
          >
            {running && <Spinner />}
            {running ? t("checks.running") : t("checks.run")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            isDisabled={running || action.busy}
            onPress={() => start(true)}
          >
            {t("checks.backCheck", {
              cost: Math.max(1, chapters.length) * BOOK_RATES.backcheck,
            })}
          </Button>
        </div>
      </div>
      <ErrorNote code={action.error} />
      {!ran && !issues?.length ? (
        <EmptyState
          title={t("checks.emptyTitle")}
          text={t("checks.emptyText")}
        />
      ) : (
        <>
          {scored.length > 0 && (
            <Panel>
              <ul className="flex flex-col gap-2">
                {scored.map((c) => (
                  <li
                    key={c.id}
                    className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1 text-sm"
                  >
                    <span className="truncate">
                      {c.title || t("editor.untitled", { number: c.position })}
                    </span>
                    <span className="text-end tabular-nums">{c.score}</span>
                    <span className="col-span-2 h-1 overflow-hidden rounded-full bg-foreground/10">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          c.score! < 80 ? "bg-pink-500" : "bg-brand"
                        )}
                        style={{ width: `${c.score}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {issues?.length ? (
            <ul className="flex flex-col gap-2">
              {issues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          issue.severity === "error"
                            ? "bg-pink-500"
                            : "bg-brand"
                        )}
                      />
                      {t(`checks.kinds.${issue.kind}`)}
                    </p>
                    {detail(issue) && (
                      <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-muted-foreground">
                        {detail(issue)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() =>
                        openSegment({
                          chapter: issue.chapter_id,
                          segment: issue.segment_id,
                        })
                      }
                    >
                      {t("checks.open")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setIssues(
                          (old) => old?.filter((i) => i.id !== issue.id) ?? old
                        )
                        void action.run(() =>
                          bookCall("dismiss", { id: bookId, issue: issue.id })
                        )
                      }}
                    >
                      {t("checks.dismiss")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            issues && (
              <p className="text-sm text-muted-foreground">
                {t("checks.clean")}
              </p>
            )
          )}
        </>
      )}
    </div>
  )
}
