import * as React from "react"
import { useNavigate } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Camera01Icon,
  Cancel01Icon,
  Clock01Icon,
  Delete02Icon,
  Download01Icon,
  Move01Icon,
  PaintBoardIcon,
  SunCloud01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Dialog, DialogTitle } from "@workspace/ui/components/dialog"
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

import { CameraDialog, type CameraTab } from "@/components/anime/camera-dialog"
import { Failure } from "@/components/anime/new-episode"
import { LabeledCheckbox } from "@/components/labeled-checkbox"
import { openSettings } from "@/components/settings/settings-dialog"
import { useLocale, useT } from "@/i18n/core"
import { AssemblyError, assemble } from "@/lib/anime/assemble"
import {
  animeCall,
  errorCode,
  saveFile,
  shotBusy,
  uploadBlob,
  useEpisode,
  type EpisodeView,
  type ShotView,
} from "@/lib/anime/client"
import {
  LOOKS,
  NARRATOR,
  VOICES,
  clipCost,
  estimate,
  fitToModel,
  outputSize,
  timeline,
  toSrt,
  type CameraSetup,
  type EpisodeSettings,
  type Line,
  type VideoModel,
} from "@/lib/anime/model"
import { messages } from "@/routes/anime.messages"

const useAnimeT = () => useT(messages)

const money = (usd: number, locale: string) =>
  usd.toLocaleString(locale, { style: "currency", currency: "USD" })

function Pill({
  glyph,
  label,
  value,
  onClick,
}: {
  glyph: typeof Camera01Icon
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-1.5 text-start outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[var(--anime-accent)]"
    >
      <HugeiconsIcon
        icon={glyph}
        strokeWidth={2}
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-[10px] leading-tight text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-xs leading-tight font-medium">
          {value}
        </span>
      </span>
    </button>
  )
}

function Status({ busy, text }: { busy?: boolean; text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm text-white/80">
      {busy && <Spinner />}
      {text}
    </div>
  )
}

function Stage({
  shot,
  links,
  aspect,
}: {
  shot: ShotView
  links: Record<string, string>
  aspect: string
}) {
  const t = useAnimeT()
  const video = shot.video_path ? links[shot.video_path] : null
  const frame = shot.keyframe_path ? links[shot.keyframe_path] : null
  const panel = links[shot.panel_path]
  const failed = shot.video_error ?? shot.keyframe_error ?? shot.voice_error
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-3">
      <div className="hidden w-40 shrink-0 flex-col gap-1 lg:flex">
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          {t("stage.panel")}
        </p>
        {panel && (
          <img
            src={panel}
            alt=""
            className="max-h-56 w-full rounded-lg object-contain"
          />
        )}
      </div>
      <div
        className={cn(
          "relative max-h-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10",
          aspect === "16:9"
            ? "aspect-video w-full max-w-4xl"
            : "aspect-[9/16] h-full"
        )}
      >
        {video ? (
          <video
            key={video}
            src={video}
            controls
            playsInline
            className="size-full"
            poster={frame ?? undefined}
          />
        ) : frame ? (
          <img src={frame} alt="" className="size-full object-cover" />
        ) : panel ? (
          <img
            src={panel}
            alt=""
            className="size-full object-contain opacity-40"
          />
        ) : null}
        {shot.keyframe_status === "working" && (
          <Status busy text={t("stage.drawing")} />
        )}
        {(shot.video_status === "submitting" ||
          shot.video_status === "rendering") && (
          <Status busy text={t("stage.rendering")} />
        )}
        {(shot.keyframe_status === "queued" ||
          shot.video_status === "queued") && (
          <Status text={t("stage.queued")} />
        )}
      </div>
      {failed && <span className="sr-only">{failed}</span>}
    </div>
  )
}

function Strip({
  shots,
  links,
  selected,
  onSelect,
  onMove,
}: {
  shots: ShotView[]
  links: Record<string, string>
  selected: string
  onSelect: (id: string) => void
  onMove: (from: number, to: number) => void
}) {
  const dragged = React.useRef<number | null>(null)
  return (
    <div className="flex [scrollbar-width:thin] gap-1.5 overflow-x-auto pb-1">
      {shots.map((s, i) => {
        const src = links[s.keyframe_path ?? ""] ?? links[s.panel_path]
        const on = s.id === selected
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            aria-label={String(i + 1)}
            draggable
            onDragStart={() => (dragged.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragged.current !== null && dragged.current !== i)
                onMove(dragged.current, i)
              dragged.current = null
            }}
            onKeyDown={(e) => {
              const step = e.altKey
                ? e.key === "ArrowRight"
                  ? 1
                  : e.key === "ArrowLeft"
                    ? -1
                    : 0
                : 0
              if (step && shots[i + step]) {
                e.preventDefault()
                onMove(i, i + step)
              }
            }}
            onClick={() => onSelect(s.id)}
            className={cn(
              "relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-black transition-[box-shadow,opacity] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--anime-accent)]",
              on
                ? "ring-2 ring-white"
                : "opacity-60 ring-1 ring-white/10 hover:opacity-100",
              s.skip && "grayscale"
            )}
          >
            {src && <img src={src} alt="" className="size-full object-cover" />}
            <span className="absolute start-1 bottom-0.5 text-[10px] font-bold text-white tabular-nums [text-shadow:0_1px_2px_black]">
              {i + 1}
            </span>
            {s.video_status === "ready" && (
              <span className="absolute end-1 top-1 size-2 rounded-full bg-[var(--anime-accent)]" />
            )}
            {shotBusy(s) && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Spinner className="size-4" />
              </span>
            )}
            {(s.video_status === "failed" ||
              s.keyframe_status === "failed") && (
              <span className="absolute end-1 top-1 size-2 rounded-full bg-pink-500" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function Lines({
  shot,
  speakers,
  onChange,
  onRecord,
}: {
  shot: ShotView
  speakers: string[]
  onChange: (lines: Line[]) => void
  onRecord: (() => void) | null
}) {
  const t = useAnimeT()
  const [lines, setLines] = React.useState(shot.dialogue)
  React.useEffect(() => setLines(shot.dialogue), [shot.id, shot.dialogue])
  const edit = (next: Line[]) => setLines(next)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t("lines.title")}</p>
      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("lines.empty")}</p>
      )}
      {lines.map((l, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 rounded-xl bg-white/[0.04] p-2"
        >
          <div className="flex items-center gap-1">
            <NativeSelect
              aria-label={t("lines.speaker")}
              value={l.speaker}
              size="sm"
              className="min-w-0 flex-1"
              onChange={(e) => {
                const next = lines.map((x, n) =>
                  n === i ? { ...x, speaker: e.target.value } : x
                )
                edit(next)
                onChange(next)
              }}
            >
              {[...new Set([NARRATOR, ...speakers, l.speaker])].map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {s}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("lines.remove")}
              onPress={() => {
                const next = lines.filter((_, n) => n !== i)
                edit(next)
                onChange(next)
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </div>
          <Textarea
            aria-label={t("lines.text")}
            value={l.text}
            rows={2}
            maxLength={400}
            onChange={(e) =>
              edit(
                lines.map((x, n) =>
                  n === i ? { ...x, text: e.target.value } : x
                )
              )
            }
            onBlur={() =>
              lines[i]!.text !== shot.dialogue[i]?.text && onChange(lines)
            }
          />
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onPress={() =>
          edit([
            ...lines,
            { speaker: speakers[0] ?? NARRATOR, text: "", delivery: "" },
          ])
        }
      >
        <HugeiconsIcon
          icon={Add01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {t("lines.add")}
      </Button>
      {onRecord && lines.length > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start rounded-full"
          onPress={onRecord}
        >
          {t(
            shot.voice_status === "ready" ? "lines.recordAgain" : "lines.record"
          )}
        </Button>
      )}
    </div>
  )
}

function CastPanel({
  episode,
  save,
}: {
  episode: EpisodeView
  save: (patch: object) => void
}) {
  const t = useAnimeT()
  const [cast, setCast] = React.useState(episode.cast_list)
  React.useEffect(() => setCast(episode.cast_list), [episode.cast_list])
  const commit = (next = cast) => {
    setCast(next)
    save({ cast: next })
  }
  return (
    <div className="flex flex-col gap-3">
      {cast.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("cast.empty")}</p>
      )}
      {cast.map((c, i) => (
        <div
          key={i}
          className="flex flex-col gap-1.5 rounded-xl bg-white/[0.04] p-2"
        >
          <div className="flex items-center gap-1">
            <Input
              aria-label={t("cast.name")}
              value={c.name}
              onChange={(e) =>
                setCast(
                  cast.map((x, n) =>
                    n === i ? { ...x, name: e.target.value } : x
                  )
                )
              }
              onBlur={() => commit()}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("cast.remove", { name: c.name })}
              onPress={() => commit(cast.filter((_, n) => n !== i))}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </div>
          <Textarea
            aria-label={t("cast.description")}
            rows={3}
            value={c.description}
            onChange={(e) =>
              setCast(
                cast.map((x, n) =>
                  n === i ? { ...x, description: e.target.value } : x
                )
              )
            }
            onBlur={() => commit()}
          />
          <NativeSelect
            aria-label={t("cast.voice")}
            size="sm"
            value={c.voice}
            className="w-full"
            onChange={(e) =>
              commit(
                cast.map((x, n) =>
                  n === i ? { ...x, voice: e.target.value } : x
                )
              )
            }
          >
            {VOICES.map((v) => (
              <NativeSelectOption key={v} value={v}>
                {v}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onPress={() =>
          setCast([
            ...cast,
            {
              name: "",
              description: "",
              voice: VOICES[cast.length % VOICES.length]!,
            },
          ])
        }
      >
        <HugeiconsIcon
          icon={Add01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {t("cast.add")}
      </Button>
    </div>
  )
}

function SettingsPanel({
  episode,
  models,
  save,
  onRemove,
}: {
  episode: EpisodeView
  models: VideoModel[]
  save: (patch: object) => void
  onRemove: () => void
}) {
  const t = useAnimeT()
  const s = episode.settings
  const set = (settings: Partial<EpisodeSettings>) => save({ settings })
  const model = models.find((m) => m.id === s.videoModel)
  const [title, setTitle] = React.useState(episode.title)
  const [confirming, setConfirming] = React.useState(false)
  const field = "flex flex-col gap-1.5 text-sm font-medium"
  return (
    <div className="flex flex-col gap-3">
      <label className={field}>
        {t("settings.title")}
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => save({ title })}
        />
      </label>
      <label className={field}>
        {t("settings.model")}
        <NativeSelect
          value={s.videoModel}
          className="w-full"
          onChange={(e) => set({ videoModel: e.target.value })}
        >
          {models.map((m) => {
            const cost = clipCost(m, s.resolution, 1, false)
            return (
              <NativeSelectOption key={m.id} value={m.id}>
                {m.name}
                {cost !== null ? ` · $${cost.toFixed(2)}/s` : ""}
              </NativeSelectOption>
            )
          })}
        </NativeSelect>
      </label>
      {!!model?.resolutions.length && (
        <label className={field}>
          {t("settings.resolution")}
          <NativeSelect
            value={fitToModel(model, s, 5).resolution}
            className="w-full"
            onChange={(e) => set({ resolution: e.target.value })}
          >
            {model.resolutions.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {r}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      )}
      <label className={field}>
        {t("settings.aspect")}
        <NativeSelect
          value={s.aspect}
          className="w-full"
          onChange={(e) =>
            set({ aspect: e.target.value as EpisodeSettings["aspect"] })
          }
        >
          <NativeSelectOption value="16:9">
            {t("settings.wide")}
          </NativeSelectOption>
          <NativeSelectOption value="9:16">
            {t("settings.tall")}
          </NativeSelectOption>
        </NativeSelect>
      </label>
      <label className={field}>
        {t("settings.sound")}
        <NativeSelect
          value={s.sound}
          className="w-full"
          onChange={(e) =>
            set({ sound: e.target.value as EpisodeSettings["sound"] })
          }
        >
          <NativeSelectOption value="voices">
            {t("settings.soundVoices")}
          </NativeSelectOption>
          <NativeSelectOption value="model">
            {t("settings.soundModel")}
          </NativeSelectOption>
          <NativeSelectOption value="silent">
            {t("settings.soundSilent")}
          </NativeSelectOption>
        </NativeSelect>
      </label>
      <LabeledCheckbox
        isSelected={s.subtitles}
        onChange={(subtitles) => set({ subtitles })}
      >
        {t("settings.subtitles")}
      </LabeledCheckbox>
      <LabeledCheckbox
        isSelected={s.fades}
        onChange={(fades) => set({ fades })}
      >
        {t("settings.fades")}
      </LabeledCheckbox>
      <LabeledCheckbox
        isSelected={s.titleCard}
        onChange={(titleCard) => set({ titleCard })}
      >
        {t("settings.titleCard")}
      </LabeledCheckbox>
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-xl bg-pink-600/10 p-3">
          <p className="text-sm">{t("settings.removeText")}</p>
          <ButtonGroup>
            <Button variant="destructive" size="sm" onPress={onRemove}>
              {t("settings.removeConfirm")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => setConfirming(false)}
            >
              {t("batch.dismiss")}
            </Button>
          </ButtonGroup>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onPress={() => setConfirming(true)}
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("settings.remove")}
        </Button>
      )}
    </div>
  )
}

function ExportPanel({
  episode,
  shots,
  links,
  refresh,
}: {
  episode: EpisodeView
  shots: ShotView[]
  links: Record<string, string>
  refresh: () => Promise<void>
}) {
  const t = useAnimeT()
  const [share, setShare] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const stop = React.useRef<AbortController | null>(null)
  const s = episode.settings
  const wanted = shots.filter((x) => !x.skip)
  const clips = wanted.filter((x) => x.video_path && links[x.video_path])
  const missing = wanted.length - clips.length
  const shown = clips.map((c) => ({
    id: c.id,
    duration: c.duration,
    lines: c.dialogue,
  }))
  const plan = timeline(shown, s.titleCard)
  const final = episode.final_path ? links[episode.final_path] : null

  const cut = async () => {
    setError(null)
    setShare(0)
    const controller = new AbortController()
    stop.current = controller
    try {
      const blob = await assemble(
        clips.map((c) => ({
          id: c.id,
          duration: c.duration,
          lines: c.dialogue,
          video: links[c.video_path!]!,
          // An edited line drops its take; the old file must not play.
          voice:
            s.sound === "voices" && c.voice_status === "ready" && c.voice_path
              ? (links[c.voice_path] ?? null)
              : null,
        })),
        {
          title: episode.title,
          ...outputSize(s.aspect, s.resolution),
          subtitles: s.subtitles,
          fades: s.fades,
          titleCard: s.titleCard,
          muted: s.sound === "silent",
          onProgress: (v) => setShare(v * 0.9),
          signal: controller.signal,
        }
      )
      const { url, path } = await animeCall<{ url: string; path: string }>({
        intent: "finalTarget",
        id: episode.id,
      })
      await uploadBlob(url, blob, (v) => setShare(0.9 + v * 0.1))
      await animeCall({ intent: "finalDone", id: episode.id, path })
      await refresh()
    } catch (e) {
      console.error(e)
      setError(e instanceof AssemblyError ? e.code : errorCode(e))
    } finally {
      setShare(null)
      stop.current = null
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("export.text")}</p>
      {final && (
        <>
          <video
            src={final}
            controls
            playsInline
            className="w-full rounded-xl bg-black"
          />
          <a
            href={final}
            download={`${episode.title || "episode"}.mp4`}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15"
          >
            {t("export.download")}
            <HugeiconsIcon
              icon={Download01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </a>
        </>
      )}
      {missing > 0 && clips.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("export.missing", { count: missing })}
        </p>
      )}
      {!clips.length && (
        <p className="text-sm text-muted-foreground">{t("export.none")}</p>
      )}
      {share !== null ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-sm tabular-nums">
            {t("export.working", { percent: Math.round(share * 100) })}
          </p>
          <Progress value={share * 100} aria-label={t("export.title")}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onPress={() => stop.current?.abort()}
          >
            {t("export.cancel")}
          </Button>
        </div>
      ) : (
        clips.length > 0 && (
          <button
            type="button"
            className="anime-generate"
            onClick={() => void cut()}
          >
            {t(final ? "export.rerender" : "export.render")}
            <span className="font-medium normal-case tabular-nums">
              {t("export.length", { count: Math.round(plan.duration) })}
            </span>
          </button>
        )
      )}
      {plan.captions.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onPress={() =>
            saveFile(
              `${episode.title || "episode"}.srt`,
              new Blob([toSrt(plan.captions)], { type: "application/x-subrip" })
            )
          }
        >
          {t("export.subtitles")}
          <HugeiconsIcon
            icon={Download01Icon}
            strokeWidth={2}
            data-icon="inline-end"
          />
        </Button>
      )}
      <Failure code={error} />
    </div>
  )
}

function ConfirmShoot({
  count,
  usd,
  unknown,
  onConfirm,
  onClose,
}: {
  count: number
  usd: number
  unknown: number
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useAnimeT()
  const { locale } = useLocale()
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => !o && onClose()}
      className="dark anime text-white sm:max-w-md"
    >
      <DialogTitle className="studio-title text-2xl">
        {t("batch.confirmTitle", { count })}
      </DialogTitle>
      <p className="text-sm text-muted-foreground">
        {t("batch.confirmText", { price: money(usd, locale) })}
      </p>
      {unknown > 0 && (
        <p className="text-sm text-pink-300">
          {t("batch.confirmUnknown", { count: unknown })}
        </p>
      )}
      <div className="flex items-stretch justify-end gap-2">
        <Button variant="ghost" onPress={onClose}>
          {t("batch.dismiss")}
        </Button>
        <button type="button" className="anime-generate" onClick={onConfirm}>
          {t("batch.confirm")}
        </button>
      </div>
    </Dialog>
  )
}

const TABS = ["shots", "cast", "settings", "export"] as const
type Tab = (typeof TABS)[number]

function Directing({
  episode,
  total,
  onRetry,
}: {
  episode: EpisodeView
  total: number
  onRetry: () => void
}) {
  const t = useAnimeT()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="studio-title text-4xl">{episode.title}</h1>
      {episode.director_error ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t("directing.failed")}
          </p>
          <Failure code={episode.director_error} />
          {episode.director_error === "needs_openrouter" ||
          episode.director_error === "bad_key" ? (
            <Button onPress={() => openSettings("openrouter")}>
              {t("connect.action")}
            </Button>
          ) : (
            <Button variant="secondary" onPress={onRetry}>
              {t("directing.retry")}
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm">
            <Spinner /> {t("directing.title")}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("directing.progress", { done: episode.directed, total })}
          </p>
        </>
      )}
    </div>
  )
}

export function Director({
  initial,
  models,
}: {
  initial: Parameters<typeof useEpisode>[1]
  models: VideoModel[]
}) {
  const t = useAnimeT()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const { episode, shots, links, running, refresh, setState } = useEpisode(
    initial.episode.id,
    initial
  )
  const [selected, setSelected] = React.useState(shots[0]?.id ?? "")
  const [tab, setTab] = React.useState<Tab>("shots")
  const [camera, setCamera] = React.useState<CameraTab | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [asking, setAsking] = React.useState<{
    count: number
    usd: number
    unknown: number
  } | null>(null)
  const shot = shots.find((s) => s.id === selected) ?? shots[0]
  const [action, setAction] = React.useState(shot?.action ?? "")
  React.useEffect(() => setAction(shot?.action ?? ""), [shot?.id, shot?.action])
  const id = episode.id
  const s = episode.settings
  const model = models.find((m) => m.id === s.videoModel)

  const call = async (body: Record<string, unknown>) => {
    setError(null)
    try {
      await animeCall({ ...body, id })
      await refresh()
    } catch (e) {
      setError(errorCode(e))
    }
  }
  const patchShot = (patch: Partial<ShotView>) => {
    if (!shot) return
    // Shown at once; the save follows.
    setState((st) => ({
      ...st,
      shots: st.shots.map((x) => (x.id === shot.id ? { ...x, ...patch } : x)),
    }))
    void call({ intent: "shot", shot: shot.id, patch })
  }
  const save = (patch: object) => void call({ intent: "update", patch })
  const moveShot = (from: number, to: number) => {
    const next = [...shots]
    next.splice(to, 0, ...next.splice(from, 1))
    setState((st) => ({ ...st, shots: next }))
    void call({ intent: "reorder", order: next.map((x) => x.id) })
  }

  if (episode.status !== "ready" || !shot)
    return (
      <div className="anime-workspace">
        <Directing
          episode={episode}
          total={shots.length}
          onRetry={() => void call({ intent: "direct" })}
        />
      </div>
    )

  const speakers = episode.cast_list.map((c) => c.name)
  const fit = model ? fitToModel(model, s, shot.duration) : null
  const shotCost = estimate(model, s, [shot.duration])
  const position = shots.indexOf(shot)
  const durations = model?.durations.length ? model.durations : [3, 5, 8, 10]
  const busyCount = shots.filter(shotBusy).length
  const todo = shots.filter(
    (x) => !x.skip && ["none", "failed"].includes(x.video_status)
  )
  const failure = shot.video_error ?? shot.keyframe_error ?? shot.voice_error

  const shootOne = () => {
    void call({
      intent: "start",
      stage: "videos",
      shots: [shot.id],
      maxUsd: shotCost.usd,
    })
  }
  const askAll = async () => {
    const cost = estimate(
      model,
      s,
      todo.map((x) => x.duration)
    )
    setAsking({ count: todo.length, ...cost })
  }
  const shootAll = () => {
    const usd = asking?.usd ?? 0
    setAsking(null)
    void call({ intent: "start", stage: "videos", maxUsd: usd })
  }
  const set = (patch: Partial<CameraSetup>) =>
    patchShot({ camera: { ...shot.camera, ...patch } })

  return (
    <div className="anime-workspace flex min-h-full flex-col gap-3 p-3 md:h-full md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="studio-title min-w-0 truncate py-0.5 text-2xl">
            {episode.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {running && (
              <>
                <span
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  <Spinner className="size-3.5" />
                  {t("batch.running", { count: busyCount })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => void call({ intent: "cancel" })}
                >
                  {t("batch.cancel")}
                </Button>
              </>
            )}
            {todo.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onPress={() => void askAll()}
              >
                {t("batch.all")}
              </Button>
            ) : (
              !running && (
                <span className="text-xs text-muted-foreground">
                  {t("batch.allDone")}
                </span>
              )
            )}
          </div>
        </div>

        <Stage shot={shot} links={links} aspect={s.aspect} />

        <Strip
          shots={shots}
          links={links}
          selected={shot.id}
          onSelect={setSelected}
          onMove={moveShot}
        />

        {/* The composer. Its one loud colour means money gets spent. */}
        <div className="flex flex-col gap-2 rounded-3xl bg-card p-3 ring-1 ring-white/5 md:flex-row md:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("panels.previous")}
                isDisabled={position === 0}
                onPress={() => setSelected(shots[position - 1]!.id)}
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  strokeWidth={2}
                  className="rtl:rotate-180"
                />
              </Button>
              <Textarea
                aria-label={t("composer.prompt")}
                placeholder={t("composer.placeholder")}
                value={action}
                rows={2}
                maxLength={2000}
                className="min-h-0 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
                onChange={(e) => setAction(e.target.value)}
                onBlur={() => action !== shot.action && patchShot({ action })}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("panels.next")}
                isDisabled={position === shots.length - 1}
                onPress={() => setSelected(shots[position + 1]!.id)}
              >
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="rtl:rotate-180"
                />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill
                glyph={Camera01Icon}
                label={t("composer.camera")}
                value={t(`presets.camera.${shot.camera.camera}`)}
                onClick={() => setCamera("setup")}
              />
              <Pill
                glyph={Move01Icon}
                label={t("composer.movement")}
                value={t(`presets.movement.${shot.camera.movement}`)}
                onClick={() => setCamera("movement")}
              />
              <Pill
                glyph={SunCloud01Icon}
                label={t("composer.lighting")}
                value={t(`presets.light.${shot.camera.light}`)}
                onClick={() => setCamera("movement")}
              />
              <span className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-1">
                <HugeiconsIcon
                  icon={Clock01Icon}
                  strokeWidth={2}
                  className="size-4 text-muted-foreground"
                />
                <NativeSelect
                  aria-label={t("composer.duration")}
                  size="sm"
                  value={String(fit?.duration ?? shot.duration)}
                  className="border-0 bg-transparent text-xs dark:bg-transparent"
                  onChange={(e) =>
                    patchShot({ duration: Number(e.target.value) })
                  }
                >
                  {durations.map((d) => (
                    <NativeSelectOption key={d} value={String(d)}>
                      {t("composer.seconds", { count: d })}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-1">
                <HugeiconsIcon
                  icon={PaintBoardIcon}
                  strokeWidth={2}
                  className="size-4 text-muted-foreground"
                />
                <NativeSelect
                  aria-label={t("composer.look")}
                  size="sm"
                  value={s.look}
                  className="border-0 bg-transparent text-xs dark:bg-transparent"
                  onChange={(e) => save({ settings: { look: e.target.value } })}
                >
                  {LOOKS.map((l) => (
                    <NativeSelectOption key={l} value={l}>
                      {t(`presets.look.${l}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onPress={() =>
                  void call({
                    intent: "start",
                    stage: "keyframes",
                    shots: [shot.id],
                  })
                }
              >
                {t("composer.frame")}
              </Button>
              <LabeledCheckbox
                isSelected={shot.skip}
                onChange={(skip) => patchShot({ skip })}
                className="ms-1 text-xs text-muted-foreground"
              >
                {t("composer.skip")}
              </LabeledCheckbox>
            </div>
          </div>
          <button
            type="button"
            className="anime-generate md:w-40"
            disabled={shotBusy(shot) || shot.skip}
            onClick={shootOne}
          >
            {t(
              shot.video_status === "ready"
                ? "composer.regenerate"
                : "composer.generate"
            )}
            <span className="font-medium normal-case tabular-nums">
              {shotCost.unknown
                ? t("composer.unknownPrice")
                : money(shotCost.usd, locale)}
            </span>
          </button>
        </div>
        <Failure code={error ?? failure} />
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-3xl bg-card p-3 ring-1 ring-white/5 md:w-80">
        <div role="tablist" className="flex gap-1">
          {TABS.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={tab === x}
              onClick={() => setTab(x)}
              className={cn(
                "flex-1 rounded-xl px-2 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--anime-accent)]",
                tab === x
                  ? "bg-white/10 text-white"
                  : "text-muted-foreground hover:text-white"
              )}
            >
              {t(`tabs.${x}`)}
            </button>
          ))}
        </div>
        {tab === "shots" && (
          <Lines
            shot={shot}
            speakers={speakers}
            onChange={(dialogue) =>
              patchShot({ dialogue, voice_status: "none" })
            }
            onRecord={
              s.sound === "voices" && !shotBusy(shot)
                ? () =>
                    void call({
                      intent: "start",
                      stage: "voices",
                      shots: [shot.id],
                    })
                : null
            }
          />
        )}
        {tab === "cast" && <CastPanel episode={episode} save={save} />}
        {tab === "settings" && (
          <SettingsPanel
            episode={episode}
            models={models}
            save={save}
            onRemove={() =>
              void animeCall({ intent: "delete", id }).then(() =>
                navigate("/studio/anime")
              )
            }
          />
        )}
        {tab === "export" && (
          <ExportPanel
            episode={episode}
            shots={shots}
            links={links}
            refresh={refresh}
          />
        )}
      </aside>

      {camera && (
        <CameraDialog
          value={shot.camera}
          tab={camera}
          onTab={setCamera}
          onChange={(next) => set(next)}
          onClose={() => setCamera(null)}
        />
      )}
      {asking && (
        <ConfirmShoot
          {...asking}
          onConfirm={shootAll}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  )
}
