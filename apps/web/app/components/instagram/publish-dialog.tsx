import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InstagramIcon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button, LinkButton } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

import { useLocale, useT, type Translate } from "@/i18n/core"
import {
  INSTAGRAM_LIMITS,
  aspectFits,
  checkPublish,
  countHashtags,
  type PublishCheck,
} from "@/lib/instagram-limits"
import type {
  InstagramAccount,
  PublishAs,
  PublishMode,
  PublishResult,
} from "@/lib/instagram.server"

import { pageDoc, type ComicProject } from "../comic-canvas/model"
import { renderToBlob, type ImageCache } from "../comic-canvas/render"
import type { ComicEditor } from "../comic-canvas/use-editor"
import { roving } from "../comic-canvas/roving"
import { messages } from "./publish.messages"
import { SchedulePicker } from "./schedule-picker"

const CAPTION_KEY = "palmframe:caption"
// Outline toggles: the chosen option gets the muted fill, not the primary black.
const SELECTED = "data-selected:bg-muted data-selected:text-foreground"

export function PublishButton({
  editor,
  images,
}: {
  editor: ComicEditor
  images: ImageCache
}) {
  const t = useT(messages)
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="outline"
        className="max-sm:px-2"
        onPress={() => setOpen(true)}
      >
        <HugeiconsIcon
          icon={InstagramIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        <span className="max-sm:sr-only">{t("button")}</span>
      </Button>
      {open && (
        <PublishDialog
          project={editor.projectRef.current}
          images={images}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// The lettering, in reading order, so screen reader users get the story.
function altText(
  project: ComicProject,
  index: number,
  t: Translate<(typeof messages)["en"]>
) {
  const layers = [...project.pages[index]!.layers]
    .filter((l) => !l.hidden)
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const lines = layers.flatMap((l) => {
    if (l.type === "panel" || !l.text.trim()) return []
    const kind =
      l.type === "text"
        ? t("alt.sfx")
        : l.shape === "caption"
          ? t("alt.caption")
          : l.shape === "message"
            ? t("alt.message")
            : l.shape === "thought"
              ? t("alt.thought")
              : l.shape === "shout"
                ? t("alt.shout")
                : t("alt.speech")
    return [`${kind}: ${l.text.trim().replace(/\s*\n\s*/g, " ")}`]
  })
  return [
    t("alt.slide", { n: index + 1, total: project.pages.length }),
    ...lines,
  ].join(" ")
}

type AccountsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; accounts: InstagramAccount[] }

async function fetchAccounts(init?: RequestInit, query = "") {
  const res = await fetch(`/api/instagram/accounts${query}`, init)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? res.statusText)
  return body.accounts as InstagramAccount[]
}

function useAccounts() {
  const [state, setState] = React.useState<AccountsState>({
    status: "loading",
  })
  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setState({ status: "loading" })
    try {
      const accounts = await fetchAccounts()
      setState({ status: "ready", accounts })
      return accounts
    } catch (e) {
      setState({ status: "error", message: (e as Error).message })
      return null
    }
  }, [])
  React.useEffect(() => {
    load()
  }, [load])
  const disconnect = React.useCallback(async (id: string) => {
    const accounts = await fetchAccounts(
      { method: "DELETE" },
      `?id=${encodeURIComponent(id)}`
    )
    setState({ status: "ready", accounts })
  }, [])
  return { state, load, disconnect }
}

// Instagram's login runs in a popup, so the dialog keeps its caption and
// settings; the callback page posts the outcome back and closes.
const CONNECT_ERRORS: Record<string, ConnectError> = {
  oauth_denied: "cancelled",
  connection_cancelled: "cancelled",
  personal_account_not_supported: "personal",
  account_limit_exceeded: "unavailable",
  profile_limit_exceeded: "unavailable",
  payment_required: "unavailable",
}
type ConnectError = "cancelled" | "personal" | "unavailable" | "failed"

function useConnect(onConnected: (username: string) => void) {
  const [connecting, setConnecting] = React.useState(false)
  const [error, setError] = React.useState<ConnectError | null>(null)
  const popup = React.useRef<Window | null>(null)
  const done = React.useRef(onConnected)
  done.current = onConnected

  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        e.origin !== location.origin ||
        e.data?.type !== "palmframe:instagram"
      )
        return
      setConnecting(false)
      popup.current = null
      if (e.data.ok) done.current(String(e.data.username ?? ""))
      else setError(CONNECT_ERRORS[e.data.error] ?? "failed")
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  // Closed without an answer: maybe it connected anyway, so look again.
  React.useEffect(() => {
    if (!connecting) return
    const id = setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null
        setConnecting(false)
        done.current("")
      }
    }, 600)
    return () => clearInterval(id)
  }, [connecting])

  const connect = () => {
    setError(null)
    const next = encodeURIComponent(location.pathname + location.search)
    const url = `/api/instagram/connect?popup=1&next=${next}`
    const w = window.open(
      url,
      "palmframe-instagram",
      "popup,width=520,height=720"
    )
    // Popups blocked: do the same in this tab and come back here after.
    if (!w) return void location.assign(`/api/instagram/connect?next=${next}`)
    popup.current = w
    setConnecting(true)
  }
  return { connect, connecting, error }
}

// An hour from now, rounded to the quarter, as a datetime-local value.
function defaultSchedule() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Phase =
  | { step: "form" }
  | { step: "rendering" | "uploading" }
  | { step: "done"; result: PublishResult; mode: PublishMode }

function PublishDialog({
  project,
  images,
  onClose,
}: {
  project: ComicProject
  images: ImageCache
  onClose: () => void
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const { state: accounts, load: reloadAccounts, disconnect } = useAccounts()
  const [accountId, setAccountId] = React.useState<string | null>(null)
  const connection = useConnect(async (username) => {
    const list = await reloadAccounts(true)
    const added = username && list?.find((a) => a.username === username)
    if (added) setAccountId(added.id)
  })
  const count = project.pages.length
  const tall = !aspectFits(project.width, project.height)
  const [as, setAs] = React.useState<PublishAs>(
    tall || count > INSTAGRAM_LIMITS.slides ? "story" : "feed"
  )
  const [mode, setMode] = React.useState<PublishMode>("now")
  const [when, setWhen] = React.useState(defaultSchedule)
  const [caption, setCaption] = React.useState(() => {
    try {
      return localStorage.getItem(CAPTION_KEY) ?? ""
    } catch {
      return ""
    }
  })
  const [alts, setAlts] = React.useState(() =>
    project.pages.map((_, i) => altText(project, i, t))
  )
  const [previews, setPreviews] = React.useState<string[]>([])
  // Each slide's weight as a posted JPEG.
  const [bytes, setBytes] = React.useState<number[]>([])
  const [phase, setPhase] = React.useState<Phase>({ step: "form" })
  const [error, setError] = React.useState<string | null>(null)
  const idempotencyKey = React.useRef(crypto.randomUUID())

  // Keep a valid choice as accounts come and go.
  React.useEffect(() => {
    if (
      accounts.status === "ready" &&
      !accounts.accounts.some((a) => a.id === accountId)
    )
      setAccountId(accounts.accounts[0]?.id ?? null)
  }, [accounts, accountId])

  React.useEffect(() => {
    try {
      localStorage.setItem(CAPTION_KEY, caption)
    } catch {}
  }, [caption])

  // Small previews of every slide, from the same renderer as the export,
  // and the size of the file each will post as.
  React.useEffect(() => {
    let live = true
    const urls: string[] = []
    const sizes: number[] = []
    ;(async () => {
      for (const i of project.pages.keys()) {
        const blob = await renderToBlob(
          pageDoc(project, i),
          images,
          "image/jpeg",
          0.2
        )
        if (!live || !blob) return
        urls.push(URL.createObjectURL(blob))
        setPreviews([...urls])
        const full = await renderToBlob(
          pageDoc(project, i),
          images,
          "image/jpeg"
        )
        if (!live || !full) return
        sizes.push(full.size)
        setBytes([...sizes])
      }
    })()
    return () => {
      live = false
      urls.forEach(URL.revokeObjectURL)
    }
  }, [project, images])

  const hashtags = countHashtags(caption)
  const scheduleTime = Date.parse(when)
  const checks = checkPublish({
    as,
    slides: count,
    width: project.width,
    height: project.height,
    bytes,
    caption,
  })
  const pastSchedule = mode === "schedule" && !(scheduleTime > Date.now())
  const canPost = !checks.some((c) => c.level === "block") && !pastSchedule
  const busy = phase.step === "rendering" || phase.step === "uploading"
  const canSubmit = !!accountId && canPost && !busy

  const submit = async () => {
    if (!accountId) return
    setError(null)
    setPhase({ step: "rendering" })
    try {
      const form = new FormData()
      form.set(
        "request",
        JSON.stringify({
          accountId,
          caption,
          as,
          mode,
          altTexts: alts,
          ...(mode === "schedule" && {
            scheduledFor: new Date(scheduleTime).toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        })
      )
      for (const i of project.pages.keys()) {
        const blob = await renderToBlob(
          pageDoc(project, i),
          images,
          "image/jpeg"
        )
        if (!blob) throw new Error("Rendering failed")
        form.append("slide", blob, `slide-${i + 1}.jpg`)
      }
      setPhase({ step: "uploading" })
      const res = await fetch("/api/instagram/publish", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey.current },
        body: form,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? res.statusText)
      const result = body as PublishResult
      if (result.status === "failed" || result.status === "partial")
        throw new Error(result.error ?? result.status)
      setPhase({ step: "done", result, mode })
    } catch (e) {
      // A failed attempt gets a fresh key, so a retry is a new post.
      idempotencyKey.current = crypto.randomUUID()
      setError((e as Error).message)
      setPhase({ step: "form" })
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && !busy && onClose()}
      isDismissable={!busy}
      className="sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={InstagramIcon} strokeWidth={2} />
          {t("title")}
        </DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      {phase.step === "done" ? (
        <Done
          result={phase.result}
          mode={phase.mode}
          locale={locale}
          t={t}
          onClose={onClose}
        />
      ) : (
        <>
          <div className="grid max-h-[65vh] gap-5 overflow-y-auto sm:grid-cols-[13rem_minmax(0,1fr)]">
            <SlidePreview
              previews={previews}
              count={count}
              ratio={`${project.width} / ${project.height}`}
              as={as}
              t={t}
            />

            <div className="flex min-w-0 flex-col gap-4">
              <Field label={t("account")}>
                <AccountPicker
                  state={accounts}
                  value={accountId}
                  onChange={setAccountId}
                  onRetry={() => reloadAccounts()}
                  onConnect={connection.connect}
                  onDisconnect={disconnect}
                  connecting={connection.connecting}
                  connectError={connection.error}
                  isDisabled={busy}
                  t={t}
                />
              </Field>

              <Field label={t("postAs")}>
                <ToggleGroup
                  aria-label={t("postAs")}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[as]}
                  onSelectionChange={(keys) => {
                    const v = [...keys][0] as PublishAs | undefined
                    if (v) setAs(v)
                  }}
                >
                  <ToggleGroupItem className={SELECTED} id="feed">
                    {count > 1 ? t("carousel") : t("single")}
                  </ToggleGroupItem>
                  <ToggleGroupItem className={SELECTED} id="story">
                    {t("stories")}
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>

              <Field
                label={t("caption")}
                hint={`${caption.length.toLocaleString(locale)} / ${INSTAGRAM_LIMITS.caption.toLocaleString(locale)}`}
              >
                <Textarea
                  aria-label={t("caption")}
                  className="min-h-24 resize-none"
                  placeholder={t("captionPlaceholder")}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={as === "story"}
                />
                <p className="text-[11px] text-muted-foreground">
                  {as === "story"
                    ? t("storiesNoCaption")
                    : `${t("fold")} · ${t("hashtags", { count: hashtags })}`}
                </p>
              </Field>

              <Field label={t("when")}>
                <ToggleGroup
                  aria-label={t("when")}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[mode]}
                  onSelectionChange={(keys) => {
                    const v = [...keys][0] as PublishMode | undefined
                    if (v) setMode(v)
                  }}
                >
                  <ToggleGroupItem className={SELECTED} id="now">
                    {t("now")}
                  </ToggleGroupItem>
                  <ToggleGroupItem className={SELECTED} id="schedule">
                    {t("schedule")}
                  </ToggleGroupItem>
                </ToggleGroup>
                {mode === "schedule" && (
                  <SchedulePicker value={when} onChange={setWhen} />
                )}
              </Field>

              <Collapsible>
                <CollapsibleTrigger className="group/alt flex w-full cursor-pointer items-center gap-1 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    strokeWidth={2}
                    className="size-3.5 -rotate-90 transition-transform group-aria-expanded/alt:rotate-0"
                  />
                  {t("altText")}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col gap-2 pt-2">
                    <p className="text-[11px] text-muted-foreground">
                      {t("altHint")}
                    </p>
                    {alts.map((alt, i) => (
                      <Textarea
                        key={project.pages[i]!.id}
                        aria-label={t("slideN", { n: i + 1 })}
                        className="min-h-14 resize-none text-xs"
                        value={alt}
                        maxLength={1000}
                        onChange={(e) =>
                          setAlts((a) =>
                            a.map((v, j) => (j === i ? e.target.value : v))
                          )
                        }
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Checks
                checks={checks}
                width={project.width}
                height={project.height}
                locale={locale}
                t={t}
              />
              {pastSchedule && (
                <p className="text-xs text-destructive">
                  {t("scheduleInPast")}
                </p>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>{t("errorTitle")}</AlertTitle>
                  <AlertDescription className="break-words">
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          <DialogFooter>
            {busy && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground sm:me-auto">
                <Spinner />
                {phase.step === "rendering" ? t("rendering") : t("uploading")}
              </span>
            )}
            <Button variant="outline" isDisabled={busy} onPress={onClose}>
              {t("cancel")}
            </Button>
            <Button variant="outline" isDisabled={!canSubmit} onPress={submit}>
              {mode === "now" ? t("publishNow") : t("scheduleSubmit")}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  )
}

// What was checked before posting, every line with the number it checked:
// problems in full, the rest as one quiet line.
function Checks({
  checks,
  width,
  height,
  locale,
  t,
}: {
  checks: PublishCheck[]
  width: number
  height: number
  locale: string
  t: Translate<(typeof messages)["en"]>
}) {
  const number = (n: number) => n.toLocaleString(locale)
  const megabytes = (n: number) =>
    `${(n / (1024 * 1024)).toLocaleString(locale, {
      maximumFractionDigits: 2,
    })} MB`
  const values = (c: PublishCheck) => ({
    value: c.id === "size" ? megabytes(c.value) : number(c.value),
    limit: c.id === "size" ? megabytes(c.limit) : number(c.limit),
    extra: number(c.value - c.limit),
    n: c.slide ?? 0,
    size: `${width} × ${height}`,
    ratio: (width / height).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  })
  const passed = checks.filter((c) => c.level === "ok" && c.value > 0)
  return (
    <div className="flex flex-col gap-1 text-xs">
      {checks
        .filter((c) => c.level !== "ok")
        .map((c) => (
          <p
            key={c.id}
            className={
              c.level === "block"
                ? "text-destructive"
                : "text-amber-700 dark:text-amber-400"
            }
          >
            {t(`issue.${c.message}`, values(c))}
          </p>
        ))}
      {passed.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {passed.map((c) => t(`check.${c.id}`, values(c))).join(" · ")}
        </p>
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {hint && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function SlidePreview({
  previews,
  count,
  ratio,
  as,
  t,
}: {
  previews: string[]
  count: number
  ratio: string
  as: PublishAs
  t: Translate<(typeof messages)["en"]>
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "grid gap-1.5",
          count === 1 ? "grid-cols-1" : "grid-cols-3 sm:grid-cols-2"
        )}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={cn(
              // Drawn inside the tile: an outer ring is clipped by the scrolling column.
              "relative overflow-hidden rounded-md bg-muted after:pointer-events-none after:absolute after:inset-0 after:rounded-md after:ring-1 after:ring-foreground/10 after:ring-inset",
              as === "feed" && i >= INSTAGRAM_LIMITS.slides && "opacity-40"
            )}
            style={{ aspectRatio: ratio }}
          >
            {previews[i] ? (
              <img
                src={previews[i]}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <Skeleton className="size-full rounded-none" />
            )}
            <span className="absolute start-1 bottom-1 rounded-sm bg-foreground/80 px-1 text-[10px] leading-4 font-medium text-background tabular-nums">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("slides", { count })}</p>
    </div>
  )
}

function AccountPicker({
  state,
  value,
  onChange,
  onRetry,
  onConnect,
  onDisconnect,
  connecting,
  connectError,
  isDisabled,
  t,
}: {
  state: AccountsState
  value: string | null
  onChange: (id: string) => void
  onRetry: () => void
  onConnect: () => void
  onDisconnect: (id: string) => Promise<void>
  connecting: boolean
  connectError: ConnectError | null
  isDisabled: boolean
  t: Translate<(typeof messages)["en"]>
}) {
  // Disconnecting asks once more on the same button.
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [removeError, setRemoveError] = React.useState<string | null>(null)

  if (state.status === "loading")
    return (
      <div className="flex items-center gap-2 rounded-lg border p-2 text-sm text-muted-foreground">
        <Spinner />
        {t("loadingAccounts")}
      </div>
    )
  if (state.status === "error")
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("accountsError")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2 break-words">
          {state.message}
          <Button size="xs" variant="outline" onPress={onRetry}>
            {t("retry")}
          </Button>
        </AlertDescription>
      </Alert>
    )

  const connectButton = (
    <Button
      size="sm"
      variant="outline"
      isDisabled={connecting || isDisabled}
      onPress={onConnect}
    >
      {connecting ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <HugeiconsIcon
          icon={state.accounts.length ? Add01Icon : InstagramIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
      )}
      {connecting
        ? t("connecting")
        : state.accounts.length
          ? t("addAccount")
          : t("connect")}
    </Button>
  )
  const feedback = (connectError || removeError) && (
    <p className="text-xs text-destructive">
      {removeError ?? t(`connectError.${connectError!}`)}
    </p>
  )

  if (!state.accounts.length)
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
        <span className="text-muted-foreground">{t("noAccounts")}</span>
        {connectButton}
        {feedback}
      </div>
    )

  const remove = async (id: string) => {
    if (confirming !== id) return setConfirming(id)
    setConfirming(null)
    setRemoving(id)
    setRemoveError(null)
    try {
      await onDisconnect(id)
    } catch (e) {
      setRemoveError((e as Error).message)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div
        role="radiogroup"
        data-roving-group
        onKeyDown={roving({ axis: "y", select: true })}
        aria-label={t("account")}
        className="flex w-full flex-col gap-1"
      >
        {state.accounts.map((a) => {
          const on = a.id === value
          const name = a.displayName || a.username
          return (
            <div
              key={a.id}
              className={cn(
                "flex items-center gap-1 rounded-lg border pe-1 transition-colors",
                on && "border-amber-500 bg-amber-500/10"
              )}
            >
              <button
                type="button"
                role="radio"
                data-roving
                tabIndex={on ? 0 : -1}
                aria-checked={on}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg p-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onChange(a.id)}
              >
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                  {a.picture ? (
                    <img
                      src={a.picture}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={InstagramIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    @{a.username}
                  </span>
                </span>
              </button>
              <Button
                size={confirming === a.id ? "xs" : "icon-xs"}
                variant={confirming === a.id ? "destructive" : "ghost"}
                aria-label={t("disconnect", { name: `@${a.username}` })}
                isDisabled={isDisabled || removing === a.id}
                onPress={() => remove(a.id)}
                onBlur={() => setConfirming((c) => (c === a.id ? null : c))}
              >
                {removing === a.id ? (
                  <Spinner />
                ) : confirming === a.id ? (
                  t("confirmDisconnect")
                ) : (
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                )}
              </Button>
            </div>
          )
        })}
      </div>
      {connectButton}
      {feedback}
    </div>
  )
}

function Done({
  result,
  mode,
  locale,
  t,
  onClose,
}: {
  result: PublishResult
  mode: PublishMode
  locale: string
  t: Translate<(typeof messages)["en"]>
  onClose: () => void
}) {
  const title =
    mode === "schedule" && result.scheduledFor
      ? t("scheduled", {
          date: new Date(result.scheduledFor).toLocaleString(locale, {
            dateStyle: "long",
            timeStyle: "short",
          }),
        })
      : result.status === "published"
        ? t("published")
        : t("retrying")
  return (
    <>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={1.5}
          className="size-10 text-emerald-500"
        />
        <p className="text-base font-medium">{title}</p>
        {result.warnings.map((w) => (
          <p key={w} className="text-xs text-muted-foreground">
            {w}
          </p>
        ))}
      </div>
      <DialogFooter>
        {result.url && (
          <LinkButton href={result.url} target="_blank" rel="noreferrer">
            {t("view")}
            <HugeiconsIcon
              icon={LinkSquare02Icon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </LinkButton>
        )}
        <Button variant="outline" onPress={onClose}>
          {t("close")}
        </Button>
      </DialogFooter>
    </>
  )
}
