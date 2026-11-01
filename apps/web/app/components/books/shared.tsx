import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { useLocale, useT } from "@/i18n/core"
import { BookCallError } from "@/lib/books/client"
import {
  TAG_STYLES,
  parseInline,
  tagMap,
  type InlineNode,
} from "@/lib/books/inline"
import { LANGUAGES, isRtl, languageOf, type InlineTag } from "@/lib/books/model"
import { messages } from "@/routes/books.messages"

export { LabeledCheckbox } from "@/components/labeled-checkbox"

export const useBookT = () => useT(messages)

export function ErrorNote({ code }: { code: string | null }) {
  const t = useBookT()
  if (!code) return null
  const known = t(`errors.${code}` as never)
  return (
    <p
      role="alert"
      className="rounded-lg bg-pink-600/15 px-3 py-2 text-sm text-pink-300"
    >
      {known.startsWith("errors.") ? t("errors.failed") : known}
    </p>
  )
}

export const errorCode = (e: unknown) =>
  e instanceof BookCallError ? e.code : "failed"

// A button's work: busy while it runs, its failure kept for an ErrorNote.
export function useAction() {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const run = React.useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      return true
    } catch (e) {
      setError(errorCode(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, run, setError }
}

export function useNumber() {
  const { locale } = useLocale()
  return React.useCallback((n: number) => n.toLocaleString(locale), [locale])
}

export function Panel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("rounded-2xl bg-card p-4 md:p-5", className)}>
      {children}
    </section>
  )
}

export function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="studio-title text-xl">{children}</h2>
}

export function EmptyState({
  title,
  text,
  children,
}: {
  title: string
  text?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl bg-card p-8 text-center">
      <h2 className="studio-title text-xl">{title}</h2>
      {text && (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {text}
        </p>
      )}
      {children}
    </div>
  )
}

export function LanguagePair({
  source,
  target,
  className,
}: {
  source: string
  target: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground",
        className
      )}
    >
      {languageOf(source)?.native ?? source}
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="size-3 shrink-0 rtl:rotate-180"
      />
      {languageOf(target)?.native ?? target}
    </span>
  )
}

export const languageOptions = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.native,
}))

// A book's own markup, rendered as text: nothing from a file ever becomes HTML.
export function InlineText({
  text,
  tags,
}: {
  text: string
  tags: InlineTag[]
}) {
  const map = tagMap(tags)
  const render = (nodes: InlineNode[]): React.ReactNode =>
    nodes.map((node, i) => {
      if ("text" in node) return node.text
      const tag = map.get(node.id)
      if (tag?.type === "br") return <br key={i} />
      return (
        <span key={i} className={tag ? TAG_STYLES[tag.type] : undefined}>
          {render(node.children)}
        </span>
      )
    })
  return <>{render(parseInline(text))}</>
}

// The line of text in its resting state and in the editor share these, so a
// click lands on the same letter once the editor has taken over.
export const FIELD_TEXT =
  "px-2 py-1 font-serif text-base leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap md:text-[15px]"

export const textProps = (lang: string) => ({
  lang: lang === "nb" ? "no" : lang,
  dir: isRtl(lang) ? ("rtl" as const) : ("ltr" as const),
})

export function Stat({
  label,
  value,
  strong,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong && "text-base font-semibold text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  )
}
