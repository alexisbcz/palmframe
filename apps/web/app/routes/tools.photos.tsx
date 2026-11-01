import * as React from "react"
import { data } from "react-router"
import { zipSync } from "fflate"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import {
  FileDrop,
  TaskStatus,
  ToolPage,
  downloadBlob,
  useObjectUrls,
  useTask,
} from "@/components/tools/shared"
import { messages } from "@/components/tools/tools.messages"
import { useT } from "@/i18n/core"
import { requireTool } from "@/lib/tools.server"
import { PILES, duplicatesIn, pileFor, type Pile } from "@/lib/tools/photos"

import type { Route } from "./+types/tools.photos"

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireTool(request, "photos")
  return data(null, { headers })
}

type Sorted = {
  file: File
  pile: Pile
  duplicate: boolean
  keeper: number
  tags: string[]
}

const NON_LABELS = /^(keeper|photo|sharp|forgettable|other)$/

async function zipPhotos(files: File[]) {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {}
  for (const file of files)
    entries[file.name] = [
      new Uint8Array(await file.arrayBuffer()),
      { level: 0 },
    ]
  const zipped = zipSync(entries)
  return new Blob([zipped.slice()], { type: "application/zip" })
}

export default function Photos() {
  const t = useT(messages)
  const task = useTask()
  const [sorted, setSorted] = React.useState<Sorted[]>([])
  const [count, setCount] = React.useState({ done: 0, total: 0 })
  const files = React.useMemo(() => sorted.map((s) => s.file), [sorted])
  const urls = useObjectUrls(files)
  const keepers = sorted.filter((s) => s.pile === "keepers")

  const sort = (picked: File[]) =>
    task.run(async () => {
      setSorted([])
      const { loadEye } = await import("@/lib/tools/models.client")
      const { eye, Eye } = await loadEye(task.download)
      const analyses = []
      for (const [i, file] of picked.entries()) {
        setCount({ done: i, total: picked.length })
        task.work(i / picked.length)
        analyses.push(await eye.analyze(file))
      }
      setCount({ done: 0, total: 0 })
      const lost = duplicatesIn(Eye.duplicates(analyses))
      setSorted(
        analyses
          .map((photo, i) => ({
            file: picked[i]!,
            pile: pileFor(photo, lost.has(i)),
            duplicate: lost.has(i),
            keeper: photo.scores?.keeper ?? 0,
            tags: photo
              .tags()
              .map(String)
              .filter((tag) => !NON_LABELS.test(tag))
              .slice(0, 3),
          }))
          .sort((a, b) => b.keeper - a.keeper)
      )
    })

  return (
    <ToolPage id="photos">
      <FileDrop
        accept="image/*"
        multiple
        disabled={task.busy}
        onFiles={(picked) => void sort(picked)}
      />
      <TaskStatus task={task} />
      {count.total > 0 && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {t("photos.progress", count)}
        </p>
      )}
      {PILES.map((pile) => {
        const photos = sorted.flatMap((s, i) =>
          s.pile === pile ? [{ ...s, url: urls[i] }] : []
        )
        if (!photos.length) return null
        return (
          <section key={pile} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">
                {t(`photos.${pile}`)}{" "}
                <span className="text-muted-foreground tabular-nums">
                  {photos.length}
                </span>
              </h2>
              {pile === "keepers" && (
                <Button
                  variant="outline"
                  onPress={async () =>
                    downloadBlob(
                      await zipPhotos(keepers.map((k) => k.file)),
                      "keepers.zip"
                    )
                  }
                >
                  {t("photos.downloadKeepers")}
                </Button>
              )}
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((p, i) => (
                <li
                  key={`${p.file.name}-${i}`}
                  className="flex flex-col gap-1.5"
                >
                  {p.url && (
                    <img
                      src={p.url}
                      alt={p.file.name}
                      className="aspect-square w-full rounded-md object-cover"
                    />
                  )}
                  <p className="truncate text-xs">{p.file.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {p.duplicate && (
                      <Badge variant="outline">{t("photos.duplicate")}</Badge>
                    )}
                    {p.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag.replaceAll("_", " ")}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </ToolPage>
  )
}
