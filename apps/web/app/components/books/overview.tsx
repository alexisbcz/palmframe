import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon, StopIcon } from "@hugeicons/core-free-icons"
import { Radio, RadioGroup } from "react-aria-components"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { openSettings } from "@/components/settings/settings-dialog"
import { bookCall, isActive, type JobView } from "@/lib/books/client"
import { useCredits } from "@/lib/credits-store"
import {
  BOOK_RATES,
  DEFAULT_STYLE,
  type StyleGuide,
  type TranslateMode,
} from "@/lib/books/model"
import type { BookStatusData, BookTab } from "@/routes/studio.books.$id"

import {
  ErrorNote,
  LabeledCheckbox,
  Panel,
  PanelTitle,
  Stat,
  languageOptions,
  useAction,
  useBookT,
  useNumber,
} from "./shared"

interface Props {
  status: BookStatusData
  refresh: () => Promise<unknown>
  goTo: (tab: BookTab) => void
}

interface Estimate {
  words: number
  repeat_words: number
  segments: number
  locked: number
  credits: { standard: number; economy: number }
  billed_by: "credits" | "openrouter"
  economy_available: boolean
  balance: number
}

function JobProgress({
  job,
  title,
  refresh,
}: {
  job: JobView
  title: string
  refresh: () => Promise<unknown>
}) {
  const t = useBookT()
  const n = useNumber()
  const stop = useAction()
  const value = job.total ? Math.round((job.done / job.total) * 100) : 0
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0" aria-live="polite">
          <PanelTitle>{title}</PanelTitle>
          {job.waiting ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("overview.waitingBatch")}
            </p>
          ) : (
            job.total > 0 && (
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                {t("overview.progress", {
                  done: n(job.done),
                  total: n(job.total),
                })}
              </p>
            )
          )}
        </div>
        <p className="studio-title text-3xl text-brand tabular-nums">
          {job.total ? `${value}%` : <Spinner />}
        </p>
      </div>
      <Progress value={value} isIndeterminate={!job.total} aria-label={title}>
        <ProgressTrack className="h-1.5">
          <ProgressIndicator className="bg-brand" />
        </ProgressTrack>
      </Progress>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {job.credits_charged > 0 &&
            t("overview.charged", { cost: n(job.credits_charged) })}
        </span>
        {job.kind !== "ingest" && (
          <Button
            size="sm"
            variant="outline"
            isDisabled={stop.busy}
            onPress={() =>
              stop
                .run(() => bookCall("cancel", { id: job.book_id, job: job.id }))
                .then(refresh)
            }
          >
            {t("overview.stop")}
            <HugeiconsIcon
              icon={StopIcon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
        )}
      </div>
      <ErrorNote code={stop.error} />
    </Panel>
  )
}

function StyleForm({ status, refresh }: Omit<Props, "goTo">) {
  const t = useBookT()
  const { book } = status
  const [style, setStyle] = React.useState<StyleGuide>({
    ...DEFAULT_STYLE,
    ...book.style,
  })
  const [saved, setSaved] = React.useState(false)
  const save = useAction()
  const set = (patch: Partial<StyleGuide>) => {
    setStyle((s) => ({ ...s, ...patch }))
    setSaved(false)
  }
  return (
    <Panel className="flex flex-col gap-3">
      <PanelTitle>{t("overview.style")}</PanelTitle>
      <div className="grid gap-3 @lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("overview.register")}
          <NativeSelect
            className="w-full"
            value={style.register}
            onChange={(e) =>
              set({ register: e.target.value as StyleGuide["register"] })
            }
          >
            {(
              [
                "neutral",
                "formal",
                "literary",
                "conversational",
                "academic",
              ] as const
            ).map((r) => (
              <NativeSelectOption key={r} value={r}>
                {t(`overview.registers.${r}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("overview.idioms")}
          <NativeSelect
            className="w-full"
            value={style.idioms}
            onChange={(e) =>
              set({ idioms: e.target.value as StyleGuide["idioms"] })
            }
          >
            <NativeSelectOption value="adapt">
              {t("overview.idiomsAdapt")}
            </NativeSelectOption>
            <NativeSelectOption value="keep">
              {t("overview.idiomsKeep")}
            </NativeSelectOption>
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("overview.audience")}
          <Input
            value={style.audience}
            maxLength={200}
            placeholder={t("overview.audiencePlaceholder")}
            onChange={(e) => set({ audience: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("overview.dialect")}
          <Input
            value={style.dialect}
            maxLength={80}
            placeholder={t("overview.dialectPlaceholder")}
            onChange={(e) => set({ dialect: e.target.value })}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("overview.notes")}
        <Textarea
          value={style.notes}
          maxLength={2000}
          placeholder={t("overview.notesPlaceholder")}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-sm text-muted-foreground">
            {t("overview.saved")}
          </span>
        )}
        <Button
          variant="outline"
          isDisabled={save.busy}
          onPress={async () => {
            const ok = await save.run(() =>
              bookCall("update", { id: book.id, patch: { style } })
            )
            setSaved(ok)
            await refresh()
          }}
        >
          {t("overview.save")}
        </Button>
      </div>
      <ErrorNote code={save.error} />
    </Panel>
  )
}

function Languages({ status, refresh }: Omit<Props, "goTo">) {
  const t = useBookT()
  const { book } = status
  const save = useAction()
  const translated =
    status.counts.machine + status.counts.reviewed + status.counts.locked > 0
  const change = (patch: Record<string, string>) =>
    save.run(() => bookCall("update", { id: book.id, patch })).then(refresh)
  return (
    <Panel className="flex flex-col gap-3">
      <PanelTitle>{t("overview.languages")}</PanelTitle>
      <div className="grid gap-3 @lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("upload.from")}
          <NativeSelect
            className="w-full"
            value={book.source_lang}
            disabled={translated}
            onChange={(e) => change({ source_lang: e.target.value })}
          >
            {languageOptions.map((l) => (
              <NativeSelectOption key={l.value} value={l.value}>
                {l.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("upload.to")}
          <NativeSelect
            className="w-full"
            value={book.target_lang}
            disabled={translated}
            onChange={(e) => change({ target_lang: e.target.value })}
          >
            {languageOptions.map((l) => (
              <NativeSelectOption key={l.value} value={l.value}>
                {l.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <ErrorNote code={save.error} />
    </Panel>
  )
}

function Glossary({ status, refresh, goTo }: Props) {
  const t = useBookT()
  const n = useNumber()
  const { book } = status
  const run = useAction()
  const extracted = status.jobs.find(
    (j) => j.kind === "extract" && j.status === "succeeded"
  )
  const count = Number((extracted?.result as { terms?: number })?.terms ?? 0)
  return (
    <Panel className="flex flex-col gap-3">
      <PanelTitle>{t("tabs.glossary")}</PanelTitle>
      <p className="text-sm text-muted-foreground">
        {t("overview.extractText")}
      </p>
      {extracted && (
        <p className="text-sm">
          {t("overview.extracted", { count }).replace(String(count), n(count))}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {extracted ? (
          <Button variant="outline" onPress={() => goTo("glossary")}>
            {t("overview.reviewTerms")}
          </Button>
        ) : (
          <Button
            variant="outline"
            isDisabled={run.busy}
            onPress={() =>
              run.run(() => bookCall("extract", { id: book.id })).then(refresh)
            }
          >
            {t("overview.extract", { cost: BOOK_RATES.extract })}
          </Button>
        )}
      </div>
      <ErrorNote code={run.error} />
    </Panel>
  )
}

function Cost({ status, refresh }: Omit<Props, "goTo">) {
  const t = useBookT()
  const n = useNumber()
  const { book } = status
  const credits = useCredits()
  const [quote, setQuote] = React.useState<Estimate | null>(null)
  const [mode, setMode] = React.useState<TranslateMode>("standard")
  const load = useAction()
  const go = useAction()
  const pendingKey = status.counts.pending + status.counts.locked
  React.useEffect(() => {
    void load.run(async () =>
      setQuote(await bookCall<Estimate>("estimate", { id: book.id }))
    )
  }, [book.id, pendingKey, load.run])
  if (!quote) return <ErrorNote code={load.error} />
  const free = quote.billed_by === "openrouter"
  const cost = free ? 0 : quote.credits[mode]
  const balance = credits ?? quote.balance
  const short = !free && cost > balance
  return (
    <Panel className="flex flex-col gap-3">
      <PanelTitle>{t("overview.cost")}</PanelTitle>
      <dl className="divide-y divide-foreground/5">
        <Stat
          label={t("overview.toTranslate")}
          value={t("words", { count: n(quote.words) })}
        />
        {quote.repeat_words > 0 && (
          <Stat
            label={t("overview.repeats")}
            value={t("words", { count: n(quote.repeat_words) })}
          />
        )}
        {quote.locked > 0 && (
          <Stat label={t("overview.locked")} value={n(quote.locked)} />
        )}
        {!free && <Stat label={t("overview.balance")} value={n(balance)} />}
      </dl>
      {free ? (
        <p className="text-sm text-muted-foreground">
          {t("overview.openrouter")}
        </p>
      ) : (
        quote.economy_available && (
          <RadioGroup
            aria-label={t("overview.mode")}
            value={mode}
            onChange={(v) => setMode(v as TranslateMode)}
            className="grid gap-2 @lg:grid-cols-2"
          >
            {(["standard", "economy"] as const).map((m) => (
              <Radio
                key={m}
                value={m}
                className={({ isSelected, isFocusVisible }) =>
                  cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-xl p-3 ring-1 transition-colors duration-150 outline-none",
                    isSelected
                      ? "bg-brand/10 ring-brand"
                      : "ring-foreground/10 hover:bg-foreground/[0.03]",
                    isFocusVisible && "ring-2 ring-ring"
                  )
                }
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {t(`overview.${m}`)}
                  <span className="tabular-nums">{n(quote.credits[m])}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`overview.${m}Text`)}
                </span>
              </Radio>
            ))}
          </RadioGroup>
        )
      )}
      {short && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-pink-300">
          {t("overview.short", { count: n(cost - balance) })}
          <Button
            size="sm"
            variant="outline"
            onPress={() => openSettings("billing")}
          >
            {t("overview.topUp")}
          </Button>
        </p>
      )}
      <Button
        isDisabled={go.busy || short || !quote.segments}
        className="bg-white text-black hover:bg-white/90"
        onPress={() =>
          go
            .run(() =>
              bookCall("translate", {
                id: book.id,
                mode,
                idempotencyKey: crypto.randomUUID(),
              })
            )
            .then(refresh)
        }
      >
        {free
          ? t("overview.translateFree")
          : t("overview.translate", { cost: n(cost) })}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className="rtl:rotate-180"
        />
      </Button>
      <ErrorNote code={go.error} />
    </Panel>
  )
}

function Finished({ status, refresh, goTo }: Props) {
  const t = useBookT()
  const { book } = status
  const [instruction, setInstruction] = React.useState("")
  const [reviewed, setReviewed] = React.useState(false)
  const [quote, setQuote] = React.useState<Estimate | null>(null)
  const run = useAction()
  const n = useNumber()
  React.useEffect(() => {
    setQuote(null)
    void bookCall<Estimate>("estimate", {
      id: book.id,
      retranslate: true,
      includeReviewed: reviewed,
    })
      .then(setQuote)
      .catch(() => {})
  }, [book.id, reviewed])
  const free = quote?.billed_by === "openrouter"
  return (
    <div className="grid items-start gap-4 @3xl:grid-cols-2">
      <Panel className="flex flex-col gap-3">
        <PanelTitle>{t("overview.finished")}</PanelTitle>
        <p className="text-sm text-muted-foreground">
          {t("overview.finishedText")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onPress={() => goTo("editor")}>
            {t("overview.openEditor")}
          </Button>
          <Button variant="outline" onPress={() => goTo("checks")}>
            {t("overview.openChecks")}
          </Button>
        </div>
      </Panel>
      <Panel className="flex flex-col gap-3">
        <PanelTitle>{t("overview.retranslate")}</PanelTitle>
        <p className="text-sm text-muted-foreground">
          {t("overview.retranslateText")}
        </p>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("overview.instruction")}
          <Input
            value={instruction}
            maxLength={1000}
            placeholder={t("overview.instructionPlaceholder")}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </label>
        <LabeledCheckbox isSelected={reviewed} onChange={setReviewed}>
          {t("overview.includeReviewed")}
        </LabeledCheckbox>
        <Button
          variant="outline"
          isDisabled={run.busy || !quote || !quote.segments}
          className="self-end"
          onPress={() =>
            run
              .run(() =>
                bookCall("translate", {
                  id: book.id,
                  retranslate: true,
                  includeReviewed: reviewed,
                  instruction: instruction.trim() || undefined,
                  idempotencyKey: crypto.randomUUID(),
                })
              )
              .then(refresh)
          }
        >
          {quote && !free
            ? t("overview.retranslateCost", { cost: n(quote.credits.standard) })
            : t("overview.retranslate")}
        </Button>
        <ErrorNote code={run.error} />
      </Panel>
    </div>
  )
}

function Ocr({ status, refresh }: Omit<Props, "goTo">) {
  const t = useBookT()
  const n = useNumber()
  const { book } = status
  const run = useAction()
  const [pages, setPages] = React.useState<{ status: string }[] | null>(null)
  React.useEffect(() => {
    void bookCall<{ pages: { status: string }[] }>("pages", { id: book.id })
      .then((r) => setPages(r.pages))
      .catch(() => setPages([]))
  }, [book.id])
  if (!pages)
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Spinner />
      </div>
    )
  const count = pages.filter((p) => p.status === "pending").length
  const unreadable = pages.filter((p) => p.status === "unreadable").length
  return (
    <Panel className="flex flex-col gap-3">
      <PanelTitle>
        {t("overview.scansFound", { count }).replace(String(count), n(count))}
      </PanelTitle>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("overview.scansText")}
      </p>
      {unreadable > 0 && (
        <p className="text-sm text-pink-300">
          {t("overview.unreadable", { count: unreadable })}
        </p>
      )}
      <Button
        className="self-start bg-white text-black hover:bg-white/90"
        isDisabled={run.busy}
        onPress={() =>
          run
            .run(() =>
              bookCall("ocr", {
                id: book.id,
                idempotencyKey: crypto.randomUUID(),
              })
            )
            .then(refresh)
        }
      >
        {t("overview.runOcr", { cost: n(count * BOOK_RATES.ocr_page) })}
      </Button>
      <ErrorNote code={run.error} />
    </Panel>
  )
}

export function OverviewPanel({ status, refresh, goTo }: Props) {
  const t = useBookT()
  const { book } = status
  const jobs = status.jobs as JobView[]
  const active = jobs.find(isActive)
  const last = jobs.find((j) => j.kind === "translate")
  const stopped = last?.status === "cancelled"
  const failed = jobs.find((j) => j.status === "failed" && j.kind !== "export")

  const title =
    active?.kind === "ingest"
      ? t("overview.parsing")
      : active?.kind === "ocr"
        ? t("overview.ocrRunning")
        : active?.kind === "extract"
          ? t("overview.extractRunning")
          : active?.kind === "qa"
            ? t("checks.running")
            : active?.kind === "export"
              ? t("output.building")
              : t("overview.translating")

  return (
    <div className="@container flex flex-col gap-4">
      {book.warnings.length > 0 && (
        <Panel>
          <p className="text-sm font-medium">{t("overview.warnings")}</p>
          <ul className="mt-1 text-sm text-muted-foreground">
            {book.warnings.slice(0, 6).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Panel>
      )}
      {book.status === "failed" && (
        <Panel className="flex flex-col gap-2">
          <PanelTitle>{t("overview.failed")}</PanelTitle>
          <ErrorNote code={book.error ?? "failed"} />
        </Panel>
      )}
      {active && active.kind !== "export" && (
        <JobProgress job={active} title={title} refresh={refresh} />
      )}
      {!active && failed?.error && book.status !== "failed" && (
        <ErrorNote code={failed.error} />
      )}
      {!active && stopped && book.status !== "failed" && (
        <p className="text-sm text-muted-foreground">{t("overview.stopped")}</p>
      )}
      {book.status === "needs_ocr" && !active && (
        <Ocr status={status} refresh={refresh} />
      )}
      {book.status === "setup" && !active && (
        <div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <Languages status={status} refresh={refresh} />
            <Glossary status={status} refresh={refresh} goTo={goTo} />
            <StyleForm status={status} refresh={refresh} />
          </div>
          <Cost status={status} refresh={refresh} />
        </div>
      )}
      {book.status === "review" && !active && (
        <>
          <Finished status={status} refresh={refresh} goTo={goTo} />
          {status.counts.pending > 0 && (
            <Cost status={status} refresh={refresh} />
          )}
        </>
      )}
    </div>
  )
}
