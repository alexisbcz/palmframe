import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Mic01Icon,
  PlayIcon,
  SparklesIcon,
  StopIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "cn"

import {
  Fader,
  Key,
  Knob,
  Led,
  Toggle,
  VuMeter,
} from "@/components/novel/hardware"
import { adapt, booth, mediaUrl } from "@/lib/dub/booth.client"
import {
  batches,
  bestTrack,
  currentTake,
  isLanguage,
  LANGUAGES,
  lineState,
  pendingLines,
  progressOf,
  roomFor,
  timecode,
  tooLong,
  type Job,
  type Line,
  type Patch,
  type Project,
  type Speaker,
} from "@/lib/dub/model"

import {
  ArmedKey,
  errorOf,
  errorText,
  formatBytes,
  newId,
  useDubT,
} from "./parts"
import { useRecorder } from "./use-booth"
import type { Player } from "./use-player"

export interface Room {
  project: Project
  jobs: Job[]
  voices: string[]
  player: Player
  patch: (change: Patch, options?: { now?: boolean; history?: boolean }) => void
  run: (start: () => Promise<unknown>) => Promise<void>
  fail: (code: string) => void
  selected: string | null
  select: (id: string) => void
  undo: { available: boolean; run: () => void }
}

const busyWith = (jobs: Job[], kind: string) =>
  jobs.some(
    (j) => j.kind === kind && (j.state === "queued" || j.state === "running")
  )

// ---- Where the words come from ----------------------------------------------

export function SourceRoom({ project, jobs, run, fail }: Room) {
  const t = useDubT()
  const file = React.useRef<HTMLInputElement>(null)
  const [spoken, setSpoken] = React.useState(project.sourceLang)
  const tracks = project.source.subtitles
  const best = bestTrack(tracks, project.targetLang)
  const busy = busyWith(jobs, "script")
  const sorted = best?.text
    ? [best, ...tracks.filter((x) => x !== best)]
    : tracks

  return (
    <div className="dub-paper dub-source">
      <h2 className="studio-title">{t("source.heading")}</h2>
      <p>{t("source.body")}</p>
      {!!tracks.length && (
        <>
          <h3>{t("source.tracks")}</h3>
          <ul>
            {sorted.map((track) => {
              const isBest = track === best && track.text
              return (
                <li key={track.index} data-best={isBest}>
                  <span className="min-w-0 flex-1">
                    <b>
                      {isLanguage(track.language)
                        ? t(`languages.${track.language}`)
                        : t("source.unknown")}
                    </b>{" "}
                    <small>
                      {track.title || t("source.track", { n: track.index + 1 })}
                      {" · "}
                      {track.codec}
                    </small>
                    {!track.text && <em>{t("source.bitmap")}</em>}
                    {track.text && track.forced && (
                      <em>{t("source.forced")}</em>
                    )}
                    {isBest && (
                      <em>
                        {track.language === project.targetLang
                          ? t("source.noTranslation")
                          : t("source.best")}
                      </em>
                    )}
                  </span>
                  <Key
                    disabled={!track.text || busy}
                    onClick={() =>
                      void run(() =>
                        booth.script(project.id, {
                          kind: "track",
                          index: track.index,
                        })
                      )
                    }
                  >
                    {t("source.use")}
                  </Key>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <h3>{t("source.sidecar")}</h3>
      <div className="dub-row">
        <small className="flex-1">{t("source.sidecarHint")}</small>
        <input
          ref={file}
          hidden
          type="file"
          accept=".srt,.ass,.ssa,.vtt"
          onChange={(e) => {
            const chosen = e.target.files?.[0]
            e.target.value = ""
            if (chosen) void run(() => booth.sidecar(project.id, chosen))
          }}
        />
        <Key disabled={busy} onClick={() => file.current?.click()}>
          {t("source.sidecarButton")}
        </Key>
      </div>
      <h3>{t("source.whisper")}</h3>
      <small>{t("source.whisperHint")}</small>
      <div className="dub-row">
        <label className="flex-1">
          <span className="sr-only">{t("source.spoken")}</span>
          <select value={spoken} onChange={(e) => setSpoken(e.target.value)}>
            <option value="">{t("source.detect")}</option>
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`languages.${code}`)}
              </option>
            ))}
          </select>
        </label>
        <Key
          disabled={busy}
          onClick={() => {
            if (project.status !== "ready") return fail("busy")
            void run(() =>
              booth.script(project.id, { kind: "whisper", language: spoken })
            )
          }}
        >
          {t("source.whisperButton")}
        </Key>
      </div>
    </div>
  )
}

// ---- The script --------------------------------------------------------------

const slotOf = (project: Project, line: Line) => {
  const index = project.lines.indexOf(line)
  const next = project.lines[index + 1]?.start ?? project.source.duration
  return Math.max(0.2, Math.min(next - 0.05, line.end + 0.6) - line.start)
}

function useAdapter({ project, patch, fail }: Room) {
  const [state, setState] = React.useState<{
    done: number
    total: number
  } | null>(null)
  const run = async (lines: Line[], mode: "translate" | "tighten") => {
    const speakers = new Map(project.speakers.map((s) => [s.id, s.name]))
    setState({ done: 0, total: lines.length })
    let done = 0
    try {
      for (const batch of batches(lines)) {
        const result = await adapt({
          lines: batch.map((l) => ({
            id: l.id,
            source: l.source,
            current: l.text,
            speaker: speakers.get(l.speaker) ?? "",
            seconds: slotOf(project, l),
          })),
          from: project.sourceLang,
          to: project.targetLang,
          mode,
        })
        patch(
          {
            lines: Object.fromEntries(
              result.map((r) => [r.id, { text: r.text }])
            ),
          },
          { now: true }
        )
        done += batch.length
        setState({ done, total: lines.length })
      }
    } catch (e) {
      fail(errorOf(e))
    }
    setState(null)
  }
  return { state, run }
}

function TakeStrip({ room, line }: { room: Room; line: Line }) {
  const t = useDubT()
  const { project, patch, player } = room
  const preview = React.useRef<HTMLAudioElement | null>(null)
  if (!line.takes.length) return null
  return (
    <div
      className="dub-takes"
      role="radiogroup"
      aria-label={t("script.takeN", { n: "" })}
    >
      {line.takes.map((take, i) => (
        <button
          key={take.file}
          type="button"
          role="radio"
          aria-checked={line.pick === i}
          onClick={() => {
            patch({ lines: { [line.id]: { pick: i } } }, { now: true })
            preview.current?.pause()
            player.pause()
            preview.current = new Audio(
              mediaUrl(project.id, `takes/${take.file}`)
            )
            void preview.current.play().catch(() => undefined)
          }}
        >
          {take.kind === "mic" && (
            <HugeiconsIcon
              icon={Mic01Icon}
              strokeWidth={2}
              className="size-3"
            />
          )}
          {t("script.takeN", { n: i + 1 })}
        </button>
      ))}
    </div>
  )
}

function Row({
  room,
  line,
  adapter,
}: {
  room: Room
  line: Line
  adapter: ReturnType<typeof useAdapter>
}) {
  const t = useDubT()
  const { project, patch, run, player, selected, select, jobs, fail } = room
  const open = selected === line.id
  const speaker = project.speakers.find((s) => s.id === line.speaker)
  const state = lineState(line, speaker)
  const take = currentTake(line)
  const ref = React.useRef<HTMLDivElement>(null)
  const recorder = useRecorder()
  const slot = slotOf(project, line)
  const room_ = roomFor(slot, project.targetLang)
  const long = tooLong(line.text, slot, project.targetLang)
  const recording = jobs.some(
    (j) => j.kind === "takes" && j.state === "running" && j.line === line.id
  )
  const clone = speaker?.voice.kind === "clone"

  React.useEffect(() => {
    if (open)
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [open])

  const atMic = async () => {
    if (recorder.recording) return recorder.stop()
    try {
      const pending = recorder.start()
      player.rehearse(line.start, line.end)
      const blob = await pending
      await run(() => booth.takeFromMic(project.id, line.id, blob))
    } catch {
      fail("generic")
    }
  }

  return (
    <div
      ref={ref}
      className={cn("dub-line", open && "is-open")}
      data-state={state}
      data-recording={recording}
      style={{ "--c": speaker?.color } as React.CSSProperties}
    >
      <button
        type="button"
        className="dub-line-head"
        aria-expanded={open}
        onClick={() => {
          select(line.id)
          player.seek(line.start)
        }}
      >
        <time>{timecode(line.start)}</time>
        <b>{speaker?.name}</b>
        <span className="dub-line-text">
          {line.text || <i>{line.source}</i>}
        </span>
        <span className="dub-stamp" title={t(`script.state.${state}`)}>
          <Led
            on={state !== "empty" && state !== "unwritten"}
            color={
              state === "ready"
                ? "#7ee08a"
                : state === "long" || state === "stale"
                  ? "#ffb648"
                  : undefined
            }
          />
          <span className="sr-only">{t(`script.state.${state}`)}</span>
        </span>
      </button>
      {open && (
        <div className="dub-line-body">
          <p className="dub-original">
            <small>{t("script.original")}</small> {line.source}
          </p>
          <label className="sr-only" htmlFor={`line-${line.id}`}>
            {t("script.dub")}
          </label>
          <textarea
            id={`line-${line.id}`}
            rows={2}
            dir="auto"
            value={line.text}
            placeholder={t("script.placeholder")}
            onChange={(e) =>
              patch({ lines: { [line.id]: { text: e.target.value } } })
            }
          />
          <div className="dub-gauge" data-long={long}>
            <span>
              {long
                ? t("script.tooLong")
                : t("script.roomLeft", { used: line.text.length, room: room_ })}
            </span>
            {(long || state === "long") && !!line.text && (
              <button
                type="button"
                className="dub-link"
                disabled={!!adapter.state}
                onClick={() => void adapter.run([line], "tighten")}
              >
                {t("script.tighten")}
              </button>
            )}
          </div>
          <div className="dub-row">
            <label className="min-w-0 flex-1">
              <small>{t("script.speaker")}</small>
              <select
                value={line.speaker}
                onChange={(e) =>
                  patch(
                    { lines: { [line.id]: { speaker: e.target.value } } },
                    { now: true }
                  )
                }
              >
                {project.speakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 flex-[2]">
              <small>{t("script.delivery")}</small>
              <input
                value={line.delivery}
                disabled={clone}
                placeholder={
                  clone
                    ? t("script.deliveryClone")
                    : t("script.deliveryPlaceholder")
                }
                title={clone ? t("script.deliveryClone") : undefined}
                onChange={(e) =>
                  patch({ lines: { [line.id]: { delivery: e.target.value } } })
                }
              />
            </label>
          </div>
          {take && (
            <div className="dub-take-note">
              <TakeStrip room={room} line={line} />
              {take.tempo > 1.01 && (
                <small>
                  {t("script.speedUp", {
                    percent: Math.round((take.tempo - 1) * 100),
                  })}
                </small>
              )}
              {take.over > 0.05 && (
                <small className="is-warn">
                  {t("script.overBy", { seconds: take.over.toFixed(1) })}
                </small>
              )}
            </div>
          )}
          <div className="dub-line-keys">
            <Key onClick={() => player.rehearse(line.start, line.end)}>
              <HugeiconsIcon
                icon={PlayIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("script.rehearse")}
            </Key>
            <Key
              tone="fire"
              disabled={!line.text.trim() || recording}
              onClick={() => void run(() => booth.takes(project.id, [line.id]))}
            >
              {take ? t("script.rerecord") : t("script.record")}
            </Key>
            <Key onClick={() => void atMic()} pressed={recorder.recording}>
              <HugeiconsIcon
                icon={recorder.recording ? StopIcon : Mic01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {recorder.recording ? t("script.stopMic") : t("script.atMic")}
            </Key>
            <ArmedKey
              className="ms-auto"
              label={
                <HugeiconsIcon
                  icon={Delete02Icon}
                  strokeWidth={2}
                  className="size-4"
                  aria-label={t("script.remove")}
                />
              }
              armedLabel={t("script.remove")}
              onConfirm={() => patch({ removeLines: [line.id] }, { now: true })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function ScriptRoom(room: Room) {
  const t = useDubT()
  const { project, patch, run, player, jobs, select, undo } = room
  const adapter = useAdapter(room)
  const [todo, setTodo] = React.useState(false)
  const speakers = new Map(project.speakers.map((s) => [s.id, s]))
  const pending = pendingLines(project)
  const unwritten = project.lines.filter((l) => !l.text.trim())
  const lines = todo
    ? project.lines.filter(
        (l) => lineState(l, speakers.get(l.speaker)) !== "ready"
      )
    : project.lines
  const recording = busyWith(jobs, "takes")

  return (
    <div className="dub-paper dub-script">
      <div className="dub-script-top">
        {unwritten.length > 0 ? (
          <Key
            tone="fire"
            disabled={!!adapter.state}
            onClick={() => void adapter.run(unwritten, "translate")}
          >
            <HugeiconsIcon
              icon={SparklesIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            {adapter.state
              ? t("script.adapting", adapter.state)
              : t("script.adaptAll", { count: unwritten.length })}
          </Key>
        ) : pending.length > 0 ? (
          <Key
            tone="fire"
            disabled={recording}
            onClick={() =>
              void run(() =>
                booth.takes(
                  project.id,
                  pending.map((l) => l.id)
                )
              )
            }
          >
            {t("script.recordAll", { count: pending.length })}
          </Key>
        ) : (
          <small>{t("script.allRecorded")}</small>
        )}
        <div
          className="dub-filter"
          role="radiogroup"
          aria-label={t("script.filter")}
        >
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={todo === value}
              onClick={() => setTodo(value)}
            >
              {t(value ? "script.filterTodo" : "script.filterAll")}
            </button>
          ))}
        </div>
        {undo.available && (
          <button type="button" className="dub-link" onClick={undo.run}>
            {t("script.undo")}
          </button>
        )}
      </div>
      <div className="dub-lines">
        {lines.map((line) => (
          <Row key={line.id} room={room} line={line} adapter={adapter} />
        ))}
        {!lines.length && <p className="dub-empty">{t("script.empty")}</p>}
      </div>
      <button
        type="button"
        className="dub-link dub-add"
        onClick={() => {
          const start = Number(player.time().toFixed(2))
          const id = newId()
          const active = project.lines[player.active]
          patch(
            {
              addLines: [
                {
                  id,
                  start,
                  end: start + 2,
                  speaker: active?.speaker ?? project.speakers[0]?.id ?? "",
                },
              ],
            },
            { now: true }
          )
          select(id)
        }}
      >
        {t("script.add")}
      </button>
    </div>
  )
}

// ---- The cast ----------------------------------------------------------------

function Clone({ room, speaker }: { room: Room; speaker: Speaker }) {
  const t = useDubT()
  const { project, run, player, fail } = room
  const [consent, setConsent] = React.useState(false)
  const [picking, setPicking] = React.useState(speaker.voice.kind !== "clone")
  const file = React.useRef<HTMLInputElement>(null)
  const recorder = useRecorder()
  const voice = speaker.voice

  const candidates = project.lines
    .filter((l) => l.speaker === speaker.id && l.end - l.start >= 2)
    .sort(
      (a, b) => Math.abs(a.end - a.start - 7) - Math.abs(b.end - b.start - 7)
    )
    .slice(0, 4)

  if (voice.kind === "clone" && !picking)
    return (
      <div className="dub-clone">
        <p>
          {t("cast.cloned", {
            seconds: voice.seconds ?? 0,
            origin:
              voice.origin === "film"
                ? t("cast.originFilm")
                : voice.origin === "mic"
                  ? t("cast.originMic")
                  : t("cast.originFile"),
          })}
        </p>
        <small>
          {t("cast.reference")}: “{voice.refText}”
        </small>
        <button
          type="button"
          className="dub-link"
          onClick={() => setPicking(true)}
        >
          {t("cast.replace")}
        </button>
      </div>
    )

  const guarded = (action: () => void) => () =>
    consent ? action() : fail("consent_required")

  const mic = async () => {
    if (recorder.recording) return recorder.stop()
    if (!consent) return fail("consent_required")
    try {
      const blob = await recorder.start()
      await run(() =>
        booth.referenceFromFile(project.id, speaker.id, blob, "mic")
      )
      setPicking(false)
    } catch {
      fail("generic")
    }
  }

  return (
    <div className="dub-clone">
      <label className="dub-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>{t("cast.consent")}</span>
      </label>
      <h4>{t("cast.fromFilm")}</h4>
      <small>{t("cast.fromFilmHint")}</small>
      {candidates.length ? (
        <ul>
          {candidates.map((line) => (
            <li key={line.id}>
              <button
                type="button"
                className="dub-link flex items-center"
                aria-label={t("cast.playLine")}
                onClick={() => {
                  player.setMonitor("original")
                  player.rehearse(line.start, line.end)
                }}
              >
                <HugeiconsIcon
                  icon={PlayIcon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              </button>
              <span className="min-w-0 flex-1 truncate">{line.source}</span>
              <button
                type="button"
                className="dub-link"
                onClick={guarded(() => {
                  setPicking(false)
                  void run(() =>
                    booth.referenceFromFilm(
                      project.id,
                      speaker.id,
                      line.start,
                      line.end
                    )
                  )
                })}
              >
                {t("cast.useLine")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <small>{t("cast.noLines")}</small>
      )}
      {recorder.recording && (
        <p className="dub-read">
          <small>{t("cast.micRead")}</small> {t("cast.micText")}
          <span aria-hidden className="dub-mic-level">
            <i style={{ transform: `scaleX(${recorder.level})` }} />
          </span>
        </p>
      )}
      <div className="dub-row">
        <input
          ref={file}
          hidden
          type="file"
          accept="audio/*,video/*"
          onChange={(e) => {
            const chosen = e.target.files?.[0]
            e.target.value = ""
            if (chosen) {
              setPicking(false)
              void run(() =>
                booth.referenceFromFile(project.id, speaker.id, chosen, "file")
              )
            }
          }}
        />
        <Key onClick={guarded(() => file.current?.click())}>
          <HugeiconsIcon
            icon={Upload04Icon}
            strokeWidth={2}
            className="size-3.5"
          />
          {t("cast.fromFile")}
        </Key>
        <Key onClick={() => void mic()} pressed={recorder.recording}>
          <HugeiconsIcon
            icon={recorder.recording ? StopIcon : Mic01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
          {recorder.recording ? t("cast.micStop") : t("cast.fromMic")}
        </Key>
      </div>
    </div>
  )
}

function Card({ room, speaker }: { room: Room; speaker: Speaker }) {
  const t = useDubT()
  const { project, patch, run, voices, jobs } = room
  const count = project.lines.filter((l) => l.speaker === speaker.id).length
  const others = project.speakers.filter((s) => s.id !== speaker.id)
  const kind = speaker.voice.kind
  const setKind = (next: "clone" | "stock" | "design") => {
    if (next === kind || next === "clone") return setShowClone(next === "clone")
    setShowClone(false)
    patch(
      {
        speakers: {
          [speaker.id]: {
            voice:
              next === "stock"
                ? { kind: "stock", speaker: voices[0] ?? "Vivian" }
                : { kind: "design", prompt: "" },
          },
        },
      },
      { now: next === "stock" }
    )
  }
  const [showClone, setShowClone] = React.useState(kind === "clone")
  const shownKind = showClone ? "clone" : kind
  const auditioning = busyWith(jobs, "audition")
  const designEmpty = kind === "design" && !speaker.voice.prompt.trim()

  return (
    <article
      className="dub-card"
      style={{ "--c": speaker.color } as React.CSSProperties}
    >
      <header>
        <i aria-hidden />
        <input
          aria-label={t("cast.name")}
          className="studio-title"
          value={speaker.name}
          onChange={(e) =>
            patch({ speakers: { [speaker.id]: { name: e.target.value } } })
          }
        />
        <small>{t("cast.lines", { count })}</small>
      </header>
      <div className="dub-filter" role="radiogroup" aria-label={t("cast.kind")}>
        {(["clone", "stock", "design"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={shownKind === value}
            onClick={() => setKind(value)}
          >
            {t(`cast.${value}`)}
          </button>
        ))}
      </div>
      {shownKind === "clone" && <Clone room={room} speaker={speaker} />}
      {shownKind === "stock" && speaker.voice.kind === "stock" && (
        <label>
          <small>{t("cast.stockVoice")}</small>
          <select
            value={speaker.voice.speaker}
            onChange={(e) =>
              patch(
                {
                  speakers: {
                    [speaker.id]: {
                      voice: { kind: "stock", speaker: e.target.value },
                    },
                  },
                },
                { now: true }
              )
            }
          >
            {voices.map((voice) => (
              <option key={voice} value={voice}>
                {voice.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      )}
      {shownKind === "design" && speaker.voice.kind === "design" && (
        <label>
          <small>{t("cast.prompt")}</small>
          <textarea
            rows={2}
            maxLength={500}
            value={speaker.voice.prompt}
            placeholder={t("cast.promptPlaceholder")}
            onChange={(e) =>
              patch({
                speakers: {
                  [speaker.id]: {
                    voice: { kind: "design", prompt: e.target.value },
                  },
                },
              })
            }
          />
        </label>
      )}
      <div className="dub-row">
        <Key
          disabled={
            auditioning || designEmpty || (showClone && kind !== "clone")
          }
          onClick={() =>
            void run(() =>
              booth.audition(project.id, speaker.id, t("cast.auditionText"))
            )
          }
        >
          {t("cast.audition")}
        </Key>
        {speaker.audition && (
          <audio
            key={speaker.audition}
            controls
            className="dub-audition"
            src={mediaUrl(project.id, `voices/${speaker.audition}`)}
          />
        )}
      </div>
      {others.length > 0 && (
        <div className="dub-row dub-card-foot">
          <label className="min-w-0 flex-1">
            <small>{t("cast.merge")}</small>
            <select
              value=""
              onChange={(e) => {
                const into = e.target.value
                if (!into) return
                patch(
                  {
                    lines: Object.fromEntries(
                      project.lines
                        .filter((l) => l.speaker === speaker.id)
                        .map((l) => [l.id, { speaker: into }])
                    ),
                    removeSpeakers: [speaker.id],
                  },
                  { now: true }
                )
              }}
            >
              <option value="">{t("cast.mergeNone")}</option>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <ArmedKey
            label={t("cast.remove")}
            armedLabel={t("cast.remove") + "?"}
            onConfirm={() =>
              patch({ removeSpeakers: [speaker.id] }, { now: true })
            }
          />
        </div>
      )}
    </article>
  )
}

export function CastRoom(room: Room) {
  const t = useDubT()
  const { project, patch } = room
  if (!project.speakers.length)
    return <p className="dub-empty">{t("cast.empty")}</p>
  return (
    <div className="dub-corkboard">
      {project.speakers.map((speaker) => (
        <Card key={speaker.id} room={room} speaker={speaker} />
      ))}
      <button
        type="button"
        className="dub-link dub-add"
        onClick={() =>
          patch(
            { addSpeakers: [{ id: newId(), name: t("cast.newName") }] },
            { now: true }
          )
        }
      >
        {t("cast.add")}
      </button>
    </div>
  )
}

// ---- The desk ----------------------------------------------------------------

export function DeskRoom(room: Room) {
  const t = useDubT()
  const { project, patch, run, jobs, player } = room
  const mix = project.mix
  const separating = busyWith(jobs, "separate")
  const fmt = (v: number) => `${Math.round(v * 100)}`
  return (
    <div className="dub-desk">
      <section className="dub-stems">
        <Led on={project.stems} color="#7ee08a" />
        <div className="min-w-0 flex-1">
          <h3 className="nv-engraved">
            {project.stems ? t("desk.cleaned") : t("desk.clean")}
          </h3>
          <small>
            {project.stems ? t("desk.cleanHint") : t("desk.notClean")}
          </small>
        </div>
        {!project.stems && (
          <Key
            tone="fire"
            disabled={separating}
            title={t("desk.cleanHint")}
            onClick={() => void run(() => booth.separate(project.id))}
          >
            {t("desk.cleanButton")}
          </Key>
        )}
      </section>
      <div className="dub-faders">
        <div className="dub-group">
          <h3 className="nv-engraved">{t("desk.mix")}</h3>
          <div className="dub-group-row">
            <Fader
              label={t("desk.dub")}
              value={mix.dub}
              min={0}
              max={1.5}
              format={fmt}
              onChange={(dub) => patch({ mix: { dub } })}
            />
            <Fader
              label={t("desk.bed")}
              value={mix.bed}
              min={0}
              max={1.5}
              format={fmt}
              onChange={(bed) => patch({ mix: { bed } })}
            />
            {project.stems && (
              <Fader
                label={t("desk.original")}
                value={mix.original}
                min={0}
                max={1}
                format={fmt}
                onChange={(original) => patch({ mix: { original } })}
              />
            )}
            <div className="dub-group-col">
              <Knob
                label={t("desk.room")}
                value={mix.room}
                min={0}
                max={1}
                size={56}
                format={fmt}
                onChange={(value) => patch({ mix: { room: value } })}
              />
              <VuMeter
                label={t("desk.meter")}
                read={player.level}
                width={108}
              />
            </div>
          </div>
        </div>
        {!!project.speakers.length && (
          <div className="dub-group">
            <h3 className="nv-engraved">{t("desk.channels")}</h3>
            <div className="dub-group-row dub-channels">
              {project.speakers.map((speaker) => (
                <div
                  key={speaker.id}
                  role="group"
                  aria-label={speaker.name}
                  className="dub-channel"
                  style={{ "--c": speaker.color } as React.CSSProperties}
                >
                  <Fader
                    label={speaker.name}
                    value={speaker.level ?? 1}
                    min={0}
                    max={1.5}
                    height={120}
                    format={fmt}
                    onChange={(level) =>
                      patch({ speakers: { [speaker.id]: { level } } })
                    }
                  />
                  <Toggle
                    label={t("desk.mute", { name: "" }).trim()}
                    value={!!speaker.muted}
                    onChange={(muted) =>
                      patch(
                        { speakers: { [speaker.id]: { muted } } },
                        { now: true }
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- The master --------------------------------------------------------------

export function MasterRoom(room: Room) {
  const t = useDubT()
  const { project, run, jobs } = room
  const [container, setContainer] = React.useState<"mkv" | "mp4">("mkv")
  const p = progressOf(project)
  const mastering = busyWith(jobs, "render")
  const ready = p.recorded > 0
  const checks = [
    {
      ok: p.total > 0 && p.written === p.total,
      text: t("master.written", { done: p.written, total: p.total }),
    },
    {
      ok: p.total > 0 && p.recorded === p.total,
      text: t("master.recorded", { done: p.recorded, total: p.total }),
    },
    ...(p.long
      ? [{ ok: false, text: t("master.long", { count: p.long }) }]
      : []),
    {
      ok: project.stems,
      text: project.stems ? t("master.stems") : t("master.noStems"),
    },
  ]
  return (
    <div className="dub-master">
      <div className="dub-paper dub-checks">
        <h3>{t("master.checklist")}</h3>
        <ul>
          {checks.map((c) => (
            <li key={c.text} data-ok={c.ok}>
              {c.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="dub-row">
        <div
          className="dub-filter"
          role="radiogroup"
          aria-label={t("master.format")}
        >
          {(["mkv", "mp4"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={container === value}
              onClick={() => setContainer(value)}
            >
              {t(`master.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <Key
        tone="fire"
        className="dub-lever"
        disabled={!ready || mastering}
        onClick={() => void run(() => booth.render(project.id, container))}
      >
        {t("master.lever")}
      </Key>
      <small>{ready ? t("master.leverHint") : t("master.empty")}</small>
      <h3 className="nv-engraved">{t("master.cans")}</h3>
      {project.renders.length ? (
        <ul className="dub-cans">
          {[...project.renders].reverse().map((render) => (
            <li key={render.file}>
              <i aria-hidden className="dub-can" />
              <span className="min-w-0 flex-1">
                <b className="block truncate">{render.file}</b>
                <small>
                  {t("master.meta", {
                    lines: render.lines,
                    size: formatBytes(render.size),
                  })}
                </small>
              </span>
              <button
                type="button"
                className="dub-link"
                onClick={() => void booth.reveal(project.id, render.file)}
              >
                {t("master.reveal")}
              </button>
              <a
                className="dub-link"
                download
                href={mediaUrl(project.id, `out/${render.file}`)}
              >
                {t("master.download")}
              </a>
              <a
                className="dub-link"
                download
                href={mediaUrl(project.id, `out/${render.subtitles}`)}
              >
                {t("master.subtitles")}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <small>{t("master.noCans")}</small>
      )}
    </div>
  )
}

export { errorText }
