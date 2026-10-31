import * as React from "react"
import {
  Link,
  redirect,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Delete02Icon,
  PlusSignIcon,
  RadioIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect } from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"

import { AccountMenu } from "@/components/account/account-menu"
import { Logo } from "@/components/auth/auth-ui"
import { Field } from "@/components/settings/sections"
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_NAMES,
  isLocale,
  translate,
  useLocale,
  useT,
} from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import type { MachineDraftRow, MachineRow } from "@/lib/database"
import { createDetector } from "@/lib/machines/detect"
import {
  type MachineConfig,
  type MachinePreset,
  type Reading,
  type Signal,
  MAX_MACHINES,
  PRESETS,
  SOURCES,
  SOURCE_INFO,
  type SourceId,
} from "@/lib/machines/model"
import { openSource } from "@/lib/machines/sources"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/machines"
import { messages } from "./machines.messages"

export const meta: Route.MetaFunction = ({ matches }) => {
  const root = matches[0]?.loaderData as { locale?: unknown } | undefined
  const locale = isLocale(root?.locale) ? root.locale : DEFAULT_LOCALE
  return [
    { title: `${translate(messages, locale, "meta")} · Palmframe` },
    PRIVATE,
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/machines", { headers })
  // The switch lives in Settings: without it, this page isn't there.
  if (!viewer.labs.machines)
    throw redirect("/projects?settings=labs", { headers })
  const [machines, drafts] = await Promise.all([
    supabase.from("comic_machines").select("*").order("created_at"),
    supabase
      .from("comic_machine_drafts")
      .select("*")
      .neq("status", "dismissed")
      .order("created_at", { ascending: false })
      .limit(100),
  ])
  return {
    machines: (machines.data ?? []) as MachineRow[],
    drafts: (drafts.data ?? []) as MachineDraftRow[],
    scheduled: !!process.env.MACHINES_CRON_SECRET?.trim(),
  }
}

async function post(body: unknown) {
  const res = await fetch("/api/machines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as {
    error?: string
    id?: string
    project?: string
    passed?: boolean
  }
  if (!res.ok) throw new Error(json.error ?? "failed")
  return json
}

const list = (s: string) =>
  s
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)

const MAX_LINES = 40

interface WireLine {
  key: string
  text: string
  url: string
}

// The stream in this tab, through the same detector the scheduled runner
// uses. Lines arrive far faster than anyone reads: they're buffered, and the
// screen catches up a few times a second.
function useWire(machine: MachineRow) {
  const [status, setStatus] = React.useState<
    "off" | "connecting" | "on" | "failed"
  >("off")
  const [counts, setCounts] = React.useState({ heard: 0, matched: 0 })
  const [lines, setLines] = React.useState<WireLine[]>([])
  const [signals, setSignals] = React.useState<Signal[]>([])
  const stop = React.useRef<(() => void) | null>(null)

  const start = () => {
    const controller = new AbortController()
    const detector = createDetector(machine.source, machine.config)
    const pending = new Map<string, WireLine>()
    let heard = 0
    let matched = 0
    setStatus("connecting")
    setLines([])
    setSignals([])
    setCounts({ heard: 0, matched: 0 })
    const flush = setInterval(() => {
      setCounts({ heard, matched })
      if (!pending.size) return
      const fresh = [...pending.values()].reverse()
      pending.clear()
      setLines((old) =>
        [
          ...fresh,
          ...old.filter((l) => !fresh.some((f) => f.key === l.key)),
        ].slice(0, MAX_LINES)
      )
    }, 400)
    const onReading = (reading: Reading) => {
      setStatus((s) => (s === "connecting" ? "on" : s))
      heard++
      const signal = detector.step(reading)
      if (signal) setSignals((old) => [signal, ...old].slice(0, 10))
      if (!detector.matches(reading)) return
      matched++
      const line =
        reading.kind === "text"
          ? { key: reading.url, text: reading.text, url: reading.url }
          : {
              key: reading.subject,
              text: `${reading.label} $${reading.value.toLocaleString("en-US")}`,
              url: reading.url,
            }
      pending.delete(line.key)
      pending.set(line.key, line)
    }
    openSource(machine.source, {
      keywords: machine.config.keywords,
      signal: controller.signal,
      onReading,
    }).then(
      () => {
        clearInterval(flush)
        if (!controller.signal.aborted) setStatus("failed")
      },
      () => {
        clearInterval(flush)
        setStatus("failed")
      }
    )
    stop.current = () => {
      controller.abort()
      clearInterval(flush)
      setStatus("off")
      stop.current = null
    }
  }

  React.useEffect(() => () => stop.current?.(), [])
  return { status, counts, lines, signals, start, stop: () => stop.current?.() }
}

function Wire({ machine }: { machine: MachineRow }) {
  const t = useT(messages)
  const revalidator = useRevalidator()
  const wire = useWire(machine)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [notes, setNotes] = React.useState<Record<string, string>>({})
  const live = wire.status === "connecting" || wire.status === "on"

  const write = async (signal: Signal) => {
    setBusy(signal.id)
    try {
      const r = await post({ intent: "draft", id: machine.id, signal })
      if (r.passed) setNotes((n) => ({ ...n, [signal.id]: t("wire.passed") }))
      revalidator.revalidate()
    } catch (e) {
      const credits = e instanceof Error && e.message === "credits"
      setNotes((n) => ({
        ...n,
        [signal.id]: t(credits ? "errors.credits" : "errors.generic"),
      }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      aria-label={t("wire.title")}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{t("wire.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("wire.hint")}</p>
        </div>
        <Button
          variant="outline"
          onPress={() => (live ? wire.stop() : wire.start())}
        >
          {wire.status === "connecting" ? (
            <Spinner />
          ) : (
            <HugeiconsIcon icon={RadioIcon} strokeWidth={2} />
          )}
          {live ? t("wire.stop") : t("wire.listen")}
        </Button>
      </div>

      {wire.status === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          {t("wire.failed")}
        </p>
      )}

      {wire.signals.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{t("wire.fired")}</h4>
          {wire.signals.map((signal) => (
            <div
              key={signal.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{signal.title}</p>
                <p className="text-xs text-muted-foreground">
                  <Measure signal={signal} />
                </p>
                {notes[signal.id] && (
                  <p role="status" className="mt-1 text-xs">
                    {notes[signal.id]}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                isDisabled={busy !== null}
                onPress={() => write(signal)}
              >
                {busy === signal.id ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
                )}
                {t("wire.write")}
              </Button>
            </div>
          ))}
        </div>
      )}

      {wire.status !== "off" && wire.status !== "failed" && (
        <div className="flex flex-col gap-2">
          <p
            aria-live="off"
            className="text-xs text-muted-foreground tabular-nums"
          >
            {wire.status === "connecting"
              ? t("wire.connecting")
              : t("wire.heard", {
                  heard: wire.counts.heard.toLocaleString(),
                  matched: wire.counts.matched.toLocaleString(),
                })}
          </p>
          {wire.lines.length ? (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
              {wire.lines.map((line) => (
                <li key={line.key} className="truncate">
                  <a
                    href={line.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {line.text}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            wire.status === "on" && (
              <p className="text-sm text-muted-foreground">{t("wire.quiet")}</p>
            )
          )}
        </div>
      )}
    </section>
  )
}

function Measure({ signal }: { signal: Signal }) {
  const t = useT(messages)
  const { locale } = useLocale()
  const m = signal.measure
  return m.type === "count"
    ? t("measure.count", {
        count: m.count.toLocaleString(locale),
        minutes: m.minutes,
      })
    : t("measure.move", {
        change: `${m.change > 0 ? "+" : ""}${m.change.toLocaleString(locale, { maximumFractionDigits: 1 })}`,
        minutes: m.minutes,
      })
}

function Draft({ draft }: { draft: MachineDraftRow }) {
  const t = useT(messages)
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const act = async (work: () => Promise<void>) => {
    setBusy(true)
    setFailed(false)
    try {
      await work()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border p-4">
      <p className="text-sm whitespace-pre-wrap">{draft.text}</p>
      {draft.scene && (
        <p className="text-sm text-muted-foreground">{draft.scene}</p>
      )}
      {!draft.prompt && (
        <p className="text-xs text-muted-foreground">{t("drafts.plain")}</p>
      )}
      <p className="text-xs text-muted-foreground">
        <Measure signal={draft.signal} />
        {" · "}
        <a
          href={draft.signal.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {t("drafts.source")}
        </a>
      </p>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("errors.generic")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={async () => {
            await navigator.clipboard.writeText(draft.text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          {copied ? t("drafts.copied") : t("drafts.copy")}
        </Button>
        {draft.project_id ? (
          <Link
            to={`/p/${draft.project_id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("drafts.open")}
          </Link>
        ) : (
          draft.scene && (
            <Button
              variant="outline"
              size="sm"
              isDisabled={busy}
              onPress={() =>
                act(async () => {
                  const { project } = await post({
                    intent: "comic",
                    id: draft.id,
                  })
                  navigate(`/p/${project}`)
                })
              }
            >
              {t("drafts.comic")}
            </Button>
          )
        )}
        <Button
          variant="ghost"
          size="sm"
          isDisabled={busy}
          onPress={() =>
            act(async () => {
              await post({ intent: "dismiss", id: draft.id })
              revalidator.revalidate()
            })
          }
        >
          {t("drafts.dismiss")}
        </Button>
      </div>
    </li>
  )
}

function Filter({ machine }: { machine: MachineRow }) {
  const t = useT(messages)
  const revalidator = useRevalidator()
  const c = machine.config
  const [name, setName] = React.useState(machine.name)
  const [keywords, setKeywords] = React.useState(c.keywords.join(", "))
  const [exclude, setExclude] = React.useState(c.exclude.join(", "))
  const [threshold, setThreshold] = React.useState(String(c.threshold))
  const [windowMinutes, setWindow] = React.useState(String(c.windowMinutes))
  const [cooldown, setCooldown] = React.useState(String(c.cooldownMinutes))
  const [cap, setCap] = React.useState(String(c.dailyCap))
  const [voice, setVoice] = React.useState(c.voice)
  const [language, setLanguage] = React.useState(c.language)
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(
    null
  )
  const [busy, setBusy] = React.useState(false)
  const info = SOURCE_INFO[machine.source]
  const crypto = machine.source === "crypto"

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNote(null)
    try {
      await post({
        intent: "save",
        machine: {
          id: machine.id,
          name,
          source: machine.source,
          config: {
            keywords: list(keywords),
            exclude: list(exclude),
            threshold: Number(threshold),
            windowMinutes: Number(windowMinutes),
            cooldownMinutes: Number(cooldown),
            dailyCap: Number(cap),
            voice,
            language,
          } satisfies MachineConfig,
        },
      })
      setNote({ ok: true, text: t("form.saved") })
      revalidator.revalidate()
    } catch {
      setNote({ ok: false, text: t("errors.generic") })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={save}
      aria-label={t("form.title")}
      className="flex flex-col gap-4 rounded-xl border p-4"
    >
      <h3 className="font-medium">{t("form.title")}</h3>
      <Field label={t("form.name")} htmlFor="machine-name">
        <Input
          id="machine-name"
          value={name}
          maxLength={80}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label={crypto ? t("form.assets") : t("form.keywords")}
        htmlFor="machine-keywords"
        hint={
          crypto
            ? t("form.assetsHint")
            : info.needsKeywords
              ? t("form.keywordsHint")
              : t("form.anyArticle")
        }
      >
        <Input
          id="machine-keywords"
          value={keywords}
          required={info.needsKeywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
      </Field>
      {!crypto && (
        <Field label={t("form.exclude")} htmlFor="machine-exclude">
          <Input
            id="machine-exclude"
            value={exclude}
            onChange={(e) => setExclude(e.target.value)}
          />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={
            info.kind === "text"
              ? t("form.thresholdCount")
              : t("form.thresholdMove")
          }
          htmlFor="machine-threshold"
        >
          <Input
            id="machine-threshold"
            type="number"
            inputMode="decimal"
            min={info.kind === "text" ? 1 : 0.1}
            max={1000}
            step={info.kind === "text" ? 1 : 0.1}
            value={threshold}
            required
            onChange={(e) => setThreshold(e.target.value)}
          />
        </Field>
        <Field label={t("form.window")} htmlFor="machine-window">
          <Input
            id="machine-window"
            type="number"
            min={1}
            max={1440}
            value={windowMinutes}
            required
            onChange={(e) => setWindow(e.target.value)}
          />
        </Field>
        <Field label={t("form.cooldown")} htmlFor="machine-cooldown">
          <Input
            id="machine-cooldown"
            type="number"
            min={1}
            max={10080}
            value={cooldown}
            required
            onChange={(e) => setCooldown(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label={t("form.cap")}
        htmlFor="machine-cap"
        hint={t("form.capHint", { cost: COSTS.machine_draft })}
      >
        <Input
          id="machine-cap"
          type="number"
          min={1}
          max={20}
          value={cap}
          required
          className="w-28"
          onChange={(e) => setCap(e.target.value)}
        />
      </Field>
      <Field label={t("form.language")} htmlFor="machine-language">
        <NativeSelect
          id="machine-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t("form.voice")} htmlFor="machine-voice">
        <Textarea
          id="machine-voice"
          value={voice}
          maxLength={600}
          rows={3}
          placeholder={t("form.voicePlaceholder")}
          onChange={(e) => setVoice(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" isDisabled={busy}>
          {busy && <Spinner />}
          {t("form.save")}
        </Button>
        {note && (
          <p
            role={note.ok ? "status" : "alert"}
            className={cn(
              "text-sm",
              note.ok ? "text-muted-foreground" : "text-destructive"
            )}
          >
            {note.text}
          </p>
        )}
      </div>
    </form>
  )
}

function Machine({
  machine,
  drafts,
  scheduled,
}: {
  machine: MachineRow
  drafts: MachineDraftRow[]
  scheduled: boolean
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const revalidator = useRevalidator()
  const [busy, setBusy] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  const act = async (body: unknown) => {
    setBusy(true)
    try {
      await post(body)
      revalidator.revalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{machine.name}</h2>
          <p className="text-sm text-muted-foreground">
            {t(`sources.${machine.source}`)}
            {machine.last_run_at &&
              ` · ${t("status.lastRun", {
                when: new Date(machine.last_run_at).toLocaleString(locale, {
                  dateStyle: "short",
                  timeStyle: "short",
                }),
              })}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-2 px-2 text-sm">
            <Switch
              aria-label={t("status.running")}
              isSelected={machine.enabled}
              isDisabled={busy}
              onChange={(on) => void act({ intent: "run", id: machine.id, on })}
            />
            {machine.enabled ? t("status.running") : t("status.paused")}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("form.delete")}
            isDisabled={busy}
            onPress={() => setConfirming(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
      {machine.enabled && !scheduled && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("status.notScheduled")}
        </p>
      )}
      {machine.last_error && (
        <p role="alert" className="text-sm text-destructive">
          {machine.last_error}
        </p>
      )}

      <Wire key={machine.updated_at} machine={machine} />

      <section aria-label={t("drafts.title")} className="flex flex-col gap-2">
        <h3 className="font-medium">{t("drafts.title")}</h3>
        {drafts.length ? (
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => (
              <Draft key={d.id} draft={d} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("drafts.empty")}</p>
        )}
      </section>

      <Filter key={`filter-${machine.updated_at}`} machine={machine} />

      <AlertDialog isOpen={confirming} onOpenChange={setConfirming}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("delete.title", { name: machine.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("delete.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            onPress={() => {
              setConfirming(false)
              void act({ intent: "remove", id: machine.id })
            }}
          >
            {t("form.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialog>
    </div>
  )
}

export default function Machines({ loaderData }: Route.ComponentProps) {
  const { machines, drafts, scheduled } = loaderData
  const t = useT(messages)
  const revalidator = useRevalidator()
  const [selected, setSelected] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const current = machines.find((m) => m.id === selected) ?? machines[0]
  const full = machines.length >= MAX_MACHINES

  const create = async (preset: MachinePreset) => {
    setError(null)
    try {
      const { id } = await post({
        intent: "save",
        machine: {
          name: t(`presets.${preset.id}`),
          source: preset.source,
          config: preset.config,
        },
      })
      if (id) setSelected(id)
      revalidator.revalidate()
    } catch {
      setError(t("errors.generic"))
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between gap-2 border-b px-2.5">
        <Logo />
        <AccountMenu />
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("intro")}</p>
          </div>
          <DropdownMenuTrigger>
            <Button variant="outline" isDisabled={full}>
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              {t("create")}
            </Button>
            <DropdownMenu
              placement="bottom end"
              onAction={(key) => {
                const preset = PRESETS.find((p) => p.id === key)
                if (preset) void create(preset)
              }}
            >
              {PRESETS.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  id={p.id}
                  textValue={t(`presets.${p.id}`)}
                >
                  {t(`presets.${p.id}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenu>
          </DropdownMenuTrigger>
        </div>
        {full && (
          <p className="text-sm text-muted-foreground">
            {t("limit", { n: MAX_MACHINES })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {current ? (
          <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label={t("title")} className="flex flex-col gap-1">
              {machines.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-current={m.id === current.id ? "page" : undefined}
                  onClick={() => setSelected(m.id)}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    m.id === current.id
                      ? "bg-foreground/10 font-medium"
                      : "text-muted-foreground hover:bg-foreground/5"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      m.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
                    )}
                  />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </nav>
            <Machine
              key={current.id}
              machine={current}
              drafts={drafts.filter((d) => d.machine_id === current.id)}
              scheduled={scheduled}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed py-16 text-center">
            <p className="font-medium">{t("empty.title")}</p>
            <p className="text-sm text-muted-foreground">{t("empty.text")}</p>
          </div>
        )}
      </main>
    </div>
  )
}
