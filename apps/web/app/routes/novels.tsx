import * as React from "react"
import { Link, data, useNavigate } from "react-router"
import { cn } from "cn"

import { useT } from "@/i18n/core"
import { Dial, FocusRing, Key, Knob, Plate } from "@/components/novel/hardware"
import { messages } from "@/components/novel/novel.messages"
import "@/components/novel/novel.css"
import "@/components/novel/player.css"
import {
  ApiError,
  loadDraft,
  saveDraft,
  writeRequest,
} from "@/lib/novel/client"
import { DEMO_SLUG, demoNovel } from "@/lib/novel/demo"
import { emptyNovel, type Novel } from "@/lib/novel/model"
import { fromOutline } from "@/lib/novel/outline"
import type { Outline } from "@/lib/novel/write.server"
import { seo } from "@/lib/seo"
import { useLocale } from "@/i18n/core"
import { useSupabase } from "@/lib/supabase.browser"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/novels"

export const meta: Route.MetaFunction = () =>
  seo({
    title: "The Stage: make visual novels",
    description:
      "Write, stage, score and publish branching visual novels on a workbench of real controls. Export to Ren'Py.",
    path: "/novels",
  })

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  const { data: novels } = viewer
    ? await supabase
        .from("comic_novels")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
    : { data: [] }
  return data({ novels: novels ?? [], signedIn: !!viewer }, { headers })
}

const BOOKS = ["#5e2d26", "#2d4a4e", "#3f3560", "#6a4a1e", "#2e4630", "#4c2740"]
const GENRES = [
  "romance",
  "mystery",
  "horror",
  "fantasy",
  "scifi",
  "slice",
  "drama",
  "comedy",
] as const
const TONES = ["tender", "wry", "bleak", "dreamy", "tense"] as const

export default function Novels({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const supabase = useSupabase()
  const { novels, signedIn } = loaderData
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [premise, setPremise] = React.useState("")
  const [genre, setGenre] = React.useState<(typeof GENRES)[number]>("mystery")
  const [tone, setTone] = React.useState<(typeof TONES)[number]>("tender")
  const [length, setLength] = React.useState(8)
  const [hasDraft, setHasDraft] = React.useState(false)

  React.useEffect(() => {
    if (!signedIn)
      loadDraft()
        .then((d) => setHasDraft(!!d))
        .catch(() => {})
  }, [signedIn])

  const create = async (novel: Novel) => {
    if (!signedIn) {
      await saveDraft(novel)
      navigate("/novels/draft")
      return
    }
    const { data: row, error: failed } = await supabase
      .from("comic_novels")
      .insert({ title: novel.title.slice(0, 120), data: novel })
      .select("id")
      .single()
    if (failed) throw failed
    navigate(`/novels/${row.id}`)
  }
  const run = async (make: () => Promise<Novel>) => {
    setBusy(true)
    setError(null)
    try {
      await create(await make())
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : t("errors.failed")
      )
      setBusy(false)
    }
  }
  const generate = () =>
    run(async () =>
      fromOutline(
        await writeRequest<Outline>({
          mode: "outline",
          premise,
          genre,
          tone,
          length,
          language: locale,
        }),
        locale,
        Math.floor(Math.random() * 2 ** 30)
      )
    )
  const remove = async (id: string) => {
    if (!window.confirm(t("shelf.confirmDelete"))) return
    await supabase.from("comic_novels").delete().eq("id", id)
    navigate(".", { replace: true })
  }

  return (
    <div className="nv nv-bench nv-scroll fixed inset-0 overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="nv-title text-5xl text-[#ece4d4] md:text-7xl">
              {t("shelf.title")}
            </h1>
            <p className="mt-2 max-w-xl text-[#b5a994]">
              {t("shelf.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/projects" className="nv-key">
              {t("shelf.comics")}
            </Link>
            <Link to={`/vn/${DEMO_SLUG}`} className="nv-key" data-tone="fire">
              {t("shelf.playDemo")}
            </Link>
          </div>
        </header>

        <section aria-label={t("shelf.yours")}>
          <div className="grid grid-cols-2 items-end gap-3 px-3 sm:grid-cols-3 md:grid-cols-5">
            {novels.map((n, i) => (
              <div
                key={n.id}
                className="nv-spine"
                style={
                  { "--book": BOOKS[i % BOOKS.length] } as React.CSSProperties
                }
              >
                <Link
                  to={`/novels/${n.id}`}
                  className="nv-title text-2xl leading-[1.05] after:absolute after:inset-0"
                >
                  {n.title || t("untitled")}
                </Link>
                <button
                  type="button"
                  aria-label={t("shelf.delete", {
                    name: n.title || t("untitled"),
                  })}
                  className="relative z-10 w-fit cursor-pointer text-xs opacity-60 hover:opacity-100"
                  onClick={() => void remove(n.id)}
                >
                  {t("shelf.deleteShort")}
                </button>
              </div>
            ))}
            {hasDraft ? (
              <div
                className="nv-spine"
                style={{ "--book": "#4a4239" } as React.CSSProperties}
              >
                <Link
                  to="/novels/draft"
                  className="nv-title text-2xl leading-[1.05] after:absolute after:inset-0"
                >
                  {t("shelf.draft")}
                </Link>
              </div>
            ) : null}
            <button
              type="button"
              disabled={busy}
              className={cn(
                "nv-spine cursor-pointer border-2 border-dashed border-[#7f7566] text-start",
                "!bg-transparent !bg-none"
              )}
              onClick={() => void run(async () => emptyNovel(""))}
            >
              <span className="nv-title text-2xl leading-[1.05]">
                {t("shelf.blank")}
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              className="nv-spine cursor-pointer text-start"
              style={{ "--book": "#1f3a4a" } as React.CSSProperties}
              onClick={() =>
                void run(async () => ({
                  ...demoNovel(),
                  title: t("shelf.sampleCopy"),
                }))
              }
            >
              <span className="nv-title text-2xl leading-[1.05]">
                {t("shelf.sample")}
              </span>
              <span className="text-xs opacity-75">
                {t("shelf.sampleHint")}
              </span>
            </button>
          </div>
          <div className="nv-shelf-board" />
        </section>

        <Plate
          title={t("shelf.engine")}
          bodyClassName="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
        >
          <div className="nv-paper rounded-[2px] p-3">
            <label className="grid gap-1">
              <span className="text-xs font-bold uppercase">
                {t("shelf.premise")}
              </span>
              <textarea
                className="min-h-28 w-full resize-y bg-transparent text-[16px] leading-[28px] outline-none placeholder:text-[#a8987e]"
                placeholder={t("shelf.premisePlaceholder")}
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
              />
            </label>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Dial
              label={t("shelf.genre")}
              size={190}
              value={genre}
              options={GENRES.map((g) => ({
                value: g,
                label: t(`shelf.genres.${g}`),
              }))}
              onChange={setGenre}
            />
          </div>
          <div className="grid w-full gap-3 lg:w-56">
            <div className="grid gap-1">
              <span className="nv-engraved">{t("shelf.tone")}</span>
              <FocusRing
                label={t("shelf.tone")}
                value={tone}
                options={TONES.map((v) => ({
                  value: v,
                  label: t(`shelf.tones.${v}`),
                }))}
                onChange={setTone}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Knob
                label={t("shelf.length")}
                size={60}
                value={length}
                min={3}
                max={24}
                step={1}
                format={(v) => t("shelf.scenes", { count: v })}
                onChange={setLength}
              />
              <Key
                tone="fire"
                disabled={busy || !premise.trim()}
                onClick={() => void generate()}
              >
                {busy ? t("shelf.planning") : t("shelf.plan")}
              </Key>
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-[#ffb5ad] lg:col-span-3">
              {error}
            </p>
          ) : null}
          {!signedIn ? (
            <p className="text-sm text-[#b5a994] lg:col-span-3">
              <Link
                to="/login?next=/novels"
                className="underline underline-offset-4"
              >
                {t("shelf.signIn")}
              </Link>
            </p>
          ) : null}
        </Plate>
      </div>
    </div>
  )
}
