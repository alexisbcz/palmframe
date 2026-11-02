import * as React from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Calendar03Icon,
  Edit02Icon,
  FlashIcon,
  News01Icon,
  PaintBoardIcon,
  ShoppingBag01Icon,
  SparklesIcon,
  TextFontIcon,
  LayoutGridIcon,
} from "@hugeicons/core-free-icons"

import { COSTS } from "@/lib/credits"
import { useLocale, useT } from "@/i18n/core"
import { APPS, type App } from "@/lib/sites/edit"
import { CORNERS, PALETTES, TYPEFACES, type Look } from "@/lib/sites/looks"
import { TEMPLATES } from "@/lib/sites/templates"

import { messages } from "./frontage.messages"
import { LookDialog, Swatch } from "./look"
import { TemplateDialog } from "./template-grid"

const APP_ICONS: Record<App, typeof Edit02Icon> = {
  store: ShoppingBag01Icon,
  bookings: Calendar03Icon,
  blog: News01Icon,
  events: FlashIcon,
}

export function Composer() {
  const t = useT(messages)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const [mode, setMode] = React.useState<"write" | "pick">("write")
  const [prompt, setPrompt] = React.useState("")
  const [template, setTemplate] = React.useState<string | null>(null)
  const [look, setLook] = React.useState<Look>({})
  const [apps, setApps] = React.useState<App[]>([])
  const [dialog, setDialog] = React.useState<"look" | "template" | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const palette = PALETTES.find((p) => p.id === look.palette)
  const type = TYPEFACES.find((f) => f.id === look.type)
  const corners = CORNERS.find((c) => c.id === look.corners)
  const picked = TEMPLATES.find((x) => x.id === template)
  const writing = mode === "write" && !!prompt.trim()

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          writing
            ? {
                intent: "draft",
                prompt,
                template,
                look,
                apps,
                language: locale,
              }
            : { intent: "create", template, look, apps }
        ),
      })
      const json = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !json.id) throw new Error(json.error ?? t("failed"))
      navigate(`/sites/${json.id}/edit`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"))
      setBusy(false)
    }
  }

  const Tile = ({
    label,
    value,
    art,
    onPress,
  }: {
    label: string
    value: string
    art: React.ReactNode
    onPress: () => void
  }) => (
    <button type="button" className="fr-tile" onClick={onPress}>
      <span className="fr-tile-art">{art}</span>
      <span>
        <small>{label}</small>
        <b>{value}</b>
      </span>
    </button>
  )

  return (
    <div className="fr-dock-wrap">
      <div className="fr-rail" role="tablist" aria-label={t("composer.mode")}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "write"}
          onClick={() => setMode("write")}
        >
          <HugeiconsIcon icon={SparklesIcon} size={17} strokeWidth={1.8} />
          {t("composer.write")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "pick"}
          onClick={() => setMode("pick")}
        >
          <HugeiconsIcon icon={LayoutGridIcon} size={17} strokeWidth={1.8} />
          {t("composer.pick")}
        </button>
      </div>
      <div className="fr-dock">
        <div className="fr-tiles">
          <Tile
            label={t("composer.template")}
            value={picked?.name ?? t("auto")}
            art={<HugeiconsIcon icon={LayoutGridIcon} size={18} />}
            onPress={() => setDialog("template")}
          />
          <Tile
            label={t("composer.palette")}
            value={palette?.name ?? t("auto")}
            art={
              palette ? (
                <Swatch colors={[palette.palette.bg, palette.palette.accent]} />
              ) : (
                <HugeiconsIcon icon={PaintBoardIcon} size={18} />
              )
            }
            onPress={() => setDialog("look")}
          />
          <Tile
            label={t("composer.type")}
            value={type?.name ?? t("auto")}
            art={<HugeiconsIcon icon={TextFontIcon} size={18} />}
            onPress={() => setDialog("look")}
          />
          <Tile
            label={t("composer.corners")}
            value={corners?.name ?? t("auto")}
            art={
              <i
                className="fr-corner fr-corner-small"
                style={{ borderTopLeftRadius: corners?.radius ?? 10 }}
              />
            }
            onPress={() => setDialog("look")}
          />
        </div>
        <div className="fr-compose">
          <div className="fr-compose-main">
            {mode === "write" ? (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void go()
                }}
                placeholder={t("composer.placeholder")}
                aria-label={t("composer.placeholder")}
                maxLength={4000}
                rows={2}
              />
            ) : (
              <button
                type="button"
                className="fr-pick"
                onClick={() => setDialog("template")}
              >
                {picked
                  ? `${picked.name}: ${picked.blurb}`
                  : t("composer.pickHint")}
              </button>
            )}
            <div className="fr-pills" aria-label={t("composer.apps")}>
              {APPS.map((app) => (
                <button
                  key={app}
                  type="button"
                  className="fr-mini"
                  aria-pressed={apps.includes(app)}
                  onClick={() =>
                    setApps(
                      apps.includes(app)
                        ? apps.filter((a) => a !== app)
                        : [...apps, app]
                    )
                  }
                >
                  <HugeiconsIcon
                    icon={APP_ICONS[app]}
                    size={14}
                    strokeWidth={2}
                  />
                  {t(`apps.${app}`)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="fr-go"
            disabled={busy || (mode === "pick" && !template)}
            onClick={() => void go()}
          >
            {busy ? (
              t("composer.building")
            ) : writing ? (
              <>
                {t("composer.generate")}
                <small>✦ {COSTS.site_draft}</small>
              </>
            ) : (
              t("composer.start")
            )}
          </button>
        </div>
        {error && (
          <p className="fr-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <LookDialog
        open={dialog === "look"}
        onClose={() => setDialog(null)}
        look={look}
        onChange={setLook}
      />
      <TemplateDialog
        open={dialog === "template"}
        onClose={() => setDialog(null)}
        onPick={(id) => {
          setTemplate(id)
          setDialog(null)
        }}
      />
    </div>
  )
}
