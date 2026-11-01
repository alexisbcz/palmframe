import * as React from "react"
import { data, useNavigate, useRevalidator } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CropIcon,
  CpuIcon,
  Download04Icon,
  Link01Icon,
  PaintBrush01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons"

import {
  allowed,
  civitaiMeta,
  installed,
  renders,
  type Render,
} from "@/lib/lab/comfy.server"
import {
  LAB_DEFAULTS,
  MAX_LORAS,
  civitaiTarget,
  fromCivitai,
  labQuery,
  toRequest,
  type LabLora,
  type LabRequest,
} from "@/lib/lab/model"
import { PRIVATE } from "@/lib/seo"

import type { Route } from "./+types/lab"
import "./lab.css"

// A developer tool for this machine only, so its copy isn't translated.
export const meta: Route.MetaFunction = () => [
  { title: "Lab · Palmframe" },
  PRIVATE,
]

export async function loader({ request }: Route.LoaderArgs) {
  if (!allowed(request)) throw data("Not found", { status: 404 })
  const url = new URL(request.url)
  const [comfy, past] = await Promise.all([installed(), renders()])
  const params: Record<string, unknown> = Object.fromEntries(url.searchParams)
  if (url.searchParams.has("lora"))
    params.lora = url.searchParams.getAll("lora")
  const link = url.searchParams.get("civitai")
  let base = LAB_DEFAULTS
  let notice: string | null = null
  let missing: string[] = []
  if (link) {
    const target = civitaiTarget(link)
    const found = target ? await civitaiMeta(target).catch(() => null) : null
    if (found) {
      const read = fromCivitai(found, comfy.loras)
      base = toRequest(read.values)
      missing = read.missing
      notice =
        "Filled in from Civitai. Steps, CFG and sampler stay on the local Turbo settings."
    } else
      notice = target
        ? "Civitai doesn't share this image's settings. Paste the model page's link instead."
        : "That isn't a Civitai image or model version link."
  }
  return {
    comfy,
    past,
    missing,
    notice,
    initial: toRequest(params, base),
  }
}

const FORMATS = [
  { id: "3:4", width: 768, height: 1024 },
  { id: "2:3", width: 832, height: 1216 },
  { id: "9:16", width: 720, height: 1280 },
  { id: "1:1", width: 1024, height: 1024 },
  { id: "4:3", width: 1024, height: 768 },
  { id: "16:9", width: 1280, height: 720 },
]

const SAMPLERS = [
  "er_sde",
  "euler",
  "euler_ancestral",
  "dpmpp_2m",
  "res_multistep",
]

type Tab = "style" | "model" | "format" | "render" | "import"
const TABS: {
  id: Tab
  label: string
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"]
  title: string
  hint: string
}[] = [
  {
    id: "style",
    label: "Style",
    icon: PaintBrush01Icon,
    title: "Build a style",
    hint: "Stack LoRAs over the model, each with its own strength",
  },
  {
    id: "model",
    label: "Model",
    icon: CpuIcon,
    title: "Select model",
    hint: "What draws the picture on this Mac",
  },
  {
    id: "format",
    label: "Format",
    icon: CropIcon,
    title: "Select format",
    hint: "The shape of the frame",
  },
  {
    id: "render",
    label: "Render",
    icon: SlidersHorizontalIcon,
    title: "Render settings",
    hint: "Sampling, seed and what to avoid",
  },
  {
    id: "import",
    label: "Import",
    icon: Link01Icon,
    title: "Import from Civitai",
    hint: "Prompt, seed, size and any LoRA you have",
  },
]

const pretty = (file: string) =>
  file
    .replace(/\.safetensors$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bv?\d+(\.\d+)*$/i, "")
    .trim()

const fileUrl = (file: string) => `/api/lab?file=${encodeURIComponent(file)}`
const randomSeed = () => Math.floor(Math.random() * 2 ** 48)

// A colour of its own for anything with no render to show yet.
function swatch(name: string) {
  let h = 7
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return `linear-gradient(145deg, oklch(0.5 0.13 ${h}), oklch(0.26 0.09 ${(h + 50) % 360}))`
}

interface Slide {
  id: string
  label: string
  image?: string
  frame?: { width: number; height: number }
}

function SlideFace({ slide }: { slide: Slide }) {
  if (slide.frame) {
    const { width, height } = slide.frame
    return (
      <div className="lab-frame">
        <i
          style={{
            aspectRatio: `${width} / ${height}`,
            [width >= height ? "width" : "height"]:
              width >= height ? "62%" : "72%",
          }}
        />
      </div>
    )
  }
  if (slide.image)
    return <img src={slide.image} alt="" draggable={false} loading="lazy" />
  return (
    <div className="lab-swatch" style={{ background: swatch(slide.id) }}>
      {slide.label}
    </div>
  )
}

// The dome: the pick in a heavy frame, its neighbours turned away at the edges.
function Dome({
  slides,
  value,
  onChange,
  label,
  children,
}: {
  slides: Slide[]
  value: string
  onChange: (id: string) => void
  label: string
  children?: React.ReactNode
}) {
  const index = Math.max(
    0,
    slides.findIndex((s) => s.id === value)
  )
  const go = (by: number) => {
    const next = slides[(index + by + slides.length) % slides.length]
    if (next) onChange(next.id)
  }
  return (
    <div
      className="lab-dome"
      role="group"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1)
        else if (e.key === "ArrowLeft") go(-1)
        else return
        e.preventDefault()
      }}
    >
      <svg
        className="lab-arc"
        viewBox="0 0 660 440"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="lab-dome" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#3b3b40" />
            <stop offset="1" stopColor="#2c2c30" />
          </linearGradient>
        </defs>
        <path d="M-40 120 Q330 -50 700 120 V460 H-40Z" fill="url(#lab-dome)" />
        <path
          d="M-40 120 Q330 -50 700 120"
          fill="none"
          stroke="#fff"
          strokeOpacity=".09"
        />
      </svg>
      {slides.map((slide, i) => {
        let at = i - index
        const n = slides.length
        if (n > 2 && at > n / 2) at -= n
        if (n > 2 && at < -n / 2) at += n
        const near = Math.abs(at) <= 2
        const style = {
          "--x": `${at * 300}px`,
          "--y": at ? "96px" : "0px",
          "--r": `${at ? at * 45 : 0}deg`,
          "--s": at ? 0.86 : 1,
          "--o": near ? 1 : 0,
          "--z": 5 - Math.abs(at),
        } as React.CSSProperties
        return (
          <button
            key={slide.id}
            type="button"
            className="lab-slide"
            data-side={at !== 0}
            style={style}
            tabIndex={-1}
            aria-hidden={at !== 0}
            onClick={() => onChange(slide.id)}
          >
            <span
              style={{
                rotate: at ? `${-at * 45}deg` : undefined,
                scale: at ? 1.5 : 1,
              }}
            >
              <SlideFace slide={slide} />
            </span>
          </button>
        )
      })}
      {children}
      <div className="lab-nav">
        <button
          type="button"
          className="lab-pill"
          data-round
          aria-label="Previous"
          onClick={() => go(-1)}
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="size-4 rtl:rotate-180"
          />
        </button>
        <b aria-live="polite">{slides[index]?.label}</b>
        <button
          type="button"
          className="lab-pill"
          data-round
          aria-label="Next"
          onClick={() => go(1)}
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-4 rtl:rotate-180"
          />
        </button>
      </div>
    </div>
  )
}

function Setup({
  open,
  tab,
  setTab,
  onClose,
  r,
  set,
  comfy,
  past,
}: {
  open: boolean
  tab: Tab
  setTab: (t: Tab) => void
  onClose: () => void
  r: LabRequest
  set: (patch: Partial<LabRequest>) => void
  comfy: { models: string[]; loras: string[] }
  past: Render[]
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const navigate = useNavigate()
  const [link, setLink] = React.useState("")
  React.useEffect(() => {
    const el = ref.current
    if (open && !el?.open) el?.showModal()
    if (!open && el?.open) el.close()
  }, [open])

  const styles: Slide[] = comfy.loras.map((l) => ({
    id: l,
    label: pretty(l),
    image: lastWith(past, (s) => usesLora(s, l)),
  }))
  const [browsing, setBrowsing] = React.useState(
    r.loras[0]?.name ?? comfy.loras[0] ?? ""
  )
  const inStack = r.loras.some((l) => l.name === browsing)
  const stack = (loras: LabLora[]) => set({ loras })
  const models: Slide[] = comfy.models.map((m) => ({
    id: m,
    label: pretty(m),
    image: lastWith(past, (s) => s.model === m),
  }))
  const size = `${r.width}x${r.height}`
  const formats: Slide[] = FORMATS.map((f) => ({
    id: `${f.width}x${f.height}`,
    label: `${f.id} · ${f.width}×${f.height}`,
    frame: f,
  }))
  const changed: Record<Tab, boolean> = {
    style: r.loras.length > 0,
    model: r.model !== LAB_DEFAULTS.model,
    format: r.width !== LAB_DEFAULTS.width || r.height !== LAB_DEFAULTS.height,
    render:
      r.steps !== LAB_DEFAULTS.steps ||
      r.cfg !== LAB_DEFAULTS.cfg ||
      r.sampler !== LAB_DEFAULTS.sampler,
    import: false,
  }
  const pane = TABS.find((t) => t.id === tab)!

  return (
    <dialog
      ref={ref}
      className="lab-setup"
      aria-label="Render setup"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <header>
        <h2>Render setup</h2>
        <div>
          <button
            type="button"
            className="lab-pill"
            onClick={() =>
              set({ ...LAB_DEFAULTS, prompt: r.prompt, seed: r.seed })
            }
          >
            Reset all
          </button>
          <button
            type="button"
            className="lab-pill"
            data-round
            aria-label="Close"
            onClick={onClose}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </button>
        </div>
      </header>
      <div className="lab-setup-body">
        <div className="lab-rail" role="tablist" aria-orientation="vertical">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <HugeiconsIcon icon={t.icon} strokeWidth={1.6} />
              {t.label}
              {changed[t.id] ? <i aria-label="Changed" /> : null}
            </button>
          ))}
        </div>
        <div className="lab-pane" role="tabpanel" aria-label={pane.label}>
          <hgroup>
            <h3>{pane.title}</h3>
            <p>{pane.hint}</p>
          </hgroup>
          {tab === "style" ? (
            <>
              {r.loras.length ? (
                <ol className="lab-stack" aria-label="LoRA stack">
                  {r.loras.map((l) => {
                    const image = lastWith(past, (s) => usesLora(s, l.name))
                    return (
                      <li key={l.name}>
                        <button
                          type="button"
                          className="lab-stack-thumb"
                          aria-label={`Show ${pretty(l.name)}`}
                          style={{ background: swatch(l.name) }}
                          onClick={() => setBrowsing(l.name)}
                        >
                          {image ? <img src={image} alt="" /> : null}
                        </button>
                        <label>
                          <span>{pretty(l.name)}</span>
                          <input
                            type="range"
                            className="lab-range"
                            aria-label={`${pretty(l.name)} strength`}
                            min={0}
                            max={1.5}
                            step={0.05}
                            value={l.strength}
                            onChange={(e) =>
                              stack(
                                r.loras.map((x) =>
                                  x.name === l.name
                                    ? { ...x, strength: Number(e.target.value) }
                                    : x
                                )
                              )
                            }
                          />
                        </label>
                        <b>{l.strength.toFixed(2)}</b>
                        <button
                          type="button"
                          className="lab-pill"
                          data-round
                          aria-label={`Remove ${pretty(l.name)}`}
                          onClick={() =>
                            stack(r.loras.filter((x) => x.name !== l.name))
                          }
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            strokeWidth={2}
                            className="size-3.5"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ol>
              ) : null}
              <Dome
                label="Style"
                slides={styles}
                value={browsing}
                onChange={setBrowsing}
              >
                {browsing ? (
                  <div className="lab-dial">
                    <button
                      type="button"
                      className="lab-pill"
                      data-on={inStack}
                      disabled={!inStack && r.loras.length >= MAX_LORAS}
                      onClick={() =>
                        stack(
                          inStack
                            ? r.loras.filter((x) => x.name !== browsing)
                            : [...r.loras, { name: browsing, strength: 1 }]
                        )
                      }
                    >
                      {inStack
                        ? "In the stack"
                        : r.loras.length >= MAX_LORAS
                          ? `Stack is full (${MAX_LORAS})`
                          : "Add to stack"}
                    </button>
                  </div>
                ) : null}
              </Dome>
            </>
          ) : null}
          {tab === "model" ? (
            <Dome
              label="Model"
              slides={models}
              value={r.model}
              onChange={(model) => set({ model })}
            />
          ) : null}
          {tab === "format" ? (
            <Dome
              label="Format"
              slides={
                formats.some((f) => f.id === size)
                  ? formats
                  : [
                      {
                        id: size,
                        label: `Custom · ${r.width}×${r.height}`,
                        frame: r,
                      },
                      ...formats,
                    ]
              }
              value={size}
              onChange={(id) => {
                const [width, height] = id.split("x").map(Number)
                set({ width, height })
              }}
            />
          ) : null}
          {tab === "render" ? (
            <div className="lab-form">
              <div className="grid grid-cols-2 gap-4">
                <label className="lab-field">
                  <span>
                    Steps<b>{r.steps}</b>
                  </span>
                  <input
                    type="range"
                    className="lab-range"
                    min={4}
                    max={40}
                    value={r.steps}
                    onChange={(e) => set({ steps: Number(e.target.value) })}
                  />
                </label>
                <label className="lab-field">
                  <span>
                    CFG<b>{r.cfg}</b>
                  </span>
                  <input
                    type="range"
                    className="lab-range"
                    min={1}
                    max={8}
                    step={0.5}
                    value={r.cfg}
                    onChange={(e) => set({ cfg: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="lab-field">
                  <span>Sampler</span>
                  <select
                    className="lab-input cursor-pointer"
                    value={r.sampler}
                    onChange={(e) => set({ sampler: e.target.value })}
                  >
                    {[...new Set([r.sampler, ...SAMPLERS])].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="lab-field">
                  <span>Seed (0 picks one)</span>
                  <input
                    type="number"
                    className="lab-input"
                    value={r.seed}
                    onChange={(e) => set({ seed: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="lab-field">
                <span>Negative prompt</span>
                <textarea
                  className="lab-input"
                  value={r.negative}
                  onChange={(e) => set({ negative: e.target.value })}
                />
              </label>
            </div>
          ) : null}
          {tab === "import" ? (
            <form
              className="lab-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!link.trim()) return
                onClose()
                navigate(`/lab?civitai=${encodeURIComponent(link.trim())}`)
              }}
            >
              <label className="lab-field">
                <span>Civitai image or model page</span>
                <div className="flex gap-2">
                  <input
                    className="lab-input"
                    placeholder="https://civitai.com/models/…"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="lab-pill !h-10 flex-none"
                    disabled={!link.trim()}
                  >
                    Fill in
                  </button>
                </div>
              </label>
            </form>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}

const usesLora = (s: LabRequest, name: string) =>
  s.loras.some((l) => l.name === name)

function lastWith(past: Render[], test: (s: LabRequest) => boolean) {
  const found = past.find((p) => test(p.settings))
  return found ? fileUrl(found.file) : undefined
}

export default function Lab({ loaderData }: Route.ComponentProps) {
  const { comfy, past, missing, notice, initial } = loaderData
  const revalidator = useRevalidator()
  const [r, setR] = React.useState<LabRequest>(initial)
  const [busy, setBusy] = React.useState(false)
  const [started, setStarted] = React.useState(0)
  const [elapsed, setElapsed] = React.useState(0)
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState(notice)
  const [setup, setSetup] = React.useState<Tab | null>(null)
  const [tab, setTab] = React.useState<Tab>("style")
  const [current, setCurrent] = React.useState(0)
  const abort = React.useRef<AbortController>(null)
  const set = (patch: Partial<LabRequest>) => setR((v) => ({ ...v, ...patch }))
  React.useEffect(() => setR(initial), [initial])
  React.useEffect(() => setMessage(notice), [notice])

  // Starting ComfyUI reloads from here, so a Civitai link is read again once
  // the installed LoRAs can be matched against it.
  const arrival = React.useRef<string | null>(null)

  // The address bar always holds the link to what's on screen.
  React.useEffect(() => {
    arrival.current ??= window.location.href
    const query = labQuery(r)
    window.history.replaceState(null, "", query ? `/lab?${query}` : "/lab")
  }, [r])

  React.useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setElapsed(Date.now() - started), 100)
    return () => clearInterval(timer)
  }, [busy, started])

  const open = (t: Tab) => {
    setTab(t)
    setSetup(t)
  }

  const start = async () => {
    setStarting(true)
    setError(null)
    await fetch("/api/lab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "start" }),
    })
    // ComfyUI takes a few seconds to bind its port.
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      const status = await fetch("/api/lab").then((res) => res.json())
      if (status.running) break
    }
    window.location.href = arrival.current ?? "/lab"
  }

  const generate = async () => {
    const seed = r.seed || randomSeed()
    set({ seed })
    setBusy(true)
    setStarted(Date.now())
    setElapsed(0)
    setError(null)
    setMessage(null)
    setCurrent(0)
    abort.current = new AbortController()
    try {
      const res = await fetch("/api/lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...r, seed }),
        signal: abort.current.signal,
      })
      if (!res.ok)
        throw new Error(
          ((await res.json().catch(() => null)) as { error?: string } | null)
            ?.error ?? `Failed (${res.status})`
        )
      await revalidator.revalidate()
    } catch (e) {
      if (!abort.current?.signal.aborted)
        setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const canGo = comfy.running && !!r.prompt.trim()
  const shown = past[current]
  const ratio = (s: LabRequest) => `${s.width} / ${s.height}`
  const modelImage = lastWith(past, (s) => s.model === r.model)
  const first = r.loras[0]?.name
  const styleImage = first
    ? lastWith(past, (s) => usesLora(s, first))
    : undefined

  return (
    <div className="lab">
      <div className="lab-brand">
        <i aria-hidden />
        Lab <span>on this Mac</span>
      </div>
      {error || message || missing.length ? (
        <div className="lab-toast" role="status" data-bad={!!error}>
          {error ?? message}
          {!error && missing.length
            ? ` Not installed here: ${missing.join(", ")}.`
            : ""}
        </div>
      ) : null}

      <main className="lab-stage">
        {busy ? (
          <div
            className="lab-card"
            style={{ "--ar": ratio(r), "--z": 20 } as React.CSSProperties}
          >
            <div className="lab-develop" role="status">
              <span>{(elapsed / 1000).toFixed(1)}s</span>
            </div>
          </div>
        ) : null}
        {past.slice(0, 9).map((p, i) => {
          // A ring, so the fan opens on both sides from the newest render.
          const count = Math.min(past.length, 9)
          let at = i - current
          if (count > 2 && at > count / 2) at -= count
          if (count > 2 && at < -count / 2) at += count
          if (busy && at >= 0) at += 1
          const hidden = Math.abs(at) > 2
          const style = {
            "--ar": ratio(p.settings),
            "--x": `calc(${at} * min(22vw, 330px))`,
            "--s": at ? 1 - Math.abs(at) * 0.17 : 1,
            "--o": hidden ? 0 : 1,
            "--b": at ? 0.42 : 1,
            "--z": 10 - Math.abs(at),
          } as React.CSSProperties
          return (
            <figure
              key={p.file}
              className="lab-card"
              style={style}
              aria-hidden={hidden}
            >
              <img
                src={fileUrl(p.file)}
                alt={at === 0 ? p.settings.prompt : ""}
                draggable={false}
              />
              {at === 0 ? (
                <figcaption className="lab-caption">
                  <p>{p.settings.prompt}</p>
                  <div>
                    <button
                      type="button"
                      className="lab-pill"
                      onClick={() => setR(p.settings)}
                    >
                      Reuse
                    </button>
                    <a
                      className="lab-pill"
                      data-round
                      href={fileUrl(p.file)}
                      download={p.file}
                      aria-label="Download"
                    >
                      <HugeiconsIcon
                        icon={Download04Icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    </a>
                  </div>
                </figcaption>
              ) : (
                !hidden && (
                  <button
                    type="button"
                    className="lab-pick"
                    aria-label={`Show render ${i + 1}`}
                    onClick={() => setCurrent(i)}
                  />
                )
              )}
            </figure>
          )
        })}
        {!shown && !busy ? (
          <div className="lab-empty">
            <h1>What are we shooting?</h1>
            <p>Write a scene below. It renders on this Mac, for free.</p>
          </div>
        ) : null}
      </main>

      <section className="lab-dock" aria-label="Generate">
        <div className="lab-prompt">
          <textarea
            aria-label="Prompt"
            placeholder="Describe the shot"
            value={r.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey) &&
                canGo &&
                !busy
              ) {
                e.preventDefault()
                void generate()
              }
            }}
          />
          <div className="lab-chips">
            <button
              type="button"
              className="lab-pill"
              onClick={() => open("render")}
            >
              {r.steps} steps
            </button>
            <button
              type="button"
              className="lab-pill"
              onClick={() => set({ seed: randomSeed() })}
            >
              Seed {r.seed ? String(r.seed).slice(-6) : "auto"}
            </button>
            <button
              type="button"
              className="lab-pill"
              onClick={() => open("import")}
            >
              <HugeiconsIcon
                icon={Link01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              Civitai
            </button>
          </div>
        </div>
        <div className="lab-tiles">
          <button
            type="button"
            className="lab-tile"
            onClick={() => open("style")}
          >
            {styleImage ? <img src={styleImage} alt="" /> : null}
            <small>Style</small>
            <b>
              {first
                ? `${r.loras.length > 1 ? `+${r.loras.length - 1} ` : ""}${pretty(first)}`
                : "None"}
            </b>
          </button>
          <button
            type="button"
            className="lab-tile"
            onClick={() => open("format")}
          >
            <small>Format</small>
            <b>
              {FORMATS.find((f) => f.width === r.width && f.height === r.height)
                ?.id ?? `${r.width}×${r.height}`}
            </b>
          </button>
          <button
            type="button"
            className="lab-tile"
            onClick={() => open("model")}
          >
            <small>Model</small>
            <b>{pretty(r.model)}</b>
          </button>
        </div>
        {!comfy.running ? (
          <button
            type="button"
            className="lab-go"
            disabled={starting}
            onClick={() => void start()}
          >
            <b>{starting ? "STARTING" : "START"}</b>
            <small>ComfyUI</small>
          </button>
        ) : busy ? (
          <button
            type="button"
            className="lab-go"
            data-busy
            onClick={() => abort.current?.abort()}
          >
            <b>CANCEL</b>
            <small>{(elapsed / 1000).toFixed(0)}s</small>
          </button>
        ) : (
          <button
            type="button"
            className="lab-go"
            disabled={!canGo}
            onClick={() => void generate()}
          >
            <b>GENERATE</b>
            <small>Free</small>
          </button>
        )}
      </section>

      <Setup
        open={setup !== null}
        tab={tab}
        setTab={setTab}
        onClose={() => setSetup(null)}
        r={r}
        set={set}
        comfy={comfy}
        past={past}
      />
    </div>
  )
}
