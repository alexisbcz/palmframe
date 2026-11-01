import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  DiceIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { ApiError, drawRequest, prepareImage } from "@/lib/novel/client"
import { RATIOS, type Novel } from "@/lib/novel/model"
import {
  FLAT_PLACES,
  FLAT_TIMES,
  PAPER_FACES,
  PAPER_HAIR,
  assetUrl,
  flatUrl,
  paperUrl,
  type FlatPlace,
  type FlatTime,
  type PaperFace,
  type PaperHair,
} from "@/lib/novel/paper"

import {
  Dial,
  FocusRing,
  Key,
  Knob,
  Plate,
  Readout,
  Swatches,
  tick,
} from "./hardware"
import { messages } from "./novel.messages"
import { useWork } from "./work"

export type ShotKind = "set" | "cg" | "actor" | "map" | "item"

export interface Shot {
  kind: ShotKind
  name: string
  // The brief: a place, a look, a moment.
  brief: string
  pose?: string
  refs?: string[]
  faceHint?: PaperFace
  onKeep: (url: string, brief: string) => void
}

const STOCKS = [
  { id: "house", color: "#3f6b5c", prompt: "" },
  {
    id: "gouache",
    color: "#d9542f",
    prompt:
      "soft gouache anime background painting, Ghibli-like warmth, clean line art",
  },
  {
    id: "cel",
    color: "#2f6fb3",
    prompt: "1990s anime cel, hand-inked lines, flat colour, film grain",
  },
  {
    id: "bishoujo",
    color: "#d9538a",
    prompt:
      "polished modern bishoujo visual novel art, glossy eyes, luminous soft shading",
  },
  {
    id: "ink",
    color: "#26241f",
    prompt: "black ink wash and brush, sumi-e, restrained grey tones",
  },
  {
    id: "oil",
    color: "#8a5a22",
    prompt: "classical oil painting, visible brushwork, chiaroscuro",
  },
  {
    id: "water",
    color: "#6fa8a0",
    prompt: "loose watercolour on textured paper, soft bleeding edges",
  },
  {
    id: "noir",
    color: "#4c4a55",
    prompt:
      "graphic noir comic art, heavy shadow, limited palette with one accent colour",
  },
  {
    id: "pixel",
    color: "#7a4fb0",
    prompt: "detailed 16-bit pixel art, limited palette, crisp pixels",
  },
] as const

type Stock = (typeof STOCKS)[number]["id"]

const MOODS = [
  "calm",
  "warm",
  "dramatic",
  "melancholy",
  "eerie",
  "romantic",
] as const
const LENSES = [18, 24, 35, 50, 85] as const
const TIMES = ["dawn", "day", "dusk", "night"] as const

const FRAMES: Record<ShotKind, readonly string[]> = {
  set: ["establishing", "interior", "low", "high"],
  cg: ["wide", "medium", "close", "over"],
  actor: ["full", "cowboy", "bust"],
  map: ["top"],
  item: ["still"],
}

const FRAME_TEXT: Record<string, string> = {
  establishing: "wide establishing shot",
  interior: "interior view at eye level",
  low: "low angle looking up",
  high: "high angle looking down",
  wide: "wide shot",
  medium: "medium shot",
  close: "intimate close-up",
  over: "over-the-shoulder shot",
  full: "full body from head to feet",
  cowboy: "three-quarter view from the knees up",
  bust: "waist-up portrait",
  top: "seen from directly above, like a hand-drawn map",
  still: "single object centred, still life",
}

export function buildPrompt(
  novel: Novel,
  shot: Shot,
  o: { stock: Stock; frame: string; time: string; mood: string; lens: number }
) {
  const style = STOCKS.find((s) => s.id === o.stock)?.prompt || novel.artStyle
  const camera = `${FRAME_TEXT[o.frame] ?? ""}, ${o.lens}mm lens`
  switch (shot.kind) {
    case "actor":
      return `${style}. A visual novel character sprite. ${shot.brief}. Expression and pose: ${shot.pose || "neutral"}. ${FRAME_TEXT[o.frame]}, standing and facing the viewer, the whole figure inside the frame. Plain, perfectly flat solid pure green background (#00FF00), no floor, no shadow, no other objects. No text.`
    case "map":
      return `${style}. An illustrated map of ${shot.brief}, seen from directly above, with coastlines, roads and landmarks. No text, no letters, no labels.`
    case "item":
      return `${style}. ${shot.brief}. A single object, centred, on a plain dark background. No text.`
    case "cg":
      return `${style}. A full-screen visual novel illustration: ${shot.brief}. ${camera}. ${o.time}, ${o.mood} mood. No text, no speech bubbles.`
    case "set":
      return `${style}. A visual novel background painting of ${shot.brief}. ${camera}. ${o.time}, ${o.mood} mood. An empty place, no people, no characters, no text.`
  }
}

function size(novel: Novel, kind: ShotKind) {
  if (kind === "actor") return { width: 832, height: 1216 }
  if (kind === "item") return { width: 768, height: 768 }
  const ratio = RATIOS[novel.ratio]
  return ratio >= 1
    ? { width: 1344, height: Math.round(1344 / ratio) }
    : { width: Math.round(1344 * ratio), height: 1344 }
}

interface Take {
  id: number
  url: string | null
  error?: string
}

export function Darkroom({
  shot,
  onClose,
}: {
  shot: Shot
  onClose: () => void
}) {
  const t = useT(messages)
  const { novel, art, storage, notify, setCredits } = useWork()
  const canPaper =
    shot.kind === "set" ||
    shot.kind === "cg" ||
    shot.kind === "actor" ||
    shot.kind === "map"
  const [tab, setTab] = React.useState<"camera" | "paper">(
    art?.route || !canPaper ? "camera" : "paper"
  )
  const [brief, setBrief] = React.useState(shot.brief)
  const [stock, setStock] = React.useState<Stock>("house")
  const [frame, setFrame] = React.useState(FRAMES[shot.kind][0]!)
  const [time, setTime] = React.useState<(typeof TIMES)[number]>("day")
  const [mood, setMood] = React.useState<(typeof MOODS)[number]>("calm")
  const [lens, setLens] = React.useState<number>(35)
  const [seed, setSeed] = React.useState(() =>
    Math.floor(Math.random() * 99_999)
  )
  const [takes, setTakes] = React.useState<Take[]>([])
  const [busy, setBusy] = React.useState(false)
  const [keeping, setKeeping] = React.useState(false)
  const nextTake = React.useRef(0)
  const abort = React.useRef<AbortController>(null)
  React.useEffect(() => () => abort.current?.abort(), [])

  const keep = async (dataUrl: string, cutOut = false) => {
    setKeeping(true)
    try {
      const finished = await prepareImage(dataUrl, { cutOut })
      shot.onKeep(await storage.image(finished), brief)
      onClose()
    } catch {
      notify(t("errors.imageFailed"))
      setKeeping(false)
    }
  }

  const fire = async () => {
    tick(2)
    setBusy(true)
    const id = nextTake.current++
    setTakes((l) => [{ id, url: null }, ...l])
    abort.current = new AbortController()
    try {
      const blob = await drawRequest(
        {
          prompt: buildPrompt(
            novel,
            { ...shot, brief },
            { stock, frame, time, mood, lens }
          ),
          ...size(novel, shot.kind),
          seed,
          refs: shot.refs ?? [],
        },
        abort.current.signal
      )
      setCredits(blob.credits)
      const url = URL.createObjectURL(blob.image)
      setTakes((l) => l.map((x) => (x.id === id ? { ...x, url } : x)))
      setSeed(Math.floor(Math.random() * 99_999))
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined
      const message =
        code === "insufficient_credits"
          ? t("errors.credits")
          : code === "needs_openrouter"
            ? t("errors.needsOpenRouter")
            : e instanceof Error
              ? e.message
              : t("errors.failed")
      setTakes((l) =>
        l.map((x) => (x.id === id ? { ...x, error: message } : x))
      )
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file: File) => {
    setKeeping(true)
    try {
      const data = await prepareImage(file, { cutOut: false })
      shot.onKeep(await storage.image(data), brief)
      onClose()
    } catch {
      notify(t("errors.imageFailed"))
      setKeeping(false)
    }
  }

  return (
    <div
      className="nv nv-darkroom"
      role="dialog"
      aria-modal
      aria-label={t("darkroom.title")}
    >
      <header className="nv-rail flex flex-wrap items-center gap-2 px-3 py-2">
        <h2 className="nv-title me-auto min-w-0 truncate text-xl text-[#ece4d4]">
          {t("darkroom.title")}{" "}
          <span className="text-[#ff7b5e]">· {shot.name}</span>
        </h2>
        <Key
          aria-current={tab === "camera" ? "page" : undefined}
          onClick={() => setTab("camera")}
        >
          {t("darkroom.camera")}
        </Key>
        {canPaper ? (
          <Key
            aria-current={tab === "paper" ? "page" : undefined}
            onClick={() => setTab("paper")}
          >
            {t("darkroom.paper")}
          </Key>
        ) : null}
        <label className="nv-key">
          <HugeiconsIcon
            icon={Upload04Icon}
            strokeWidth={2}
            className="size-4"
          />
          {t("darkroom.upload")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
            }}
          />
        </label>
        <Key size="icon" aria-label={t("close")} onClick={onClose}>
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </Key>
      </header>
      {tab === "paper" ? (
        <PaperBench
          shot={shot}
          busy={keeping}
          onKeep={(url) => {
            shot.onKeep(url, brief)
            onClose()
          }}
        />
      ) : (
        <div className="nv-scroll grid min-h-0 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
          <div className="flex min-h-0 flex-col gap-3">
            <div
              role="radiogroup"
              aria-label={t("darkroom.stock")}
              className="nv-tray nv-scroll flex flex-none gap-2 overflow-x-auto rounded-lg px-3 pt-4 pb-2"
            >
              {STOCKS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={stock === s.id}
                  className="nv-can"
                  style={{ "--can": s.color } as React.CSSProperties}
                  onClick={() => {
                    tick(1.1)
                    setStock(s.id)
                  }}
                >
                  <i className="nv-can-cap" style={{ top: 0 }} />
                  <span className="nv-can-body">
                    <span className="nv-can-name">
                      {t(`darkroom.stocks.${s.id}`)}
                    </span>
                  </span>
                  <i className="nv-can-cap" style={{ bottom: 0 }} />
                </button>
              ))}
            </div>
            <div className="nv-scroll min-h-[220px] flex-1 overflow-y-auto rounded-lg bg-black/40 p-3">
              <span className="nv-engraved">{t("darkroom.contactSheet")}</span>
              {takes.length ? (
                <div className="mt-2 grid grid-cols-2 gap-3 xl:grid-cols-3">
                  {takes.map((k) => (
                    <div key={k.id} className="nv-print !pb-2">
                      <div
                        className={`${shot.kind === "actor" ? "aspect-[2/3]" : "aspect-video"} nv-checker relative grid place-items-center overflow-hidden`}
                      >
                        {k.url ? (
                          <img
                            src={k.url}
                            alt=""
                            className="nv-develop size-full object-contain"
                          />
                        ) : k.error ? (
                          <p className="bg-black/80 p-2 text-xs text-[#ffb5ad]">
                            {k.error}
                          </p>
                        ) : (
                          <span className="nv-engraved text-[#2a2118]!">
                            {t("darkroom.developing")}
                          </span>
                        )}
                      </div>
                      {k.url ? (
                        <Key
                          className="mt-2 w-full"
                          disabled={keeping}
                          onClick={() =>
                            void keep(k.url!, shot.kind === "actor")
                          }
                        >
                          {shot.kind === "actor"
                            ? t("darkroom.keepCut")
                            : t("darkroom.keep")}
                        </Key>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-[#b5a994]">
                  {t("darkroom.empty")}
                </p>
              )}
            </div>
          </div>
          <Plate
            title={t("darkroom.rig")}
            bodyClassName="nv-scroll overflow-y-auto p-3 grid gap-3 content-start"
          >
            <div className="nv-paper rounded-[2px] p-2.5">
              <label className="grid gap-1">
                <span className="text-xs font-bold uppercase">
                  {t("darkroom.brief")}
                </span>
                <textarea
                  className="min-h-20 w-full resize-y bg-transparent text-[15px] leading-[22px] outline-none"
                  value={brief}
                  placeholder={t("darkroom.briefPlaceholder")}
                  onChange={(e) => setBrief(e.target.value)}
                />
              </label>
            </div>
            {FRAMES[shot.kind].length > 1 ? (
              <div className="grid gap-1">
                <span className="nv-engraved">{t("darkroom.framing")}</span>
                <FocusRing
                  label={t("darkroom.framing")}
                  value={frame}
                  mark={120}
                  options={FRAMES[shot.kind].map((f) => ({
                    value: f,
                    label: t(`darkroom.frames.${f as "wide"}`),
                  }))}
                  onChange={setFrame}
                />
              </div>
            ) : null}
            {shot.kind === "set" || shot.kind === "cg" ? (
              <>
                <div className="grid gap-1">
                  <span className="nv-engraved">{t("darkroom.lens")}</span>
                  <FocusRing
                    label={t("darkroom.lens")}
                    value={lens}
                    mark={80}
                    options={LENSES.map((l) => ({ value: l, label: `${l}mm` }))}
                    onChange={setLens}
                  />
                </div>
                <div className="flex items-center justify-around gap-2">
                  <Dial
                    label={t("darkroom.time")}
                    value={time}
                    size={140}
                    options={TIMES.map((v) => ({
                      value: v,
                      label: t(`darkroom.times.${v}`),
                    }))}
                    onChange={setTime}
                  />
                  <Dial
                    label={t("darkroom.mood")}
                    value={mood}
                    size={140}
                    options={MOODS.map((v) => ({
                      value: v,
                      label: t(`darkroom.moods.${v}`),
                    }))}
                    onChange={setMood}
                  />
                </div>
              </>
            ) : null}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="grid gap-1">
                <span className="nv-engraved">{t("darkroom.seed")}</span>
                <div className="flex items-center gap-2">
                  <Readout>{String(seed).padStart(5, "0")}</Readout>
                  <Key
                    size="icon"
                    aria-label={t("darkroom.reroll")}
                    onClick={() => setSeed(Math.floor(Math.random() * 99_999))}
                  >
                    <HugeiconsIcon
                      icon={DiceIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </Key>
                </div>
                <span className="text-xs text-[#b5a994]">
                  {art === null
                    ? ""
                    : art.route === null
                      ? t("darkroom.noRoute")
                      : art.route === "openrouter"
                        ? t("darkroom.openrouter")
                        : t("credits", { count: art.cost })}
                </span>
              </div>
              <button
                type="button"
                className="nv-shutter"
                aria-label={t("darkroom.shutter")}
                data-busy={busy}
                disabled={busy || !brief.trim() || art?.route === null}
                onClick={() => void fire()}
              />
            </div>
          </Plate>
        </div>
      )}
    </div>
  )
}

const HAIRS = [
  "#1f1a1a",
  "#4a2c1c",
  "#8a5a2c",
  "#c9963f",
  "#e0cfa4",
  "#8a2f2a",
  "#3a3f6c",
  "#c7c1b5",
]
const SKINS = ["#f6dfca", "#f2d3b5", "#d9ab82", "#a9744f", "#7a5236"]
const COATS = [
  "#37506b",
  "#7a3b3b",
  "#3f6b55",
  "#6b4f7a",
  "#8a6a33",
  "#2f3a3f",
  "#d8cfc0",
  "#b05a3a",
]

function PaperBench({
  shot,
  busy,
  onKeep,
}: {
  shot: Shot
  busy: boolean
  onKeep: (url: string) => void
}) {
  const t = useT(messages)
  const [place, setPlace] = React.useState<FlatPlace>(
    shot.kind === "map" ? "chart" : "harbor"
  )
  const [time, setTime] = React.useState<FlatTime>("dusk")
  const [seed, setSeed] = React.useState(5)
  const [hair, setHair] = React.useState<PaperHair>("bob")
  const [hairColor, setHairColor] = React.useState(HAIRS[0]!)
  const [skin, setSkin] = React.useState(SKINS[1]!)
  const [coat, setCoat] = React.useState(COATS[0]!)
  const [face, setFace] = React.useState<PaperFace>(shot.faceHint ?? "neutral")
  const actor = shot.kind === "actor"
  const url = actor
    ? paperUrl({ hair, hairColor, skin, coat, face })
    : flatUrl(place, time, seed)
  return (
    <div className="nv-scroll grid min-h-0 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="nv-monitor grid min-h-[260px] place-items-center">
        <img
          src={assetUrl(url)}
          alt=""
          className={
            actor
              ? "nv-checker max-h-[64vh] rounded"
              : "max-h-[64vh] w-full rounded object-contain"
          }
        />
      </div>
      <Plate
        title={t("darkroom.paperBench")}
        bodyClassName="grid gap-3 content-start p-3"
      >
        {actor ? (
          <>
            <div className="grid gap-1">
              <span className="nv-engraved">{t("darkroom.hair")}</span>
              <FocusRing
                label={t("darkroom.hair")}
                value={hair}
                options={PAPER_HAIR.map((v) => ({
                  value: v,
                  label: t(`darkroom.hairs.${v}`),
                }))}
                onChange={setHair}
              />
            </div>
            <div className="flex justify-center">
              <Dial
                label={t("darkroom.expression")}
                value={face}
                options={PAPER_FACES.map((v) => ({
                  value: v,
                  label: t(`darkroom.faces.${v}`),
                }))}
                onChange={setFace}
              />
            </div>
            <div className="grid gap-1">
              <span className="nv-engraved">{t("darkroom.hairColor")}</span>
              <Swatches
                label={t("darkroom.hairColor")}
                value={hairColor}
                options={HAIRS}
                onChange={setHairColor}
              />
            </div>
            <div className="grid gap-1">
              <span className="nv-engraved">{t("darkroom.skin")}</span>
              <Swatches
                label={t("darkroom.skin")}
                value={skin}
                options={SKINS}
                onChange={setSkin}
              />
            </div>
            <div className="grid gap-1">
              <span className="nv-engraved">{t("darkroom.coat")}</span>
              <Swatches
                label={t("darkroom.coat")}
                value={coat}
                options={COATS}
                onChange={setCoat}
              />
            </div>
          </>
        ) : (
          <>
            {shot.kind !== "map" ? (
              <>
                <div className="grid gap-1">
                  <span className="nv-engraved">{t("darkroom.place")}</span>
                  <FocusRing
                    label={t("darkroom.place")}
                    value={place}
                    mark={110}
                    options={FLAT_PLACES.filter((p) => p !== "chart").map(
                      (v) => ({
                        value: v,
                        label: t(`darkroom.places.${v as "harbor"}`),
                      })
                    )}
                    onChange={setPlace}
                  />
                </div>
                <div className="flex justify-center">
                  <Dial
                    label={t("darkroom.time")}
                    value={time}
                    options={FLAT_TIMES.map((v) => ({
                      value: v,
                      label: t(`darkroom.times.${v}`),
                    }))}
                    onChange={setTime}
                  />
                </div>
              </>
            ) : null}
            <div className="flex justify-center">
              <Knob
                label={t("darkroom.variation")}
                value={seed}
                min={1}
                max={60}
                step={1}
                format={String}
                onChange={setSeed}
              />
            </div>
          </>
        )}
        <Key tone="fire" disabled={busy} onClick={() => onKeep(url)}>
          {t("darkroom.keep")}
        </Key>
        <p className="text-xs text-[#b5a994]">{t("darkroom.paperHelp")}</p>
      </Plate>
    </div>
  )
}
