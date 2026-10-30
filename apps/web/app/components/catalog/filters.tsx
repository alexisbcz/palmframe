import * as React from "react"
import { useSearchParams } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { Switch } from "@workspace/ui/components/switch"

import { useViewer } from "@/components/account/account-menu"
import { useT } from "@/i18n/core"
import type { CatalogResult } from "@/lib/catalog.server"

import { messages } from "./catalog.messages"
import {
  COLORS,
  GENRES,
  GROUPS,
  SOURCES,
  readFilters,
  writeFilters,
  type AssetGroup,
  type Filters,
} from "./model"
import { GROUP_ICONS, KIND_ICONS } from "./icons"

export function useFilters() {
  const [params, setParams] = useSearchParams()
  const filters = React.useMemo(() => readFilters(params), [params])
  const set = React.useCallback(
    (patch: Partial<Filters>) =>
      setParams(
        // Any change starts the list from the top again.
        writeFilters({ ...readFilters(params), limit: 40, ...patch }),
        { preventScrollReset: true, replace: true }
      ),
    [params, setParams]
  )
  return [filters, set] as const
}

function Row({
  active,
  count,
  icon,
  inset,
  children,
  onPress,
}: {
  active: boolean
  count?: number
  icon?: (typeof KIND_ICONS)[keyof typeof KIND_ICONS]
  inset?: boolean
  children: React.ReactNode
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={count === 0 && !active}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-start text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-muted font-medium text-foreground",
        inset && "ps-8"
      )}
      onClick={onPress}
    >
      {icon && (
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className="size-4 shrink-0"
        />
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </button>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
      {children}
    </h2>
  )
}

export function FilterRail({ result }: { result: CatalogResult }) {
  const t = useT(messages)
  const viewer = useViewer()
  const [f, set] = useFilters()
  const groups = Object.keys(GROUPS) as AssetGroup[]
  const total = Object.values(result.groups).reduce((a, b) => a + b, 0)

  return (
    <nav aria-label={t("filters.label")} className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <Row
          active={!f.group && !f.kind}
          count={total}
          onPress={() => set({ group: null, kind: null })}
        >
          {t("filters.everything")}
        </Row>
        {groups.map((group) => {
          const open =
            f.group === group || GROUPS[group].some((k) => k === f.kind)
          return (
            <div key={group} className="flex flex-col gap-0.5">
              <Row
                active={f.group === group && !f.kind}
                count={result.groups[group] ?? 0}
                icon={GROUP_ICONS[group]}
                onPress={() => set({ group, kind: null })}
              >
                {t(`groups.${group}`)}
              </Row>
              {open &&
                GROUPS[group].length > 1 &&
                GROUPS[group].map((kind) => (
                  <Row
                    key={kind}
                    inset
                    active={f.kind === kind}
                    count={result.kinds[kind] ?? 0}
                    onPress={() => set({ kind, group })}
                  >
                    {t(`kinds.${kind}`)}
                  </Row>
                ))}
            </div>
          )
        })}
      </div>

      <div>
        <Heading>{t("filters.genre")}</Heading>
        <div className="flex flex-wrap gap-1 px-1">
          {GENRES.map((g) => {
            const on = f.genres.includes(g)
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                disabled={!on && !result.genres[g]}
                className={cn(
                  "h-7 cursor-pointer rounded-full border px-2.5 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent",
                  on &&
                    "border-foreground bg-foreground text-background hover:bg-foreground/90"
                )}
                onClick={() =>
                  set({
                    genres: on
                      ? f.genres.filter((x) => x !== g)
                      : [...f.genres, g],
                  })
                }
              >
                {t(`genres.${g}`)}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Heading>{t("filters.color")}</Heading>
        <div className="flex flex-wrap gap-1.5 px-2">
          {COLORS.map((c) => {
            const on = f.color === c.id
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                aria-label={t(`colors.${c.id}`)}
                title={t(`colors.${c.id}`)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full ring-1 ring-foreground/15 transition-transform outline-none hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:hover:scale-100"
                style={{ backgroundColor: c.swatch }}
                onClick={() => set({ color: on ? null : c.id })}
              >
                {on && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={3}
                    className="size-3.5 text-white drop-shadow-sm"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Heading>{t("filters.source")}</Heading>
        <div className="flex flex-col gap-0.5">
          {SOURCES.filter((s) => viewer || (s !== "mine" && s !== "saved")).map(
            (source) => (
              <Row
                key={source}
                active={f.source === source}
                onPress={() => set({ source })}
              >
                {t(`sources.${source}`)}
              </Row>
            )
          )}
        </div>
      </div>

      <label className="flex cursor-pointer items-start justify-between gap-3 px-2">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">{t("filters.refs")}</span>
          <span className="text-xs text-muted-foreground">
            {t("filters.refsHint")}
          </span>
        </span>
        <Switch
          aria-label={t("filters.refs")}
          isSelected={f.refs}
          onChange={(refs) => set({ refs })}
        />
      </label>
    </nav>
  )
}
