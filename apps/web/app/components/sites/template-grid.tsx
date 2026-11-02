import * as React from "react"
import { Dialog, Modal, ModalOverlay } from "react-aria-components"

import { useT } from "@/i18n/core"
import { TEMPLATES } from "@/lib/sites/templates"
import type { Template } from "@/lib/sites/templates/types"

import { messages } from "./frontage.messages"
import { SitePreview } from "./preview"
import { Close } from "./shell"

export function TemplateGrid({
  onPick,
  pickLabel,
  busy,
}: {
  onPick: (id: string) => void
  pickLabel: string
  busy?: string | null
}) {
  const t = useT(messages)
  const [category, setCategory] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [viewing, setViewing] = React.useState<Template | null>(null)
  const categories = [...new Set(TEMPLATES.map((x) => x.category))]
  const shown = TEMPLATES.filter(
    (x) =>
      (!category || x.category === category) &&
      `${x.name} ${x.category} ${x.blurb}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  )
  return (
    <>
      <div className="fr-filter">
        <input
          type="search"
          value={query}
          placeholder={t("templates.search")}
          aria-label={t("templates.search")}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="fr-mini"
          aria-pressed={!category}
          onClick={() => setCategory(null)}
        >
          {t("templates.all")}
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className="fr-mini"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="fr-templates">
        {shown.map((x) => (
          <article key={x.id} className="fr-template">
            <div className="fr-template-shot">
              <SitePreview make={x.make} />
              <div className="fr-template-actions">
                <button
                  type="button"
                  className="fr-primary"
                  disabled={!!busy}
                  onClick={() => onPick(x.id)}
                >
                  {busy === x.id ? t("composer.building") : pickLabel}
                </button>
                <button
                  type="button"
                  className="fr-ghost"
                  onClick={() => setViewing(x)}
                >
                  {t("templates.view")}
                </button>
              </div>
            </div>
            <h3>{x.name}</h3>
            <p>{x.blurb}</p>
          </article>
        ))}
        {!shown.length && <p className="fr-empty">{t("templates.none")}</p>}
      </div>
      <ModalOverlay
        className="fr fr-overlay"
        isOpen={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        isDismissable
      >
        <Modal className="fr-modal fr-viewer">
          <Dialog className="outline-none" aria-label={viewing?.name}>
            <header>
              <h2>{viewing?.name}</h2>
              <button
                type="button"
                className="fr-primary"
                onClick={() => viewing && onPick(viewing.id)}
              >
                {pickLabel}
              </button>
              <Close onPress={() => setViewing(null)} label={t("close")} />
            </header>
            <div className="fr-viewer-scroll">
              {viewing && <SitePreview make={viewing.make} eager />}
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  )
}

export function TemplateDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (id: string) => void
}) {
  const t = useT(messages)
  return (
    <ModalOverlay
      className="fr fr-overlay"
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      isDismissable
    >
      <Modal className="fr-modal fr-pick-modal">
        <Dialog className="outline-none" aria-label={t("templates.title")}>
          <header>
            <h2>{t("templates.title")}</h2>
            <Close onPress={onClose} label={t("close")} />
          </header>
          <div className="fr-pick-scroll">
            <TemplateGrid onPick={onPick} pickLabel={t("templates.choose")} />
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
