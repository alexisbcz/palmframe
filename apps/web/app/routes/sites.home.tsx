import * as React from "react"
import { Dialog, Modal, ModalOverlay } from "react-aria-components"

import { Composer } from "@/components/sites/composer"
import { messages } from "@/components/sites/frontage.messages"
import { SitePreview } from "@/components/sites/preview"
import { Close, Mark } from "@/components/sites/shell"
import { useT } from "@/i18n/core"
import { TEMPLATES } from "@/lib/sites/templates"

const FAN = ["rosewater", "foundry", "ansel"]
const SEEN = "frontage-welcome"

function Welcome() {
  const t = useT(messages)
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN)) setOpen(true)
    } catch {
      // Private window: skip the welcome.
    }
  }, [])
  const close = () => {
    setOpen(false)
    try {
      localStorage.setItem(SEEN, "1")
    } catch {
      // It simply shows again next time.
    }
  }
  return (
    <ModalOverlay
      className="fr fr-overlay"
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      isDismissable
    >
      <Modal className="fr-modal fr-welcome">
        <Dialog className="outline-none" aria-label={t("welcome.title")}>
          <Close onPress={close} label={t("close")} />
          <div className="fr-welcome-art">
            {TEMPLATES.slice(0, 6).map((x) => (
              <SitePreview key={x.id} make={x.make} eager />
            ))}
          </div>
          <div className="fr-welcome-copy">
            <Mark />
            <strong>FRONTAGE</strong>
            <em>{t("welcome.badge")}</em>
            <h2>
              {t("welcome.title")}
              <span>{t("welcome.titleTwo")}</span>
            </h2>
            <p>{t("welcome.text")}</p>
            <button type="button" className="fr-go fr-go-wide" onClick={close}>
              {t("welcome.cta")}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}

export default function SitesHome() {
  const t = useT(messages)
  const fan = FAN.map((id) => TEMPLATES.find((x) => x.id === id)).filter(
    (x) => !!x
  )
  const [front, setFront] = React.useState(0)
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => setFront((f) => f + 1), 3800)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="fr-home">
      <Welcome />
      <div className="fr-fan" aria-hidden>
        {fan.map((x, i) => (
          <div key={x.id} data-slot={(i + front) % fan.length}>
            <SitePreview make={x.make} eager />
          </div>
        ))}
      </div>
      <h1>{t("home.title")}</h1>
      <Composer />
    </div>
  )
}
