import * as React from "react"

import { useT } from "@/i18n/core"
import { ApiError, renpyZip, saveFile } from "@/lib/novel/client"
import { lint, type Issue } from "@/lib/novel/lint"
import { toNovel, wordCount } from "@/lib/novel/model"
import { slug } from "@/lib/novel/script"
import { useSupabase } from "@/lib/supabase.browser"

import { Key, Led, Plate, Readout } from "./hardware"
import { messages } from "./novel.messages"
import { useWork } from "./work"

const releaseSlug = (title: string) =>
  `${
    slug(title)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "novel"
  }-${Math.random().toString(36).slice(2, 7)}`

export function ReleaseRoom() {
  const t = useT(messages)
  const {
    novel,
    update,
    novelId,
    signedIn,
    setRoom,
    setScene,
    setStep,
    notify,
  } = useWork()
  const supabase = useSupabase()
  const issues = React.useMemo(() => lint(novel), [novel])
  const errors = issues.filter((i) => i.level === "error")
  const [release, setRelease] = React.useState<{
    slug: string
    plays: number
    published_at: string
  } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState<string | null>(null)
  const [origin, setOrigin] = React.useState("")

  React.useEffect(() => {
    setOrigin(window.location.origin)
    if (!novelId) return
    supabase
      .from("comic_novel_releases")
      .select("slug, plays, published_at")
      .eq("novel_id", novelId)
      .maybeSingle()
      .then(({ data }) => setRelease(data))
  }, [novelId, supabase])

  const open = (i: Issue) => {
    if (!i.scene) return
    setScene(i.scene)
    setStep(i.step ?? null)
    setRoom(i.step ? "stage" : "board")
  }

  const publish = async () => {
    if (!novelId) return
    setBusy(true)
    try {
      const row = {
        novel_id: novelId,
        slug: release?.slug ?? releaseSlug(novel.title),
        title: novel.title.slice(0, 120),
        synopsis: novel.synopsis.slice(0, 2000),
        cover: null,
        data: novel,
        published_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from("comic_novel_releases")
        .upsert(row, { onConflict: "novel_id" })
        .select("slug, plays, published_at")
        .single()
      if (error) throw error
      setRelease(data)
      notify(t("release.published"))
    } catch {
      notify(t("errors.failed"))
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    if (!novelId) return
    setBusy(true)
    const { error } = await supabase
      .from("comic_novel_releases")
      .delete()
      .eq("novel_id", novelId)
    setBusy(false)
    if (error) notify(t("errors.failed"))
    else setRelease(null)
  }

  const exportRenpy = async () => {
    setBusy(true)
    try {
      const zip = await renpyZip(novel, (done, total) =>
        setProgress(`${done}/${total}`)
      )
      saveFile(
        `${slug(novel.title) || "novel"}-renpy.zip`,
        zip,
        "application/zip"
      )
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("errors.exportFailed"))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const link = release ? `${origin}/vn/${release.slug}` : null
  const stats: [string, number][] = [
    [t("release.scenes"), novel.scenes.length],
    [t("release.words"), wordCount(novel)],
    [t("release.characters"), novel.characters.length],
    [t("release.sets"), novel.backdrops.length],
    [t("release.tracks"), novel.tracks.length],
    [t("release.endings"), novel.endings.length],
  ]

  return (
    <div className="nv-scroll grid h-full gap-2 overflow-y-auto p-2 lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
      <Plate
        title={t("release.preflight")}
        bodyClassName="nv-scroll overflow-y-auto p-3"
      >
        {issues.length ? (
          <ul className="grid gap-1.5">
            {issues.map((i, k) => (
              <li key={k}>
                <button
                  type="button"
                  className="nv-tray flex w-full cursor-pointer items-center gap-2.5 rounded p-2 text-start text-sm"
                  onClick={() => open(i)}
                >
                  <Led
                    on
                    color={i.level === "error" ? "var(--red)" : "var(--amber)"}
                  />
                  <span className="min-w-0 flex-1">
                    {t(`issues.${i.code}`, { name: i.name ?? "" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm">
            <Led on color="var(--green)" /> {t("release.clean")}
          </p>
        )}
      </Plate>
      <div className="nv-scroll grid min-h-0 content-start gap-2 overflow-y-auto">
        <Plate
          title={t("release.gauge")}
          bodyClassName="grid grid-cols-3 gap-3 p-3"
        >
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="grid justify-items-center gap-1 text-center"
            >
              <Readout>{value}</Readout>
              <span className="nv-engraved">{label}</span>
            </div>
          ))}
        </Plate>
        <Plate title={t("release.publish")} bodyClassName="grid gap-2 p-3">
          {!novelId ? (
            <p className="text-sm text-[#b5a994]">{t("release.signIn")}</p>
          ) : (
            <>
              {link ? (
                <>
                  <div className="flex">
                    <input
                      aria-label={t("release.link")}
                      readOnly
                      className="nv-field min-w-0 flex-1 !rounded-e-none"
                      value={link}
                    />
                    <Key
                      className="!rounded-s-none"
                      onClick={() => {
                        void navigator.clipboard?.writeText(link)
                        notify(t("release.copied"))
                      }}
                    >
                      {t("release.copy")}
                    </Key>
                  </div>
                  <p className="text-xs text-[#b5a994]">
                    {t("release.plays", { count: release!.plays })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#b5a994]">{t("release.notOut")}</p>
              )}
              <Key
                tone="fire"
                disabled={busy || errors.length > 0 || !signedIn}
                onClick={() => void publish()}
              >
                {release ? t("release.update") : t("release.goLive")}
              </Key>
              {errors.length ? (
                <p className="text-xs text-[#ffb5ad]">{t("release.blocked")}</p>
              ) : null}
              {release ? (
                <Key
                  tone="danger"
                  disabled={busy}
                  onClick={() => void withdraw()}
                >
                  {t("release.withdraw")}
                </Key>
              ) : null}
            </>
          )}
        </Plate>
        <Plate title={t("release.export")} bodyClassName="grid gap-2 p-3">
          <Key disabled={busy} onClick={() => void exportRenpy()}>
            {progress ? t("release.packing", { progress }) : t("release.renpy")}
          </Key>
          <p className="text-xs text-[#b5a994]">{t("release.renpyHelp")}</p>
          <Key
            onClick={() =>
              saveFile(
                `${slug(novel.title) || "novel"}.json`,
                JSON.stringify(novel),
                "application/json"
              )
            }
          >
            {t("release.backup")}
          </Key>
          <label className="nv-key">
            {t("release.restore")}
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  const next = toNovel(JSON.parse(await f.text()))
                  update((n) => void Object.assign(n, next))
                  notify(t("release.restored"))
                } catch {
                  notify(t("errors.badFile"))
                }
              }}
            />
          </label>
        </Plate>
      </div>
    </div>
  )
}
