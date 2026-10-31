import * as React from "react"
import { Link, useNavigate } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  BookOpen02Icon,
  Cancel01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"

import {
  ErrorNote,
  EmptyState,
  LabeledCheckbox,
  LanguagePair,
  errorCode,
  languageOptions,
  useBookT,
  useNumber,
} from "@/components/books/shared"
import { PageTitle } from "@/components/studio/ui"
import { useLocale } from "@/i18n/core"
import {
  ACCEPT,
  bookCall,
  fileError,
  formatBytes,
  uploadFile,
} from "@/lib/books/client"
import { MAX_BOOK_BYTES } from "@/lib/books/limits"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio.books"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const { data } = await supabase
    .from("book_projects")
    .select(
      "id, title, file_name, source_lang, target_lang, status, words, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100)
  return { books: data ?? [] }
}

const AUTO = "auto"

function Uploader() {
  const t = useBookT()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const input = React.useRef<HTMLInputElement>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [over, setOver] = React.useState(false)
  const [source, setSource] = React.useState(AUTO)
  const [target, setTarget] = React.useState<string>(
    locale === "en" ? "fr" : locale
  )
  const [rights, setRights] = React.useState(false)
  const [progress, setProgress] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const same = source === target
  const busy = progress !== null

  const choose = (next: File | undefined) => {
    if (!next) return
    const problem = fileError(next)
    setError(problem)
    setFile(problem ? null : next)
  }

  const start = async () => {
    if (!file || busy) return
    setError(null)
    setProgress(0)
    try {
      const prepared = await bookCall<{ id: string; upload_url: string }>(
        "prepare",
        {
          fileName: file.name,
          size: file.size,
          rights,
          targetLang: target,
          ...(source !== AUTO && { sourceLang: source }),
        }
      )
      await uploadFile(prepared.upload_url, file, setProgress)
      await bookCall("ingest", { id: prepared.id, detect: source === AUTO })
      navigate(`/studio/books/${prepared.id}`)
    } catch (e) {
      setError(errorCode(e))
      setProgress(null)
    }
  }

  return (
    <div className="relative">
      {/* The stack of pages a book sits on. */}
      <div
        aria-hidden
        className="absolute inset-x-3 -bottom-1.5 h-6 rounded-b-2xl bg-card/60"
      />
      <div
        aria-hidden
        className="absolute inset-x-6 -bottom-3 h-6 rounded-b-2xl bg-card/30"
      />
      <div className="relative rounded-2xl bg-card p-2">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            choose(e.dataTransfer.files[0])
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-foreground/15 px-4 py-8 text-center transition-colors duration-150 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
            over ? "border-brand bg-brand/10" : "hover:bg-foreground/[0.03]"
          )}
        >
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <HugeiconsIcon
            icon={file ? BookOpen02Icon : Upload01Icon}
            strokeWidth={1.5}
            className={cn(
              "size-7",
              file ? "text-brand" : "text-muted-foreground"
            )}
          />
          {file ? (
            <>
              <span className="mt-2 max-w-full truncate font-medium">
                {file.name}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatBytes(file.size, locale)}
              </span>
            </>
          ) : (
            <>
              <span className="mt-2 font-medium">{t("upload.drop")}</span>
              <span className="text-sm text-muted-foreground">
                {t("upload.browse")}
              </span>
              <span className="mt-2 text-xs text-muted-foreground">
                {t("upload.formats", {
                  size: formatBytes(MAX_BOOK_BYTES, locale),
                })}
              </span>
            </>
          )}
        </label>
        {file && (
          <div className="flex flex-col gap-3 p-3 pt-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                {t("upload.from")}
                <NativeSelect
                  className="w-full"
                  value={source}
                  disabled={busy}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <NativeSelectOption value={AUTO}>
                    {t("upload.detect")}
                  </NativeSelectOption>
                  {languageOptions.map((l) => (
                    <NativeSelectOption key={l.value} value={l.value}>
                      {l.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="mb-2 size-4 shrink-0 text-muted-foreground max-sm:hidden rtl:rotate-180"
              />
              <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                {t("upload.to")}
                <NativeSelect
                  className="w-full"
                  value={target}
                  disabled={busy}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {languageOptions.map((l) => (
                    <NativeSelectOption key={l.value} value={l.value}>
                      {l.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <LabeledCheckbox
              isSelected={rights}
              onChange={setRights}
              isDisabled={busy}
            >
              {t("upload.rights")}
            </LabeledCheckbox>
            {same && (
              <p className="text-sm text-pink-300">
                {t("upload.sameLanguage")}
              </p>
            )}
            {busy ? (
              <Progress
                value={Math.round((progress ?? 0) * 100)}
                aria-label={t("upload.reading")}
              >
                <span className="flex w-full items-center justify-between text-sm text-muted-foreground tabular-nums">
                  {progress! < 1
                    ? t("upload.uploading", {
                        percent: Math.round(progress! * 100),
                      })
                    : t("upload.reading")}
                  <Spinner />
                </span>
                <ProgressTrack>
                  <ProgressIndicator className="bg-brand" />
                </ProgressTrack>
              </Progress>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setFile(null)
                    if (input.current) input.current.value = ""
                  }}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  {t("upload.change")}
                </Button>
                <Button
                  isDisabled={!rights || same}
                  onPress={start}
                  className="bg-white text-black hover:bg-white/90"
                >
                  {t("upload.start")}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    data-icon="inline-end"
                    className="rtl:rotate-180"
                  />
                </Button>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="p-2">
            <ErrorNote code={error} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function StudioBooks({ loaderData }: Route.ComponentProps) {
  const t = useBookT()
  const n = useNumber()
  return (
    <>
      <PageTitle title={t("title")} intro={t("intro")} />
      <div className="max-w-2xl pb-3">
        <Uploader />
      </div>
      {loaderData.books.length ? (
        <ul className="flex flex-col gap-2">
          {loaderData.books.map((book) => (
            <li key={book.id}>
              <Link
                to={`/studio/books/${book.id}`}
                className="flex items-center gap-3 rounded-2xl bg-card p-3 transition-colors duration-150 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden
                  className="relative flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[3px] rounded-e-md bg-muted font-serif text-lg text-foreground/70 ring-1 ring-foreground/10"
                >
                  <span className="absolute inset-y-0 start-0 w-1 bg-foreground/15" />
                  {(book.title || book.file_name).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {book.title || book.file_name}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <LanguagePair
                      source={book.source_lang}
                      target={book.target_lang}
                    />
                    {book.words > 0 && (
                      <span className="text-xs tabular-nums">
                        {t("words", { count: book.words }).replace(
                          String(book.words),
                          n(book.words)
                        )}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground max-[400px]:hidden">
                  {t(`status.${book.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t("empty.title")} text={t("empty.text")} />
      )}
    </>
  )
}
