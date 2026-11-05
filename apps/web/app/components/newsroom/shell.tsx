import * as React from "react"
import { Link, NavLink, useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  DashboardSquare01Icon,
  Globe02Icon,
  Home01Icon,
  News01Icon,
  NewspaperIcon,
  SidebarLeft01Icon,
} from "@hugeicons/core-free-icons"

import { AccountMenu, useBalance } from "@/components/account/account-menu"
import { CreditsPill } from "@/components/account/credits-pill"
import { useLocale, useT } from "@/i18n/core"
import type { DeepDiveStatus } from "@/lib/deepdive/model"

import { messages } from "./newsroom.messages"

export const Mark = () => (
  <i className="nr-mark" aria-hidden>
    <HugeiconsIcon icon={News01Icon} size={16} strokeWidth={2} />
  </i>
)

const NAV = [
  { to: "/newsroom", key: "home", icon: Home01Icon, tone: "a", end: true },
  { to: "/newsroom/stories", key: "stories", icon: News01Icon, tone: "b" },
  { to: "/newsroom/samples", key: "samples", icon: NewspaperIcon, tone: "d" },
  {
    to: "/newsroom/publication",
    key: "publication",
    icon: Globe02Icon,
    tone: "e",
  },
  {
    to: "/newsroom/templates",
    key: "templates",
    icon: DashboardSquare01Icon,
    tone: "c",
  },
] as const

export interface StoryRow {
  id: string
  title: string
  lead: string
  status: DeepDiveStatus
  template: string | null
  cover: { url?: string }
  created_at: string
}

export function Shell({
  stories,
  children,
}: {
  stories: StoryRow[]
  children: React.ReactNode
}) {
  const t = useT(messages)
  const navigate = useNavigate()
  const { locale } = useLocale()
  const balance = useBalance()
  const [rail, setRail] = React.useState(false)
  return (
    <div className="nr nr-shell" data-rail={rail || null}>
      <aside className="nr-side">
        <div className="nr-brand">
          <Link to="/newsroom" className="nr-switch">
            <Mark />
            <span>Newsroom</span>
          </Link>
          <button
            type="button"
            className="nr-square"
            aria-label={t("nav.collapse")}
            aria-pressed={rail}
            onClick={() => setRail(!rail)}
          >
            <HugeiconsIcon icon={SidebarLeft01Icon} size={16} strokeWidth={2} />
          </button>
        </div>
        <nav className="nr-nav">
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
        <div className="nr-recent">
          <h2>{t("nav.recent")}</h2>
          <button
            type="button"
            className="nr-new"
            onClick={() => navigate("/newsroom")}
          >
            <i>
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
            </i>
            <span>{t("nav.new")}</span>
          </button>
          {stories.slice(0, 14).map((s) => (
            <NavLink
              key={s.id}
              to={`/newsroom/${s.id}`}
              className="nr-item"
              title={s.title || s.lead}
            >
              <b data-status={s.status} />
              <span>{s.title || s.lead || t("untitled")}</span>
            </NavLink>
          ))}
        </div>
        <footer className="nr-side-foot">
          <CreditsPill>{(balance ?? 0).toLocaleString(locale)}</CreditsPill>
          <AccountMenu />
        </footer>
      </aside>
      <main className="nr-main">{children}</main>
    </div>
  )
}
