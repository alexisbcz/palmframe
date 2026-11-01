import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlugSocketIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"

import { NewEpisode } from "@/components/anime/new-episode"
import { openSettings } from "@/components/settings/settings-dialog"
import { useT } from "@/i18n/core"
import { ANIME_BUCKET } from "@/lib/anime/model"
import { fakeEnabled } from "@/lib/anime/provider.server"
import { payingConnection } from "@/lib/openrouter.server"
import { PRIVATE } from "@/lib/seo"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import { messages } from "./anime.messages"
import type { Route } from "./+types/studio.anime"

export const meta: Route.MetaFunction = () => [
  { title: "Anime · Palmframe" },
  PRIVATE,
]

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer } = await getViewer(request)
  const [{ data: episodes }, { data: projects }, connection] =
    await Promise.all([
      supabase
        .from("comic_anime_episodes")
        .select("id, title, status, final_path, updated_at")
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("comic_projects")
        .select("id, title, cover, slide_count")
        .order("updated_at", { ascending: false })
        .limit(50),
      viewer ? payingConnection(viewer.id) : null,
    ])
  const ids = (episodes ?? []).map((e) => e.id)
  const { data: shots } = ids.length
    ? await supabase
        .from("comic_anime_shots")
        .select("episode_id, position, panel_path, keyframe_path")
        .in("episode_id", ids)
        .order("position")
        .limit(2_000)
    : { data: [] }
  const first = new Map<string, string>()
  const counts = new Map<string, number>()
  for (const s of shots ?? []) {
    counts.set(s.episode_id, (counts.get(s.episode_id) ?? 0) + 1)
    if (!first.has(s.episode_id))
      first.set(s.episode_id, s.keyframe_path ?? s.panel_path)
  }
  const paths = [...first.values()]
  const { data: signed } = paths.length
    ? await supabaseAdmin()
        .storage.from(ANIME_BUCKET)
        .createSignedUrls(paths, 3_600)
    : { data: [] }
  const links = new Map(signed?.map((s) => [s.path, s.signedUrl]))
  return {
    connected: fakeEnabled() || !!connection,
    projects: projects ?? [],
    episodes: (episodes ?? []).map((e) => ({
      ...e,
      shots: counts.get(e.id) ?? 0,
      poster: links.get(first.get(e.id) ?? "") ?? null,
    })),
  }
}

export default function Anime({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { connected, episodes, projects } = loaderData
  const reel = episodes.filter((e) => e.poster).slice(0, 3)
  return (
    <div className="anime flex flex-col gap-8">
      <div className="flex flex-col items-center gap-6 pt-2 text-center">
        {reel.length > 0 && (
          <div aria-hidden className="flex items-center justify-center">
            {reel.map((e, i) => (
              <img
                key={e.id}
                src={e.poster!}
                alt=""
                className={
                  reel.length > 1 && i !== Math.floor(reel.length / 2)
                    ? "h-28 w-44 rounded-xl object-cover opacity-50 ring-1 ring-white/10 first:-me-6 last:-ms-6"
                    : "relative z-10 h-36 w-60 rounded-xl object-cover ring-1 ring-white/20"
                }
              />
            ))}
          </div>
        )}
        <div className="max-w-2xl">
          <h1 className="studio-title text-5xl">{t("title")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("intro")}</p>
        </div>
      </div>

      {!connected && (
        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-card p-4 ring-1 ring-white/5">
          <HugeiconsIcon
            icon={PlugSocketIcon}
            strokeWidth={2}
            className="size-5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("connect.title")}</p>
            <p className="text-sm text-muted-foreground">{t("connect.text")}</p>
          </div>
          <Button onPress={() => openSettings("openrouter")}>
            {t("connect.action")}
          </Button>
        </div>
      )}

      <NewEpisode connected={connected} projects={projects} />

      <section className="flex flex-col gap-3">
        <h2 className="studio-title text-2xl">{t("episodes")}</h2>
        {episodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((e) => (
              <Link
                key={e.id}
                to={`/studio/anime/${e.id}`}
                className="group overflow-hidden rounded-2xl bg-card ring-1 ring-white/5 outline-none hover:ring-white/20 focus-visible:ring-2 focus-visible:ring-[var(--anime-accent)]"
              >
                <div className="aspect-video bg-black">
                  {e.poster && (
                    <img
                      src={e.poster}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {e.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {t("shotCount", { count: e.shots })}
                  </span>
                </div>
                <p className="px-3 pb-3 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {t(`statuses.${e.final_path ? "final" : e.status}`)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
