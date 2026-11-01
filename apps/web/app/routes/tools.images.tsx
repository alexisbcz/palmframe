import * as React from "react"
import { data } from "react-router"
import { cn } from "cn"

import { Badge } from "@workspace/ui/components/badge"

import {
  FileDrop,
  TaskStatus,
  ToolPage,
  useObjectUrls,
  useTask,
} from "@/components/tools/shared"
import { messages } from "@/components/tools/tools.messages"
import { useT } from "@/i18n/core"
import { requireTool } from "@/lib/tools.server"

import type { Route } from "./+types/tools.images"

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireTool(request, "images")
  return data(null, { headers })
}

type Checked = { file: File; score: number; flagged: boolean }

export default function Images() {
  const t = useT(messages)
  const task = useTask()
  const [checked, setChecked] = React.useState<Checked[]>([])
  const files = React.useMemo(() => checked.map((c) => c.file), [checked])
  const urls = useObjectUrls(files)
  const flagged = checked.filter((c) => c.flagged).length

  const check = (picked: File[]) =>
    task.run(async () => {
      setChecked([])
      const { loadModerator } = await import("@/lib/tools/models.client")
      const moderator = await loadModerator(task.download)
      const done: Checked[] = []
      for (const [i, file] of picked.entries()) {
        task.work(i / picked.length)
        const { score, isNSFW } = await moderator.analyze(file)
        done.push({ file, score, flagged: isNSFW })
      }
      setChecked(done.sort((a, b) => b.score - a.score))
    })

  return (
    <ToolPage id="images">
      <FileDrop
        accept="image/*"
        multiple
        disabled={task.busy}
        onFiles={(picked) => void check(picked)}
      />
      <TaskStatus task={task} />
      {checked.length > 0 && (
        <section className="flex flex-col gap-3">
          <p aria-live="polite" className="text-sm font-medium">
            {flagged
              ? t("images.summary", { count: checked.length, flagged })
              : t("images.clear")}
          </p>
          <p className="text-sm text-muted-foreground">{t("images.note")}</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {checked.map((c, i) => (
              <li key={`${c.file.name}-${i}`} className="flex flex-col gap-1.5">
                <div className="overflow-hidden rounded-md bg-muted">
                  {urls[i] && (
                    <img
                      src={urls[i]}
                      alt={c.file.name}
                      className={cn(
                        "aspect-square w-full object-cover",
                        c.flagged && "blur-xl"
                      )}
                    />
                  )}
                </div>
                <p className="truncate text-xs">{c.file.name}</p>
                <div className="flex items-center gap-2">
                  {c.flagged && (
                    <Badge variant="destructive">{t("images.flagged")}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("images.score", { score: c.score.toFixed(2) })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ToolPage>
  )
}
