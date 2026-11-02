import * as React from "react"
import { Link, NavLink, useNavigate } from "react-router"
import { Button } from "react-aria-components"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Cancel01Icon,
  DashboardSquare01Icon,
  Globe02Icon,
  Home01Icon,
  SidebarLeft01Icon,
} from "@hugeicons/core-free-icons"

import { AccountMenu, useBalance } from "@/components/account/account-menu"
import { CreditsPill } from "@/components/account/credits-pill"
import { useLocale, useT } from "@/i18n/core"

import { messages } from "./frontage.messages"

export function Close({
  onPress,
  label,
}: {
  onPress: () => void
  label: string
}) {
  return (
    <Button className="fr-close" aria-label={label} onPress={onPress}>
      <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.2} />
    </Button>
  )
}

export const Mark = () => (
  <i className="fr-mark" aria-hidden>
    <HugeiconsIcon icon={Globe02Icon} size={16} strokeWidth={2} />
  </i>
)

const NAV = [
  { to: "/sites", key: "home", icon: Home01Icon, tone: "a", end: true },
  { to: "/sites/mine", key: "mine", icon: Globe02Icon, tone: "b" },
  {
    to: "/sites/templates",
    key: "templates",
    icon: DashboardSquare01Icon,
    tone: "c",
  },
] as const

export interface SiteRow {
  id: string
  name: string
  updated_at: string
  slug: string | null
}

export function Shell({
  sites,
  children,
}: {
  sites: SiteRow[]
  children: React.ReactNode
}) {
  const t = useT(messages)
  const navigate = useNavigate()
  const { locale } = useLocale()
  const balance = useBalance()
  const [rail, setRail] = React.useState(false)
  return (
    <div className="fr fr-shell" data-rail={rail || null}>
      <aside className="fr-side">
        <div className="fr-brand">
          <Link to="/sites" className="fr-switch">
            <Mark />
            <span>Frontage</span>
          </Link>
          <button
            type="button"
            className="fr-square"
            aria-label={t("nav.collapse")}
            onClick={() => setRail(!rail)}
          >
            <HugeiconsIcon icon={SidebarLeft01Icon} size={16} strokeWidth={2} />
          </button>
        </div>
        <nav className="fr-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={"end" in n ? n.end : false}
              prefetch="intent"
            >
              <i data-tone={n.tone}>
                <HugeiconsIcon icon={n.icon} size={15} strokeWidth={2} />
              </i>
              <span>{t(`nav.${n.key}`)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="fr-projects">
          <h2>{t("nav.sites")}</h2>
          <button
            type="button"
            className="fr-new"
            onClick={() => navigate("/sites/templates")}
          >
            <i>
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
            </i>
            <span>{t("nav.new")}</span>
          </button>
          {sites.slice(0, 12).map((s) => (
            <NavLink key={s.id} to={`/sites/${s.id}`} className="fr-project">
              <b data-live={s.slug ? true : undefined} />
              <span>{s.name || t("untitled")}</span>
            </NavLink>
          ))}
        </div>
        <footer className="fr-side-foot">
          <CreditsPill>{(balance ?? 0).toLocaleString(locale)}</CreditsPill>
          <AccountMenu />
        </footer>
      </aside>
      <main className="fr-main">{children}</main>
    </div>
  )
}
