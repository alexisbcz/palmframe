import * as React from "react"
import { Dialog, Modal, ModalOverlay } from "react-aria-components"

import { useT } from "@/i18n/core"
import { CORNERS, PALETTES, TYPEFACES, type Look } from "@/lib/sites/looks"
import { fontsHref, fontStack } from "@/lib/sites/model"

import { messages } from "./frontage.messages"
import { Close } from "./shell"

const TILE = 104

// A column of pills that scrolls and settles on one. The middle pill is the
// choice, so reading the three columns across reads the whole look.
function Wheel({
  label,
  items,
  value,
  onChange,
}: {
  label: string
  items: { id: string; name: string; art: React.ReactNode }[]
  value: string | undefined
  onChange: (id: string | undefined) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const all = [{ id: "", name: "", art: null }, ...items]
  const index = Math.max(
    0,
    all.findIndex((i) => i.id === (value ?? ""))
  )
  const settling = React.useRef(0)
  const [active, setActive] = React.useState(index)

  React.useEffect(() => {
    ref.current?.scrollTo({ top: index * TILE })
  }, [index])

  const onScroll = () => {
    const node = ref.current
    if (!node) return
    const at = Math.round(node.scrollTop / TILE)
    setActive(at)
    window.clearTimeout(settling.current)
    settling.current = window.setTimeout(() => {
      const id = all[at]?.id
      if (id !== undefined && id !== (value ?? "")) onChange(id || undefined)
    }, 120)
  }

  return (
    <div className="fr-wheel">
      <h3>{label}</h3>
      <div
        ref={ref}
        className="fr-wheel-track"
        onScroll={onScroll}
        role="listbox"
        aria-label={label}
      >
        <div className="fr-wheel-pad" />
        {all.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === active}
            data-on={i === active || null}
            className="fr-pill"
            onClick={() =>
              ref.current?.scrollTo({ top: i * TILE, behavior: "smooth" })
            }
          >
            <span>{item.art}</span>
            <small>{item.name || "Auto"}</small>
          </button>
        ))}
        <div className="fr-wheel-pad" />
      </div>
    </div>
  )
}

export const Swatch = ({ colors }: { colors: string[] }) => (
  <i className="fr-swatch">
    {colors.map((c) => (
      <b key={c} style={{ background: c }} />
    ))}
  </i>
)

export function LookDialog({
  open,
  onClose,
  look,
  onChange,
}: {
  open: boolean
  onClose: () => void
  look: Look
  onChange: (look: Look) => void
}) {
  const t = useT(messages)
  const [tab, setTab] = React.useState<"look" | "palettes">("look")
  return (
    <ModalOverlay
      className="fr fr-overlay"
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      isDismissable
    >
      <Modal className="fr-modal fr-look">
        <Dialog className="outline-none" aria-label={t("look.title")}>
          <link
            rel="stylesheet"
            href={fontsHref(TYPEFACES.map((f) => f.heading))}
            precedence="default"
          />
          <header>
            <h2>{t("look.title")}</h2>
            <button
              type="button"
              className="fr-chip-button"
              onClick={() => onChange({})}
            >
              {t("look.reset")}
            </button>
            <Close onPress={onClose} label={t("close")} />
          </header>
          <div className="fr-look-body">
            <nav>
              <button
                type="button"
                data-on={tab === "look" || null}
                onClick={() => setTab("look")}
              >
                {t("look.setup")}
              </button>
              <button
                type="button"
                data-on={tab === "palettes" || null}
                onClick={() => setTab("palettes")}
              >
                {t("look.allPalettes")}
              </button>
            </nav>
            {tab === "look" ? (
              <div className="fr-wheels">
                <Wheel
                  label={t("look.palette")}
                  value={look.palette}
                  onChange={(palette) => onChange({ ...look, palette })}
                  items={PALETTES.map((p) => ({
                    id: p.id,
                    name: p.name,
                    art: (
                      <Swatch
                        colors={[
                          p.palette.bg,
                          p.palette.accent,
                          p.palette.text,
                        ]}
                      />
                    ),
                  }))}
                />
                <Wheel
                  label={t("look.type")}
                  value={look.type}
                  onChange={(type) => onChange({ ...look, type })}
                  items={TYPEFACES.map((f) => ({
                    id: f.id,
                    name: f.name,
                    art: (
                      <b
                        className="fr-aa"
                        style={{ fontFamily: fontStack(f.heading) }}
                      >
                        Aa
                      </b>
                    ),
                  }))}
                />
                <Wheel
                  label={t("look.corners")}
                  value={look.corners}
                  onChange={(corners) => onChange({ ...look, corners })}
                  items={CORNERS.map((c) => ({
                    id: c.id,
                    name: c.name,
                    art: (
                      <i
                        className="fr-corner"
                        style={{ borderTopLeftRadius: c.radius }}
                      />
                    ),
                  }))}
                />
              </div>
            ) : (
              <div className="fr-palette-grid">
                {PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-on={look.palette === p.id || null}
                    style={{ background: p.palette.bg, color: p.palette.text }}
                    onClick={() => onChange({ ...look, palette: p.id })}
                  >
                    <b>{p.name}</b>
                    <i style={{ background: p.palette.accent }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
