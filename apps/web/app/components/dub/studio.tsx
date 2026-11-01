import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
} from "@hugeicons/core-free-icons"

import { Key, Led } from "@/components/novel/hardware"
import { booth, mediaUrl } from "@/lib/dub/booth.client"
import {
  lineAt,
  nextLineIndex,
  previousLineIndex,
  timecode,
  type BoothStatus,
} from "@/lib/dub/model"

import { Band } from "./band"
import { errorText, Slate, Ticket, useDubT } from "./parts"
import {
  CastRoom,
  DeskRoom,
  MasterRoom,
  ScriptRoom,
  SourceRoom,
  type Room,
} from "./rooms"
import { useReel } from "./use-booth"
import { usePlayer } from "./use-player"

const TABS = ["script", "cast", "desk", "master"] as const
type Tab = (typeof TABS)[number]
const ZOOMS = [70, 120, 200]

export function Studio({ id, status }: { id: string; status: BoothStatus }) {
  const t = useDubT()
  const reel = useReel(id)
  const { project, jobs, patch, run, setError, undoLast, undoable } = reel
  const player = usePlayer(project)
  const [tab, setTab] = React.useState<Tab>("script")
  const [selected, setSelected] = React.useState<string | null>(null)
  const [zoom, setZoom] = React.useState(1)
  const [restarting, setRestarting] = React.useState(false)
  const scriptJobs = jobs.filter((j) => j.kind === "script")
  const lastScript = scriptJobs.at(-1)

  // A finished script job closes the chooser it was started from.
  React.useEffect(() => {
    if (lastScript?.state === "done") setRestarting(false)
  }, [lastScript?.state, lastScript?.id])

  const select = React.useCallback((lineId: string) => {
    setSelected(lineId)
    setTab("script")
  }, [])

  // During playback the selection stays free; the script simply follows it.
  React.useEffect(() => {
    if (player.playing && project?.lines[player.active])
      setSelected(project.lines[player.active]!.id)
  }, [player.active, player.playing, project?.lines])

  const go = React.useCallback(
    (direction: 1 | -1) => {
      if (!project) return
      const now = player.time()
      const index =
        direction > 0
          ? nextLineIndex(project.lines, now)
          : previousLineIndex(project.lines, now)
      const line = project.lines[index]
      if (line) {
        player.seek(line.start)
        select(line.id)
      }
    },
    [project, player, select]
  )

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest("input, textarea, select, [contenteditable]")) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === " " && !target.closest("button")) {
        e.preventDefault()
        player.toggle()
      } else if (key === "j") go(-1)
      else if (key === "l") go(1)
      else if (key === "m")
        player.setMonitor(player.monitor === "dub" ? "original" : "dub")
      else if (key === "r" && selected && project) {
        void run(() => booth.takes(project.id, [selected]))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, player, project, run, selected])

  if (!project)
    return reel.error ? (
      <div className="dub-center">
        <p role="alert">{errorText(t, reel.error)}</p>
      </div>
    ) : (
      <div className="dub-center">
        <span aria-hidden className="dub-reels" />
      </div>
    )

  const room: Room = {
    project,
    jobs,
    voices: status.voices,
    player,
    patch,
    run,
    fail: setError,
    selected,
    select,
    undo: { available: undoable, run: undoLast },
  }
  const ready = project.status === "ready"
  const active = project.lines[player.active]
  const activeSpeaker = project.speakers.find((s) => s.id === active?.speaker)
  const needsSource = !project.lines.length || restarting
  const onAir = player.playing && player.monitor === "dub"

  return (
    <div className="dub-room">
      <Slate project={project} patch={patch} />
      <main className="dub-floor">
        <div className="dub-glass">
          <div className="dub-screen">
            {ready ? (
              <video
                ref={player.video}
                src={player.sources.video}
                crossOrigin="anonymous"
                playsInline
                preload="auto"
                onPlay={() => player.setPlaying(true)}
                onPause={() => player.setPlaying(false)}
                onClick={player.toggle}
              />
            ) : (
              <span aria-hidden className="dub-reels" />
            )}
            <audio
              ref={player.bed}
              src={player.sources.bed}
              crossOrigin="anonymous"
              preload="auto"
            />
            <audio ref={player.voice} crossOrigin="anonymous" />
            {active && (
              <p
                className="dub-subtitle"
                style={{ color: activeSpeaker?.color }}
              >
                {player.monitor === "dub"
                  ? active.text || active.source
                  : active.source}
              </p>
            )}
            <span className="dub-onair" data-on={onAir}>
              {t("transport.onAir")}
            </span>
          </div>
        </div>
        <section className="dub-binder" aria-label={t("tabs.label")}>
          <div className="dub-tabs" role="tablist">
            {TABS.map((id) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                type="button"
                aria-selected={tab === id}
                aria-controls="dub-panel"
                onClick={() => setTab(id)}
              >
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
          <div
            id="dub-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            className="dub-panel"
          >
            {tab === "script" &&
              (needsSource ? (
                <SourceRoom {...room} />
              ) : (
                <ScriptRoom {...room} />
              ))}
            {tab === "cast" && <CastRoom {...room} />}
            {tab === "desk" && <DeskRoom {...room} />}
            {tab === "master" && <MasterRoom {...room} />}
          </div>
          {tab === "script" && project.lines.length > 0 && !restarting && (
            <button
              type="button"
              className="dub-link dub-restart"
              onClick={() => setRestarting(true)}
            >
              {t("source.restart")}
            </button>
          )}
          {restarting && (
            <button
              type="button"
              className="dub-link dub-restart"
              onClick={() => setRestarting(false)}
            >
              {t("cancel")}
            </button>
          )}
        </section>
        <div className="dub-deck">
          {ready && (
            <Band
              project={project}
              player={player}
              selected={selected}
              onSelect={select}
              patch={patch}
              zoom={ZOOMS[zoom]!}
            />
          )}
          <div
            className="dub-transport"
            role="group"
            aria-label={t("transport.label")}
          >
            <Key
              size="icon"
              aria-label={t("transport.previous")}
              onClick={() => go(-1)}
            >
              <HugeiconsIcon
                icon={PreviousIcon}
                strokeWidth={2}
                className="size-4"
              />
            </Key>
            <Key
              size="icon"
              className="dub-play"
              aria-label={
                player.playing ? t("transport.pause") : t("transport.play")
              }
              onClick={player.toggle}
            >
              <HugeiconsIcon
                icon={player.playing ? PauseIcon : PlayIcon}
                strokeWidth={2}
                className="size-5"
              />
            </Key>
            <Key
              size="icon"
              aria-label={t("transport.next")}
              onClick={() => go(1)}
            >
              <HugeiconsIcon
                icon={NextIcon}
                strokeWidth={2}
                className="size-4"
              />
            </Key>
            <div
              className="dub-filter"
              role="radiogroup"
              aria-label={t("transport.monitor")}
            >
              {(["original", "dub"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={player.monitor === value}
                  onClick={() => player.setMonitor(value)}
                >
                  <Led
                    on={player.monitor === value}
                    color={value === "dub" ? "#e5483a" : "#ffb648"}
                  />
                  {t(
                    value === "dub"
                      ? "transport.monitorDub"
                      : "transport.monitorOriginal"
                  )}
                </button>
              ))}
            </div>
            <div
              className="dub-filter max-sm:hidden"
              role="radiogroup"
              aria-label={t("transport.zoom")}
            >
              {ZOOMS.map((value, index) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={zoom === index}
                  onClick={() => setZoom(index)}
                >
                  {"▸".repeat(index + 1)}
                </button>
              ))}
            </div>
            <small className="dub-keys max-lg:hidden">
              {t("transport.keys")}
            </small>
            <span className="dub-duration">
              {timecode(project.source.duration)}
            </span>
          </div>
        </div>
      </main>
      <Ticket jobs={jobs} onChange={() => void reel.refresh()} />
      {reel.error && (
        <p className="dub-toast" role="alert">
          {errorText(t, reel.error)}
          <button
            type="button"
            className="dub-link"
            onClick={() => setError(null)}
          >
            {t("close")}
          </button>
        </p>
      )}
    </div>
  )
}

export { lineAt, mediaUrl }
