import * as React from "react"
import { Dialog, Modal, ModalOverlay } from "react-aria-components"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon, Upload01Icon } from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { COMICS_BUCKET } from "@/lib/database"
import { TOKENS, type Link, type Site } from "@/lib/sites/model"
import { useSupabase } from "@/lib/supabase.browser"
import { useViewer } from "@/components/account/account-menu"

import { messages } from "../frontage.messages"
import { Close } from "../shell"

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="fe-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Text({
  label,
  value,
  onChange,
  area,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  area?: boolean
  placeholder?: string
}) {
  return (
    <Field label={label}>
      {area ? (
        <textarea
          value={value}
          rows={4}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export function Num({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  )
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; name: string }[]
  onChange: (v: T) => void
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Toggle({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="fe-toggle">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
      <span>{label}</span>
    </label>
  )
}

export function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | undefined
  options: { id: T; name: React.ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="fe-field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="fe-segments">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// A theme token keeps following the palette. A literal colour stays put.
export function ColorField({
  label,
  value,
  site,
  onChange,
}: {
  label: string
  value: string | undefined
  site: Site
  onChange: (v: string | undefined) => void
}) {
  const t = useT(messages)
  const shown = value?.startsWith("$")
    ? site.theme.palette[value.slice(1) as keyof Site["theme"]["palette"]]
    : value
  return (
    <div className="fe-field">
      <span>{label}</span>
      <div className="fe-colors">
        <button
          type="button"
          className="fe-dot fe-none"
          aria-label={t("editor.noColor")}
          aria-pressed={!value}
          onClick={() => onChange(undefined)}
        />
        {TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            className="fe-dot"
            aria-label={token}
            aria-pressed={value === `$${token}`}
            style={{ background: site.theme.palette[token] }}
            onClick={() => onChange(`$${token}`)}
          />
        ))}
        <input
          type="color"
          aria-label={t("editor.customColor")}
          value={/^#[0-9a-f]{6}$/i.test(shown ?? "") ? shown : "#888888"}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

export function LinkField({
  label,
  value,
  site,
  onChange,
}: {
  label: string
  value: Link | null | undefined
  site: Site
  onChange: (v: Link | null) => void
}) {
  const t = useT(messages)
  const kind = value?.kind ?? "none"
  return (
    <div className="fe-field">
      <span>{label}</span>
      <select
        value={kind}
        aria-label={label}
        onChange={(e) => {
          const k = e.target.value
          onChange(
            k === "none"
              ? null
              : k === "page"
                ? { kind: "page", page: site.pages[0]!.id }
                : k === "url"
                  ? { kind: "url", url: "https://" }
                  : k === "email"
                    ? { kind: "email", email: "" }
                    : { kind: "phone", phone: "" }
          )
        }}
      >
        <option value="none">{t("link.none")}</option>
        <option value="page">{t("link.page")}</option>
        <option value="url">{t("link.url")}</option>
        <option value="email">{t("link.email")}</option>
        <option value="phone">{t("link.phone")}</option>
      </select>
      {value?.kind === "page" && (
        <select
          aria-label={t("link.page")}
          value={value.page}
          onChange={(e) => onChange({ kind: "page", page: e.target.value })}
        >
          {site.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {value?.kind === "url" && (
        <input
          aria-label={t("link.url")}
          value={value.url}
          onChange={(e) => onChange({ kind: "url", url: e.target.value })}
        />
      )}
      {value?.kind === "email" && (
        <input
          aria-label={t("link.email")}
          type="email"
          value={value.email}
          onChange={(e) => onChange({ kind: "email", email: e.target.value })}
        />
      )}
      {value?.kind === "phone" && (
        <input
          aria-label={t("link.phone")}
          value={value.phone}
          onChange={(e) => onChange({ kind: "phone", phone: e.target.value })}
        />
      )}
    </div>
  )
}

const hash = async (blob: Blob) => {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function useUpload() {
  const supabase = useSupabase()
  const viewer = useViewer()
  return async (blob: Blob) => {
    if (!viewer) throw new Error("Sign in first.")
    const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png"
    const path = `${viewer.id}/site-${await hash(blob)}.${ext}`
    const bucket = supabase.storage.from(COMICS_BUCKET)
    const { error } = await bucket.upload(path, blob, {
      contentType: blob.type,
      upsert: true,
    })
    if (error) throw error
    return bucket.getPublicUrl(path).data.publicUrl
  }
}

// Upload, draw with AI, paste a link, or pick something already on the site.
export function ImageField({
  label,
  value,
  site,
  onChange,
}: {
  label: string
  value: string
  site: Site
  onChange: (src: string) => void
}) {
  const t = useT(messages)
  const upload = useUpload()
  const [open, setOpen] = React.useState(false)
  const [prompt, setPrompt] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const used = React.useMemo(() => {
    const srcs = new Set<string>()
    JSON.stringify(site, (k, v: unknown) => {
      if (typeof v === "string" && ["src", "image", "cover"].includes(k) && v)
        srcs.add(v)
      return v
    })
    return [...srcs].slice(0, 40)
  }, [site])

  const run = async (work: () => Promise<string>) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await work())
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"))
    }
    setBusy(false)
  }
  const draw = () =>
    run(async () => {
      const res = await fetch("/api/sites/art", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt}. Editorial photograph, natural light. No text, no logos, no watermark.`,
          width: 1344,
          height: 1024,
        }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error ?? t("failed"))
      }
      return upload(await res.blob())
    })

  return (
    <div className="fe-field">
      <span>{label}</span>
      <button
        type="button"
        className="fe-image-button"
        style={value ? { backgroundImage: `url("${encodeURI(value)}")` } : {}}
        onClick={() => setOpen(true)}
      >
        <b>{t("media.change")}</b>
      </button>
      <ModalOverlay
        className="fr fr-overlay"
        isOpen={open}
        onOpenChange={setOpen}
        isDismissable
      >
        <Modal className="fr-modal fe-media">
          <Dialog className="outline-none" aria-label={t("media.title")}>
            <header>
              <h2>{t("media.title")}</h2>
              <Close onPress={() => setOpen(false)} label={t("close")} />
            </header>
            <div className="fe-media-body">
              <div className="fe-draw">
                <input
                  value={prompt}
                  placeholder={t("media.prompt")}
                  aria-label={t("media.prompt")}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <button
                  type="button"
                  className="fr-go fe-draw-go"
                  disabled={busy || !prompt.trim()}
                  onClick={() => void draw()}
                >
                  <HugeiconsIcon icon={SparklesIcon} size={15} />
                  {busy ? t("media.working") : t("media.draw")}
                </button>
              </div>
              <div className="fe-media-row">
                <label className="fr-ghost">
                  <HugeiconsIcon icon={Upload01Icon} size={15} />
                  &nbsp;{t("media.upload")}
                  <input
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void run(() => upload(file))
                    }}
                  />
                </label>
                <input
                  className="fe-url"
                  placeholder={t("media.url")}
                  aria-label={t("media.url")}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    const url = e.currentTarget.value.trim()
                    if (url.startsWith("https://")) {
                      onChange(url)
                      setOpen(false)
                    }
                  }}
                />
              </div>
              {error && (
                <p className="fr-error" role="alert">
                  {error}
                </p>
              )}
              <h3>{t("media.onSite")}</h3>
              <div className="fe-media-grid">
                {used.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => {
                      onChange(src)
                      setOpen(false)
                    }}
                  >
                    <img src={src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  )
}
