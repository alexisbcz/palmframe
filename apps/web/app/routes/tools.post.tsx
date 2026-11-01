import * as React from "react"
import { data } from "react-router"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  CopyButton,
  TaskStatus,
  ToolPage,
  useTask,
} from "@/components/tools/shared"
import { messages } from "@/components/tools/tools.messages"
import { useLocale, useT } from "@/i18n/core"
import { requireTool } from "@/lib/tools.server"

import type { Route } from "./+types/tools.post"

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireTool(request, "post")
  return data(null, { headers })
}

type Reading = {
  language: string | null
  topics: string[]
  emoji: string[]
}

const TOPICS = 3
const EMOJI = 8

export default function Post() {
  const t = useT(messages)
  const { locale } = useLocale()
  const task = useTask()
  const [text, setText] = React.useState("")
  const [reading, setReading] = React.useState<Reading | null>(null)

  const look = () =>
    task.run(async () => {
      const { loadEmo, loadGist, loadTongue } =
        await import("@/lib/tools/models.client")
      const tongue = await loadTongue()
      const gist = await loadGist(task.download)
      const emo = await loadEmo(task.download)
      task.work()
      const detection = tongue.detect(text)
      const [topics, emoji] = await Promise.all([
        gist.classify(text),
        emo.suggestions(text, { limit: EMOJI }),
      ])
      setReading({
        language: detection.isTooCloseToCall ? null : detection.language,
        topics: topics.slice(0, TOPICS).map((topic) => topic.name),
        emoji: emoji.map((e) => e.emoji),
      })
    })

  const languageName =
    reading?.language &&
    new Intl.DisplayNames([locale], { type: "language" }).of(reading.language)

  return (
    <ToolPage id="post">
      <form
        className="flex max-w-2xl flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void look()
        }}
      >
        <Textarea
          aria-label={t("post.input")}
          placeholder={t("post.input")}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="outline"
            isDisabled={task.busy || !text.trim()}
          >
            {t("post.action")}
          </Button>
          {text.trim() && <CopyButton text={text} />}
        </div>
      </form>
      <TaskStatus task={task} />
      {reading && (
        <dl className="flex max-w-2xl flex-col gap-4">
          <div>
            <dt className="text-sm font-medium">{t("post.language")}</dt>
            <dd className="text-sm text-muted-foreground">
              {languageName || t("post.unknown")}
            </dd>
          </div>
          {reading.topics.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <dt className="text-sm font-medium">{t("post.topics")}</dt>
              <dd className="flex flex-wrap gap-1">
                {reading.topics.map((topic) => (
                  <Badge key={topic} variant="outline">
                    {topic}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
          {reading.emoji.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <dt className="text-sm font-medium">{t("post.emoji")}</dt>
              <dd className="flex flex-wrap gap-1">
                {reading.emoji.map((emoji) => (
                  <Button
                    key={emoji}
                    variant="outline"
                    size="icon"
                    aria-label={`${t("post.emoji")} ${emoji}`}
                    onPress={() => setText((v) => `${v.trimEnd()} ${emoji}`)}
                  >
                    {emoji}
                  </Button>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </ToolPage>
  )
}
