import * as React from "react"
import { Link } from "react-router"
import { Dialog, Modal, ModalOverlay } from "react-aria-components"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowLeft01Icon,
  ComputerIcon,
  FileEditIcon,
  Layers01Icon,
  LayoutGridIcon,
  PaintBoardIcon,
  Redo02Icon,
  Settings01Icon,
  SmartPhone01Icon,
  Store01Icon,
  Undo02Icon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { slugAllowed, slugify, type Device, type Site } from "@/lib/sites/model"

import { messages } from "../frontage.messages"
import "../frontage.css"
import { Close } from "../shell"
import { AppsPanel } from "./apps"
import { Canvas } from "./canvas"
import "./editor.css"
import { Inspector } from "./inspector"
import {
  AddPanel,
  DesignPanel,
  LayersPanel,
  PagesPanel,
  SectionsPanel,
  SettingsPanel,
} from "./panels"
import { useEditor } from "./state"

const RAIL = [
  { id: "add", icon: Add01Icon, tone: "a" },
  { id: "sections", icon: LayoutGridIcon, tone: "b" },
  { id: "pages", icon: FileEditIcon, tone: "c" },
  { id: "layers", icon: Layers01Icon, tone: "d" },
  { id: "design", icon: PaintBoardIcon, tone: "e" },
  { id: "apps", icon: Store01Icon, tone: "f" },
  { id: "settings", icon: Settings01Icon, tone: "g" },
] as const

type Panel = (typeof RAIL)[number]["id"]

function Publish({
  site,
  id,
  slug,
  open,
  onClose,
  flush,
  onPublished,
}: {
  site: Site
  id: string
  slug: string | null
  open: boolean
  onClose: () => void
  flush: () => Promise<void>
  onPublished: (slug: string) => void
}) {
  const t = useT(messages)
  const [value, setValue] = React.useState(
    slug ?? (slugify(site.name) || "my-site")
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const [origin, setOrigin] = React.useState("")
  React.useEffect(() => setOrigin(window.location.origin), [])
  const clean = slugify(value)
  const valid = slugAllowed(clean)
  const url = `${origin}/s/${clean}`
  const publish = async () => {
    setBusy(true)
    setError(null)
    await flush()
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "publish", id, slug: clean }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      slug?: string
      code?: string
      error?: string
    }
    setBusy(false)
    if (!res.ok || !json.slug) {
      setError(
        json.code === "slug_taken"
          ? t("publish.taken")
          : json.code === "slug"
            ? t("publish.invalid")
            : (json.error ?? t("failed"))
      )
      return
    }
    setDone(true)
    onPublished(json.slug)
  }
  const unpublish = async () => {
    setBusy(true)
    await fetch("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "unpublish", id }),
    })
    setBusy(false)
    onPublished("")
    onClose()
  }
  return (
    <ModalOverlay
      className="fr fr-overlay"
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          setDone(false)
        }
      }}
      isDismissable
    >
      <Modal className="fr-modal fe-publish">
        <Dialog className="outline-none" aria-label={t("publish.title")}>
          <header>
            <h2>{done ? t("publish.done") : t("publish.title")}</h2>
            <Close onPress={onClose} label={t("close")} />
          </header>
          <div className="fe-publish-body">
            {done ? (
              <>
                <p>{t("publish.doneText")}</p>
                <a
                  className="fe-live"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {url.replace(/^https?:\/\//, "")}
                </a>
                <a
                  className="fr-go fr-go-wide"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("publish.visit")}
                </a>
              </>
            ) : (
              <>
                <label className="fe-field">
                  <span>{t("publish.address")}</span>
                  <div className="fe-slug">
                    <em>/s/</em>
                    <input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                </label>
                {!valid && clean && (
                  <p className="fr-error">{t("publish.invalid")}</p>
                )}
                {error && (
                  <p className="fr-error" role="alert">
                    {error}
                  </p>
                )}
                <p className="fe-note">{t("publish.note")}</p>
                <button
                  type="button"
                  className="fr-go fr-go-wide"
                  disabled={busy || !valid}
                  onClick={() => void publish()}
                >
                  {busy
                    ? t("publish.publishing")
                    : slug
                      ? t("publish.update")
                      : t("publish.go")}
                </button>
                {slug && (
                  <button
                    type="button"
                    className="fr-ghost"
                    disabled={busy}
                    onClick={() => void unpublish()}
                  >
                    {t("publish.unpublish")}
                  </button>
                )}
              </>
            )}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}

export function SiteEditor({
  id,
  site,
  revision,
  slug: initialSlug,
}: {
  id: string
  site: Site
  revision: number
  slug: string | null
}) {
  const t = useT(messages)
  const ed = useEditor(id, site, revision)
  const [panel, setPanel] = React.useState<Panel | null>("add")
  const [after, setAfter] = React.useState<number | null>(null)
  const [publishing, setPublishing] = React.useState(false)
  const [slug, setSlug] = React.useState(initialSlug)

  const clip = React.useRef<typeof ed.selected>([])
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      )
        return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) ed.redo()
        else ed.undo()
        return
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void ed.flush()
        return
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault()
        ed.duplicate()
        return
      }
      if (mod && e.key.toLowerCase() === "c") clip.current = ed.selected
      if (mod && e.key.toLowerCase() === "v" && clip.current.length) {
        const target = ed.section?.id ?? ed.page.sections[0]?.id
        if (!target) return
        const copies = clip.current.map((c) => ({
          ...c,
          id: Math.random().toString(36).slice(2, 12),
          box: { ...c.box, x: c.box.x + 24, y: c.box.y + 24 },
        }))
        ed.patchSection(target, (s) => ({
          ...s,
          elements: [...s.elements, ...copies],
        }))
        ed.select(copies.map((c) => c.id))
        return
      }
      if (e.key === " ") e.preventDefault()
      if (e.key === "Escape") ed.select([])
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        ed.remove()
      }
      const by = e.shiftKey ? 10 : 1
      const shift: Record<string, [number, number]> = {
        ArrowLeft: [-by, 0],
        ArrowRight: [by, 0],
        ArrowUp: [0, -by],
        ArrowDown: [0, by],
      }
      const move = shift[e.key]
      if (move && ed.selected.length && ed.section) {
        e.preventDefault()
        const frames = new Map(
          ed.selected.map((x) => {
            const b = ed.frame(x, ed.section!)
            return [x.id, { ...b, x: b.x + move[0], y: b.y + move[1] }]
          })
        )
        ed.setFrames(frames, "nudge")
      }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [ed])

  const saveLabel =
    ed.save === "saved"
      ? t("editor.saved")
      : ed.save === "conflict"
        ? t("editor.conflict")
        : ed.save === "failed"
          ? t("editor.saveFailed")
          : t("editor.saving")

  return (
    <div className="fr fe">
      <header className="fe-top">
        <Link
          to={`/sites/${id}`}
          className="fr-square"
          aria-label={t("editor.back")}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        </Link>
        <input
          className="fe-name"
          value={ed.site.name}
          aria-label={t("settings.name")}
          onChange={(e) =>
            ed.edit((s) => ({ ...s, name: e.target.value }), "name")
          }
        />
        <select
          className="fe-page-select"
          aria-label={t("panels.pages")}
          value={ed.page.id}
          onChange={(e) => {
            ed.setPageId(e.target.value)
            ed.select([])
          }}
        >
          {ed.site.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="fe-spacer" />
        <div
          className="fe-segments"
          role="group"
          aria-label={t("editor.device")}
        >
          {(
            [
              ["desktop", ComputerIcon],
              ["mobile", SmartPhone01Icon],
            ] as [Device, typeof ComputerIcon][]
          ).map(([d, icon]) => (
            <button
              key={d}
              type="button"
              aria-label={t(`editor.${d}`)}
              aria-pressed={ed.device === d}
              onClick={() => ed.setDevice(d)}
            >
              <HugeiconsIcon icon={icon} size={15} />
            </button>
          ))}
        </div>
        <div className="fe-spacer" />
        <span
          className="fe-save"
          data-bad={ed.save === "conflict" || ed.save === "failed" || null}
          role="status"
        >
          {saveLabel}
        </span>
        <button
          type="button"
          className="fr-square"
          aria-label={t("editor.undo")}
          disabled={!ed.canUndo}
          onClick={ed.undo}
        >
          <HugeiconsIcon icon={Undo02Icon} size={16} />
        </button>
        <button
          type="button"
          className="fr-square"
          aria-label={t("editor.redo")}
          disabled={!ed.canRedo}
          onClick={ed.redo}
        >
          <HugeiconsIcon icon={Redo02Icon} size={16} />
        </button>
        {slug && (
          <a
            className="fr-ghost"
            href={`/s/${slug}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("editor.view")}
          </a>
        )}
        <button
          type="button"
          className="fe-publish-button"
          onClick={() => setPublishing(true)}
        >
          {t("editor.publish")}
        </button>
      </header>
      <div className="fe-body" data-panel={panel || null}>
        <nav className="fe-rail" aria-label={t("editor.tools")}>
          {RAIL.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={panel === r.id}
              onClick={() => {
                setAfter(null)
                setPanel(panel === r.id ? null : r.id)
              }}
            >
              <i data-tone={r.tone}>
                <HugeiconsIcon icon={r.icon} size={15} strokeWidth={2} />
              </i>
              {t(`panels.${r.id}`)}
            </button>
          ))}
        </nav>
        {panel && (
          <aside className="fe-panel" aria-label={t(`panels.${panel}`)}>
            <h2>{t(`panels.${panel}`)}</h2>
            {panel === "add" && <AddPanel ed={ed} />}
            {panel === "sections" && (
              <SectionsPanel
                ed={ed}
                after={after}
                onDone={() => setAfter(null)}
              />
            )}
            {panel === "pages" && <PagesPanel ed={ed} />}
            {panel === "layers" && <LayersPanel ed={ed} />}
            {panel === "design" && <DesignPanel ed={ed} />}
            {panel === "apps" && <AppsPanel ed={ed} />}
            {panel === "settings" && <SettingsPanel ed={ed} />}
          </aside>
        )}
        <Canvas
          ed={ed}
          onAddSection={(index) => {
            setAfter(index)
            setPanel("sections")
          }}
        />
        <Inspector ed={ed} />
      </div>
      <Publish
        site={ed.site}
        id={id}
        slug={slug}
        open={publishing}
        onClose={() => setPublishing(false)}
        flush={ed.flush}
        onPublished={(s) => setSlug(s || null)}
      />
    </div>
  )
}
