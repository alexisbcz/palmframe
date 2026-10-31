import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  Delete02Icon,
  FileExportIcon,
  FileImportIcon,
  PlusSignIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { bookCall, downloadText } from "@/lib/books/client"
import { MAX_GLOSSARY_IMPORT_BYTES } from "@/lib/books/limits"
import type { Term } from "@/lib/books/model"
import type { BookStatusData } from "@/routes/studio.books.$id"

import {
  EmptyState,
  ErrorNote,
  LabeledCheckbox,
  Panel,
  PanelTitle,
  useAction,
  useBookT,
  useNumber,
} from "./shared"

type Book = BookStatusData["book"]
type TermItem = Term & { occurrences: number }

const FILTERS = ["suggested", "approved", "rejected"] as const

function TermRow({
  term,
  onChange,
  onRemove,
}: {
  term: TermItem
  onChange: (id: string, patch: Partial<TermItem>) => void
  onRemove: (id: string) => void
}) {
  const t = useBookT()
  const [target, setTarget] = React.useState(term.target)
  React.useEffect(() => setTarget(term.target), [term.target])
  return (
    <li className="grid gap-2 border-t border-foreground/5 py-2.5 first:border-t-0 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @2xl:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium" title={term.source}>
          {term.source}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(`glossary.kinds.${term.kind}`)}
          {term.occurrences > 0 &&
            ` · ${t("glossary.seen", { count: term.occurrences })}`}
          {term.note && ` · ${term.note}`}
        </p>
      </div>
      <Input
        aria-label={`${t("glossary.target")}: ${term.source}`}
        value={term.dnt ? term.source : target}
        disabled={term.dnt}
        onChange={(e) => setTarget(e.target.value)}
        onBlur={() => {
          if (target !== term.target) onChange(term.id, { target })
        }}
      />
      <div className="flex items-center justify-end gap-1">
        <LabeledCheckbox
          isSelected={term.dnt}
          onChange={(dnt) => onChange(term.id, { dnt })}
          className="me-1 text-xs whitespace-nowrap text-muted-foreground"
        >
          {t("glossary.dnt")}
        </LabeledCheckbox>
        {term.state !== "approved" && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`${t("glossary.approve")}: ${term.source}`}
            onPress={() => onChange(term.id, { state: "approved" })}
          >
            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
          </Button>
        )}
        {term.state !== "rejected" && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`${t("glossary.reject")}: ${term.source}`}
            onPress={() => onChange(term.id, { state: "rejected" })}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("glossary.remove", { term: term.source })}
          onPress={() => onRemove(term.id)}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        </Button>
      </div>
    </li>
  )
}

export function GlossaryPanel({ book }: { book: Book }) {
  const t = useBookT()
  const n = useNumber()
  const [glossary, setGlossary] = React.useState<string | null>(null)
  const [terms, setTerms] = React.useState<TermItem[] | null>(null)
  const [filter, setFilter] =
    React.useState<(typeof FILTERS)[number]>("approved")
  const [source, setSource] = React.useState("")
  const [reusable, setReusable] = React.useState<
    { id: string; name: string }[]
  >([])
  const [attached, setAttached] = React.useState<string[]>(book.glossaries)
  const [name, setName] = React.useState("")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [report, setReport] = React.useState<{
    occurrences: number
    breaks: { segment_id: string; term: string; expected: string }[]
  } | null>(null)
  const action = useAction()
  const file = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async () => {
    const r = await bookCall<{ id: string; terms: TermItem[] }>("glossary", {
      id: book.id,
    })
    setGlossary(r.id)
    setTerms(r.terms)
    if (r.terms.some((x) => x.state === "suggested")) setFilter("suggested")
  }, [book.id])

  React.useEffect(() => {
    void action.run(load)
    void bookCall<{ glossaries: { id: string; name: string }[] }>("glossaries")
      .then((r) => setReusable(r.glossaries))
      .catch(() => {})
  }, [load, action.run])

  const change = (id: string, patch: Partial<TermItem>) => {
    setTerms(
      (old) => old?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? old
    )
    void action.run(() => bookCall("updateTerm", { term: id, patch }))
  }
  const remove = (id: string) => {
    setTerms((old) => old?.filter((x) => x.id !== id) ?? old)
    void action.run(() => bookCall("deleteTerm", { term: id }))
  }

  if (!terms) {
    return action.error ? (
      <ErrorNote code={action.error} />
    ) : (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Spinner />
      </div>
    )
  }

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f, terms.filter((x) => x.state === f).length])
  ) as Record<(typeof FILTERS)[number], number>
  const shown = terms.filter((x) => x.state === filter)

  const importFile = (f: File | undefined) => {
    if (!f || f.size > MAX_GLOSSARY_IMPORT_BYTES) return
    void action.run(async () => {
      const body = await f.text()
      const r = await bookCall<{ imported: number }>("importTerms", {
        id: book.id,
        glossary,
        body,
        format: /\.(tbx|xml)$/i.test(f.name) ? "tbx" : "csv",
      })
      setNotice(t("glossary.imported", { count: r.imported }))
      await load()
    })
    if (file.current) file.current.value = ""
  }

  const exportFile = (format: "csv" | "tbx") =>
    action.run(async () => {
      const r = await bookCall<{ body: string }>("exportTerms", {
        id: book.id,
        glossary,
        format,
      })
      downloadText(
        `glossary.${format}`,
        r.body,
        format === "csv" ? "text/csv" : "application/xml"
      )
    })

  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("glossary.intro")}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={file}
            type="file"
            accept=".csv,.tbx,.xml"
            aria-label={t("glossary.import")}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => importFile(e.target.files?.[0])}
          />
          <Button
            size="sm"
            variant="outline"
            onPress={() => file.current?.click()}
          >
            {t("glossary.import")}
            <HugeiconsIcon
              icon={FileImportIcon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
          <ButtonGroup>
            <Button
              size="sm"
              variant="outline"
              onPress={() => exportFile("csv")}
            >
              CSV
              <HugeiconsIcon
                icon={FileExportIcon}
                strokeWidth={2}
                data-icon="inline-end"
              />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onPress={() => exportFile("tbx")}
            >
              TBX
            </Button>
          </ButtonGroup>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const value = source.trim()
          if (!value) return
          void action.run(async () => {
            await bookCall("addTerm", {
              glossary,
              term: { source: value, state: "approved" },
            })
            setSource("")
            setFilter("approved")
            await load()
          })
        }}
      >
        <ButtonGroup className="w-full max-w-md">
          <Input
            value={source}
            aria-label={t("glossary.source")}
            placeholder={t("glossary.source")}
            onChange={(e) => setSource(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="outline" isDisabled={!source.trim()}>
            {t("glossary.add")}
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
        </ButtonGroup>
      </form>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <ErrorNote code={action.error} />
      <div className="flex flex-col items-start gap-2">
        <Button
          size="sm"
          variant="outline"
          isDisabled={action.busy}
          onPress={() =>
            action.run(async () =>
              setReport(await bookCall("checkGlossary", { id: book.id }))
            )
          }
        >
          {t("glossary.check")}
        </Button>
        {report && (
          <div role="status" className="flex flex-col gap-1 text-sm">
            <p className="text-muted-foreground">
              {t("glossary.checkResult", {
                count: report.breaks.length,
                occurrences: n(report.occurrences),
              })}
            </p>
            {report.breaks.length > 0 && (
              <ul className="text-muted-foreground">
                {report.breaks.slice(0, 20).map((b, i) => (
                  <li key={`${b.segment_id}-${i}`}>
                    {t("checks.details.glossary", {
                      term: b.term,
                      expected: b.expected,
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {terms.length ? (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    filter === f
                      ? "bg-foreground/10 font-medium"
                      : "text-muted-foreground hover:bg-foreground/5"
                  )}
                >
                  {t(`glossary.${f}`)}{" "}
                  <span className="tabular-nums">{n(counts[f])}</span>
                </button>
              ))}
            </div>
            {filter === "suggested" && counts.suggested > 0 && (
              <Button
                size="sm"
                variant="outline"
                onPress={() =>
                  action
                    .run(() => bookCall("approveAll", { glossary }))
                    .then(load)
                }
              >
                {t("glossary.approveAll")}
              </Button>
            )}
          </div>
          <ul>
            {shown.map((term) => (
              <TermRow
                key={term.id}
                term={term}
                onChange={change}
                onRemove={remove}
              />
            ))}
          </ul>
        </Panel>
      ) : (
        <EmptyState
          title={t("glossary.emptyTitle")}
          text={t("glossary.emptyText")}
        />
      )}
      <Panel className="flex flex-col gap-3">
        <PanelTitle>{t("glossary.reusable")}</PanelTitle>
        <p className="text-sm text-muted-foreground">
          {reusable.length
            ? t("glossary.reusableText")
            : t("glossary.noReusable")}
        </p>
        {reusable.length > 0 && (
          <ul className="flex flex-col gap-2">
            {reusable.map((g) => (
              <li key={g.id}>
                <LabeledCheckbox
                  isSelected={attached.includes(g.id)}
                  onChange={(on) => {
                    const next = on
                      ? [...attached, g.id]
                      : attached.filter((x) => x !== g.id)
                    setAttached(next)
                    void action.run(() =>
                      bookCall("update", {
                        id: book.id,
                        patch: { glossaries: next },
                      })
                    )
                  }}
                >
                  {g.name}
                </LabeledCheckbox>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const value = name.trim()
            if (!value) return
            void action.run(async () => {
              const made = await bookCall<{ id: string; name: string }>(
                "saveGlossary",
                { id: book.id, name: value }
              )
              setReusable((old) => [made, ...old])
              setName("")
            })
          }}
        >
          <ButtonGroup className="w-full max-w-md">
            <Input
              value={name}
              maxLength={120}
              aria-label={t("glossary.saveAs")}
              placeholder={t("glossary.saveAs")}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline" isDisabled={!name.trim()}>
              {t("glossary.saveAsButton")}
            </Button>
          </ButtonGroup>
        </form>
      </Panel>
    </div>
  )
}
