import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mic01Icon,
  PlayIcon,
  PlusSignIcon,
  StopIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { NovelAudio } from "@/lib/novel/audio"
import { ApiError, writeRequest } from "@/lib/novel/client"
import {
  MUSIC_MODES,
  NOISE_KINDS,
  SFX_KINDS,
  nid,
  type MusicMode,
  type NoiseKind,
  type Recipe,
  type SfxKind,
  type Track,
  type TrackKind,
} from "@/lib/novel/model"
import {
  SCORE_PRESETS,
  SCORE_PRESET_NAMES,
  scoreRecipe,
  type ScorePreset,
} from "@/lib/novel/synth"

import {
  Dial,
  Fader,
  FocusRing,
  Key,
  Knob,
  Plate,
  VuMeter,
  tick,
} from "./hardware"
import { messages } from "./novel.messages"
import { useWork } from "./work"

type Score = Extract<Recipe, { type: "score" }>

const KINDS: TrackKind[] = ["music", "ambience", "sfx", "voice"]
const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
const TAPE_COLORS: Record<TrackKind, string> = {
  music: "#e7c66b",
  ambience: "#7fc4b0",
  sfx: "#e8806f",
  voice: "#8fb4e8",
}
const percent = (v: number) => `${Math.round(v * 100)}`

export function SoundRoom() {
  const t = useT(messages)
  const { novel, update, storage, notify, writer } = useWork()
  const [kind, setKind] = React.useState<TrackKind>("music")
  const [active, setActive] = React.useState<string | null>(null)
  const [playing, setPlaying] = React.useState<string | null>(null)
  const [describing, setDescribing] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [recording, setRecording] = React.useState(false)
  const recorder = React.useRef<MediaRecorder>(null)
  const audioRef = React.useRef<NovelAudio>(null)
  audioRef.current ??= new NovelAudio()
  const audio = audioRef.current
  React.useEffect(() => () => audio.dispose(), [audio])

  const list = novel.tracks.filter((k) => k.kind === kind)
  const track = list.find((k) => k.id === active) ?? list[0]

  const stop = () => {
    audio.stopAll(0.2)
    setPlaying(null)
  }
  const preview = (k: Track) => {
    audio.unlock()
    if (playing === k.id) return stop()
    if (k.kind === "sfx" || k.kind === "voice") {
      void audio.shot(k, 1)
      return
    }
    setPlaying(k.id)
    void audio.set("music", k, 0.9, 0.2)
  }

  const change = (patch: Partial<Track>, merge?: string) =>
    track &&
    update((n) => {
      const x = n.tracks.find((v) => v.id === track.id)
      if (x) Object.assign(x, patch)
    }, merge)
  const tune = (patch: Partial<Score>, merge?: string) => {
    if (track?.recipe?.type !== "score") return
    change({ recipe: { ...track.recipe, ...patch } }, merge)
    // A retuned tape plays the new mix on the next press.
    if (playing === track.id) stop()
  }

  const add = () => {
    const seed = Math.floor(Math.random() * 9999)
    const recipe: Recipe | undefined =
      kind === "music"
        ? scoreRecipe("tender", seed)
        : kind === "ambience"
          ? { type: "noise", kind: "rain", seed, tone: 0.5, drift: 0.5 }
          : kind === "sfx"
            ? { type: "sfx", kind: "knock", seed, pitch: 0.5 }
            : undefined
    const k: Track = {
      id: nid("tk"),
      name: t("sound.newName", { count: list.length + 1 }),
      kind,
      loop: kind === "music" || kind === "ambience",
      ...(recipe && { recipe }),
    }
    update((n) => n.tracks.push(k))
    setActive(k.id)
    tick(1)
  }

  const attach = async (blob: Blob, name: string) => {
    setBusy(true)
    try {
      const url = await storage.audio(blob)
      const k: Track = {
        id: nid("tk"),
        name,
        kind,
        loop: kind === "music" || kind === "ambience",
        url,
      }
      update((n) => n.tracks.push(k))
      setActive(k.id)
    } catch {
      notify(t("errors.audioFailed"))
    } finally {
      setBusy(false)
    }
  }

  const compose = async () => {
    if (!track || track.recipe?.type !== "score") return
    setBusy(true)
    try {
      const r = await writeRequest<
        Omit<Score, "type" | "seed" | "bars"> & { name: string }
      >({ mode: "score", description: describing })
      const { name, ...rest } = r
      change({
        name,
        recipe: {
          ...track.recipe,
          ...rest,
          mode: MUSIC_MODES.includes(rest.mode) ? rest.mode : "minor",
        },
      })
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("errors.failed"))
    } finally {
      setBusy(false)
    }
  }

  const toggleRecord = async () => {
    if (recording) {
      recorder.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const parts: Blob[] = []
      rec.ondataavailable = (e) => parts.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((x) => x.stop())
        setRecording(false)
        void attach(
          new Blob(parts, { type: rec.mimeType }),
          t("sound.takeName", { count: list.length + 1 })
        )
      }
      recorder.current = rec
      rec.start()
      setRecording(true)
    } catch {
      notify(t("errors.noMic"))
    }
  }

  const score = track?.recipe?.type === "score" ? track.recipe : null
  const noise = track?.recipe?.type === "noise" ? track.recipe : null
  const sfx = track?.recipe?.type === "sfx" ? track.recipe : null

  return (
    <div className="nv-scroll grid h-full gap-2 overflow-y-auto p-2 md:grid-cols-[300px_minmax(0,1fr)] md:overflow-hidden">
      <Plate
        title={t("sound.shelf")}
        bodyClassName="nv-scroll overflow-y-auto p-3 grid grid-cols-2 gap-2.5 content-start md:grid-cols-2"
        actions={
          <Key
            size="icon"
            aria-label={t("sound.add")}
            onClick={add}
            disabled={kind === "voice"}
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              className="size-4"
            />
          </Key>
        }
      >
        <div className="col-span-2 grid grid-cols-4 gap-1">
          {KINDS.map((k) => (
            <Key
              key={k}
              className="!px-1 !text-[11px]"
              aria-current={kind === k ? "page" : undefined}
              onClick={() => {
                setKind(k)
                setActive(null)
              }}
            >
              {t(`sound.kinds.${k}`)}
            </Key>
          ))}
        </div>
        {list.map((k) => (
          <button
            key={k.id}
            type="button"
            className="nv-tape"
            aria-pressed={track?.id === k.id}
            data-spin={playing === k.id}
            style={{ "--c": TAPE_COLORS[k.kind] } as React.CSSProperties}
            onClick={() => {
              tick(1.2)
              setActive(k.id)
            }}
          >
            <span className="nv-tape-label">
              <span className="nv-tape-name">{k.name}</span>
            </span>
            <i className="nv-tape-hole" style={{ insetInlineStart: "22%" }} />
            <i className="nv-tape-hole" style={{ insetInlineEnd: "22%" }} />
          </button>
        ))}
        <label className="nv-key col-span-2">
          <HugeiconsIcon
            icon={Upload04Icon}
            strokeWidth={2}
            className="size-4"
          />
          {t("sound.upload")}
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void attach(f, f.name.replace(/\.\w+$/, ""))
            }}
          />
        </label>
        {kind === "voice" ? (
          <Key
            className="col-span-2"
            pressed={recording}
            led={recording}
            onClick={() => void toggleRecord()}
          >
            <HugeiconsIcon
              icon={Mic01Icon}
              strokeWidth={2}
              className="size-4"
            />
            {recording ? t("sound.stopRecording") : t("sound.record")}
          </Key>
        ) : null}
      </Plate>

      <Plate
        title={track ? t("sound.desk") : t("sound.desk")}
        bodyClassName="nv-scroll overflow-y-auto p-4"
        actions={
          track ? (
            <div className="flex items-center gap-2">
              <VuMeter read={audio.level} width={92} label={t("sound.meter")} />
              <Key tone="fire" onClick={() => preview(track)}>
                <HugeiconsIcon
                  icon={playing === track.id ? StopIcon : PlayIcon}
                  strokeWidth={2}
                  className="size-4"
                />
                {playing === track.id ? t("sound.stop") : t("sound.play")}
              </Key>
            </div>
          ) : undefined
        }
      >
        {track ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label={t("sound.name")}
                className="nv-field max-w-xs"
                value={track.name}
                onChange={(e) => change({ name: e.target.value }, "name")}
              />
              <Key
                tone="danger"
                onClick={() => {
                  stop()
                  update(
                    (n) =>
                      void (n.tracks = n.tracks.filter(
                        (x) => x.id !== track.id
                      ))
                  )
                }}
              >
                {t("sound.remove")}
              </Key>
            </div>
            {score ? (
              <>
                <div className="grid gap-1">
                  <span className="nv-engraved">{t("sound.mood")}</span>
                  <FocusRing<ScorePreset>
                    label={t("sound.mood")}
                    mark={120}
                    value={
                      (SCORE_PRESET_NAMES.find((p) =>
                        Object.entries(SCORE_PRESETS[p]).every(
                          ([k, v]) => score[k as keyof Score] === v
                        )
                      ) ?? SCORE_PRESET_NAMES[0]) as ScorePreset
                    }
                    options={SCORE_PRESET_NAMES.map((p) => ({
                      value: p,
                      label: t(`sound.moods.${p}`),
                    }))}
                    onChange={(p) => tune({ ...SCORE_PRESETS[p] })}
                  />
                </div>
                <div className="nv-tray flex flex-wrap items-end justify-around gap-3 rounded-lg p-4">
                  {(
                    ["pad", "keys", "pluck", "bass", "drums", "bell"] as const
                  ).map((v) => (
                    <Fader
                      key={v}
                      label={t(`sound.voices.${v}`)}
                      value={score[v]}
                      min={0}
                      max={1}
                      step={0.01}
                      format={percent}
                      onChange={(value) => tune({ [v]: value }, v)}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-start justify-around gap-4">
                  <Knob
                    label={t("sound.tempo")}
                    size={76}
                    value={score.bpm}
                    min={50}
                    max={150}
                    step={1}
                    format={(v) => `${v}`}
                    onChange={(bpm) => tune({ bpm }, "bpm")}
                  />
                  <Knob
                    label={t("sound.bars")}
                    value={score.bars}
                    min={8}
                    max={32}
                    step={4}
                    format={String}
                    onChange={(bars) => tune({ bars }, "bars")}
                  />
                  <Knob
                    label={t("sound.swing")}
                    value={score.swing}
                    min={0}
                    max={1}
                    step={0.01}
                    format={percent}
                    onChange={(swing) => tune({ swing }, "swing")}
                  />
                  <Knob
                    label={t("sound.warmth")}
                    value={score.warmth}
                    min={0}
                    max={1}
                    step={0.01}
                    format={percent}
                    onChange={(warmth) => tune({ warmth }, "warmth")}
                  />
                  <Knob
                    label={t("sound.space")}
                    value={score.space}
                    min={0}
                    max={1}
                    step={0.01}
                    format={percent}
                    onChange={(space) => tune({ space }, "space")}
                  />
                  <Knob
                    label={t("sound.tape")}
                    value={score.tape}
                    min={0}
                    max={1}
                    step={0.01}
                    format={percent}
                    onChange={(tape) => tune({ tape }, "tape")}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-around gap-4">
                  <Dial<MusicMode>
                    label={t("sound.mode")}
                    value={score.mode}
                    options={MUSIC_MODES.map((m) => ({
                      value: m,
                      label: t(`sound.modes.${m}`),
                    }))}
                    onChange={(mode) => tune({ mode })}
                  />
                  <Knob
                    label={t("sound.key")}
                    value={score.root}
                    min={0}
                    max={11}
                    step={1}
                    format={(v) => NOTES[v]!}
                    onChange={(root) => tune({ root }, "root")}
                  />
                  <Knob
                    label={t("sound.take")}
                    value={score.seed % 100}
                    min={0}
                    max={99}
                    step={1}
                    format={String}
                    onChange={(seed) => tune({ seed }, "seed")}
                  />
                </div>
                <div className="nv-tray grid gap-2 rounded-md p-3">
                  <span className="nv-engraved">{t("sound.describe")}</span>
                  <div className="flex gap-0">
                    <input
                      className="nv-field min-w-0 flex-1 !rounded-e-none"
                      placeholder={t("sound.describePlaceholder")}
                      value={describing}
                      onChange={(e) => setDescribing(e.target.value)}
                    />
                    <Key
                      className="!rounded-s-none"
                      disabled={
                        busy ||
                        !describing.trim() ||
                        writer?.available === false
                      }
                      onClick={() => void compose()}
                    >
                      {t("sound.setDials")}
                    </Key>
                  </div>
                </div>
              </>
            ) : null}
            {noise ? (
              <div className="flex flex-wrap items-center justify-around gap-6">
                <Dial<NoiseKind>
                  label={t("sound.source")}
                  size={190}
                  value={noise.kind}
                  options={NOISE_KINDS.map((k) => ({
                    value: k,
                    label: t(`sound.noises.${k}`),
                  }))}
                  onChange={(k) => {
                    change({ recipe: { ...noise, kind: k } })
                    if (playing) stop()
                  }}
                />
                <Knob
                  label={t("sound.tone")}
                  size={84}
                  value={noise.tone}
                  min={0}
                  max={1}
                  step={0.01}
                  format={percent}
                  onChange={(tone) => {
                    change({ recipe: { ...noise, tone } }, "tone")
                    if (playing) stop()
                  }}
                />
                <Knob
                  label={t("sound.drift")}
                  size={84}
                  value={noise.drift}
                  min={0}
                  max={1}
                  step={0.01}
                  format={percent}
                  onChange={(drift) => {
                    change({ recipe: { ...noise, drift } }, "drift")
                    if (playing) stop()
                  }}
                />
              </div>
            ) : null}
            {sfx ? (
              <div className="grid gap-4">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
                  {SFX_KINDS.map((k) => (
                    <Key
                      key={k}
                      pressed={sfx.kind === k}
                      onClick={() => {
                        const next = {
                          ...track,
                          recipe: { ...sfx, kind: k as SfxKind },
                        }
                        change({ recipe: next.recipe })
                        audio.unlock()
                        void audio.shot(next, 1)
                      }}
                    >
                      {t(`sound.sfx.${k}`)}
                    </Key>
                  ))}
                </div>
                <div className="flex justify-center">
                  <Knob
                    label={t("sound.pitch")}
                    size={84}
                    value={sfx.pitch}
                    min={0}
                    max={1}
                    step={0.01}
                    format={percent}
                    onChange={(pitch) =>
                      change({ recipe: { ...sfx, pitch } }, "pitch")
                    }
                  />
                </div>
              </div>
            ) : null}
            {!track.recipe ? (
              <p className="text-sm text-[#b5a994]">{t("sound.fileHelp")}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[#b5a994]">
            {t(kind === "voice" ? "sound.emptyVoice" : "sound.empty")}
          </p>
        )}
      </Plate>
    </div>
  )
}
