import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Download01Icon,
  Image02Icon,
  Jpg01Icon,
  Layers01Icon,
  Pdf01Icon,
  Png01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Kbd } from "@workspace/ui/components/kbd"
import { Spinner } from "@workspace/ui/components/spinner"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { useLocale, useT } from "@/i18n/core"

import { download, pdf, withDpi, zip } from "./actions"
import { SliderInput } from "./controls"
import { messages } from "./export.messages"
import { pageDoc } from "./model"
import { renderPsd } from "./psd"
import { renderToBlob, type ImageCache } from "./render"
import { roving } from "./roving"
import type { ComicEditor } from "./use-editor"

type Scope = "all" | "current"
type Format = "jpeg" | "png" | "webp" | "pdf" | "psd"
type Size = "1" | "2" | "3" | "300" | "600"
interface Settings {
  scope: Scope
  format: Format
  scale: 1 | 2 | 3
  // Print resolution; 0 means screen size, picked by `scale`.
  dpi: 0 | 300 | 600
  quality: number
  name: string
}

const DEFAULTS: Settings = {
  scope: "all",
  format: "jpeg",
  scale: 1,
  dpi: 0,
  quality: 90,
  name: "palmframe-carousel",
}
const STORAGE_KEY = "palmframe:export"
const FORMATS = ["jpeg", "png", "webp", "pdf", "psd"] as const
const FORMAT_ICON = {
  jpeg: Jpg01Icon,
  png: Png01Icon,
  webp: Image02Icon,
  pdf: Pdf01Icon,
  psd: Layers01Icon,
}
const MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const
// Slides are laid out at CSS 96 dpi, like the PDF: 1080 px is 11.25 in.
const CSS_DPI = 96

function readSettings(): Settings {
  try {
    return {
      ...DEFAULTS,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"),
    }
  } catch {
    return DEFAULTS
  }
}

// "My comic!" → "my-comic". Keeps accents, drops what file systems dislike.
function slug(name: string) {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase() || DEFAULTS.name
  )
}

function formatBytes(n: number, locale: string) {
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000
    i++
  }
  return `${n.toLocaleString(locale, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`
}

type Status =
  | { step: "idle" }
  | { step: "rendering"; done: number; total: number }
  | { step: "packing" }
  | { step: "done"; file: string; size: number }
  | { step: "error"; message: string }

// One button, one panel: what to export, in which format and size, and a
// primary action that says exactly what you'll get. ⌘E opens it.
export function ExportButton({
  editor,
  images,
}: {
  editor: ComicEditor
  images: ImageCache
}) {
  const t = useT(messages)
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === "Escape" && open) {
        setOpen(false)
      }
    }
    const onDown = (e: PointerEvent) => {
      if (open && !rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onDown, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="outline"
        className="max-sm:px-2"
        aria-expanded={open}
        aria-haspopup="dialog"
        onPress={() => setOpen((o) => !o)}
      >
        <HugeiconsIcon
          icon={Download01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        <span className="max-sm:sr-only">{t("button")}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className={cn(
            "transition-transform max-sm:hidden",
            open && "rotate-180"
          )}
        />
      </Button>
      {open && <ExportPanel editor={editor} images={images} />}
    </div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: React.ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-roving-group
      onKeyDown={roving({ axis: "x", select: true })}
      className="flex rounded-lg bg-muted p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          data-roving
          onClick={() => onChange(o.id)}
          className={cn(
            "h-7 flex-1 cursor-pointer rounded-md px-2 text-sm font-medium text-muted-foreground transition outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            value === o.id &&
              "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Label({
  children,
  aside,
}: {
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-muted-foreground">{children}</span>
      {aside && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {aside}
        </span>
      )}
    </div>
  )
}

function ExportPanel({
  editor,
  images,
}: {
  editor: ComicEditor
  images: ImageCache
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const project = editor.projectRef.current
  const [settings, setSettings] = React.useState(readSettings)
  const set = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set())
  const [thumbs, setThumbs] = React.useState<string[]>([])
  const [status, setStatus] = React.useState<Status>({ step: "idle" })
  const [copied, setCopied] = React.useState(false)

  const count = project.pages.length
  const pages =
    settings.scope === "current"
      ? [editor.pageIndex]
      : project.pages.flatMap((p, i) => (excluded.has(p.id) ? [] : [i]))
  const busy = status.step === "rendering" || status.step === "packing"
  const lossy = ["jpeg", "webp", "pdf"].includes(settings.format)
  const scale = settings.dpi ? settings.dpi / CSS_DPI : settings.scale
  const pixelWidth = Math.round(project.width * scale)
  const pixelHeight = Math.round(project.height * scale)
  const ext = settings.format === "jpeg" ? "jpg" : settings.format
  const name = slug(settings.name)
  // Several images travel as one .zip; a PDF or a single image downloads as is.
  const outName =
    settings.format === "pdf"
      ? `${name}.pdf`
      : pages.length > 1
        ? `${name}.zip`
        : `${name}-${String(pages[0]! + 1).padStart(2, "0")}.${ext}`

  React.useEffect(() => {
    let live = true
    const urls: string[] = []
    ;(async () => {
      for (const i of project.pages.keys()) {
        const blob = await renderToBlob(
          pageDoc(project, i),
          images,
          "image/jpeg",
          0.12,
          0.7
        )
        if (!live || !blob) return
        urls.push(URL.createObjectURL(blob))
        setThumbs([...urls])
      }
    })()
    return () => {
      live = false
      urls.forEach(URL.revokeObjectURL)
    }
  }, [project, images])

  const formatName = t(`formats.${settings.format}.name`)
  const inches = (px: number) =>
    (px / CSS_DPI).toLocaleString(locale, { maximumFractionDigits: 2 })

  const run = async () => {
    if (!pages.length) return
    const { format, dpi } = settings
    const type =
      format === "pdf" || format === "psd" ? "image/jpeg" : MIME[format]
    const quality = settings.quality / 100
    try {
      const blobs: Blob[] = []
      for (const [n, i] of pages.entries()) {
        setStatus({ step: "rendering", done: n, total: pages.length })
        const doc = pageDoc(project, i)
        let blob =
          format === "psd"
            ? await renderPsd(doc, images, scale, dpi || 72)
            : await renderToBlob(doc, images, type, scale, quality)
        if (!blob) throw new Error("canvas")
        // Browsers that can't encode a type quietly fall back to PNG.
        if (format !== "psd" && blob.type !== type)
          throw new Error(t("unsupported", { format: formatName }))
        if (dpi && format !== "pdf") blob = await withDpi(blob, dpi)
        blobs.push(blob)
      }
      setStatus({ step: "packing" })
      let out: Blob
      if (settings.format === "pdf") {
        out = await pdf(
          blobs.map((jpeg) => ({
            jpeg,
            width: project.width,
            height: project.height,
            pixelWidth,
            pixelHeight,
          }))
        )
      } else if (blobs.length > 1) {
        // Numbered so they sort in posting order when uploaded.
        out = await zip(
          blobs.map((blob, n) => ({
            name: `${name}-${String(pages[n]! + 1).padStart(2, "0")}.${ext}`,
            blob,
          }))
        )
      } else out = blobs[0]!
      download(out, outName)
      setStatus({ step: "done", file: outName, size: out.size })
    } catch (e) {
      setStatus({ step: "error", message: (e as Error).message })
    }
  }

  const copy = async () => {
    const blob = await renderToBlob(
      pageDoc(project, editor.pageIndex),
      images,
      "image/png",
      scale
    )
    if (!blob) return
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const primary =
    settings.format === "pdf"
      ? t("exportPdf", { count: pages.length })
      : t("exportFiles", { count: pages.length, format: formatName })

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="absolute end-0 top-full z-50 mt-2 flex max-h-[calc(100svh-4rem)] w-[22rem] max-w-[calc(100vw-1.5rem)] animate-in flex-col gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-popover-foreground shadow-xl ring-1 ring-foreground/10 duration-100 fade-in-0 zoom-in-95 max-sm:fixed max-sm:inset-x-3 max-sm:top-12 max-sm:w-auto max-sm:max-w-none"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          run()
        }
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <Kbd>⌘E</Kbd>
      </div>

      <Segmented<Scope>
        label={t("slides")}
        value={settings.scope}
        onChange={(scope) => set({ scope })}
        options={[
          {
            id: "all",
            label: (
              <>
                {t("scope.all")}
                <span className="ms-1.5 text-muted-foreground tabular-nums">
                  {count}
                </span>
              </>
            ),
          },
          { id: "current", label: t("scope.current") },
        ]}
      />

      <div className="flex flex-col gap-2">
        <Label>{t("format")}</Label>
        <div
          role="radiogroup"
          aria-label={t("format")}
          data-roving-group
          onKeyDown={roving({ axis: "x", select: true })}
          className="grid grid-cols-3 gap-1.5"
        >
          {FORMATS.map((f) => {
            const on = settings.format === f
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-roving
                onClick={() => set({ format: f })}
                className={cn(
                  "flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-2.5 text-start transition outline-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  on && "border-ring ring-3 ring-ring/50"
                )}
              >
                <HugeiconsIcon
                  icon={FORMAT_ICON[f]}
                  strokeWidth={1.75}
                  className="size-5"
                />
                <span className="text-sm font-medium">
                  {t(`formats.${f}.name`)}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {t(`formats.${f}.hint`)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label
          aside={
            settings.dpi
              ? t("printSize", {
                  width: inches(project.width),
                  height: inches(project.height),
                  pixels: `${pixelWidth} × ${pixelHeight}`,
                })
              : `${pixelWidth} × ${pixelHeight} px`
          }
        >
          {t("size")}
        </Label>
        <Segmented<Size>
          label={t("size")}
          value={String(settings.dpi || settings.scale) as Size}
          onChange={(v) =>
            set(
              v === "300" || v === "600"
                ? { dpi: Number(v) as 300 | 600 }
                : { dpi: 0, scale: Number(v) as 1 | 2 | 3 }
            )
          }
          options={[
            { id: "1", label: "1×" },
            { id: "2", label: "2×" },
            { id: "3", label: "3×" },
            { id: "300", label: t("dpi", { dpi: 300 }) },
            { id: "600", label: t("dpi", { dpi: 600 }) },
          ]}
        />
      </div>

      {lossy && (
        <SliderInput
          label={t("quality")}
          value={settings.quality}
          onChange={(quality) => set({ quality })}
          min={50}
          max={100}
          suffix="%"
        />
      )}

      {settings.scope === "all" && count > 1 && (
        <div className="flex flex-col gap-2">
          <Label aside={`${pages.length}/${count}`}>{t("slides")}</Label>
          <div
            data-roving-group
            onKeyDown={roving()}
            className="grid grid-cols-5 gap-1.5"
          >
            {project.pages.map((page, i) => {
              const on = !excluded.has(page.id)
              return (
                <button
                  key={page.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={t("include", { n: i + 1 })}
                  data-roving
                  onClick={() =>
                    setExcluded((ex) => {
                      const next = new Set(ex)
                      if (on) next.add(page.id)
                      else next.delete(page.id)
                      return next
                    })
                  }
                  className={cn(
                    "relative cursor-pointer overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10 transition outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    !on && "opacity-35 grayscale"
                  )}
                  style={{
                    aspectRatio: `${project.width} / ${project.height}`,
                  }}
                >
                  {thumbs[i] && (
                    <img
                      src={thumbs[i]}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                  <span
                    className={cn(
                      "absolute end-1 top-1 flex size-3.5 items-center justify-center rounded-full ring-1",
                      on
                        ? "bg-foreground text-background ring-foreground"
                        : "bg-background/80 ring-foreground/30"
                    )}
                  >
                    {on && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={3}
                        className="size-2.5"
                      />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{t("fileName")}</span>
        <span className="flex h-8 items-center rounded-lg border border-input text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <input
            className="min-w-0 flex-1 bg-transparent px-2.5 outline-none"
            value={settings.name}
            spellCheck={false}
            onChange={(e) => set({ name: e.target.value })}
          />
          <span className="pe-2.5 text-muted-foreground">
            {outName.slice(name.length)}
          </span>
        </span>
      </label>

      <div className="-mx-4 -mb-4 flex flex-col gap-2 rounded-b-xl border-t bg-muted/40 p-3">
        <div className="flex gap-2">
          <TooltipTrigger>
            <Button
              variant="outline"
              size="icon"
              aria-label={copied ? t("copied") : t("copy")}
              isDisabled={busy}
              onPress={copy}
            >
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                strokeWidth={2}
              />
            </Button>
            <Tooltip>{copied ? t("copied") : t("copy")}</Tooltip>
          </TooltipTrigger>
          <Button
            // The kit's buttons don't shrink; this one must, to truncate.
            className="min-w-0 flex-1 shrink"
            isDisabled={busy || !pages.length}
            onPress={run}
          >
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon
                icon={Download01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            <span className="truncate">{primary}</span>
          </Button>
        </div>
        {(status.step !== "idle" || !pages.length) && (
          <p
            role="status"
            className={cn(
              "flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground",
              status.step === "error" && "text-destructive"
            )}
          >
            {status.step === "rendering" && (
              <>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className="block h-full rounded-full bg-foreground transition-[width]"
                    style={{
                      width: `${((status.done + 0.5) / status.total) * 100}%`,
                    }}
                  />
                </span>
                <span className="shrink-0 tabular-nums">
                  {t("rendering", {
                    done: status.done + 1,
                    total: status.total,
                  })}
                </span>
              </>
            )}
            {status.step === "packing" && t("packing")}
            {status.step === "done" && (
              <>
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  strokeWidth={2}
                  className="size-3.5 text-emerald-600 dark:text-emerald-400"
                />
                <span className="truncate">
                  {t("done", {
                    file: status.file,
                    size: formatBytes(status.size, locale),
                  })}
                </span>
              </>
            )}
            {status.step === "error" && t("failed", { error: status.message })}
            {status.step === "idle" && !pages.length && t("noSlides")}
          </p>
        )}
      </div>
    </div>
  )
}
