import * as React from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { SearchIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import {
  Failure,
  PageTitle,
  Slant,
  Thumb,
  useCompact,
} from "@/components/studio/ui"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import { PRIVATE } from "@/lib/seo"
import { useStudioCall } from "@/lib/studio/client"
import {
  type Platform,
  type Video,
  PLATFORMS,
  engagement,
} from "@/lib/studio/model"

import type { Route } from "./+types/studio.trends"
import { messages } from "./studio.messages"

export const meta: Route.MetaFunction = () => [PRIVATE]

const LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
}

// Reactions per hundred views worth pointing out.
const HOT = 8

export default function StudioTrends() {
  const t = useT(messages)
  const compact = useCompact()
  const navigate = useNavigate()
  const { busy, error, call } = useStudioCall()
  const [platform, setPlatform] = React.useState<Platform>("tiktok")
  const [query, setQuery] = React.useState("")
  const [videos, setVideos] = React.useState<Video[] | null>(null)

  return (
    <>
      <PageTitle title={t("trends.title")} intro={t("trends.intro")} />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setVideos(null)
          const r = await call<{ videos: Video[] }>("videos", {
            intent: "videos",
            platform,
            ...(query.trim() && { query }),
          })
          if (r) setVideos(r.videos)
        }}
      >
        <ToggleGroup
          variant="outline"
          spacing={0}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[platform]}
          onSelectionChange={(keys) => {
            const next = [...keys][0] as Platform | undefined
            if (next) setPlatform(next)
          }}
        >
          {PLATFORMS.map((p) => (
            <ToggleGroupItem
              key={p}
              id={p}
              className="data-selected:bg-foreground! data-selected:text-background!"
            >
              {LABELS[p]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Input
          value={query}
          required={platform === "tiktok"}
          minLength={2}
          aria-label={t("trends.search")}
          placeholder={
            platform === "tiktok" ? t("trends.search") : t("trends.optional")
          }
          onChange={(e) => setQuery(e.target.value)}
          className="w-80 max-w-full"
        />
        <Button
          type="submit"
          isDisabled={busy !== null}
          className="bg-white text-black hover:bg-white/90"
        >
          {busy ? (
            <Spinner />
          ) : (
            <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
          )}
          {t("trends.find", { cost: COSTS.studio_lookup })}
        </Button>
      </form>
      <Failure code={error} />

      {videos &&
        (videos.length ? (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {videos.map((v) => {
              const rate = engagement(v)
              return (
                <li key={`${v.platform}-${v.id}`}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/studio/teardown?url=${encodeURIComponent(v.url)}`
                      )
                    }
                    className="group flex w-full flex-col gap-2 rounded-xl text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="relative block">
                      <Thumb
                        src={v.thumbnail}
                        className="aspect-[4/5] w-full transition-opacity group-hover:opacity-80"
                      />
                      {rate !== null && rate >= HOT && (
                        <Slant className="absolute start-2 top-2">
                          {t("trends.hot")}
                        </Slant>
                      )}
                    </span>
                    <span className="line-clamp-2 text-sm">
                      {v.title || `@${v.author}`}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("trends.stats", {
                        views: compact(v.views),
                        rate: rate === null ? "—" : `${rate.toFixed(1)}%`,
                      })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("trends.none")}</p>
        ))}
    </>
  )
}
