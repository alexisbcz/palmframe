import { Link } from "react-router"
import { cn } from "cn"

import { buttonVariants } from "@workspace/ui/components/button"

import { PageTitle, Slant } from "@/components/studio/ui"
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  useLocale,
  useT,
} from "@/i18n/core"
import type { StudioBoardRow } from "@/lib/database"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio.home"
import { messages } from "./studio.messages"

export const meta: Route.MetaFunction = ({ matches }) => {
  const root = matches[0] as { loaderData?: { locale?: unknown } } | undefined
  const locale = root?.loaderData?.locale
  return [
    {
      title: `${translate(messages, isLocale(locale) ? locale : DEFAULT_LOCALE, "brandName")} · Palmframe`,
    },
    PRIVATE,
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const { data } = await supabase
    .from("comic_studio_boards")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30)
  return { boards: (data ?? []) as StudioBoardRow[] }
}

export default function StudioHome({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-linear-to-r from-pink-800 via-pink-600 to-amber-500 p-5">
        <div className="max-w-2xl">
          <p className="studio-title text-2xl text-white">
            {t("home.bannerTitle")}
          </p>
          <p className="mt-1 text-sm text-white/85">{t("home.bannerText")}</p>
        </div>
        <Link
          to="/studio/ads"
          className={cn(
            buttonVariants(),
            "bg-white text-black hover:bg-white/90"
          )}
        >
          {t("home.bannerCta")}
        </Link>
      </section>

      <PageTitle title={t("home.title")} intro={t("home.intro")} />

      {loaderData.boards.length ? (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-start text-xs text-muted-foreground">
                <th className="px-4 py-3 text-start font-normal">
                  {t("home.colBoard")}
                </th>
                <th className="px-4 py-3 text-start font-normal">
                  {t("home.colFrom")}
                </th>
                <th className="px-4 py-3 text-start font-normal">
                  {t("home.colDate")}
                </th>
                <th className="px-4 py-3 text-start font-normal">
                  {t("home.colComic")}
                </th>
              </tr>
            </thead>
            <tbody>
              {loaderData.boards.map((b) => (
                <tr key={b.id} className="border-t hover:bg-foreground/5">
                  <td className="max-w-md px-4 py-3">
                    <Link
                      to={`/studio/boards/${b.id}`}
                      className="line-clamp-1 font-medium hover:underline"
                    >
                      {b.board.hook}
                    </Link>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {b.title}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {t(`kinds.${b.kind}`)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3">
                    {b.project_id ? (
                      <Slant className="bg-brand text-brand-foreground">
                        {t("home.made")}
                      </Slant>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed py-14 text-center">
          <p className="font-medium">{t("home.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("home.emptyText")}</p>
        </div>
      )}
    </>
  )
}
