import * as React from "react"
import { Link, data, redirect, useNavigate } from "react-router"

import { useT } from "@/i18n/core"
import { useLocale } from "@/i18n/core"
import "@/components/desk/desk.css"
import { messages } from "@/components/desk/desk.messages"
import { DeskScene, useLight } from "@/components/desk/view"
import { importFile } from "@/lib/desk/client"
import {
  CLOTHS,
  emptyManuscript,
  KINDS,
  totalWords,
  type Kind,
  type Manuscript,
} from "@/lib/desk/model"
import { sampleFor } from "@/lib/desk/samples"
import { seo } from "@/lib/seo"
import { useSupabase } from "@/lib/supabase.browser"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/desk"

export const meta: Route.MetaFunction = () =>
  seo({
    title: "The Desk: write novels, poems and screenplays",
    description:
      "A writing desk with style checks after Hemingway and Strunk, verse scansion, Fountain screenwriting, and export to PDF, EPUB, LaTeX and Final Draft.",
    path: "/desk",
  })

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect("/login?next=/desk", { headers })
  if (!viewer.labs.desk) throw redirect("/projects?settings=labs", { headers })
  const { data: works } = await supabase
    .from("comic_manuscripts")
    .select("id, kind, title, words, updated_at, cloth:data->>cloth")
    .order("updated_at", { ascending: false })
  return data({ works: works ?? [] }, { headers })
}

export default function Desk({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const supabase = useSupabase()
  const [light] = useLight()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const works = loaderData.works as {
    id: string
    kind: Kind
    title: string
    words: number
    updated_at: string
    cloth: keyof typeof CLOTHS | null
  }[]

  const open = async (m: Manuscript) => {
    setBusy(true)
    setError(null)
    const { data: row, error: failed } = await supabase
      .from("comic_manuscripts")
      .insert({
        kind: m.kind,
        title: m.title.slice(0, 200),
        words: totalWords(m),
        data: m,
      })
      .select("id")
      .single()
    if (failed) {
      setError(t("shelf.failed"))
      setBusy(false)
      return
    }
    navigate(`/desk/${row.id}`)
  }
  const start = (kind: Kind) => {
    const m = emptyManuscript(kind)
    if (locale === "fr") {
      m.language = "fr"
      m.styles = kind === "screenplay" ? [] : ["flaubert"]
    }
    void open(m)
  }
  const remove = async (id: string, name: string) => {
    if (!window.confirm(t("shelf.confirmDelete", { name }))) return
    await supabase.from("comic_manuscripts").delete().eq("id", id)
    navigate(".", { replace: true })
  }
  const sheets = React.useCallback(() => [], [])
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })

  return (
    <div className="dk fixed inset-0 overflow-y-auto" data-light={light}>
      <div className="fixed inset-0">
        <DeskScene light={light} sheets={sheets} layout="shelf" />
      </div>
      <div className="dk-shelf">
        <header className="dk-shelf-head">
          <Link to="/projects" className="dk-brass-tag">
            <span aria-hidden>←</span> {t("shelf.back")}
          </Link>
          <h1>{t("shelf.title")}</h1>
          <p>{t("shelf.subtitle")}</p>
        </header>
        <section aria-label={t("shelf.start")} className="dk-starts">
          {KINDS.map((k) => (
            <div key={k} className="dk-start" data-kind={k}>
              <button
                type="button"
                disabled={busy}
                className="dk-object"
                onClick={() => start(k)}
              >
                <span className="dk-object-art" aria-hidden />
                <b>{t(`kinds.${k}`)}</b>
                <small>{t(`kinds.${k}Hint`)}</small>
              </button>
              <div className="dk-start-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void open(sampleFor(k))}
                >
                  {t("shelf.sample")}
                </button>
                <label>
                  {t("shelf.import")}
                  <input
                    type="file"
                    className="sr-only"
                    accept={
                      k === "screenplay"
                        ? ".fountain,.spmd,.fdx,.txt"
                        : ".txt,.md"
                    }
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (f) void open(await importFile(f, k))
                      e.target.value = ""
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
        </section>
        {error ? (
          <p role="alert" className="dk-error text-center">
            {error}
          </p>
        ) : null}
        {works.length ? (
          <section aria-label={t("shelf.yours")} className="grid gap-4">
            <h2 className="dk-shelf-sub">{t("shelf.yours")}</h2>
            <div className="dk-books">
              {works.map((w) => {
                const name = w.title || t("untitled")
                return (
                  <div
                    key={w.id}
                    className="dk-cover"
                    data-light-cloth={w.cloth === "bone" || undefined}
                    style={
                      {
                        "--cloth": CLOTHS[w.cloth ?? "oxblood"],
                      } as React.CSSProperties
                    }
                  >
                    <Link
                      to={`/desk/${w.id}`}
                      className="after:absolute after:inset-0"
                    >
                      <b>{name}</b>
                    </Link>
                    <small>
                      {t(`kinds.${w.kind}`)} ·{" "}
                      {t("cards.words", { count: w.words })}
                    </small>
                    <small>{date.format(new Date(w.updated_at))}</small>
                    <button
                      type="button"
                      className="dk-cover-x"
                      aria-label={t("shelf.delete", { name })}
                      onClick={() => void remove(w.id, name)}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
