import * as React from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { cn } from "cn"

import { useT } from "@/i18n/core"
import { booth, BoothError } from "@/lib/dub/booth.client"
import { LANGUAGES, type Job, type Patch, type Project } from "@/lib/dub/model"

import { messages } from "./dub.messages"
import { en } from "./locales/en"

export type T = ReturnType<typeof useDubT>
export const useDubT = () => useT(messages)

export function errorText(t: T, code: string) {
  return code in en.errors
    ? t(`errors.${code as keyof typeof en.errors}`)
    : t("errors.generic")
}

export function errorOf(e: unknown) {
  return e instanceof BoothError ? e.code : "generic"
}

export const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("")

export function formatBytes(bytes: number) {
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

// A press that needs a second press. Dialogs would stop the room; this keeps
// someone's hands where they are.
export function ArmedKey({
  label,
  armedLabel,
  onConfirm,
  className,
  disabled,
}: {
  label: React.ReactNode
  armedLabel: string
  onConfirm: () => void
  className?: string
  disabled?: boolean
}) {
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn("dub-link", armed && "is-armed", className)}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? armedLabel : label}
    </button>
  )
}

// The clapperboard: the reel's identity, and the title you edit in place.
export function Slate({
  project,
  patch,
}: {
  project: Project
  patch: (change: Patch) => void
}) {
  const t = useDubT()
  const takes = project.lines.reduce((n, l) => n + l.takes.length, 0)
  return (
    <header className="dub-slate">
      <div aria-hidden className="dub-sticks" />
      <div className="dub-slate-body">
        <Link to="/dub" className="dub-back" aria-label={t("back")}>
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="rtl:rotate-180"
          />
        </Link>
        <label className="dub-slate-field min-w-0 flex-1">
          <span>{t("slate.production")}</span>
          <input
            className="dub-slate-title studio-title"
            value={project.title}
            placeholder={t("untitled")}
            spellCheck={false}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <div className="dub-slate-field max-sm:hidden">
          <span>{t("slate.roll")}</span>
          <b>{project.id.slice(0, 4).toUpperCase()}</b>
        </div>
        <div className="dub-slate-field max-sm:hidden">
          <span>{t("slate.lines")}</span>
          <b>{project.lines.length}</b>
        </div>
        <div className="dub-slate-field max-sm:hidden">
          <span>{t("slate.takes")}</span>
          <b>{takes}</b>
        </div>
        <label className="dub-slate-field">
          <span>{t("slate.dubbing")}</span>
          <select
            aria-label={t("slate.language")}
            value={project.targetLang}
            onChange={(e) => patch({ targetLang: e.target.value })}
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`languages.${code}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  )
}

const ACTIVE = new Set(["queued", "running"])

function jobText(t: T, job: Job) {
  if (job.state === "queued") return t("job.queued")
  if (job.label === "takes" && job.lines.length)
    return t("job.takes", {
      done: Math.min(
        job.lines.length,
        Math.round(job.progress * job.lines.length) + 1
      ),
      total: job.lines.length,
    })
  const key = job.label as keyof typeof en.job
  return key in en.job ? t(`job.${key}`) : t("job.queued")
}

// A work ticket on two turning reels. It says what the Booth is doing and lets
// anyone stop it; a failure stays until it's been read.
export function Ticket({
  jobs,
  onChange,
}: {
  jobs: Job[]
  onChange: () => void
}) {
  const t = useDubT()
  const [dismissed, setDismissed] = React.useState<string[]>([])
  const running = jobs.filter((j) => ACTIVE.has(j.state))
  const job = running.find((j) => j.state === "running") ?? running[0]
  const failed = jobs
    .filter(
      (j) =>
        j.state === "failed" &&
        !dismissed.includes(j.id) &&
        Date.now() / 1000 - j.createdAt < 600
    )
    .at(-1)
  if (!job && !failed) return null
  return (
    <div className="dub-ticket" role="status" data-failed={!job}>
      {job ? (
        <>
          <span aria-hidden className="dub-reels" />
          <span className="min-w-0 flex-1 truncate">{jobText(t, job)}</span>
          {running.length > 1 && <b>+{running.length - 1}</b>}
          <span aria-hidden className="dub-ticket-bar">
            <i
              style={{ transform: `scaleX(${Math.max(0.02, job.progress)})` }}
            />
          </span>
          <button
            type="button"
            className="dub-link"
            onClick={() => void booth.cancel(job.id).then(onChange)}
          >
            {t("cancel")}
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">{errorText(t, failed!.error)}</span>
          <button
            type="button"
            aria-label={t("close")}
            className="dub-link flex items-center"
            onClick={() => setDismissed((d) => [...d, failed!.id])}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </button>
        </>
      )}
    </div>
  )
}
