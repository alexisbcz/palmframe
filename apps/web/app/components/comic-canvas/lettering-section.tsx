import * as React from "react"
import { Link } from "react-router"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { openSettings } from "@/components/settings/settings-dialog"
import { LOCALES, LOCALE_NAMES, useT, type Locale } from "@/i18n/core"
import { INSUFFICIENT_CREDITS, setCredits } from "@/lib/credits-store"

import { messages } from "./lettering.messages"
import {
  letteringLines,
  linesToTranslate,
  withEditedLine,
  withTranslations,
} from "./lettering"
import type { ComicEditor } from "./use-editor"

// The Export panel's language switch: pick a language, translate the bubbles
// into it, and fix any line by hand. The artwork is never touched.
export function LetteringSection({
  editor,
  language,
  onLanguage,
}: {
  editor: ComicEditor
  language: Locale | null
  onLanguage: (language: Locale | null) => void
}) {
  const t = useT(messages)
  const project = editor.project
  const [info, setInfo] = React.useState<{
    available: boolean
    cost: number
  } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch("/api/translate")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json && setInfo(json))
      .catch(() => {})
  }, [])

  const lines = language ? letteringLines(project, language) : []
  const pending = linesToTranslate(lines)
  const translated = lines.filter((l) => l.status !== "missing").length
  const stale = lines.filter((l) => l.status === "stale").length
  const fresh = lines.length > 0 && translated === lines.length && !stale

  const translate = async () => {
    if (!language || !pending.length) return
    const sent = pending.map(({ id, shape, text }) => ({ id, shape, text }))
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language,
          lines: sent,
          cast: (project.cast ?? []).map((c) => c.name),
        }),
      })
      const credits = res.headers.get("x-credits")
      if (credits !== null) setCredits(Number(credits))
      const json = await res.json().catch(() => null)
      if (!res.ok)
        throw new Error(
          json?.code === INSUFFICIENT_CREDITS
            ? INSUFFICIENT_CREDITS
            : (json?.error ?? `HTTP ${res.status}`)
        )
      editor.commitProject((p) =>
        withTranslations(p, language, sent, json.lines)
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{t("language")}</span>
        <NativeSelect
          className="w-full"
          value={language ?? ""}
          disabled={busy}
          onChange={(e) => {
            setError(null)
            onLanguage((e.target.value || null) as Locale | null)
          }}
        >
          <NativeSelectOption value="">{t("original")}</NativeSelectOption>
          {LOCALES.map((l) => (
            <NativeSelectOption key={l} value={l}>
              {LOCALE_NAMES[l]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>

      {language && !lines.length && (
        <p className="text-xs text-muted-foreground">{t("nothing")}</p>
      )}

      {language && lines.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {t("progress", { done: translated, total: lines.length })}
            {stale > 0 && ` · ${t("stale", { count: stale })}`}
          </p>
          {info?.available === false ? (
            <p className="text-xs text-muted-foreground">{t("unavailable")}</p>
          ) : (
            <Button
              variant="outline"
              isDisabled={busy || !pending.length}
              onPress={translate}
            >
              {busy && <Spinner data-icon="inline-start" />}
              {t(fresh ? "retranslate" : "translate")}
              {!!info?.cost && (
                <span className="text-muted-foreground tabular-nums">
                  {t("cost", { count: info.cost })}
                </span>
              )}
            </Button>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error === INSUFFICIENT_CREDITS ? (
                <>
                  {t("insufficient")}{" "}
                  <Link
                    to="/pricing"
                    className="font-medium underline underline-offset-2"
                    onClick={(e) => {
                      e.preventDefault()
                      openSettings("billing")
                    }}
                  >
                    {t("getMore")}
                  </Link>
                </>
              ) : (
                t("failed", { error })
              )}
            </p>
          )}
          <Collapsible>
            <CollapsibleTrigger className="text-xs">
              {t("editLines")}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="py-2 text-xs text-muted-foreground">
                {t("editHint")}
              </p>
              <ul className="flex flex-col gap-3">
                {lines.map((line) => (
                  <li key={line.id} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0">
                        {t("slide", { n: line.page + 1 })} · {line.text}
                      </span>
                      {line.translation?.edited && (
                        <Badge variant="secondary">{t("edited")}</Badge>
                      )}
                      {line.status === "stale" && (
                        <Badge variant="outline">{t("outdated")}</Badge>
                      )}
                    </span>
                    <Textarea
                      aria-label={t("lineLabel", { n: line.page + 1 })}
                      rows={2}
                      value={line.translation?.text ?? ""}
                      placeholder={t("untranslated")}
                      onChange={(e) => {
                        const text = e.target.value
                        editor.commitProject(
                          (p) => withEditedLine(p, language, line.id, text),
                          `translation:${language}:${line.id}`
                        )
                      }}
                    />
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  )
}
