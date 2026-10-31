import * as React from "react"
import { Link, data, useNavigate } from "react-router"
import { cn } from "cn"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { Failure, Slant, Thumb } from "@/components/studio/ui"
import { useT } from "@/i18n/core"
import type { StudioBoardRow } from "@/lib/database"
import { PRIVATE } from "@/lib/seo"
import { useStudioCall } from "@/lib/studio/client"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio.board"
import { messages } from "./studio.messages"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const { data: row } = await supabase
    .from("comic_studio_boards")
    .select("*")
    .eq("id", params.id)
    .maybeSingle()
  if (!row) throw data(null, { status: 404 })
  return { row: row as StudioBoardRow }
}

const sourceLink = (r: StudioBoardRow) =>
  r.source.kind === "ad"
    ? r.source.ad.url
    : r.source.kind === "video"
      ? r.source.video.url
      : r.source.product.url

const sourceImage = (r: StudioBoardRow) =>
  r.source.kind === "ad"
    ? r.source.ad.image
    : r.source.kind === "video"
      ? r.source.video.thumbnail
      : r.source.product.image

export default function StudioBoard({ loaderData }: Route.ComponentProps) {
  const { row } = loaderData
  const { board } = row
  const t = useT(messages)
  const navigate = useNavigate()
  const { busy, error, call } = useStudioCall()
  const [copied, setCopied] = React.useState(false)

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-3xl min-w-0 flex-col gap-2">
          <Slant className="self-start bg-brand text-brand-foreground">
            {t(`kinds.${row.kind}`)}
          </Slant>
          <h1 className="studio-title text-4xl">{board.hook}</h1>
          <p className="text-sm text-muted-foreground">{board.angle}</p>
        </div>
        {row.project_id ? (
          <Link
            to={`/p/${row.project_id}`}
            className={cn(
              buttonVariants(),
              "bg-white text-black hover:bg-white/90"
            )}
          >
            {t("board.open")}
          </Link>
        ) : (
          <Button
            isDisabled={busy !== null}
            className="bg-white text-black hover:bg-white/90"
            onPress={async () => {
              const r = await call<{ project: string }>("comic", {
                intent: "comic",
                id: row.id,
              })
              if (r) navigate(`/p/${r.project}`)
            }}
          >
            {busy && <Spinner />}
            {t("board.comic", { n: board.scenes.length })}
          </Button>
        )}
      </header>
      <Failure code={error} />

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {board.scenes.map((s, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-2xl border p-4">
            <span className="studio-title text-3xl text-brand-ink tabular-nums">
              {i + 1}
            </span>
            <p className="text-sm">{s.scene}</p>
            {s.caption && (
              <p className="mt-auto rounded-lg bg-foreground/5 px-2 py-1.5 text-sm font-medium">
                {s.caption}
              </p>
            )}
          </li>
        ))}
      </ol>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border p-4">
          <h2 className="font-medium">{t("board.why")}</h2>
          <ul className="mt-2 flex list-inside list-disc flex-col gap-1 text-sm text-muted-foreground">
            {board.whyItWorks.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3 border-t pt-3">
            <Thumb src={sourceImage(row)} className="size-10" />
            <a
              href={sourceLink(row)}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-2 text-sm underline underline-offset-2"
            >
              {row.title}
            </a>
          </div>
        </section>
        <section className="flex flex-col gap-2 rounded-2xl border p-4">
          <h2 className="font-medium">{t("board.post")}</h2>
          <p className="text-sm whitespace-pre-wrap">{board.postText}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-auto self-start"
            onPress={async () => {
              await navigator.clipboard.writeText(board.postText)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? t("board.copied") : t("board.copy")}
          </Button>
        </section>
      </div>
    </>
  )
}
