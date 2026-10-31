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
  Copy01Icon,
  Delete02Icon,
  SentIcon,
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
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  MachineItemRow,
  MachineRow,
} from "@/lib/database"
import {
  existingProfile,
  instagramEnabled,
  listAccounts,
} from "@/lib/instagram.server"
import { createDetector } from "@/lib/machines/detect"
import {
  type Feed,
  type MachineConfig,
  type MachineOutput,
  type MachinePreset,
  EVERY_MINUTES,
  FEED_KINDS,
  MAX_FEEDS,
  OUTPUT_PLATFORMS,
  type OutputPlatform,
  type PublishMode,
  type Reading,
  type Signal,
  MAX_MACHINES,
  type MediaConfig,
  NO_MEDIA,
  PRESETS,
  SOURCES,
  SOURCE_INFO,
  type SourceId,
} from "@/lib/machines/model"
import { imageAvailable } from "@/lib/machines/image.server"
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
  const [machines, drafts, items, accounts, connection] = await Promise.all([
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
    (async () => {
      if (!posting) return []
      const profile = await existingProfile(viewer.id)
      return profile ? listAccounts(profile) : []
    })().catch(() => []),
    payingConnection(viewer.id).catch(() => null),
  ])
  return {
    machines: (machines.data ?? []) as MachineRow[],
    drafts: (drafts.data ?? []) as MachineDraftRow[],
    items: (items.data ?? []) as MachineItemRow[],
    accounts: accounts.filter((a) =>
      OUTPUT_PLATFORMS.includes(a.platform as OutputPlatform)
    ),
    posting,
    canDraw: imageAvailable(connection),
    formats: availableFormats(),
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
    ok?: boolean
    errors?: string[]
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
        <p className="text-sm whitespace-pre-wrap">{draft.text}</p>
      )}
      {draft.scene && !draft.image_url && (
        <p className="text-sm text-muted-foreground">{draft.scene}</p>
      )}
      {draft.held && (
        <p role="status" className="text-sm text-amber-600 dark:text-amber-400">
          {t("posts.held", { reason: draft.held })}
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
              {r.error ? (
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
                if (r.errors?.length) setFailed(r.errors[0]!)
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
        {(editable || draft.status === "used") && (
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
        )}
      </div>
    </li>
  )
}

const feedValue = (f: Feed) =>
  f.kind === "rss" ? f.url : f.kind === "hackernews" ? "" : f.query

function makeFeed(kind: Feed["kind"], value: string): Feed {
  if (kind === "rss") return { kind, url: value.trim() }
  if (kind === "hackernews") return { kind }
  return { kind, query: value.trim() }
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
      {feeds.map((feed, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label={t("agent.feedKind")}
            value={feed.kind}
            onChange={(e) =>
              set(i, makeFeed(e.target.value as Feed["kind"], feedValue(feed)))
            }
          >
            {FEED_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`feeds.${k}`)}
              </option>
            ))}
          </NativeSelect>
          {feed.kind !== "hackernews" && (
            <Input
              aria-label={
                feed.kind === "rss" ? t("agent.feedUrl") : t("agent.feedQuery")
              }
              type={feed.kind === "rss" ? "url" : "text"}
              className="min-w-40 flex-1"
              placeholder={
                feed.kind === "rss" ? "https://" : t("agent.feedQuery")
              }
              value={feedValue(feed)}
              required
              onChange={(e) => set(i, makeFeed(feed.kind, e.target.value))}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("agent.removeFeed")}
            onPress={() => onChange(feeds.filter((_, n) => n !== i))}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </div>
      ))}
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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("out.blueskyHandle")}
          placeholder={t("out.blueskyHandle")}
          autoComplete="off"
          className="min-w-40 flex-1"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <Input
          aria-label={t("out.blueskyPassword")}
          placeholder={t("out.blueskyPassword")}
          type="password"
          autoComplete="off"
          className="min-w-40 flex-1"
          value={appPassword}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          isDisabled={busy || !identifier || !appPassword}
          onPress={connect}
        >
          {busy && <Spinner />}
          {t("out.connectBluesky")}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("out.blueskyFailed")}
        </p>
      )}
    </div>
  )
}

function Filter({
  machine,
  accounts,
  posting,
  canDraw,
  formats,
}: {
  machine: MachineRow
  accounts: Connected[]
  posting: boolean
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
            voice,
            language,
            mission,
            feeds,
            listen,
            everyMinutes: every,
            image,
            media,
          } satisfies MachineConfig,
          publish_mode: mode,
          outputs,
          public: isPublic,
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
      <FeedsEditor feeds={feeds} onChange={setFeeds} />
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
        {outputs.some((o) => o.platform === "instagram") && !image && (
          <p className="text-sm text-muted-foreground">
            {t("out.instagramNeedsImage")}
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Switch
            aria-label={t("out.image")}
            isSelected={image}
            isDisabled={!canDraw && !image}
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
            <option value="auto" disabled={nowhere}>
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
  drafts,
  items,
  accounts,
  posting,
  canDraw,
  formats,
  scheduled,
}: {
  machine: MachineRow
  drafts: MachineDraftRow[]
  items: MachineItemRow[]
  accounts: Connected[]
  posting: boolean
  canDraw: boolean
  formats: FormatId[]
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
          {machine.last_error}
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

      <Filter
        key={`filter-${machine.id}`}
        machine={machine}
        accounts={accounts}
        posting={posting}
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
    accounts,
    posting,
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
    } catch {
      setError(t("errors.generic"))
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
            items={items.filter((i) => i.machine_id === current.id)}
            accounts={accounts}
            posting={posting}
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
