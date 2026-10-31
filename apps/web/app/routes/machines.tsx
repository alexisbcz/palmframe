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
  Add01Icon,
  Alert02Icon,
  BitcoinIcon,
  CodeIcon,
  Comment01Icon,
  Copy01Icon,
  Delete02Icon,
  NewsIcon,
  SentIcon,
  PlusSignIcon,
  RadioIcon,
  SparklesIcon,
  WikipediaIcon,
} from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
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
import { availableFormats } from "@/lib/media/formats"
import type { FormatId } from "@/lib/media/model"
import type {
  MachineDraftRow,
  MachineFeedStateRow,
  MachineItemRow,
  MachineRow,
} from "@/lib/database"
import {
  existingProfile,
  instagramEnabled,
  listAccounts,
} from "@/lib/instagram.server"
import {
  type DatasetId,
  CLOSED_DATASETS,
  DATASETS,
  OPEN_DATASETS,
} from "@/lib/machines/datasets"
import { createDetector } from "@/lib/machines/detect"
import {
  type DiscordOutput,
  discordOutputs,
  discordReady,
} from "@/lib/machines/discord.server"
import {
  type DismissReason,
  type RetractReason,
  type Feed,
  type MachineConfig,
  type MachineOutput,
  type MachinePreset,
  type Notice,
  DISMISS_REASONS,
  EVERY_MINUTES,
  FEED_KINDS,
  MAX_CREDITS_PER_DAY,
  MAX_FEEDS,
  MIN_CREDITS_PER_DAY,
  OUTPUT_PLATFORMS,
  type OutputPlatform,
  type PublishMode,
  type TypedFeed,
  RETRACTABLE,
  RETRACT_REASONS,
  type Reading,
  type Signal,
  MAX_MACHINES,
  type MediaConfig,
  NO_MEDIA,
  PRESETS,
  SOURCES,
  SOURCE_INFO,
  type SourceId,
  DEFAULT_CREDITS_PER_DAY,
  noticeOf,
} from "@/lib/machines/model"
import {
  type Arena,
  type Scrutiny,
  type Stance,
  type Style,
  ARENAS,
  FAR_STANCES,
  LINE_REVIEW_POSTS,
  MAX_SCRUTINY,
  SCRUTINY,
  STANCES,
  STANCE_COOLDOWN_DAYS,
  STYLES,
  lineOf,
  styleOf,
  usesDesk,
} from "@/lib/machines/stance"
import { imageAvailable } from "@/lib/machines/image.server"
import { feedHealth, feedKey } from "@/lib/machines/source-state"
import { openSource } from "@/lib/machines/sources"
import { payingConnection } from "@/lib/openrouter.server"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/machines"
import { messages } from "./machines.messages"
import { messages as mediaMessages } from "./media.messages"

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
  const posting = instagramEnabled()
  const [machines, drafts, items, feedStates, accounts, connection, discord] =
    await Promise.all([
      supabase.from("comic_machines").select("*").order("created_at"),
      supabase
        .from("comic_machine_drafts")
        .select("*")
        .neq("status", "dismissed")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("comic_machine_items")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(100),
      // Not `seen`: it's long, and the page has no use for it.
      supabase
        .from("comic_machine_feed_state")
        .select("machine_id, feed_key, failures, last_read_at, last_item_at"),
      (async () => {
        if (!posting) return []
        const profile = await existingProfile(viewer.id)
        return profile ? listAccounts(profile) : []
      })().catch(() => []),
      payingConnection(viewer.id).catch(() => null),
      discordOutputs(viewer.id).catch(() => []),
    ])
  return {
    machines: (machines.data ?? []) as MachineRow[],
    drafts: (drafts.data ?? []) as MachineDraftRow[],
    items: (items.data ?? []) as MachineItemRow[],
    feedStates: (feedStates.data ?? []) as FeedStatus[],
    readAt: Date.now(),
    accounts: accounts.filter((a) =>
      OUTPUT_PLATFORMS.includes(a.platform as OutputPlatform)
    ),
    posting,
    discord,
    discordReady: discordReady(),
    canDraw: imageAvailable(connection),
    formats: availableFormats(),
    scheduled: !!process.env.MACHINES_CRON_SECRET?.trim(),
  }
}

type FeedStatus = Pick<
  MachineFeedStateRow,
  "machine_id" | "feed_key" | "failures" | "last_read_at" | "last_item_at"
>

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
    ok?: boolean
    halted?: boolean
    stopped?: Notice
    manual?: number
    errors?: string[]
    wait?: number
  }
  if (!res.ok)
    throw Object.assign(new Error(json.error ?? "failed"), { wait: json.wait })
  return json
}

const PRESET_ICONS = {
  newsroom: NewsIcon,
  hackernews: CodeIcon,
  wikipedia: WikipediaIcon,
  bluesky: Comment01Icon,
  crypto: BitcoinIcon,
  rejectedBin: Delete02Icon,
  foreignObject: Alert02Icon,
  rappelConso: Alert02Icon,
} satisfies Record<MachinePreset["id"], unknown>

const list = (s: string) =>
  s
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)

const MAX_LINES = 40

const DISCORD_ERRORS = [
  "discord_url",
  "discord_wait",
  "discord_gone",
  "discord_missing",
  "discord_halted",
] as const

const LINE_ERRORS = [
  "one_stance",
  "cooldown",
  "review_first",
  "line_rules",
  "no_desk",
  "social_feed",
  "dataset_blocked",
  "rival_rules",
] as const

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
  const writes = !usesDesk({
    line: lineOf(machine.config),
    style: styleOf(machine.config),
  })

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
              {writes && (
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
              )}
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
            <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
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

function Status({ draft }: { draft: MachineDraftRow }) {
  const t = useT(messages)
  const { locale } = useLocale()
  const labels: Partial<Record<MachineDraftRow["status"], string>> = {
    new: t("posts.waiting"),
    approved: t("posts.queued"),
    publishing: t("posts.publishing"),
    failed: t("posts.failed"),
    published: t("posts.published"),
    expired: t("posts.expired"),
    blocked: t("posts.blocked"),
    retracted: t("posts.retracted"),
  }
  const label = labels[draft.status]
  if (!label) return null
  return (
    <p className="text-xs font-medium text-muted-foreground">
      {label}
      {draft.published_at &&
        ` · ${new Date(draft.published_at).toLocaleString(locale, {
          dateStyle: "short",
          timeStyle: "short",
        })}`}
    </p>
  )
}

function Draft({
  draft,
  machine,
}: {
  draft: MachineDraftRow
  machine: MachineRow
}) {
  const t = useT(messages)
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [text, setText] = React.useState(draft.text)
  const editable = draft.status === "new" || draft.status === "failed"
  const canPost = machine.public || machine.outputs.length > 0
  const source = draft.sources[0]
  const link = source?.url ?? draft.signal?.url

  const act = async (work: () => Promise<void>) => {
    setBusy(true)
    setFailed(null)
    try {
      await work()
    } catch {
      setFailed(t("errors.generic"))
    } finally {
      setBusy(false)
    }
  }
  const retract = (reason: RetractReason) =>
    act(async () => {
      const r = await post({ intent: "retract", id: draft.id, reason })
      if (r.manual) setFailed(t("posts.retractLeft", { n: r.manual }))
      revalidator.revalidate()
    })
  const dismiss = (reason?: DismissReason) =>
    act(async () => {
      await post({ intent: "dismiss", id: draft.id, reason })
      revalidator.revalidate()
    })

  return (
    <li className="flex flex-col gap-2 rounded-xl border p-4">
      <Status draft={draft} />
      {draft.image_url && (
        <img
          src={draft.image_url}
          alt={draft.alt}
          loading="lazy"
          className="h-auto max-w-sm rounded-lg"
        />
      )}
      {editable && canPost ? (
        <Textarea
          aria-label={t("posts.text")}
          value={text}
          maxLength={500}
          rows={3}
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
          {draft.text}
        </p>
      )}
      {draft.scene && !draft.image_url && (
        <p className="text-sm text-muted-foreground">{draft.scene}</p>
      )}
      {draft.held &&
        (draft.status === "blocked" ? (
          <p role="status" className="text-sm text-destructive">
            {t("posts.blockedReason", { reason: draft.held })}
          </p>
        ) : (
          <p
            role="status"
            className="text-sm text-amber-600 dark:text-amber-400"
          >
            {t("posts.held", { reason: draft.held })}
          </p>
        ))}
      {draft.take_note && (
        <p className="text-sm text-muted-foreground">
          {t("posts.takeDropped", { reason: draft.take_note })}
        </p>
      )}
      {draft.status === "retracted" && draft.retract_reason && (
        <p className="text-sm text-muted-foreground">
          {t(`retractReasons.${draft.retract_reason}`)}
        </p>
      )}
      {!draft.prompt && (
        <p className="text-xs text-muted-foreground">{t("drafts.plain")}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {draft.signal && (
          <>
            <Measure signal={draft.signal} />
            {" · "}
          </>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {source?.source ?? t("drafts.source")}
          </a>
        )}
      </p>
      {draft.receipts.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {draft.receipts.map((r) => (
            <li key={r.accountId} className="min-w-0 truncate">
              {t(`platforms.${r.platform}`)} · {r.username}
              {" · "}
              {r.retraction === "removed" ? (
                t("posts.removed")
              ) : r.retraction === "manual" ? (
                <span className="text-destructive">
                  {t("posts.byHand")}
                  {r.url && (
                    <>
                      {" · "}
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {t("posts.view")}
                      </a>
                    </>
                  )}
                </span>
              ) : r.error ? (
                <span className="text-destructive">{r.error}</span>
              ) : r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {t("posts.view")}
                </a>
              ) : (
                t("posts.sent")
              )}
            </li>
          ))}
        </ul>
      )}
      {draft.status === "published" &&
        draft.receipts.some((r) => !RETRACTABLE[r.platform]) && (
          <p className="text-sm text-muted-foreground">
            {t("posts.retractManual")}
          </p>
        )}
      {draft.discord_status && (
        <p
          className={cn(
            "text-xs",
            draft.discord_status === "left"
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {t(`discord.status.${draft.discord_status}`)}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {failed}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {editable && canPost && (
          <Button
            variant="outline"
            size="sm"
            isDisabled={busy || !text.trim()}
            onPress={() =>
              act(async () => {
                const r = await post({ intent: "approve", id: draft.id, text })
                if (r.halted) setFailed(t("posts.halted"))
                else if (r.stopped)
                  setFailed(t(`notices.${r.stopped}`, { feeds: "" }))
                else if (r.errors?.length) setFailed(r.errors[0]!)
                revalidator.revalidate()
              })
            }
          >
            {busy ? (
              <Spinner />
            ) : (
              <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
            )}
            {draft.status === "failed" ? t("posts.retry") : t("posts.approve")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onPress={async () => {
            await navigator.clipboard.writeText(text)
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
        {draft.status === "published" && (
          <DropdownMenuTrigger>
            <Button variant="outline" size="sm" isDisabled={busy}>
              {t("posts.retract")}
            </Button>
            <DropdownMenu
              aria-label={t("posts.retract")}
              className="min-w-48"
              onAction={(key) => {
                const reason = RETRACT_REASONS.find((r) => r === key)
                if (reason) void retract(reason)
              }}
            >
              {RETRACT_REASONS.map((reason) => (
                <DropdownMenuItem key={reason} id={reason}>
                  {t(`retractReasons.${reason}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenu>
          </DropdownMenuTrigger>
        )}
        {(editable || draft.status === "used") && (
          <DropdownMenuTrigger>
            <Button variant="ghost" size="sm" isDisabled={busy}>
              {t("drafts.dismiss")}
            </Button>
            <DropdownMenu
              aria-label={t("drafts.dismiss")}
              className="min-w-48"
              onAction={(key) =>
                dismiss(DISMISS_REASONS.find((reason) => reason === key))
              }
            >
              <DropdownMenuItem id="none">
                {t("dismissReasons.none")}
              </DropdownMenuItem>
              {DISMISS_REASONS.map((reason) => (
                <DropdownMenuItem key={reason} id={reason}>
                  {t(`dismissReasons.${reason}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenu>
          </DropdownMenuTrigger>
        )}
      </div>
    </li>
  )
}

const feedValue = (f: TypedFeed) =>
  f.kind === "rss" ? f.url : f.kind === "hackernews" ? "" : f.query

function makeFeed(kind: TypedFeed["kind"], value: string): TypedFeed {
  if (kind === "rss") return { kind, url: value.trim() }
  if (kind === "hackernews") return { kind }
  return { kind, query: value.trim() }
}

interface LineFields {
  stance: Stance | ""
  arena: Arena
  publisher: string
  contact: string
  scrutiny: Scrutiny[]
  style: Style
}

const isTyped = (feed: Feed): feed is TypedFeed =>
  feed.kind !== "dataset" && feed.kind !== "rival"

const isDataset = (feed: Feed, id: DatasetId) =>
  feed.kind === "dataset" && feed.preset === id

// Open datasets can be picked. Closed ones are listed, so an owner sees what's
// coming and why it isn't here yet, and one already on a machine can be taken off.
function DatasetPicker({
  feeds,
  onChange,
}: {
  feeds: Feed[]
  onChange: (feeds: Feed[]) => void
}) {
  const t = useT(messages)
  const full = feeds.length >= MAX_FEEDS
  const toggle = (id: DatasetId, on: boolean) =>
    onChange(
      on
        ? [...feeds, { kind: "dataset", preset: id }]
        : feeds.filter((f) => !isDataset(f, id))
    )
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t("agent.datasets")}</legend>
      <p className="text-sm text-muted-foreground">{t("agent.datasetsHint")}</p>
      <ul className="flex flex-col gap-2">
        {OPEN_DATASETS.map((id) => {
          const on = feeds.some((f) => isDataset(f, id))
          const { licence } = DATASETS[id]
          return (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
            >
              <Checkbox
                isSelected={on}
                isDisabled={!on && full}
                onChange={(next) => toggle(id, next)}
              >
                {t(`datasets.${id}`)}
              </Checkbox>
              {licence && (
                <a
                  href={licence.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline underline-offset-2"
                >
                  {licence.name}
                </a>
              )}
            </li>
          )
        })}
      </ul>
      <h4 className="text-sm font-medium">{t("agent.datasetsClosed")}</h4>
      <p className="text-sm text-muted-foreground">
        {t("agent.datasetsClosedHint")}
      </p>
      <ul className="flex flex-col gap-2">
        {CLOSED_DATASETS.map((id) => {
          const on = feeds.some((f) => isDataset(f, id))
          return (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
            >
              <Checkbox
                isSelected={on}
                isDisabled={!on}
                onChange={(next) => toggle(id, next)}
              >
                {t(`datasets.${id}`)}
              </Checkbox>
              <Badge variant="outline">{t("agent.termsUnread")}</Badge>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

// Other public outlets of this owner, to answer. Both pages then say who owns them.
function RivalPicker({
  feeds,
  outlets,
  onChange,
}: {
  feeds: Feed[]
  outlets: { id: string; name: string }[]
  onChange: (feeds: Feed[]) => void
}) {
  const t = useT(messages)
  const isRival = (f: Feed, id: string) =>
    f.kind === "rival" && f.machine === id
  if (!outlets.length) return null
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t("agent.rivals")}</legend>
      <p className="text-sm text-muted-foreground">{t("agent.rivalsHint")}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {outlets.map((o) => {
          const on = feeds.some((f) => isRival(f, o.id))
          return (
            <Checkbox
              key={o.id}
              isSelected={on}
              isDisabled={!on && feeds.length >= MAX_FEEDS}
              onChange={(next) =>
                onChange(
                  next
                    ? [...feeds, { kind: "rival", machine: o.id }]
                    : feeds.filter((f) => !isRival(f, o.id))
                )
              }
            >
              {o.name}
            </Checkbox>
          )
        })}
      </div>
    </fieldset>
  )
}

// One line per source: whether it's being read, and when it last said anything new.
function FeedHealthList({
  machine,
  machines,
  states,
  now,
}: {
  machine: MachineRow
  machines: MachineRow[]
  states: FeedStatus[]
  now: number
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const feeds = machine.config.feeds
  const label = (feed: Feed) =>
    feed.kind === "dataset"
      ? t(`datasets.${feed.preset}`)
      : feed.kind === "rival"
        ? (machines.find((m) => m.id === feed.machine)?.name ??
          t("agent.rivals"))
        : feed.kind === "rss"
          ? feed.url
          : t(`feeds.${feed.kind}`)
  if (!feeds.length) return null
  return (
    <section aria-label={t("health.title")} className="flex flex-col gap-2">
      <h3 className="font-medium">{t("health.title")}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {feeds.map((feed) => {
          const key = feedKey(feed)
          const state = states.find((s) => s.feed_key === key)
          const quiet =
            feed.kind === "dataset" ? DATASETS[feed.preset].quietDays : null
          return (
            <li key={key} className="flex min-w-0 flex-wrap gap-x-2">
              <span className="min-w-0 truncate">{label(feed)}</span>
              <span className="text-muted-foreground">
                {t(`health.${feedHealth(state, quiet, now)}`)}
                {state?.last_item_at &&
                  ` · ${t("health.lastItem", {
                    when: new Date(state.last_item_at).toLocaleDateString(
                      locale,
                      { dateStyle: "short", timeZone: "UTC" }
                    ),
                  })}`}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function FeedsEditor({
  feeds,
  onChange,
}: {
  feeds: Feed[]
  onChange: (feeds: Feed[]) => void
}) {
  const t = useT(messages)
  const set = (i: number, feed: Feed) =>
    onChange(feeds.map((f, n) => (n === i ? feed : f)))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t("agent.feeds")}</legend>
      <p className="text-sm text-muted-foreground">{t("agent.feedsHint")}</p>
      {feeds.map((feed, i) =>
        !isTyped(feed) ? null : (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label={t("agent.feedKind")}
              value={feed.kind}
              onChange={(e) =>
                set(
                  i,
                  makeFeed(e.target.value as TypedFeed["kind"], feedValue(feed))
                )
              }
            >
              {FEED_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`feeds.${k}`)}
                </option>
              ))}
            </NativeSelect>
            <ButtonGroup className="min-w-40 flex-1">
              {feed.kind !== "hackernews" && (
                <Input
                  aria-label={
                    feed.kind === "rss"
                      ? t("agent.feedUrl")
                      : t("agent.feedQuery")
                  }
                  type={feed.kind === "rss" ? "url" : "text"}
                  className="min-w-0 flex-1"
                  placeholder={
                    feed.kind === "rss" ? "https://" : t("agent.feedQuery")
                  }
                  value={feedValue(feed)}
                  required
                  onChange={(e) => set(i, makeFeed(feed.kind, e.target.value))}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                aria-label={t("agent.removeFeed")}
                onPress={() => onChange(feeds.filter((_, n) => n !== i))}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </ButtonGroup>
          </div>
        )
      )}
      <div>
        <Button
          variant="outline"
          size="sm"
          isDisabled={feeds.length >= MAX_FEEDS}
          onPress={() => onChange([...feeds, { kind: "news", query: "" }])}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          {t("agent.addFeed")}
        </Button>
      </div>
    </fieldset>
  )
}

// The stance and style fields of one machine. What a stance rules out elsewhere
// in the form is applied by the form, so this only reports it.
function LineEditor({
  value,
  outputs,
  onStance,
  onChange,
}: {
  value: LineFields
  outputs: MachineOutput[]
  onStance: (stance: Stance | "") => void
  onChange: (fields: Partial<LineFields>) => void
}) {
  const t = useT(messages)
  const { stance, arena, publisher, contact, scrutiny, style } = value
  const platforms = [...new Set(outputs.map((o) => o.platform))]
  return (
    <fieldset className="flex flex-col gap-3 border-t pt-4">
      <legend className="text-sm font-medium">{t("line.title")}</legend>
      <p className="text-sm text-muted-foreground">{t("line.hint")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("line.stance")} htmlFor="machine-stance">
          <NativeSelect
            id="machine-stance"
            value={stance}
            onChange={(e) => onStance(e.target.value as Stance | "")}
          >
            <option value="">{t("line.none")}</option>
            {STANCES.map((s) => (
              <option key={s} value={s}>
                {t(`stances.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("line.style")} htmlFor="machine-style">
          <NativeSelect
            id="machine-style"
            value={style}
            onChange={(e) => onChange({ style: e.target.value as Style })}
          >
            {STYLES.map((s) => (
              <option key={s} value={s}>
                {t(`styles.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {(stance || style !== "plain") && (
        <p className="text-sm text-muted-foreground">
          {t(stance ? "line.styleWithStance" : "line.styleAlone")}
        </p>
      )}
      {style !== "plain" && (
        <p className="text-sm text-muted-foreground">{t("line.styleLimits")}</p>
      )}
      {stance && (
        <>
          <Field label={t("line.arena")} htmlFor="machine-arena">
            <NativeSelect
              id="machine-arena"
              value={arena}
              onChange={(e) => onChange({ arena: e.target.value as Arena })}
            >
              {ARENAS.map((a) => (
                <option key={a} value={a}>
                  {t(`arenas.${a}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label={t("line.publisher")}
            htmlFor="machine-publisher"
            hint={t("line.publisherHint")}
          >
            <Input
              id="machine-publisher"
              value={publisher}
              minLength={2}
              maxLength={120}
              required
              onChange={(e) => onChange({ publisher: e.target.value })}
            />
          </Field>
          <Field
            label={t("line.contact")}
            htmlFor="machine-contact"
            hint={t("line.contactHint")}
          >
            <Input
              id="machine-contact"
              value={contact}
              maxLength={200}
              required
              onChange={(e) => onChange({ contact: e.target.value })}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">
              {t("line.scrutiny")}
            </legend>
            <p className="text-sm text-muted-foreground">
              {t("line.scrutinyHint", { n: MAX_SCRUTINY })}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SCRUTINY.map((s) => (
                <Checkbox
                  key={s}
                  isSelected={scrutiny.includes(s)}
                  isDisabled={
                    !scrutiny.includes(s) && scrutiny.length >= MAX_SCRUTINY
                  }
                  onChange={(on) =>
                    onChange({
                      scrutiny: on
                        ? [...scrutiny, s]
                        : scrutiny.filter((x) => x !== s),
                    })
                  }
                >
                  {t(`scrutiny.${s}`)}
                </Checkbox>
              ))}
            </div>
          </fieldset>
          <ul className="flex list-disc flex-col gap-1 ps-4 text-sm text-muted-foreground">
            <li>
              {FAR_STANCES.includes(stance)
                ? t("line.far")
                : t("line.review", { n: LINE_REVIEW_POSTS })}
            </li>
            <li>{t("line.off")}</li>
            <li>{t("line.oneStance")}</li>
            <li>{t("line.cooldown", { days: STANCE_COOLDOWN_DAYS })}</li>
            <li>{t("line.calendar")}</li>
          </ul>
          {platforms.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium">{t("line.checklist")}</p>
              <ul className="flex list-disc flex-col gap-1 ps-4 text-muted-foreground">
                {platforms.map((p) => (
                  <li key={p}>{t(`line.checks.${p}`)}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </fieldset>
  )
}

interface Connected {
  id: string
  platform: string
  username: string
}

function BlueskyConnect({ onDone }: { onDone: () => void }) {
  const t = useT(messages)
  const [identifier, setIdentifier] = React.useState("")
  const [appPassword, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const connect = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await post({ intent: "bluesky", identifier, appPassword })
      setPassword("")
      onDone()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
      <Input
        aria-label={t("out.blueskyHandle")}
        placeholder={t("out.blueskyHandle")}
        autoComplete="off"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <ButtonGroup className="w-full">
        <Input
          aria-label={t("out.blueskyPassword")}
          placeholder={t("out.blueskyPassword")}
          type="password"
          autoComplete="off"
          className="min-w-0 flex-1"
          value={appPassword}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          variant="outline"
          isDisabled={busy || !identifier || !appPassword}
          onPress={connect}
        >
          {busy && <Spinner />}
          {t("out.connectBluesky")}
        </Button>
      </ButtonGroup>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("out.blueskyFailed")}
        </p>
      )}
    </div>
  )
}

// The webhook goes one way: it's sent once from this box and nothing ever sends it
// back, so the page knows only that there is one, and the end of its id.
function DiscordConnect({
  machineId,
  output,
  onDone,
}: {
  machineId: string
  output: DiscordOutput | undefined
  onDone: () => void
}) {
  const t = useT(messages)
  const [url, setUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(
    null
  )
  const act = async (work: () => Promise<string>) => {
    setBusy(true)
    setNote(null)
    try {
      setNote({ ok: true, text: await work() })
      onDone()
    } catch (e) {
      const { message, wait } = e as Error & { wait?: number }
      const known = DISCORD_ERRORS.find((c) => c === message)
      setNote({
        ok: false,
        text: t(`discord.errors.${known ?? "failed"}`, { n: wait ?? 0 }),
      })
      if (message === "discord_gone") onDone()
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    act(async () => {
      await post({ intent: "discord_connect", id: machineId, url })
      setUrl("")
      return t("discord.saved")
    })
  const off = output?.state === "disabled"
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
      <p className="text-sm font-medium">{t("discord.title")}</p>
      <p className="text-sm text-muted-foreground">{t("discord.hint")}</p>
      {output && (
        <p
          className={cn(
            "text-sm",
            off ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {off
            ? t("discord.disabled")
            : t("discord.connected", { hint: output.hint })}
        </p>
      )}
      <ButtonGroup className="w-full">
        <Input
          aria-label={t("discord.url")}
          placeholder={t("discord.placeholder")}
          type="password"
          autoComplete="off"
          className="min-w-0 flex-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          variant="outline"
          isDisabled={busy || !url.trim()}
          onPress={save}
        >
          {t("discord.save")}
          {busy ? (
            <Spinner />
          ) : (
            <HugeiconsIcon
              icon={SentIcon}
              strokeWidth={2}
              className="rtl:rotate-180"
            />
          )}
        </Button>
      </ButtonGroup>
      {output && (
        <div className="flex flex-wrap gap-2">
          {!off && (
            <Button
              variant="outline"
              size="sm"
              isDisabled={busy}
              onPress={() =>
                act(async () => {
                  await post({ intent: "discord_test", id: machineId })
                  return t("discord.tested")
                })
              }
            >
              {t("discord.test")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            isDisabled={busy}
            onPress={() =>
              act(async () => {
                await post({ intent: "discord_remove", id: machineId })
                return t("discord.removed")
              })
            }
          >
            {t("discord.remove")}
          </Button>
        </div>
      )}
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
  )
}

function Filter({
  machine,
  outlets,
  accounts,
  posting,
  discord,
  discordReady,
  canDraw,
  formats,
}: {
  machine: MachineRow
  outlets: { id: string; name: string }[]
  accounts: Connected[]
  posting: boolean
  discord: DiscordOutput | undefined
  discordReady: boolean
  canDraw: boolean
  formats: FormatId[]
}) {
  const t = useT(messages)
  const tMedia = useT(mediaMessages)
  const revalidator = useRevalidator()
  const c = machine.config
  const [name, setName] = React.useState(machine.name)
  const [keywords, setKeywords] = React.useState(c.keywords.join(", "))
  const [exclude, setExclude] = React.useState(c.exclude.join(", "))
  const [threshold, setThreshold] = React.useState(String(c.threshold))
  const [windowMinutes, setWindow] = React.useState(String(c.windowMinutes))
  const [cooldown, setCooldown] = React.useState(String(c.cooldownMinutes))
  const [cap, setCap] = React.useState(String(c.dailyCap))
  // The stored config, so machines saved before this limit don't have one.
  const [maxCredits, setMaxCredits] = React.useState(
    String(c.maxCreditsPerDay ?? DEFAULT_CREDITS_PER_DAY)
  )
  const [voice, setVoice] = React.useState(c.voice)
  const [language, setLanguage] = React.useState(c.language)
  const [mission, setMission] = React.useState(c.mission)
  const [feeds, setFeeds] = React.useState<Feed[]>(c.feeds)
  const [listen, setListen] = React.useState(c.listen)
  const [every, setEvery] = React.useState(c.everyMinutes)
  const [image, setImage] = React.useState(c.image)
  // Machines saved before Stories have no such field.
  const [media, setMedia] = React.useState<MediaConfig>(c.media ?? NO_MEDIA)
  const [mode, setMode] = React.useState<PublishMode>(machine.publish_mode)
  const [outputs, setOutputs] = React.useState<MachineOutput[]>(machine.outputs)
  const [isPublic, setPublic] = React.useState(machine.public)
  // The stored config again: older machines have neither field.
  const storedLine = lineOf(c)
  const [line, setLine] = React.useState<LineFields>({
    stance: storedLine?.stance ?? "",
    arena: storedLine?.arena ?? ARENAS[0],
    publisher: storedLine?.publisher ?? "",
    contact: storedLine?.contact ?? "",
    scrutiny: storedLine?.scrutiny ?? [],
    style: styleOf(c),
  })
  const onLine = !!line.stance
  // A new stance goes back to review, and a far one never leaves it.
  const autoClosed =
    !!line.stance &&
    (FAR_STANCES.includes(line.stance) || line.stance !== storedLine?.stance)
  const pickStance = (stance: Stance | "") => {
    setLine((old) => ({ ...old, stance }))
    if (!stance) return
    setPublic(true)
    setImage(false)
    setMedia(NO_MEDIA)
    setOutputs((old) => old.filter((o) => o.platform !== "instagram"))
    if (stance !== storedLine?.stance || FAR_STANCES.includes(stance))
      setMode("review")
  }
  const [confirmAuto, setConfirmAuto] = React.useState(false)
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(
    null
  )
  const [busy, setBusy] = React.useState(false)
  const info = SOURCE_INFO[machine.source]
  const crypto = machine.source === "crypto"

  const nowhere = !outputs.length && !isPublic
  const toggleOutput = (account: Connected, on: boolean) =>
    setOutputs((old) =>
      on
        ? [
            ...old,
            {
              platform: account.platform as OutputPlatform,
              accountId: account.id,
              username: account.username,
            },
          ]
        : old.filter((o) => o.accountId !== account.id)
    )

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === "auto" && machine.publish_mode !== "auto") {
      setConfirmAuto(true)
      return
    }
    await persist()
  }

  const persist = async () => {
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
            maxCreditsPerDay: Number(maxCredits),
            voice,
            language,
            mission,
            feeds,
            listen,
            everyMinutes: every,
            image,
            media,
            line: line.stance
              ? {
                  stance: line.stance,
                  arena: line.arena,
                  publisher: line.publisher,
                  contact: line.contact,
                  scrutiny: line.scrutiny,
                }
              : null,
            style: line.style,
          } satisfies MachineConfig,
          publish_mode: mode,
          outputs,
          public: isPublic,
        },
      })
      setNote({ ok: true, text: t("form.saved") })
      revalidator.revalidate()
    } catch (e) {
      const code = LINE_ERRORS.find(
        (c) => e instanceof Error && e.message === c
      )
      setNote({
        ok: false,
        text: t(code ? `errors.${code}` : "errors.generic"),
      })
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
        label={t("agent.mission")}
        htmlFor="machine-mission"
        hint={t("agent.missionHint")}
      >
        <Textarea
          id="machine-mission"
          value={mission}
          maxLength={1000}
          rows={3}
          onChange={(e) => setMission(e.target.value)}
        />
      </Field>
      <LineEditor
        value={line}
        outputs={outputs}
        onStance={pickStance}
        onChange={(fields) => setLine((old) => ({ ...old, ...fields }))}
      />
      <FeedsEditor feeds={feeds} onChange={setFeeds} />
      <DatasetPicker feeds={feeds} onChange={setFeeds} />
      {isPublic && (onLine || line.style !== "plain") && (
        <RivalPicker feeds={feeds} outlets={outlets} onChange={setFeeds} />
      )}
      <Field
        label={t("agent.every")}
        htmlFor="machine-every"
        hint={t("agent.everyHint", { cost: COSTS.machine_run })}
      >
        <NativeSelect
          id="machine-every"
          value={String(every)}
          onChange={(e) => setEvery(Number(e.target.value))}
        >
          {EVERY_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m < 60
                ? t("agent.minutes", { n: m })
                : t("agent.hours", { n: m / 60 })}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-sm font-medium">{t("out.title")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            aria-label={t("out.public")}
            isSelected={isPublic}
            isDisabled={onLine}
            onChange={setPublic}
          />
          {t("out.public")}
        </label>
        {machine.public && machine.slug && (
          <a
            href={`/m/${machine.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline underline-offset-2"
          >
            /m/{machine.slug}
          </a>
        )}
        {accounts.map((a) => (
          <label key={a.id} className="flex min-w-0 items-center gap-2 text-sm">
            <Switch
              aria-label={`${t(`platforms.${a.platform as OutputPlatform}`)} ${a.username}`}
              isSelected={outputs.some((o) => o.accountId === a.id)}
              isDisabled={onLine && a.platform === "instagram"}
              onChange={(on) => toggleOutput(a, on)}
            />
            <span className="truncate">
              {t(`platforms.${a.platform as OutputPlatform}`)} · {a.username}
            </span>
          </label>
        ))}
        {posting && (
          <>
            <div className="flex flex-wrap gap-2">
              {OUTPUT_PLATFORMS.filter((p) => p !== "bluesky").map((p) => (
                <a
                  key={p}
                  href={`/api/machines/connect?platform=${p}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" })
                  )}
                >
                  {t("out.connect", { platform: t(`platforms.${p}`) })}
                </a>
              ))}
            </div>
            <BlueskyConnect onDone={() => revalidator.revalidate()} />
          </>
        )}
        {discordReady && (
          <DiscordConnect
            machineId={machine.id}
            output={discord}
            onDone={() => revalidator.revalidate()}
          />
        )}
        {outputs.some((o) => o.platform === "instagram") && !image && (
          <p className="text-sm text-muted-foreground">
            {t("out.instagramNeedsImage")}
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Switch
            aria-label={t("out.image")}
            isSelected={image}
            isDisabled={onLine || (!canDraw && !image)}
            onChange={setImage}
          />
          {t("out.image")}
        </label>
        <p className="text-sm text-muted-foreground">
          {canDraw
            ? t("out.imageHint", { cost: COSTS.machine_image })
            : t("out.imageOff")}
        </p>
        {formats.length > 0 && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                aria-label={t("out.story")}
                isSelected={media.enabled}
                isDisabled={onLine}
                onChange={(enabled) => setMedia({ ...media, enabled })}
              />
              {t("out.story")}
            </label>
            <p className="text-sm text-muted-foreground">
              {t("out.storyHint", {
                story: COSTS.deep_dive,
                format: COSTS.media_render,
              })}
            </p>
            {media.enabled && (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {formats.map((f) => (
                  <Checkbox
                    key={f}
                    isSelected={media.formats.includes(f)}
                    onChange={(on) =>
                      setMedia({
                        ...media,
                        formats: on
                          ? [...media.formats, f]
                          : media.formats.filter((x) => x !== f),
                      })
                    }
                  >
                    {tMedia(`formats.${f}`)}
                  </Checkbox>
                ))}
              </div>
            )}
          </>
        )}
        <Field
          label={t("out.mode")}
          htmlFor="machine-mode"
          hint={mode === "auto" ? t("out.autoHint") : t("out.reviewHint")}
        >
          <NativeSelect
            id="machine-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as PublishMode)}
          >
            <option value="review">{t("out.review")}</option>
            <option value="auto" disabled={nowhere || autoClosed}>
              {t("out.auto")}
            </option>
          </NativeSelect>
        </Field>
      </fieldset>

      <label className="flex items-center gap-2 border-t pt-4 text-sm">
        <Switch
          aria-label={t("agent.listen")}
          isSelected={listen}
          onChange={setListen}
        />
        {t("agent.listen", { stream: t(`sources.${machine.source}`) })}
      </label>
      {listen && (
        <>
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
        </>
      )}
      <Field
        label={t("form.cap")}
        htmlFor="machine-cap"
        hint={t("form.capHint")}
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
      <Field
        label={t("form.maxCredits")}
        htmlFor="machine-max-credits"
        hint={t("form.maxCreditsHint")}
      >
        <Input
          id="machine-max-credits"
          type="number"
          min={MIN_CREDITS_PER_DAY}
          max={MAX_CREDITS_PER_DAY}
          value={maxCredits}
          required
          className="w-28"
          onChange={(e) => setMaxCredits(e.target.value)}
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
      <AlertDialog isOpen={confirmAuto} onOpenChange={setConfirmAuto}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("out.confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("out.confirmBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
          <Button
            variant="outline"
            onPress={() => {
              setConfirmAuto(false)
              void persist()
            }}
          >
            {t("out.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialog>
    </form>
  )
}

function Machine({
  machine,
  machines,
  drafts,
  items,
  feedStates,
  now,
  accounts,
  posting,
  discord,
  discordReady,
  canDraw,
  formats,
  scheduled,
}: {
  machine: MachineRow
  machines: MachineRow[]
  drafts: MachineDraftRow[]
  items: MachineItemRow[]
  feedStates: FeedStatus[]
  now: number
  accounts: Connected[]
  posting: boolean
  discord: DiscordOutput | undefined
  discordReady: boolean
  canDraw: boolean
  formats: FormatId[]
  scheduled: boolean
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const revalidator = useRevalidator()
  const [busy, setBusy] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const notice = machine.last_error ? noticeOf(machine.last_error) : null

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
          <h2 className="studio-title truncate py-0.5 text-2xl">
            {machine.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(machine.publish_mode === "auto" ? "out.auto" : "out.review")}
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
          {notice
            ? t(`notices.${notice.notice}`, { feeds: notice.detail })
            : machine.last_error}
        </p>
      )}

      {machine.config.listen && (
        <Wire key={machine.updated_at} machine={machine} />
      )}

      <section aria-label={t("drafts.title")} className="flex flex-col gap-2">
        <h3 className="font-medium">{t("posts.title")}</h3>
        {drafts.length ? (
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => (
              <Draft key={d.id} draft={d} machine={machine} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("drafts.empty")}</p>
        )}
      </section>

      {items.length > 0 && (
        <section aria-label={t("inbox.title")} className="flex flex-col gap-2">
          <h3 className="font-medium">{t("inbox.title")}</h3>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {items.map((i) => (
              <li key={i.id} className="truncate">
                <span className="text-xs font-medium">
                  {i.status === "used" ? `${t("inbox.used")} · ` : ""}
                </span>
                <a
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {i.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FeedHealthList
        machine={machine}
        machines={machines}
        states={feedStates}
        now={now}
      />

      <Filter
        key={`filter-${machine.id}`}
        machine={machine}
        outlets={machines.filter((m) => m.public && m.id !== machine.id)}
        accounts={accounts}
        posting={posting}
        discord={discord}
        discordReady={discordReady}
        canDraw={canDraw}
        formats={formats}
      />

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
  const {
    machines,
    drafts,
    items,
    feedStates,
    readAt,
    accounts,
    posting,
    discord,
    discordReady,
    canDraw,
    formats,
    scheduled,
  } = loaderData
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
    } catch (e) {
      const code = LINE_ERRORS.find(
        (c) => e instanceof Error && e.message === c
      )
      setError(t(code ? `errors.${code}` : "errors.generic"))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="max-w-2xl">
          <h1 className="studio-title text-4xl">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <DropdownMenuTrigger>
          <Button variant="outline" isDisabled={full}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            {t("create")}
          </Button>
          <DropdownMenu
            placement="bottom end"
            className="w-84 max-w-[calc(100vw-2rem)]"
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
                className="min-h-13 gap-3 px-2"
              >
                <HugeiconsIcon
                  icon={PRESET_ICONS[p.id]}
                  strokeWidth={2}
                  className="text-muted-foreground"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {t(`presets.${p.id}`)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t(`presetHints.${p.id}`)}
                  </span>
                </span>
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
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
            machines={machines}
            drafts={drafts.filter((d) => d.machine_id === current.id)}
            items={items.filter((i) => i.machine_id === current.id)}
            feedStates={feedStates.filter((s) => s.machine_id === current.id)}
            now={readAt}
            accounts={accounts}
            posting={posting}
            discord={discord.find((d) => d.machine_id === current.id)}
            discordReady={discordReady}
            canDraw={canDraw}
            formats={formats}
            scheduled={scheduled}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed py-16 text-center">
          <p className="font-medium">{t("empty.title")}</p>
          <p className="text-sm text-muted-foreground">{t("empty.text")}</p>
        </div>
      )}
    </div>
  )
}
