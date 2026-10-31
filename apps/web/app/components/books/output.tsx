import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download01Icon } from "@hugeicons/core-free-icons"
import { Radio, RadioGroup } from "react-aria-components"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"

import { useLocale } from "@/i18n/core"
import {
  bookCall,
  formatBytes,
  isActive,
  type JobView,
} from "@/lib/books/client"
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/books/model"

import { ErrorNote, Panel, PanelTitle, useAction, useBookT } from "./shared"

export function OutputPanel({
  bookId,
  jobs,
  refresh,
}: {
  bookId: string
  jobs: JobView[]
  refresh: () => Promise<unknown>
}) {
  const t = useBookT()
  const { locale } = useLocale()
  const [format, setFormat] = React.useState<ExportFormat>("epub")
  const [bilingual, setBilingual] = React.useState(false)
  const build = useAction()
  const fetchFile = useAction()
  const files = jobs.filter((j) => j.kind === "export")
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return (
    <div className="@container">
      <div className="grid items-start gap-4 @3xl:grid-cols-2">
        <Panel className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("output.intro")}</p>
          <RadioGroup
            aria-label={t("output.format")}
            value={format}
            onChange={(v) => setFormat(v as ExportFormat)}
            className="grid gap-2 @md:grid-cols-2"
          >
            {EXPORT_FORMATS.map((f) => (
              <Radio
                key={f}
                value={f}
                className={({ isSelected, isFocusVisible }) =>
                  cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-xl p-3 ring-1 transition-colors duration-150 outline-none",
                    isSelected
                      ? "bg-brand/10 ring-brand"
                      : "ring-foreground/10 hover:bg-foreground/[0.03]",
                    isFocusVisible && "ring-2 ring-ring"
                  )
                }
              >
                <span className="text-sm font-medium">
                  {t(`output.formats.${f}`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`output.hints.${f}`)}
                </span>
              </Radio>
            ))}
          </RadioGroup>
          <div className="flex items-start gap-3">
            <Switch
              isSelected={bilingual}
              onChange={setBilingual}
              aria-label={t("output.bilingual")}
              className="mt-0.5"
            />
            <p className="min-w-0 text-sm">
              {t("output.bilingual")}
              <span className="block text-xs text-muted-foreground">
                {t("output.bilingualText")}
              </span>
            </p>
          </div>
          <Button
            className="self-end bg-white text-black hover:bg-white/90"
            isDisabled={build.busy}
            onPress={() =>
              build
                .run(() =>
                  bookCall("export", { id: bookId, format, bilingual })
                )
                .then(refresh)
            }
          >
            {t("output.build", { format: t(`output.formats.${format}`) })}
          </Button>
          <ErrorNote code={build.error} />
        </Panel>
        <Panel className="flex flex-col gap-3">
          <PanelTitle>{t("output.files")}</PanelTitle>
          {files.length ? (
            <ul className="flex flex-col divide-y divide-foreground/5">
              {files.map((job) => {
                const name = job.params.format as ExportFormat
                return (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {t(`output.formats.${name}`)}
                        {job.params.bilingual && ` · ${t("output.bilingual")}`}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {date.format(new Date(job.created_at))}
                        {job.result?.size !== undefined &&
                          ` · ${formatBytes(job.result.size, locale)}`}
                      </p>
                      {!!job.result?.untranslated && (
                        <p className="text-xs text-pink-300">
                          {t("output.untranslated", {
                            count: job.result.untranslated,
                          })}
                        </p>
                      )}
                      {job.status === "failed" && (
                        <p className="text-xs text-pink-300">
                          {t("output.failed")}
                        </p>
                      )}
                    </div>
                    {isActive(job) ? (
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner />
                        {t("output.building")}
                      </span>
                    ) : (
                      job.status === "succeeded" && (
                        <Button
                          size="sm"
                          variant="outline"
                          isDisabled={fetchFile.busy}
                          onPress={() =>
                            fetchFile.run(async () => {
                              const { url } = await bookCall<{ url: string }>(
                                "download",
                                { id: bookId, job: job.id }
                              )
                              window.location.assign(url)
                            })
                          }
                        >
                          {t("output.download")}
                          <HugeiconsIcon
                            icon={Download01Icon}
                            strokeWidth={2}
                            data-icon="inline-end"
                          />
                        </Button>
                      )
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("output.none")}</p>
          )}
          <ErrorNote code={fetchFile.error} />
        </Panel>
      </div>
    </div>
  )
}
