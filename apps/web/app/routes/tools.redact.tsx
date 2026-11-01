import * as React from "react"
import { data } from "react-router"
import type { Redaction } from "@desert-ant-labs/redact"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import { LabeledCheckbox } from "@/components/labeled-checkbox"
import {
  CopyButton,
  TaskStatus,
  ToolPage,
  useTask,
} from "@/components/tools/shared"
import { messages } from "@/components/tools/tools.messages"
import { useT } from "@/i18n/core"
import { requireTool } from "@/lib/tools.server"

import type { Route } from "./+types/tools.redact"

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireTool(request, "redact")
  return data(null, { headers })
}

export default function Redact() {
  const t = useT(messages)
  const task = useTask()
  const [text, setText] = React.useState("")
  const [companies, setCompanies] = React.useState(false)
  const [result, setResult] = React.useState<Redaction | null>(null)
  const [reply, setReply] = React.useState("")

  const redact = () =>
    task.run(async () => {
      setResult(null)
      const { loadRedact } = await import("@/lib/tools/models.client")
      const { redact: model, DEFAULT_LABELS } = await loadRedact(task.download)
      task.work()
      setResult(
        await model.redaction(text, {
          labels: companies ? [...DEFAULT_LABELS, "ORG"] : DEFAULT_LABELS,
        })
      )
    })

  return (
    <ToolPage id="redact">
      <form
        className="flex max-w-2xl flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void redact()
        }}
      >
        <Textarea
          aria-label={t("redact.input")}
          placeholder={t("redact.input")}
          rows={8}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(null)
          }}
        />
        <LabeledCheckbox isSelected={companies} onChange={setCompanies}>
          {t("redact.companies")}
        </LabeledCheckbox>
        <Button
          type="submit"
          variant="outline"
          className="self-start"
          isDisabled={task.busy || !text.trim()}
        >
          {t("redact.action")}
        </Button>
      </form>
      <TaskStatus task={task} />
      {result && (
        <section className="flex max-w-2xl flex-col gap-3">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {result.items.length
              ? t("redact.found", { count: result.items.length })
              : t("redact.none")}
          </p>
          <Textarea
            aria-label={t("redact.output")}
            readOnly
            rows={8}
            value={result.redactedText}
          />
          <div>
            <CopyButton text={result.redactedText} />
          </div>
          {result.items.length > 0 && (
            <div className="mt-3 flex flex-col gap-3 border-t pt-4">
              <div>
                <h2 className="font-medium">{t("redact.restore")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("redact.restoreHint")}
                </p>
              </div>
              <Textarea
                aria-label={t("redact.restoreInput")}
                placeholder={t("redact.restoreInput")}
                rows={5}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              {reply.trim() && (
                <>
                  <p className="text-sm whitespace-pre-wrap">
                    {result.restore(reply)}
                  </p>
                  <div>
                    <CopyButton text={result.restore(reply)} />
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </ToolPage>
  )
}
