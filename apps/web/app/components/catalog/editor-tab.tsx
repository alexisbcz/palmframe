import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { LinkSquare02Icon, Search01Icon } from "@hugeicons/core-free-icons"

import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"

import type { ComicEditor } from "@/components/comic-canvas/use-editor"
import { useT } from "@/i18n/core"
import type { CatalogResult } from "@/lib/catalog.server"

import { applyAsset, type Applied } from "./apply"
import { SfxArt } from "./card"
import { messages } from "./catalog.messages"
import { catalogRequest } from "./client"
import {
  GROUPS,
  NO_FILTERS,
  writeFilters,
  type AssetGroup,
  type Asset,
} from "./model"

// The catalog inside the editor: click to add to the carousel or the
// selected panel. Adding is an ordinary edit, so undo takes it back.
export function CatalogTab({ editor }: { editor: ComicEditor }) {
  const t = useT(messages)
  const [q, setQ] = React.useState("")
  const [group, setGroup] = React.useState<AssetGroup | null>(null)
  const [assets, setAssets] = React.useState<Asset[] | null>(null)
  const [done, setDone] = React.useState<{ name: string; how: Applied } | null>(
    null
  )

  React.useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const params = writeFilters({ ...NO_FILTERS, q, group, limit: 60 })
      fetch(`/api/catalog?${params}`, { signal: controller.signal })
        .then((r) => r.json() as Promise<CatalogResult>)
        .then((json) => setAssets(json.assets))
        .catch(() => {})
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, group])

  const use = (asset: Asset) => {
    const how = applyAsset(editor, asset)
    setDone({ name: asset.name, how })
    if (how !== "needsCast" && how !== "needsPanel")
      catalogRequest({ intent: "use", ids: [asset.id] }).catch(() => {})
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t("search.label")}
          placeholder={t("tab.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ps-7"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(GROUPS) as AssetGroup[]).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            className={cn(
              "h-6 cursor-pointer rounded-full border px-2 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60",
              group === g &&
                "border-foreground bg-foreground text-background hover:bg-foreground/90"
            )}
            onClick={() => setGroup(group === g ? null : g)}
          >
            {t(`groups.${g}`)}
          </button>
        ))}
      </div>
      <p
        aria-live="polite"
        className={cn(
          "min-h-4 text-xs text-muted-foreground",
          (done?.how === "needsCast" || done?.how === "needsPanel") &&
            "text-amber-700 dark:text-amber-400"
        )}
      >
        {done ? t(`tab.done.${done.how}`, { name: done.name }) : t("tab.hint")}
      </p>
      {assets === null ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      ) : assets.length ? (
        <ul className="grid grid-cols-2 gap-2">
          {assets.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                title={a.description}
                className="group block w-full cursor-pointer text-start outline-none"
                onClick={() => use(a)}
              >
                <span className="[container-type:inline-size] block aspect-[3/4] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition-shadow group-hover:ring-foreground/40 group-focus-visible:ring-3 group-focus-visible:ring-ring/60">
                  {a.payload.type === "sfx" ? (
                    <SfxArt payload={a.payload} />
                  ) : (
                    a.image && (
                      <img
                        src={a.image}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    )
                  )}
                </span>
                <span className="mt-1 block truncate text-xs">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("empty.title")}
        </p>
      )}
      <a
        href="/catalog"
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {t("tab.browse")}
        <HugeiconsIcon
          icon={LinkSquare02Icon}
          strokeWidth={2}
          className="size-3"
        />
      </a>
    </div>
  )
}

// What `?assets=` asks for, applied once when the editor opens. The URL is
// cleaned first, so a reload can't apply it twice.
export function useAssetsFromUrl(editor: ComicEditor, onApplied: () => void) {
  const ran = React.useRef(false)
  React.useEffect(() => {
    if (ran.current) return
    ran.current = true
    const url = new URL(location.href)
    const ids = url.searchParams.get("assets")
    if (!ids) return
    url.searchParams.delete("assets")
    history.replaceState(history.state, "", url)
    fetch(`/api/catalog?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then(({ assets }: { assets: Asset[] }) => {
        for (const a of assets) applyAsset(editor, a)
        if (assets.length) onApplied()
        catalogRequest({ intent: "use", ids: assets.map((a) => a.id) }).catch(
          () => {}
        )
      })
      .catch(() => {})
  }, [editor, onApplied])
}
