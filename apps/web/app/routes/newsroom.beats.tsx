import * as React from "react"
import { Link, useRevalidator, useSearchParams } from "react-router"

import { Cover } from "@/components/newsroom/cover"
import { messages } from "@/components/newsroom/newsroom.messages"
import { useLocale, useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import type { BeatRow, Cadence } from "@/lib/newsroom/database"
import { timeLabel } from "@/lib/newsroom/schedule"
import {
  LANGUAGES,
  LANGUAGE_IDS,
  type LanguageId,
  VOICE_IDS,
  type VoiceId,
  readOptions,
} from "@/lib/newsroom/styles"
import {
  TEMPLATES,
  type TemplateId,
  isTemplateId,
  templateById,
} from "@/lib/newsroom/templates"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/newsroom.beats"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const [{ data: beats }, { data: stories }, { data: pub }] = await Promise.all(
    [
      supabase
        .from("comic_newsroom_beats")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("comic_deep_dives")
        .select("id, beat_id, title, lead, status, template, cover, created_at")
        .not("beat_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.from("comic_newsrooms").select("id").maybeSingle(),
    ]
  )
  return {
    beats: beats ?? [],
    stories: stories ?? [],
    hasPublication: !!pub,
  }
}

type Draft = {
  name: string
  lead: string
  template: TemplateId
  voice: VoiceId
  language: LanguageId
  cadence: Cadence
  weekday: number
  time: string
  timezone: string
  enabled: boolean
  auto_publish: boolean
  auto_newsletter: boolean
  auto_social: boolean
  max_credits_per_week: number
}

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

const zones = () => {
  try {
    return (
      (
        Intl as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf?.("timeZone") ?? ["UTC"]
    )
  } catch {
    return ["UTC"]
  }
}

function fromBeat(b: BeatRow): Draft {
  const o = readOptions(b.options)
  return {
    name: b.name,
    lead: b.lead,
    template: isTemplateId(b.template) ? b.template : "roundup",
    voice: o.voice,
    language: o.language,
    cadence: b.cadence,
    weekday: b.weekday,
    time: timeLabel(b.minute_of_day),
    timezone: b.timezone,
    enabled: b.enabled,
    auto_publish: b.auto_publish,
    auto_newsletter: b.auto_newsletter,
    auto_social: b.auto_social,
    max_credits_per_week: b.max_credits_per_week,
  }
}

function Editor({
  id,
  initial,
  hasPublication,
  onDone,
}: {
  id: string | null
  initial: Draft
  hasPublication: boolean
  onDone: () => void
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const [d, setD] = React.useState(initial)
  const [state, setState] = React.useState<
    "idle" | "busy" | "failed" | "limit"
  >("idle")
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    setState("idle")
  }
  const weekdays = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        // 2023-01-01 was a Sunday.
        new Date(Date.UTC(2023, 0, 1 + i, 12)).toLocaleDateString(locale, {
          weekday: "long",
          timeZone: "UTC",
        })
      ),
    [locale]
  )
  const [hh, mm] = d.time.split(":").map(Number)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setState("busy")
    const res = await fetch("/api/newsroom/beats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "save",
        id,
        beat: {
          name: d.name.trim() || d.lead.slice(0, 60),
          lead: d.lead.trim(),
          template: d.template,
          options: { voice: d.voice, language: d.language },
          cadence: d.cadence,
          weekday: d.weekday,
          minute_of_day: (hh || 0) * 60 + (mm || 0),
          timezone: d.timezone,
          enabled: d.enabled,
          auto_publish: d.auto_publish,
          auto_newsletter: d.auto_publish && d.auto_newsletter,
          auto_social: d.auto_publish && d.auto_social,
          max_credits_per_week: d.max_credits_per_week,
        },
      }),
    }).catch(() => null)
    if (res?.ok) onDone()
    else setState(res?.status === 409 ? "limit" : "failed")
  }
  return (
    <form className="nr-panel nr-form" onSubmit={save}>
      <label>
        <span>{t("beats.name")}</span>
        <input
          value={d.name}
          maxLength={80}
          onChange={(e) => set("name", e.target.value)}
        />
      </label>
      <label>
        <span>{t("beats.lead")}</span>
        <input
          value={d.lead}
          maxLength={500}
          required
          minLength={3}
          placeholder={t("composer.placeholder")}
          onChange={(e) => set("lead", e.target.value)}
        />
      </label>
      <div className="nr-form-grid">
        <label>
          <span>{t("composer.template")}</span>
          <select
            value={d.template}
            onChange={(e) => set("template", e.target.value as TemplateId)}
          >
            {TEMPLATES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("composer.voice")}</span>
          <select
            value={d.voice}
            onChange={(e) => set("voice", e.target.value as VoiceId)}
          >
            {VOICE_IDS.map((v) => (
              <option key={v} value={v}>
                {t(`voices.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("composer.language")}</span>
          <select
            value={d.language}
            onChange={(e) => set("language", e.target.value as LanguageId)}
          >
            {LANGUAGE_IDS.map((l) => (
              <option key={l} value={l}>
                {LANGUAGES[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="nr-fieldset">
        <legend>{t("beats.schedule")}</legend>
        <div className="nr-form-grid">
          <label>
            <span>{t("beats.schedule")}</span>
            <select
              value={d.cadence}
              onChange={(e) => set("cadence", e.target.value as Cadence)}
            >
              {(["daily", "weekdays", "weekly"] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`beats.cadence.${c}`)}
                </option>
              ))}
            </select>
          </label>
          {d.cadence === "weekly" && (
            <label>
              <span>{t("beats.weekday")}</span>
              <select
                value={d.weekday}
                onChange={(e) => set("weekday", Number(e.target.value))}
              >
                {weekdays.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>{t("beats.time")}</span>
            <input
              type="time"
              value={d.time}
              required
              onChange={(e) => set("time", e.target.value)}
            />
          </label>
          <label>
            <span>{t("beats.timezone")}</span>
            <select
              value={d.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            >
              {[...new Set([d.timezone, ...zones()])].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="nr-fieldset">
        <legend>{t("beats.after")}</legend>
        {!hasPublication && (
          <p className="nr-muted">
            {t("beats.needsPublication")}{" "}
            <Link to="/newsroom/publication" className="nr-link">
              {t("distribute.setUp")}
            </Link>
          </p>
        )}
        <label className="nr-inline">
          <input
            type="checkbox"
            checked={d.auto_publish}
            disabled={!hasPublication}
            onChange={(e) => set("auto_publish", e.target.checked)}
          />
          <span>{t("beats.autoPublish")}</span>
        </label>
        <label className="nr-inline">
          <input
            type="checkbox"
            checked={d.auto_publish && d.auto_newsletter}
            disabled={!d.auto_publish}
            onChange={(e) => set("auto_newsletter", e.target.checked)}
          />
          <span>{t("beats.autoNewsletter")}</span>
        </label>
        <label className="nr-inline">
          <input
            type="checkbox"
            checked={d.auto_publish && d.auto_social}
            disabled={!d.auto_publish}
            onChange={(e) => set("auto_social", e.target.checked)}
          />
          <span>{t("beats.autoSocial")}</span>
        </label>
      </fieldset>
      <label>
        <span>{t("beats.cap")}</span>
        <input
          type="number"
          min={0}
          max={5000}
          step={COSTS.deep_dive}
          value={d.max_credits_per_week}
          onChange={(e) => set("max_credits_per_week", Number(e.target.value))}
        />
        <small>
          {t("beats.capHint", {
            count: Math.floor(d.max_credits_per_week / COSTS.deep_dive),
          })}
        </small>
      </label>
      <label className="nr-inline">
        <input
          type="checkbox"
          checked={d.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        <span>{t("beats.on")}</span>
      </label>
      <div className="nr-row">
        <button
          type="submit"
          className="nr-button"
          data-primary
          disabled={state === "busy" || d.lead.trim().length < 3}
        >
          {t("beats.save")}
        </button>
        <button type="button" className="nr-button" onClick={onDone}>
          {t("beats.cancel")}
        </button>
        {state === "failed" && (
          <span className="nr-error" role="alert">
            {t("errors.generic")}
          </span>
        )}
        {state === "limit" && (
          <span className="nr-error" role="alert">
            {t("beats.limit")}
          </span>
        )}
      </div>
    </form>
  )
}

export default function Beats({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const revalidator = useRevalidator()
  const [params, setParams] = useSearchParams()
  const { beats, stories, hasPublication } = loaderData
  const [editing, setEditing] = React.useState<string | "new" | null>(
    params.get("lead") ? "new" : null
  )
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)

  const fresh = (): Draft => {
    const tpl = params.get("template")
    const voice = params.get("voice") as VoiceId | null
    const language = params.get("language") as LanguageId | null
    return {
      name: "",
      lead: params.get("lead") ?? "",
      template: isTemplateId(tpl) ? tpl : "roundup",
      voice: voice && VOICE_IDS.includes(voice) ? voice : "house",
      language: language && LANGUAGE_IDS.includes(language) ? language : "en",
      cadence: "weekdays",
      weekday: 1,
      time: "07:00",
      timezone: browserZone(),
      enabled: true,
      auto_publish: hasPublication,
      auto_newsletter: false,
      auto_social: false,
      max_credits_per_week: COSTS.deep_dive * 5,
    }
  }

  const done = () => {
    setEditing(null)
    if (params.size) setParams({}, { replace: true })
    void revalidator.revalidate()
  }
  const act = async (body: Record<string, unknown>, message?: string) => {
    const res = await fetch("/api/newsroom/beats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null)
    setNote(res?.ok ? (message ?? null) : t("errors.generic"))
    void revalidator.revalidate()
  }

  return (
    <div className="nr-page">
      <header className="nr-page-head">
        <h1>{t("beats.title")}</h1>
        <p>{t("beats.text")}</p>
      </header>
      {note && (
        <p className="nr-muted" role="status">
          {note}
        </p>
      )}
      {editing === "new" ? (
        <Editor
          id={null}
          initial={fresh()}
          hasPublication={hasPublication}
          onDone={done}
        />
      ) : (
        <div>
          <button
            type="button"
            className="nr-button"
            data-primary
            onClick={() => setEditing("new")}
          >
            {t("beats.new")}
          </button>
        </div>
      )}
      {!beats.length && editing !== "new" && (
        <p className="nr-muted">{t("beats.empty")}</p>
      )}
      <div className="nr-beats">
        {beats.map((b) =>
          editing === b.id ? (
            <Editor
              key={b.id}
              id={b.id}
              initial={fromBeat(b)}
              hasPublication={hasPublication}
              onDone={done}
            />
          ) : (
            <article key={b.id} className="nr-panel nr-beat">
              <div className="nr-beat-head">
                <Cover
                  template={b.template}
                  title={templateById(b.template)?.name ?? ""}
                  small
                />
                <div>
                  <b>{b.name}</b>
                  <small>
                    {templateById(b.template)?.name} ·{" "}
                    {t(`beats.cadence.${b.cadence}`)} ·{" "}
                    {timeLabel(b.minute_of_day)} {b.timezone}
                  </small>
                  <p>{b.lead}</p>
                </div>
                <span
                  className="nr-badge"
                  data-status={b.enabled ? "done" : undefined}
                >
                  {b.enabled ? t("beats.on") : t("beats.off")}
                </span>
              </div>
              <p className="nr-muted">
                {b.enabled && b.next_run_at
                  ? t("beats.next", {
                      when: new Date(b.next_run_at).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })
                  : t("beats.never")}
                {b.last_error && ` · ${b.last_error}`}
              </p>
              <div className="nr-row">
                <button
                  type="button"
                  className="nr-button"
                  onClick={() =>
                    void act({ intent: "run", id: b.id }, t("beats.queued"))
                  }
                >
                  {t("beats.runNow")}
                </button>
                <button
                  type="button"
                  className="nr-button"
                  onClick={() =>
                    void act({ intent: "toggle", id: b.id, on: !b.enabled })
                  }
                >
                  {b.enabled ? t("beats.off") : t("beats.on")}
                </button>
                <button
                  type="button"
                  className="nr-button"
                  onClick={() => setEditing(b.id)}
                >
                  {t("beats.edit")}
                </button>
                <button
                  type="button"
                  className="nr-button"
                  data-danger
                  onClick={() => {
                    if (confirming !== b.id) {
                      setConfirming(b.id)
                      return
                    }
                    void act({ intent: "remove", id: b.id })
                  }}
                >
                  {confirming === b.id
                    ? t("beats.confirmRemove")
                    : t("beats.remove")}
                </button>
              </div>
              {stories.some((s) => s.beat_id === b.id) && (
                <>
                  <h3 className="nr-subhead">{t("beats.stories")}</h3>
                  <ul className="nr-beat-stories">
                    {stories
                      .filter((s) => s.beat_id === b.id)
                      .slice(0, 5)
                      .map((s) => (
                        <li key={s.id}>
                          <Link to={`/newsroom/${s.id}`}>
                            <b data-status={s.status} />
                            <span>{s.title || s.lead}</span>
                            <small>
                              {new Date(s.created_at).toLocaleDateString(
                                locale
                              )}
                            </small>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </article>
          )
        )}
      </div>
    </div>
  )
}
