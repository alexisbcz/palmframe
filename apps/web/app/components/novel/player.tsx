import * as React from "react"
import { cn } from "cn"

import { useT } from "@/i18n/core"
import { NovelAudio, trackOf } from "@/lib/novel/audio"
import {
  answer,
  choose,
  emptyStage,
  holds,
  interpolate,
  parseText,
  plainText,
  run,
  startState,
  travel,
  type Beat,
  type Cue,
  type RunState,
  type TextRun,
} from "@/lib/novel/engine"
import type { ChoiceOption, Novel, Scene, Step } from "@/lib/novel/model"
import { assetUrl } from "@/lib/novel/paper"

import { Stage, ratioOf, type StageHandle } from "./stage"
import { messages } from "./player.messages"
import "./player.css"

// The game, as a reader gets it: title screen, text, choices, saves, rollback,
// gallery, music room, maps, inventory and preferences.

interface Prefs {
  speed: number // characters per second; 0 is instant
  auto: number // seconds of pause per 40 characters
  music: number
  sfx: number
  blips: number
}
const DEFAULT_PREFS: Prefs = {
  speed: 45,
  auto: 1.5,
  music: 0.8,
  sfx: 0.9,
  blips: 0.5,
}

interface Globals {
  cgs: string[]
  endings: string[]
  tracks: string[]
}

interface Slot {
  at: number
  state: RunState
  scene: string
  line: string
  bg: string
}

const SLOTS = 12

const load = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}
const store = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the game goes on, unsaved.
  }
}

interface Logged {
  who: string | null
  text: string
  chose?: boolean
}

type Panel =
  | "save"
  | "load"
  | "prefs"
  | "history"
  | "gallery"
  | "music"
  | "endings"
  | "items"
  | null

function Typed({ runs, shown }: { runs: TextRun[]; shown: number }) {
  let left = shown
  return (
    <>
      {runs.map((r, i) => {
        if (left <= 0) return null
        const text = r.text.slice(0, left)
        left -= r.text.length
        const style: React.CSSProperties = {
          color: r.color,
          fontWeight: r.bold ? 700 : undefined,
          fontStyle: r.italic ? "italic" : undefined,
          fontSize: r.big ? "1.3em" : undefined,
        }
        if (r.shake || r.wave)
          return (
            <span key={i} style={style}>
              {[...text].map((ch, c) => (
                <span
                  key={c}
                  className={r.shake ? "nvp-shake" : "nvp-wave"}
                  style={{ animationDelay: `${c * -0.07}s` }}
                >
                  {ch === " " ? " " : ch}
                </span>
              ))}
            </span>
          )
        return (
          <span key={i} style={style}>
            {text}
          </span>
        )
      })}
    </>
  )
}

export function NovelPlayer({
  novel,
  storageKey,
  onExit,
  autoStart,
  startScene,
  onStart,
}: {
  novel: Novel
  storageKey: string
  onExit?: () => void
  // The editor's playtest skips the title screen.
  autoStart?: boolean
  startScene?: string | null
  onStart?: () => void
}) {
  const t = useT(messages)
  const audioRef = React.useRef<NovelAudio>(null)
  audioRef.current ??= new NovelAudio()
  const audio = audioRef.current
  const stageRef = React.useRef<StageHandle>(null)
  const [prefs, setPrefsState] = React.useState(DEFAULT_PREFS)
  const [globals, setGlobals] = React.useState<Globals>({
    cgs: [],
    endings: [],
    tracks: [],
  })
  const [slots, setSlots] = React.useState<(Slot | null)[]>([])
  const [mode, setMode] = React.useState<"title" | "game">("title")
  const [panel, setPanel] = React.useState<Panel>(null)
  const [state, setState] = React.useState<RunState | null>(null)
  const [beat, setBeat] = React.useState<Beat | null>(null)
  const [before, setBefore] = React.useState<RunState[]>([])
  const [log, setLog] = React.useState<Logged[]>([])
  const [page, setPage] = React.useState<Logged[]>([])
  const [shown, setShown] = React.useState(0)
  const [auto, setAuto] = React.useState(false)
  const [skip, setSkip] = React.useState(false)
  const [hidden, setHidden] = React.useState(false)
  const [viewing, setViewing] = React.useState<string | null>(null)
  const [playingTrack, setPlayingTrack] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [timeLeft, setTimeLeft] = React.useState(0)
  const [answerText, setAnswerText] = React.useState("")
  const prefsKey = "palmframe-novel-prefs"
  const globalKey = `palmframe-novel:${storageKey}:globals`
  const slotsKey = `palmframe-novel:${storageKey}:slots`

  React.useEffect(() => {
    const p = load(prefsKey, DEFAULT_PREFS)
    setPrefsState(p)
    audio.setLevels({ music: p.music, sfx: p.sfx, blips: p.blips })
    setGlobals(load(globalKey, { cgs: [], endings: [], tracks: [] }))
    try {
      setSlots(JSON.parse(localStorage.getItem(slotsKey) ?? "[]"))
    } catch {
      setSlots([])
    }
    return () => audio.dispose()
  }, [audio, globalKey, slotsKey])

  const setPrefs = (patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch }
      store(prefsKey, next)
      audio.setLevels({ music: next.music, sfx: next.sfx, blips: next.blips })
      return next
    })
  }
  const unlock = (patch: (g: Globals) => Globals) =>
    setGlobals((g) => {
      const next = patch(g)
      store(globalKey, next)
      return next
    })

  const runCues = (cues: Cue[]) => {
    for (const c of cues) {
      if (c.t === "sfx") void audio.shot(trackOf(novel, c.track), c.vol)
      if (c.t === "shake") stageRef.current?.shake(c.power, c.dur)
      if (c.t === "flash") stageRef.current?.flash(c.color, c.dur)
      if (c.t === "unlock-cg")
        unlock((g) => ({ ...g, cgs: [...new Set([...g.cgs, c.ref])] }))
      if (c.t === "ending" && c.ending) {
        const e = c.ending
        unlock((g) => ({ ...g, endings: [...new Set([...g.endings, e])] }))
      }
    }
  }

  const syncSound = (s: RunState) => {
    const m = s.stage.music
    void audio.set("music", trackOf(novel, m.track), m.vol, m.fade)
    const a = s.stage.ambience
    void audio.set("ambience", trackOf(novel, a.track), a.vol, a.fade)
    if (m.track)
      unlock((g) =>
        g.tracks.includes(m.track!)
          ? g
          : { ...g, tracks: [...g.tracks, m.track!] }
      )
  }

  const present = (from: RunState, keep = true) => {
    const { state: next, beat: b } = run(novel, from)
    if (keep) setBefore((h) => [...h.slice(-199), from])
    setState(next)
    setBeat(b)
    setShown(0)
    runCues(b.cues)
    syncSound(next)
    if (b.kind === "say") {
      const line = interpolate(novel, next, b.step.text)
      const who = b.step.who
      const entry = { who, text: line }
      setLog((l) => [...l.slice(-300), entry])
      setPage((p) => (b.scene.layout === "nvl" ? [...p, entry] : []))
      const voice = trackOf(novel, b.step.voice)
      if (voice) void audio.shot(voice, 1)
    }
    if (b.kind === "choice" && b.step.timer) setTimeLeft(b.step.timer)
    if (
      b.kind === "choice" ||
      b.kind === "map" ||
      b.kind === "ask" ||
      b.kind === "end"
    ) {
      setSkip(false)
      setAuto(false)
    }
    if (b.kind === "wait")
      window.setTimeout(
        // Part of one beat with what follows it, for rollback.
        () => present(next, false),
        (skipRef.current ? 0.05 : b.dur) * 1000
      )
  }
  const skipRef = React.useRef(false)
  skipRef.current = skip

  const begin = (fresh: RunState) => {
    audio.unlock()
    onStart?.()
    setMode("game")
    setPanel(null)
    setBefore([])
    setLog([])
    setPage([])
    present(fresh)
  }
  const startGame = () => {
    const s = startState(novel)
    begin(startScene ? { ...s, scene: startScene, seen: [startScene] } : s)
  }

  const didAutoStart = React.useRef(false)
  React.useEffect(() => {
    if (autoStart && !didAutoStart.current) {
      didAutoStart.current = true
      startGame()
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  const toTitle = () => {
    audio.stopAll(0.8)
    setMode("title")
    setPanel(null)
    setBeat(null)
    setState(null)
    setSkip(false)
    setAuto(false)
  }

  // Title music starts with the reader's first touch of the page.
  const titleTrack = novel.titleScreen.music
  const playTitle = () => {
    audio.unlock()
    if (titleTrack)
      void audio.set("music", trackOf(novel, titleTrack), 0.8, 1.5)
  }

  const speaker = beat?.kind === "say" ? beat.step.who : null
  const character = novel.characters.find((c) => c.id === speaker)
  const line =
    beat?.kind === "say" && state
      ? interpolate(novel, state, beat.step.text)
      : ""
  const runs = React.useMemo(() => parseText(line), [line])
  const length = React.useMemo(() => plainText(line).length, [line])
  const isTyping = beat?.kind === "say" && shown < length
  const typing = React.useRef(0)

  // Types one character at a time, pausing where {w} says.
  React.useEffect(() => {
    if (beat?.kind !== "say") return
    if (!prefs.speed || skip) {
      setShown(length)
      return
    }
    let i = 0
    let timer = 0
    const stops = new Map<number, number>()
    let at = 0
    for (const r of runs) {
      if (r.pause) stops.set(at, r.pause)
      at += r.text.length
    }
    const blip = character?.blip ?? "none"
    const next = () => {
      i++
      setShown(i)
      if (i % 3 === 1) audio.blip(blip)
      if (i >= length) return
      const pause = stops.get(i)
      typing.current = timer = window.setTimeout(
        next,
        pause ? pause * 1000 : 1000 / prefs.speed
      )
    }
    typing.current = timer = window.setTimeout(next, 1000 / prefs.speed)
    return () => clearTimeout(timer)
  }, [beat, runs, length, prefs.speed, skip, character?.blip, audio])

  const advance = React.useCallback(() => {
    if (panel || !state || !beat) return
    if (beat.kind !== "say") return
    if (shown < length) {
      clearTimeout(typing.current)
      setShown(length)
      return
    }
    present(state)
    // `present` closes over the whole render on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, state, beat, shown, length])

  // `before` ends with the state that led to what's on screen, so the beat
  // before this one comes from the entry under it.
  const rollback = () => {
    const target = before.at(-2)
    if (!target) return
    setBefore((h) => h.slice(0, -2))
    setLog((l) => {
      const next = [...l]
      while (next.at(-1)?.chose) next.pop()
      next.pop()
      while (next.at(-1)?.chose) next.pop()
      next.pop()
      return next
    })
    present(target)
  }

  // Auto and skip.
  React.useEffect(() => {
    if (panel || beat?.kind !== "say") return
    if (skip) {
      const timer = window.setTimeout(() => state && present(state), 55)
      return () => clearTimeout(timer)
    }
    if (auto && !isTyping) {
      const timer = window.setTimeout(
        () => state && present(state),
        900 + (length / 40) * prefs.auto * 1000
      )
      return () => clearTimeout(timer)
    }
    // `present` closes over the whole render on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, auto, isTyping, beat, panel, length, prefs.auto])

  // Timed choices.
  React.useEffect(() => {
    if (beat?.kind !== "choice" || !beat.step.timer || panel) return
    const total = beat.step.timer
    const started = performance.now() - (total - timeLeft) * 1000
    const interval = window.setInterval(() => {
      const left = total - (performance.now() - started) / 1000
      setTimeLeft(Math.max(0, left))
      if (left <= 0) {
        clearInterval(interval)
        const open = beat.options.filter((o) => !o.locked)
        const fall = beat.step.options[beat.step.fallback]
        pick(
          open.find((o) => o.option.id === fall?.id)?.option ?? open[0]!.option
        )
      }
    }, 80)
    return () => clearInterval(interval)
    // Restarts only for a new choice or a closed menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, panel])

  const pick = (option: ChoiceOption) => {
    if (!state) return
    setLog((l) => [...l, { who: null, text: option.text, chose: true }])
    setPage([])
    present(choose(novel, state, option))
  }

  const visit = (scene: string | null) => {
    if (state) present(travel(state, scene))
  }

  const submitAnswer = (e: React.FormEvent) => {
    e.preventDefault()
    if (!state || beat?.kind !== "ask") return
    const value = answerText.trim()
    if (!value) return
    setAnswerText("")
    present(answer(state, beat.step.on, value))
  }

  const sceneOf = (id: string): Scene | undefined =>
    novel.scenes.find((s) => s.id === id)

  const save = (index: number) => {
    if (!state) return
    // A save holds the moment just before the line on screen, so that loading
    // shows that line again.
    const slot: Slot = {
      at: Date.now(),
      state: before.at(-1) ?? state,
      scene: sceneOf(state.scene)?.name ?? "",
      line: plainText(line).slice(0, 80),
      bg: novel.backdrops.find((b) => b.id === state.stage.bg)?.url ?? "",
    }
    const next = [...slots]
    next[index] = slot
    setSlots(next)
    store(slotsKey, next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }
  const loadSlot = (slot: Slot) => {
    audio.unlock()
    setMode("game")
    setPanel(null)
    setBefore([])
    setLog([])
    setPage([])
    present(slot.state)
  }

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  React.useEffect(() => {
    if (mode !== "game") return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return
      if (panel) {
        if (e.key === "Escape") setPanel(null)
        return
      }
      if (e.key === " " || e.key === "Enter") {
        if (beat?.kind === "say") {
          e.preventDefault()
          advance()
        }
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") rollback()
      else if (e.key === "h" || e.key === "H") setHidden((v) => !v)
      else if (e.key === "a" || e.key === "A") setAuto((v) => !v)
      else if (e.key === "s" || e.key === "S") setSkip((v) => !v)
      else if (e.key === "Control") setSkip(true)
      else if (e.key === "Escape") setPanel("prefs")
    }
    const onUp = (e: KeyboardEvent) => e.key === "Control" && setSkip(false)
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onUp)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onUp)
    }
    // Rebinds with what the handlers read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, panel, beat, advance, before])

  const titleStage = React.useMemo(() => {
    const s = emptyStage()
    s.bg = novel.titleScreen.backdrop
    s.weather = { kind: novel.titleScreen.weather, amount: 0.6 }
    return s
  }, [novel.titleScreen])

  const hud = novel.variables.filter((v) => v.hud)
  const cgs = novel.backdrops.filter((b) => b.kind === "cg")
  const songs = novel.tracks.filter((k) => k.kind === "music")
  const canContinue = slots.some(Boolean)
  const theme = {
    "--accent": novel.theme.accent,
    "--ratio": ratioOf(novel),
  } as React.CSSProperties
  const layout = beat?.kind === "say" && beat.scene.layout === "nvl"

  const side =
    character?.sprites.find(
      (s) => s.id === (beat?.kind === "say" ? beat.step.pose : null)
    ) ?? character?.sprites[0]

  const quick = (
    <div className="nvp-quick" onClick={(e) => e.stopPropagation()}>
      <button type="button" disabled={before.length < 2} onClick={rollback}>
        {t("back")}
      </button>
      <button type="button" onClick={() => setPanel("history")}>
        {t("history")}
      </button>
      <button
        type="button"
        aria-pressed={skip}
        onClick={() => setSkip((v) => !v)}
      >
        {t("skip")}
      </button>
      <button
        type="button"
        aria-pressed={auto}
        onClick={() => setAuto((v) => !v)}
      >
        {t("auto")}
      </button>
      <button type="button" onClick={() => setPanel("save")}>
        {t("save")}
      </button>
      <button type="button" onClick={() => setPanel("load")}>
        {t("load")}
      </button>
      {novel.items.length ? (
        <button type="button" onClick={() => setPanel("items")}>
          {t("items")}
        </button>
      ) : null}
      <button type="button" onClick={() => setPanel("prefs")}>
        {t("prefs")}
      </button>
    </div>
  )

  return (
    <div
      className={cn(
        "nvp",
        `nvp-font-${novel.theme.font}`,
        `nvp-box-${novel.theme.box}`
      )}
      style={theme}
    >
      <div className="nvp-frame">
        {mode === "title" ? (
          <div className="nvp-screen" onPointerDown={playTitle}>
            <Stage novel={novel} state={titleStage} />
            <div className="nvp-title-shade" />
            <div className="nvp-title">
              <h1>{novel.title || t("untitled")}</h1>
              {novel.titleScreen.tagline ? (
                <p>{novel.titleScreen.tagline}</p>
              ) : null}
              {novel.author ? (
                <p className="nvp-author">{t("by", { name: novel.author })}</p>
              ) : null}
              <nav>
                <button type="button" onClick={startGame}>
                  {t("start")}
                </button>
                <button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => setPanel("load")}
                >
                  {t("continue")}
                </button>
                {cgs.length ? (
                  <button type="button" onClick={() => setPanel("gallery")}>
                    {t("gallery")}
                  </button>
                ) : null}
                {songs.length ? (
                  <button type="button" onClick={() => setPanel("music")}>
                    {t("musicRoom")}
                  </button>
                ) : null}
                {novel.endings.length ? (
                  <button type="button" onClick={() => setPanel("endings")}>
                    {t("endings")}
                  </button>
                ) : null}
                <button type="button" onClick={() => setPanel("prefs")}>
                  {t("prefs")}
                </button>
                {onExit ? (
                  <button type="button" onClick={onExit}>
                    {t("exit")}
                  </button>
                ) : null}
              </nav>
            </div>
          </div>
        ) : (
          <div
            className="nvp-screen"
            onClick={advance}
            onWheel={(e) => {
              if (panel) return
              if (e.deltaY < -10) rollback()
              else if (e.deltaY > 10) advance()
            }}
          >
            {state ? (
              <Stage
                ref={stageRef}
                novel={novel}
                state={state.stage}
                speaker={speaker}
                spotlight={novel.theme.spotlight}
              />
            ) : null}

            {!hidden && hud.length && state ? (
              <div className="nvp-hud">
                {hud.map((v) => (
                  <div key={v.id}>
                    <span>{v.name.replace(/_/g, " ")}</span>
                    {v.kind === "number" ? (
                      <i>
                        <b
                          style={{
                            width: `${Math.min(100, (Number(state.vars[v.id]) / (v.max || 10)) * 100)}%`,
                          }}
                        />
                      </i>
                    ) : (
                      <em>{String(state.vars[v.id] ?? "")}</em>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {beat?.kind === "choice" ? (
              <div className="nvp-choices" onClick={(e) => e.stopPropagation()}>
                {beat.step.prompt ? (
                  <p>{state && interpolate(novel, state, beat.step.prompt)}</p>
                ) : null}
                {beat.step.timer ? (
                  <div className="nvp-timer">
                    <b
                      style={{
                        width: `${(timeLeft / beat.step.timer) * 100}%`,
                      }}
                    />
                  </div>
                ) : null}
                {beat.options.map(({ option, locked }) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={locked}
                    onClick={() => pick(option)}
                  >
                    {state && interpolate(novel, state, option.text)}
                  </button>
                ))}
              </div>
            ) : null}

            {beat?.kind === "map" ? (
              <MapScreen
                novel={novel}
                step={beat.step}
                state={state!}
                onPick={visit}
              />
            ) : null}

            {beat?.kind === "ask" ? (
              <form
                className="nvp-ask"
                onSubmit={submitAnswer}
                onClick={(e) => e.stopPropagation()}
              >
                <label>
                  <span>{beat.step.prompt}</span>
                  <input
                    autoFocus
                    maxLength={beat.step.max}
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                  />
                </label>
                <button type="submit">{t("confirm")}</button>
              </form>
            ) : null}

            {beat?.kind === "end" ? (
              <div className="nvp-end" onClick={(e) => e.stopPropagation()}>
                <h2>{t("theEnd")}</h2>
                {beat.ending ? (
                  <p>{novel.endings.find((x) => x.id === beat.ending)?.name}</p>
                ) : null}
                <button type="button" onClick={toTitle}>
                  {t("toTitle")}
                </button>
              </div>
            ) : null}

            {beat?.kind === "error" ? (
              <div className="nvp-end" onClick={(e) => e.stopPropagation()}>
                <h2>
                  {t(beat.message === "loop" ? "errorLoop" : "errorScene")}
                </h2>
                <button type="button" onClick={toTitle}>
                  {t("toTitle")}
                </button>
              </div>
            ) : null}

            {layout && !hidden ? (
              <div className="nvp-nvl">
                {page.slice(0, -1).map((p, i) => (
                  <p key={i}>
                    {p.who ? (
                      <b>
                        {novel.characters.find((c) => c.id === p.who)?.name}
                        :{" "}
                      </b>
                    ) : null}
                    {plainText(p.text)}
                  </p>
                ))}
                <p>
                  {character ? (
                    <b style={{ color: character.color }}>{character.name}: </b>
                  ) : null}
                  <Typed runs={runs} shown={shown} />
                </p>
              </div>
            ) : null}

            {saved ? <div className="nvp-saved">{t("saved")}</div> : null}
          </div>
        )}

        {mode === "game" && !hidden ? (
          <div className="nvp-dock" onClick={advance}>
            {beat?.kind === "say" && !layout ? (
              <div
                className={cn(
                  "nvp-box",
                  novel.theme.sideImage && side?.url && "nvp-has-side"
                )}
              >
                {novel.theme.sideImage && side?.url ? (
                  <img className="nvp-side" src={assetUrl(side.url)} alt="" />
                ) : null}
                {character ? (
                  <div className="nvp-name" style={{ color: character.color }}>
                    {character.name}
                  </div>
                ) : null}
                <div className="nvp-line" aria-live="polite">
                  <Typed runs={runs} shown={shown} />
                  {!isTyping ? <i className="nvp-ctc" /> : null}
                </div>
              </div>
            ) : null}
            {beat?.kind === "map" ? null : quick}
          </div>
        ) : null}

        {panel ? (
          <div
            className="nvp-panel"
            role="dialog"
            aria-label={t(panel === "music" ? "musicRoom" : panel)}
          >
            <header>
              <h2>{t(panel === "music" ? "musicRoom" : panel)}</h2>
              <button type="button" onClick={() => setPanel(null)}>
                {t("return")}
              </button>
            </header>
            <div className="nvp-panel-body">
              {panel === "save" || panel === "load" ? (
                <div className="nvp-slots">
                  {Array.from({ length: SLOTS }, (_, i) => {
                    const slot = slots[i]
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={panel === "load" && !slot}
                        onClick={() => {
                          if (panel === "save") save(i)
                          else if (slot) loadSlot(slot)
                        }}
                      >
                        {slot?.bg ? (
                          <img src={assetUrl(slot.bg)} alt="" />
                        ) : (
                          <span className="nvp-slot-empty">{i + 1}</span>
                        )}
                        <b>{slot?.scene ?? t("emptySlot")}</b>
                        {slot ? (
                          <small>{new Date(slot.at).toLocaleString()}</small>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {panel === "prefs" ? (
                <div className="nvp-prefs">
                  <Pref
                    label={t("textSpeed")}
                    value={prefs.speed}
                    min={0}
                    max={120}
                    step={5}
                    onChange={(v) => setPrefs({ speed: v })}
                  />
                  <Pref
                    label={t("autoDelay")}
                    value={prefs.auto}
                    min={0.5}
                    max={4}
                    step={0.25}
                    onChange={(v) => setPrefs({ auto: v })}
                  />
                  <Pref
                    label={t("musicVolume")}
                    value={prefs.music}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setPrefs({ music: v })}
                  />
                  <Pref
                    label={t("sfxVolume")}
                    value={prefs.sfx}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setPrefs({ sfx: v })}
                  />
                  <Pref
                    label={t("blipVolume")}
                    value={prefs.blips}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setPrefs({ blips: v })}
                  />
                  <div className="nvp-row">
                    <button type="button" onClick={fullscreen}>
                      {t("fullscreen")}
                    </button>
                    {mode === "game" ? (
                      <button type="button" onClick={toTitle}>
                        {t("toTitle")}
                      </button>
                    ) : null}
                    {onExit ? (
                      <button type="button" onClick={onExit}>
                        {t("exit")}
                      </button>
                    ) : null}
                  </div>
                  <p className="nvp-hint">{t("keys")}</p>
                </div>
              ) : null}
              {panel === "history" ? (
                <div className="nvp-history">
                  {log.map((l, i) => {
                    const who = novel.characters.find((c) => c.id === l.who)
                    return (
                      <p key={i} data-chose={l.chose}>
                        {who ? (
                          <b style={{ color: who.color }}>{who.name}</b>
                        ) : null}
                        {plainText(l.text)}
                      </p>
                    )
                  })}
                </div>
              ) : null}
              {panel === "gallery" ? (
                <div className="nvp-gallery">
                  {cgs.map((c) =>
                    globals.cgs.includes(c.id) ? (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setViewing(c.id)}
                      >
                        <img src={assetUrl(c.url)} alt={c.name} />
                      </button>
                    ) : (
                      <div key={c.id} className="nvp-locked">
                        {t("locked")}
                      </div>
                    )
                  )}
                </div>
              ) : null}
              {panel === "music" ? (
                <ul className="nvp-songs">
                  {songs.map((s) => {
                    const open =
                      globals.tracks.includes(s.id) ||
                      novel.titleScreen.music === s.id
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          disabled={!open}
                          aria-pressed={playingTrack === s.id}
                          onClick={() => {
                            audio.unlock()
                            const next = playingTrack === s.id ? null : s.id
                            setPlayingTrack(next)
                            void audio.set(
                              "music",
                              next ? s : undefined,
                              0.85,
                              0.6
                            )
                          }}
                        >
                          {open ? s.name : t("locked")}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {panel === "endings" ? (
                <ul className="nvp-endings">
                  {novel.endings.map((e) => {
                    const got = globals.endings.includes(e.id)
                    return (
                      <li key={e.id}>
                        <b>{got ? e.name : t("locked")}</b>
                        {got && e.description ? (
                          <span>{e.description}</span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {panel === "items" ? (
                <div className="nvp-items">
                  {novel.items
                    .filter((i) => state?.items.includes(i.id))
                    .map((i) => (
                      <div key={i.id}>
                        {i.url ? <img src={assetUrl(i.url)} alt="" /> : null}
                        <b>{i.name}</b>
                        <span>{i.description}</span>
                      </div>
                    ))}
                  {!state?.items.length ? (
                    <p className="nvp-hint">{t("noItems")}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {viewing ? (
          <button
            type="button"
            className="nvp-view"
            aria-label={t("return")}
            onClick={() => setViewing(null)}
          >
            <img
              src={assetUrl(novel.backdrops.find((b) => b.id === viewing)?.url)}
              alt=""
            />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Pref({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="nvp-pref">
      <span>{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function MapScreen({
  novel,
  step,
  state,
  onPick,
}: {
  novel: Novel
  step: Extract<Step, { t: "map" }>
  state: RunState
  onPick: (scene: string | null) => void
}) {
  const map = novel.maps.find((m) => m.id === step.map)
  if (!map) return null
  const open = map.pins.filter((p) => {
    if (!p.when?.clauses.length) return true
    return holds(state, p.when)
  })
  return (
    <div className="nvp-map" onClick={(e) => e.stopPropagation()}>
      {map.url ? <img src={assetUrl(map.url)} alt={map.name} /> : null}
      {open.map((p) => (
        <button
          key={p.id}
          type="button"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onClick={() => onPick(p.scene)}
        >
          <i />
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  )
}
