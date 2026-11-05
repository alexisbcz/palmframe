import * as React from "react"
import { useNavigate, useRevalidator } from "react-router"
import {
  Button,
  Dialog,
  DialogTrigger,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  Globe02Icon,
  Image01Icon,
  NewTwitterIcon,
  News01Icon,
  PlayCircleIcon,
  RedditIcon,
  SparklesIcon,
  Building03Icon,
  TextFontIcon,
} from "@hugeicons/core-free-icons"

import { setCredits } from "@/lib/credits-store"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import {
  type SourceKind,
  type TemplateId,
  TEMPLATES,
  templateById,
} from "@/lib/newsroom/templates"

import { Cover } from "./cover"
import { messages } from "./newsroom.messages"

export const SOURCE_ICONS: Record<SourceKind, typeof News01Icon> = {
  news: News01Icon,
  web: Globe02Icon,
  social: RedditIcon,
  video: PlayCircleIcon,
  brand: Building03Icon,
  x: NewTwitterIcon,
}

const DRAFT = "newsroom-draft"

export function Composer({ initial }: { initial?: TemplateId }) {
  const t = useT(messages)
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [template, setTemplate] = React.useState<TemplateId>(
    initial ?? "breakdown"
  )
  const [lead, setLead] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const area = React.useRef<HTMLTextAreaElement>(null)
  const chosen = templateById(template)!

  // An unsent lead survives a reload; nothing else is remembered.
  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT)
      if (saved) setLead(saved)
    } catch {
      // Storage blocked: start empty.
    }
  }, [])
  React.useEffect(() => {
    if (initial) setTemplate(initial)
  }, [initial])
  const write = (value: string) => {
    setLead(value)
    setError(null)
    try {
      sessionStorage.setItem(DRAFT, value)
    } catch {
      // Not remembered.
    }
  }

  const ready = lead.trim().length >= 3 && !busy
  const file = async () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/newsroom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "file", lead: lead.trim(), template }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        id?: string
        balance?: number
        error?: string
      }
      if (!res.ok || !body.id) {
        const known = ["invalid", "busy", "credits"] as const
        const code = known.find((k) => k === body.error) ?? "generic"
        setError(t(`errors.${code}`))
        return
      }
      if (typeof body.balance === "number") setCredits(body.balance)
      try {
        sessionStorage.removeItem(DRAFT)
      } catch {
        // Fine.
      }
      revalidator.revalidate()
      navigate(`/newsroom/${body.id}`)
    } catch {
      setError(t("errors.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="nr-dock">
        <div className="nr-tiles">
          <DialogTrigger>
            <Button className="nr-tile" aria-label={t("composer.pick")}>
              <span className="nr-tile-art">
                <Cover template={template} title={chosen.name} small />
              </span>
              <span>
                <small>{t("composer.template")}</small>
                <b>{chosen.name}</b>
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={2}
                style={{ marginInlineStart: "auto", opacity: 0.5 }}
              />
            </Button>
            <Popover placement="bottom start" className="nr nr-popover">
              <Dialog aria-label={t("composer.pick")} className="outline-none">
                {({ close }) => (
                  <ListBox
                    aria-label={t("composer.pick")}
                    className="nr-picker"
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={[template]}
                    onSelectionChange={(keys) => {
                      const [k] = [...keys]
                      if (typeof k === "string" && templateById(k)) {
                        setTemplate(k as TemplateId)
                        close()
                        area.current?.focus()
                      }
                    }}
                  >
                    {TEMPLATES.map((x) => (
                      <ListBoxItem
                        key={x.id}
                        id={x.id}
                        textValue={x.name}
                        className="nr-option"
                      >
                        <Cover template={x.id} title={x.name} small />
                        <span>
                          <small>{t(`templates.${x.id}.tag`)}</small>
                          <b>{x.name}</b>
                          <p>{t(`templates.${x.id}.blurb`)}</p>
                        </span>
                      </ListBoxItem>
                    ))}
                  </ListBox>
                )}
              </Dialog>
            </Popover>
          </DialogTrigger>
          <div className="nr-tile">
            <span className="nr-tile-art">
              <HugeiconsIcon icon={Globe02Icon} size={18} strokeWidth={1.8} />
            </span>
            <span>
              <small>{t("composer.sources")}</small>
              <span
                className="nr-icons"
                title={chosen.sources.map((s) => t(`source.${s}`)).join(", ")}
              >
                {chosen.sources.map((s) => (
                  <i key={s} aria-label={t(`source.${s}`)}>
                    <HugeiconsIcon
                      icon={SOURCE_ICONS[s]}
                      size={12}
                      strokeWidth={2}
                    />
                  </i>
                ))}
              </span>
            </span>
          </div>
          <div className="nr-tile">
            <span className="nr-tile-art">
              <HugeiconsIcon icon={TextFontIcon} size={18} strokeWidth={1.8} />
            </span>
            <span>
              <small>{t("composer.length")}</small>
              <b>
                {t("composer.words", {
                  min: chosen.limits.minWords,
                  max: chosen.limits.maxWords,
                })}
              </b>
            </span>
          </div>
          <div className="nr-tile">
            <span className="nr-tile-art">
              <HugeiconsIcon
                icon={CheckmarkBadge01Icon}
                size={18}
                strokeWidth={1.8}
              />
            </span>
            <span>
              <small>{t("composer.checks")}</small>
              <b>{t("composer.checksValue")}</b>
            </span>
          </div>
          <div className="nr-tile">
            <span className="nr-tile-art">
              <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.8} />
            </span>
            <span>
              <small>{t("composer.cover")}</small>
              <b>{t("composer.coverValue")}</b>
            </span>
          </div>
        </div>
        <div className="nr-compose">
          <div className="nr-compose-main">
            <textarea
              ref={area}
              value={lead}
              maxLength={500}
              rows={2}
              placeholder={t("composer.placeholder")}
              aria-label={t("composer.placeholder")}
              onChange={(e) => write(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void file()
                }
              }}
            />
            <div className="nr-pills">
              <span className="nr-mini">
                <HugeiconsIcon icon={News01Icon} size={14} strokeWidth={2} />
                <span>{t(`templates.${template}.tag`)}</span>
              </span>
              <span className="nr-mini">
                <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={2} />
                <span>
                  {t("composer.minutes", {
                    min: chosen.minutes[0],
                    max: chosen.minutes[1],
                  })}
                </span>
              </span>
            </div>
            {error && (
              <p className="nr-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <button
            type="button"
            className="nr-go"
            disabled={!ready}
            onClick={() => void file()}
          >
            {busy ? t("composer.filing") : t("composer.file")}
            <small>
              <HugeiconsIcon icon={SparklesIcon} size={13} strokeWidth={2.2} />
              {COSTS.deep_dive}
            </small>
          </button>
        </div>
      </div>
      <div className="nr-suggest">
        <span>{t("composer.try")}</span>
        {chosen.leads.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => {
              write(l)
              area.current?.focus()
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </>
  )
}
