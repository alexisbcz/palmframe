import * as React from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  RefreshIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "cn"

import { LabeledCheckbox } from "@/components/labeled-checkbox"
import { useLocale, useT } from "@/i18n/core"
import { animeCall, errorCode } from "@/lib/anime/client"
import {
  ANIME_BUCKET,
  DUB_LANGUAGES,
  MAX_SHOTS,
  type DubLanguage,
} from "@/lib/anime/model"
import {
  MIN_FRAME,
  WORK_SIDE,
  cropPanel,
  detectFrames,
  framesInOrder,
  panelsOfProject,
} from "@/lib/anime/panels"
import type { Frame } from "@/components/comic-canvas/pixel/detect-panels"
import type { ComicProject } from "@/components/comic-canvas/model"
import {
  FILE_ACCEPT,
  openComic,
  type ImportPage,
  type OpenedComic,
} from "@/lib/comic-import/client"
import { useSupabase } from "@/lib/supabase.browser"
import { messages } from "@/routes/anime.messages"

export interface ProjectChoice {
  id: string
  title: string
  cover: string | null
  slide_count: number
}

type Step =
  { kind: "source" } | { kind: "panels"; comic: OpenedComic; title: string }

export function Failure({ code }: { code: string | null }) {
  const t = useT(messages)
  if (!code) return null
  const text = t(`errors.${code}` as never)
  return (
    <p
      role="alert"
      className="rounded-xl bg-pink-600/15 px-3 py-2 text-sm text-pink-300"
    >
      {text.startsWith("errors.") ? t("errors.failed") : text}
    </p>
  )
}

function FrameEditor({
  page,
  frames,
  onChange,
  numberFrom,
}: {
  page: ImportPage
  frames: Frame[]
  onChange: (frames: Frame[]) => void
  numberFrom: number
}) {
  const t = useT(messages)
  const [src, setSrc] = React.useState<string | null>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{
    i: number
    mode: "move" | "size"
    x: number
    y: number
    start: Frame
  } | null>(null)

  React.useEffect(() => {
    let live = true
    void page
      .draw(1100)
      .then((c) => live && setSrc(c.toDataURL("image/jpeg", 0.8)))
    return () => {
      live = false
    }
  }, [page])

  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    }
  }
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v))

  const onDown = (e: React.PointerEvent) => {
    if (e.target !== box.current && !(e.target as HTMLElement).dataset.page)
      return
    const p = at(e)
    const made = { x: p.x, y: p.y, width: 0, height: 0 }
    drag.current = { i: frames.length, mode: "size", ...p, start: made }
    onChange([...frames, made])
    box.current!.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = at(e)
    const dx = p.x - d.x
    const dy = p.y - d.y
    onChange(
      frames.map((f, i) => {
        if (i !== d.i) return f
        return d.mode === "move"
          ? {
              ...f,
              x: clamp(d.start.x + dx, 0, 1 - f.width),
              y: clamp(d.start.y + dy, 0, 1 - f.height),
            }
          : {
              ...f,
              width: clamp(d.start.width + dx, 0, 1 - f.x),
              height: clamp(d.start.height + dy, 0, 1 - f.y),
            }
      })
    )
  }
  const onUp = () => {
    drag.current = null
    // A click on the page shouldn't leave a speck of a frame behind.
    if (frames.some((f) => f.width < MIN_FRAME || f.height < MIN_FRAME))
      onChange(
        frames.filter((f) => f.width >= MIN_FRAME && f.height >= MIN_FRAME)
      )
  }
  const grab = (e: React.PointerEvent, i: number, mode: "move" | "size") => {
    e.stopPropagation()
    drag.current = { i, mode, ...at(e), start: frames[i]! }
    box.current!.setPointerCapture(e.pointerId)
  }

  return (
    <div
      ref={box}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className="relative mx-auto w-fit touch-none overflow-hidden rounded-xl bg-white/5 select-none"
    >
      {src ? (
        <img
          src={src}
          alt=""
          data-page
          draggable={false}
          className="block max-h-[62svh] w-auto"
        />
      ) : (
        <div className="flex size-80 items-center justify-center">
          <Spinner />
        </div>
      )}
      {frames.map((f, i) => (
        <div
          key={i}
          onPointerDown={(e) => grab(e, i, "move")}
          style={{
            left: `${f.x * 100}%`,
            top: `${f.y * 100}%`,
            width: `${f.width * 100}%`,
            height: `${f.height * 100}%`,
          }}
          className="absolute cursor-move bg-[var(--anime-accent)]/10 ring-2 ring-[var(--anime-accent)]"
        >
          <span className="absolute start-1 top-1 rounded bg-[var(--anime-accent)] px-1.5 text-xs font-bold text-black tabular-nums">
            {numberFrom + i + 1}
          </span>
          <button
            type="button"
            aria-label={t("panels.remove", { index: numberFrom + i + 1 })}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange(frames.filter((_, n) => n !== i))}
            className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </button>
          <span
            onPointerDown={(e) => grab(e, i, "size")}
            className="absolute end-0 bottom-0 size-4 cursor-nwse-resize bg-[var(--anime-accent)]"
          />
        </div>
      ))}
    </div>
  )
}

function PanelStep({
  comic,
  initialTitle,
  onBack,
  rights,
}: {
  comic: OpenedComic
  initialTitle: string
  onBack: () => void
  rights: boolean
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const supabase = useSupabase()
  const [index, setIndex] = React.useState(0)
  const [frames, setFrames] = React.useState<Record<string, Frame[]>>({})
  const [rtl, setRtl] = React.useState(false)
  const [title, setTitle] = React.useState(initialTitle)
  const [dub, setDub] = React.useState<DubLanguage>("source")
  const [progress, setProgress] = React.useState<{
    done: number
    total: number
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const page = comic.pages[index]!

  const detect = React.useCallback(
    async (p: ImportPage) => detectFrames(await p.draw(WORK_SIDE)),
    []
  )
  React.useEffect(() => {
    if (frames[page.id]) return
    let live = true
    void detect(page).then((found) => {
      if (live) setFrames((all) => ({ ...all, [page.id]: found }))
    })
    return () => {
      live = false
    }
  }, [page, frames, detect])

  const before = comic.pages
    .slice(0, index)
    .reduce((n, p) => n + (frames[p.id]?.length ?? 0), 0)

  // Pages nobody opened still count, from their own detection.
  const start = async () => {
    setError(null)
    try {
      const pages: { page: ImportPage; n: number; list: Frame[] }[] = []
      for (const [n, p] of comic.pages.entries()) {
        const list = frames[p.id] ?? (await detect(p))
        pages.push({ page: p, n, list: framesInOrder(list, rtl) })
      }
      const total = pages.reduce((n, p) => n + p.list.length, 0)
      if (total > MAX_SHOTS) {
        setError("too_many_shots")
        return
      }
      setProgress({ done: 0, total })
      const { id, folder } = await animeCall<{ id: string; folder: string }>({
        intent: "create",
        title: title.trim(),
        rtl,
        rights,
        settings: { dub },
      })
      const panels: { path: string; page: number }[] = []
      for (const { page: p, n, list } of pages) {
        if (!list.length) continue
        const canvas = await p.draw(WORK_SIDE)
        for (const frame of list) {
          const path = `${folder}/${String(panels.length).padStart(3, "0")}.jpg`
          const { error: failed } = await supabase.storage
            .from(ANIME_BUCKET)
            .upload(path, await cropPanel(canvas, frame), {
              contentType: "image/jpeg",
            })
          if (failed) throw failed
          panels.push({ path, page: n })
          setProgress({ done: panels.length, total })
        }
      }
      await animeCall({ intent: "panels", id, panels })
      await animeCall({ intent: "direct", id })
      comic.close()
      navigate(`/studio/anime/${id}`)
    } catch (e) {
      setProgress(null)
      setError(errorCode(e))
    }
  }

  const count =
    before +
    comic.pages
      .slice(index)
      .reduce((n, p) => n + (frames[p.id]?.length ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="studio-title text-2xl">{t("panels.title")}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("panels.text")}
          </p>
        </div>
        <Button variant="ghost" onPress={onBack}>
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            className="rtl:rotate-180"
          />
          {t("batch.dismiss")}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-card p-3">
          <FrameEditor
            page={page}
            frames={frames[page.id] ?? []}
            numberFrom={before}
            onChange={(next) =>
              setFrames((all) => ({ ...all, [page.id]: next }))
            }
          />
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("panels.previous")}
              isDisabled={index === 0}
              onPress={() => setIndex(index - 1)}
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                strokeWidth={2}
                className="rtl:rotate-180"
              />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {t("panels.page", { page: index + 1, total: comic.pages.length })}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("panels.next")}
              isDisabled={index === comic.pages.length - 1}
              onPress={() => setIndex(index + 1)}
            >
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="rtl:rotate-180"
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("panels.reset")}
              onPress={() =>
                void detect(page).then((found) =>
                  setFrames((all) => ({ ...all, [page.id]: found }))
                )
              }
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("panels.name")}
            <Input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <LabeledCheckbox isSelected={rtl} onChange={setRtl}>
            {t("panels.rtl")}
          </LabeledCheckbox>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("settings.dub")}
            <NativeSelect
              value={dub}
              className="w-full"
              onChange={(e) => setDub(e.target.value as DubLanguage)}
            >
              {DUB_LANGUAGES.map((l) => (
                <NativeSelectOption key={l} value={l}>
                  {l === "source"
                    ? t("settings.dubSource")
                    : new Intl.DisplayNames([locale], { type: "language" }).of(
                        l
                      )}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("panels.selected", { count })}
          </p>
          <Failure code={error} />
          {progress ? (
            <p className="flex items-center gap-2 text-sm" aria-live="polite">
              <Spinner />
              {t("panels.uploading", {
                done: progress.done,
                total: progress.total,
              })}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={!count || !title.trim()}
              className="anime-generate"
            >
              {t("panels.start")}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function NewEpisode({
  projects,
  connected,
}: {
  projects: ProjectChoice[]
  connected: boolean
}) {
  const t = useT(messages)
  const navigate = useNavigate()
  const supabase = useSupabase()
  const [step, setStep] = React.useState<Step>({ kind: "source" })
  const [rights, setRights] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [over, setOver] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  const take = async (files: File[]) => {
    if (!files.length) return
    if (!rights) {
      setError("rights_required")
      return
    }
    setError(null)
    setBusy("file")
    try {
      const comic = await openComic(files)
      if (!comic.pages.length) throw new Error("empty")
      setStep({
        kind: "panels",
        comic,
        title: files[0]!.name.replace(/\.[^.]+$/, "").slice(0, 120),
      })
    } catch (e) {
      setError(errorCode(e))
    } finally {
      setBusy(null)
    }
  }

  const fromProject = async (p: ProjectChoice) => {
    setError(null)
    setBusy(p.id)
    try {
      const { data, error: failed } = await supabase
        .from("comic_projects")
        .select("data")
        .eq("id", p.id)
        .single()
      if (failed) throw failed
      const panels = panelsOfProject(data.data as ComicProject).slice(
        0,
        MAX_SHOTS
      )
      if (!panels.length) {
        setError("no_art")
        return
      }
      const { id, folder } = await animeCall<{ id: string; folder: string }>({
        intent: "create",
        title: p.title,
        projectId: p.id,
      })
      const rows = []
      for (const [i, panel] of panels.entries()) {
        const blob = await (await fetch(panel.src)).blob()
        const type =
          blob.type === "image/png" || blob.type === "image/webp"
            ? blob.type
            : "image/jpeg"
        const path = `${folder}/${String(i).padStart(3, "0")}.${type.split("/")[1]}`
        const { error: stored } = await supabase.storage
          .from(ANIME_BUCKET)
          .upload(path, blob, { contentType: type })
        if (stored) throw stored
        rows.push({ path, page: panel.page, hint: panel.hint })
      }
      await animeCall({ intent: "panels", id, panels: rows })
      await animeCall({ intent: "direct", id })
      navigate(`/studio/anime/${id}`)
    } catch (e) {
      setError(errorCode(e))
    } finally {
      setBusy(null)
    }
  }

  if (step.kind === "panels")
    return (
      <PanelStep
        comic={step.comic}
        initialTitle={step.title}
        rights={rights}
        onBack={() => {
          step.comic.close()
          setStep({ kind: "source" })
        }}
      />
    )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            void take([...e.dataTransfer.files])
          }}
          className={cn(
            "flex min-h-56 flex-col items-center justify-center gap-3 rounded-3xl bg-card p-6 text-center ring-1 ring-white/5 transition-[box-shadow] duration-150",
            over && "ring-2 ring-[var(--anime-accent)]"
          )}
        >
          {busy === "file" ? (
            <p className="flex items-center gap-2 text-sm">
              <Spinner /> {t("source.opening")}
            </p>
          ) : (
            <>
              <HugeiconsIcon
                icon={Upload01Icon}
                strokeWidth={1.5}
                className="size-8 text-muted-foreground"
              />
              <p className="text-sm font-medium">{t("source.drop")}</p>
              <Button
                variant="secondary"
                className="rounded-full"
                isDisabled={!connected}
                onPress={() => input.current?.click()}
              >
                {t("source.browse")}
              </Button>
              <input
                ref={input}
                type="file"
                multiple
                hidden
                accept={FILE_ACCEPT}
                onChange={(e) => {
                  void take([...(e.target.files ?? [])])
                  e.target.value = ""
                }}
              />
            </>
          )}
        </div>
        <LabeledCheckbox isSelected={rights} onChange={setRights}>
          {t("source.rights")}
        </LabeledCheckbox>
        {error === "no_art" ? (
          <p role="alert" className="text-sm text-pink-300">
            {t("source.noArt")}
          </p>
        ) : (
          <Failure code={error} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2 rounded-3xl bg-card p-4 ring-1 ring-white/5">
        <p className="text-sm font-medium">{t("source.orProject")}</p>
        {projects.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("source.noProjects")}
          </p>
        )}
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!connected || !!busy}
              onClick={() => void fromProject(p)}
              className="flex items-center gap-3 rounded-xl p-1.5 text-start text-sm outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[var(--anime-accent)] disabled:opacity-50"
            >
              {p.cover ? (
                <img
                  src={p.cover}
                  alt=""
                  className="size-10 rounded-lg object-cover"
                />
              ) : (
                <span className="size-10 rounded-lg bg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              {busy === p.id && <Spinner />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
