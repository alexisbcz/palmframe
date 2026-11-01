import * as React from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft02Icon,
  PlayIcon,
  RedoIcon,
  UndoIcon,
  VolumeHighIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { loadDraft, saveDraft, storageFor } from "@/lib/novel/client"
import { emptyNovel, toNovel, type Novel } from "@/lib/novel/model"
import { useSupabase } from "@/lib/supabase.browser"

import { BoardRoom } from "./board-room"
import { CastRoom, SetsRoom } from "./cast-room"
import { Key, Led, Readout, clicksEnabled, setClicks } from "./hardware"
import { messages } from "./novel.messages"
import { NovelPlayer } from "./player"
import { FrontRoom, MapsRoom, SwitchboardRoom } from "./plan-rooms"
import { ReleaseRoom } from "./release-room"
import { SoundRoom } from "./sound-room"
import { StageRoom } from "./stage-room"
import {
  WorkContext,
  useHistory,
  type ArtInfo,
  type Room,
  type WriterInfo,
} from "./work"
import "./novel.css"
import "./player.css"

const ROOMS: Room[] = [
  "board",
  "stage",
  "cast",
  "sets",
  "sound",
  "maps",
  "switchboard",
  "front",
  "release",
]

type Save = "saved" | "saving" | "dirty" | "conflict" | "error"

export function NovelEditor({
  id,
  initial,
  revision,
  userId,
  credits,
}: {
  // Null is the local draft of someone signed out.
  id: string | null
  initial: Novel | null
  revision: number
  userId: string | null
  credits: number | null
}) {
  const [novel, setNovel] = React.useState(initial)
  React.useEffect(() => {
    if (novel) return
    loadDraft()
      .then((d) => setNovel(d ? toNovel(d) : emptyNovel("")))
      .catch(() => setNovel(emptyNovel("")))
  }, [novel])
  if (!novel) return <div className="nv nv-bench fixed inset-0" />
  return (
    <Workshop
      id={id}
      initial={novel}
      revision={revision}
      userId={userId}
      credits={credits}
    />
  )
}

function Workshop({
  id,
  initial,
  revision,
  userId,
  credits: startCredits,
}: {
  id: string | null
  initial: Novel
  revision: number
  userId: string | null
  credits: number | null
}) {
  const t = useT(messages)
  const supabase = useSupabase()
  const [save, setSave] = React.useState<Save>("saved")
  const [credits, setCredits] = React.useState(startCredits)
  const rev = React.useRef(revision)
  const timer = React.useRef<number>(0)
  const latest = React.useRef(initial)
  const flushing = React.useRef(false)

  const flush = React.useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    const doc = latest.current
    setSave("saving")
    try {
      if (!id) await saveDraft(doc)
      else {
        const { data, error } = await supabase
          .from("comic_novels")
          .update({
            data: doc,
            title: doc.title.slice(0, 120),
            revision: rev.current + 1,
          })
          .eq("id", id)
          .eq("revision", rev.current)
          .select("revision")
        if (error) throw error
        if (!data?.length) {
          setSave("conflict")
          return
        }
        rev.current = data[0]!.revision
      }
      setSave(latest.current === doc ? "saved" : "dirty")
      if (latest.current !== doc)
        timer.current = window.setTimeout(() => void flush(), 300)
    } catch {
      setSave("error")
      timer.current = window.setTimeout(() => void flush(), 5000)
    } finally {
      flushing.current = false
    }
  }, [id, supabase])

  const onChange = React.useCallback(
    (doc: Novel) => {
      latest.current = doc
      setSave((s) => (s === "conflict" ? s : "dirty"))
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), 900)
    },
    [flush]
  )
  const history = useHistory(initial, onChange)
  const { novel } = history

  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveRef.current !== "saved") e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])
  const saveRef = React.useRef(save)
  saveRef.current = save

  const [room, setRoom] = React.useState<Room>("board")
  const [scene, setScene] = React.useState<string | null>(novel.start)
  const [step, setStep] = React.useState<string | null>(null)
  const [playing, setPlaying] = React.useState<{ scene: string | null } | null>(
    null
  )
  const [note, setNote] = React.useState<string | null>(null)
  const [art, setArt] = React.useState<ArtInfo | null>(null)
  const [writer, setWriter] = React.useState<WriterInfo | null>(null)
  const [clicks, setClicksState] = React.useState(true)
  const noteTimer = React.useRef(0)

  React.useEffect(() => {
    setClicksState(clicksEnabled())
    fetch("/api/novels/art")
      .then((r) => r.json())
      .then(setArt)
      .catch(() => {})
    fetch("/api/novels/write")
      .then((r) => r.json())
      .then(setWriter)
      .catch(() => {})
  }, [])

  const notify = React.useCallback((message: string) => {
    setNote(message)
    clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setNote(null), 5000)
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [history.undo, history.redo])

  const storage = React.useMemo(
    () => storageFor(userId ? supabase : null, userId),
    [supabase, userId]
  )

  const work = React.useMemo(
    () => ({
      ...history,
      storage,
      room,
      setRoom,
      scene,
      setScene,
      step,
      setStep,
      play: (s?: string | null) => setPlaying({ scene: s ?? null }),
      notify,
      novelId: id,
      signedIn: !!userId,
      art,
      writer,
      setCredits: (n: number | null) => {
        if (n !== null) setCredits(n)
      },
    }),
    [history, storage, room, scene, step, notify, id, userId, art, writer]
  )

  const saveLabel: Record<Save, string> = {
    saved: t("save.saved"),
    saving: t("save.saving"),
    dirty: t("save.dirty"),
    conflict: t("save.conflict"),
    error: t("save.error"),
  }

  return (
    <WorkContext.Provider value={work}>
      <div className="nv nv-bench fixed inset-0 flex flex-col">
        <header className="nv-rail flex flex-none flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
          <Link
            to="/novels"
            className="nv-key"
            data-size="icon"
            aria-label={t("backToShelf")}
          >
            <HugeiconsIcon
              icon={ArrowLeft02Icon}
              strokeWidth={2}
              className="size-4 rtl:rotate-180"
            />
          </Link>
          <input
            aria-label={t("novelTitle")}
            className="nv-title min-w-0 flex-[1_1_140px] bg-transparent py-1 text-lg text-[#ece4d4] outline-none placeholder:text-[#7f7566] sm:text-xl"
            placeholder={t("untitled")}
            value={novel.title}
            maxLength={120}
            onChange={(e) => {
              const v = e.target.value
              history.update((n) => void (n.title = v), "title")
            }}
          />
          <nav
            aria-label={t("rooms")}
            className="nv-scroll order-last flex w-full gap-1.5 overflow-x-auto pt-0.5 pb-1.5 lg:order-none lg:w-auto"
          >
            {ROOMS.map((r) => (
              <Key
                key={r}
                aria-current={room === r ? "page" : undefined}
                onClick={() => setRoom(r)}
              >
                {t(`rooms_.${r}`)}
              </Key>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5"
              title={saveLabel[save]}
              role="status"
            >
              <Led
                on
                color={
                  save === "saved"
                    ? "var(--green)"
                    : save === "conflict" || save === "error"
                      ? "var(--red)"
                      : "var(--amber)"
                }
              />
              <span className="nv-engraved hidden xl:inline">
                {saveLabel[save]}
              </span>
            </span>
            {credits !== null ? <Readout>{credits}</Readout> : null}
            <Key
              size="icon"
              aria-label={t("undo")}
              disabled={!history.canUndo}
              onClick={history.undo}
            >
              <HugeiconsIcon
                icon={UndoIcon}
                strokeWidth={2}
                className="size-4 rtl:rotate-180"
              />
            </Key>
            <Key
              size="icon"
              aria-label={t("redo")}
              disabled={!history.canRedo}
              onClick={history.redo}
            >
              <HugeiconsIcon
                icon={RedoIcon}
                strokeWidth={2}
                className="size-4 rtl:rotate-180"
              />
            </Key>
            <Key
              size="icon"
              aria-label={t("clicks")}
              pressed={clicks}
              onClick={() => {
                setClicks(!clicks)
                setClicksState(!clicks)
              }}
            >
              <HugeiconsIcon
                icon={clicks ? VolumeHighIcon : VolumeOffIcon}
                strokeWidth={2}
                className="size-4"
              />
            </Key>
            <Key tone="fire" onClick={() => setPlaying({ scene: null })}>
              <HugeiconsIcon
                icon={PlayIcon}
                strokeWidth={2}
                className="size-4 rtl:rotate-180"
              />
              {t("playtest")}
            </Key>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          {room === "board" ? <BoardRoom /> : null}
          {room === "stage" ? <StageRoom /> : null}
          {room === "cast" ? <CastRoom /> : null}
          {room === "sets" ? <SetsRoom /> : null}
          {room === "sound" ? <SoundRoom /> : null}
          {room === "maps" ? <MapsRoom /> : null}
          {room === "switchboard" ? <SwitchboardRoom /> : null}
          {room === "front" ? <FrontRoom /> : null}
          {room === "release" ? <ReleaseRoom /> : null}
        </main>
        {note ? (
          <div
            role="status"
            className="nv-plate fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg px-4 py-3 text-sm"
          >
            {note}
          </div>
        ) : null}
      </div>
      {playing ? (
        <div className="fixed inset-0 z-50 bg-black">
          <NovelPlayer
            novel={novel}
            storageKey={`test-${id ?? "draft"}`}
            autoStart
            startScene={playing.scene}
            onExit={() => setPlaying(null)}
          />
          <button
            type="button"
            className="nv-key fixed end-3 top-3 z-[60]"
            onClick={() => setPlaying(null)}
          >
            {t("stopPlaytest")}
          </button>
        </div>
      ) : null}
    </WorkContext.Provider>
  )
}
