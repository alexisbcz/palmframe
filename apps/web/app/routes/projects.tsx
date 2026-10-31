import * as React from "react"
import {
  Form,
  Link,
  data,
  redirect,
  useNavigate,
  useNavigation,
  useRevalidator,
  useSubmit,
} from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Delete02Icon,
  LibraryIcon,
  MoreHorizontalIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Spinner } from "@workspace/ui/components/spinner"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { AccountMenu } from "@/components/account/account-menu"
import { messages } from "@/components/account/account.messages"
import { Logo } from "@/components/auth/auth-ui"
import {
  createDefaultProject,
  toProject,
} from "@/components/comic-canvas/model"
import {
  ManageSeries,
  SeriesPicker,
  seriesRequest,
} from "@/components/comic-canvas/series-dialog"
import { messages as seriesMessages } from "@/components/comic-canvas/series.messages"
import { STORAGE_KEY } from "@/components/comic-canvas/use-editor"
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  useLocale,
  useT,
} from "@/i18n/core"
import { withStoredImages } from "@/lib/cloud"
import { COMICS_BUCKET } from "@/lib/database"
import { PRIVATE } from "@/lib/seo"
import { listSeries, type SeriesSummary } from "@/lib/series.server"
import { useSupabase } from "@/lib/supabase.browser"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/projects"

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0] as { loaderData?: { locale?: unknown } })
    ?.loaderData?.locale
  const title = translate(
    messages,
    isLocale(locale) ? locale : DEFAULT_LOCALE,
    "projects.meta"
  )
  return [{ title: `${title} · Palmframe` }, PRIVATE]
}

async function requireViewer(request: Request) {
  const session = await getViewer(request)
  if (!session.viewer)
    throw redirect("/login?next=/projects", { headers: session.headers })
  return { ...session, viewer: session.viewer }
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = await requireViewer(request)
  const { data: projects, error } = await supabase
    .from("comic_projects")
    .select("id, title, cover, slide_count, updated_at")
    .order("updated_at", { ascending: false })
  if (error) throw data(error.message, { status: 500, headers })
  return data({ projects, series: await listSeries(supabase) }, { headers })
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, viewer, headers } = await requireViewer(request)
  const form = await request.formData()
  const intent = form.get("intent")
  const id = String(form.get("id") ?? "")

  if (intent === "new" || intent === "duplicate") {
    let insert = { title: "", data: createDefaultProject() }
    if (intent === "duplicate") {
      const { data: source } = await supabase
        .from("comic_projects")
        .select("data")
        .eq("id", id)
        .single()
      const project = source && toProject(source.data)
      if (!project) throw data("Not found", { status: 404, headers })
      insert = {
        title: String(form.get("title") ?? "").slice(0, 120),
        data: project,
      }
    }
    const { data: row, error } = await supabase
      .from("comic_projects")
      .insert(insert)
      .select("id")
      .single()
    if (error) throw data(error.message, { status: 500, headers })
    throw redirect(intent === "new" ? `/p/${row.id}` : "/projects", { headers })
  }

  if (intent === "delete") {
    const { error } = await supabase
      .from("comic_projects")
      .delete()
      .eq("id", id)
    if (error) throw data(error.message, { status: 500, headers })
    // Images are shared by content hash between projects, so only the cover goes.
    await supabase.storage
      .from(COMICS_BUCKET)
      .remove([`${viewer.id}/covers/${id}.jpg`])
    return data({ ok: true }, { headers })
  }

  throw data("Unknown intent", { status: 400, headers })
}

function useRelativeTime() {
  const { locale } = useLocale()
  return React.useCallback(
    (iso: string) => {
      const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
      const seconds = (new Date(iso).getTime() - Date.now()) / 1000
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["year", 31536000],
        ["month", 2592000],
        ["week", 604800],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
      ]
      for (const [unit, size] of units)
        if (Math.abs(seconds) >= size)
          return format.format(Math.round(seconds / size), unit)
      return format.format(0, "minute")
    },
    [locale]
  )
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const navigation = useNavigation()
  const creating =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "new"
  const { projects, series } = loaderData
  const ts = useT(seriesMessages)
  const revalidator = useRevalidator()
  const [naming, setNaming] = React.useState(false)
  const byId = new Map(projects.map((p) => [p.id, p]))
  const grouped = new Set(series.flatMap((s) => s.carousels))
  const loose = projects.filter((p) => !grouped.has(p.id))
  const card = (p: (typeof projects)[number]) => (
    <ProjectCard
      key={p.id}
      project={p}
      inSeries={grouped.has(p.id)}
      onSeries={revalidator.revalidate}
    />
  )

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between gap-2 border-b px-2.5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link
            to="/catalog"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {t("account.catalog")}
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold">{t("projects.title")}</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onPress={() => setNaming(true)}>
              <HugeiconsIcon icon={LibraryIcon} strokeWidth={2} />
              {ts("newSeries")}
            </Button>
            <Form method="post">
              <Button
                type="submit"
                name="intent"
                value="new"
                isDisabled={creating}
              >
                {creating ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                )}
                {t("projects.new")}
              </Button>
            </Form>
          </div>
        </div>
        <ImportLocal />
        {series.map((s) => (
          <SeriesSection
            key={s.id}
            series={s}
            onChanged={revalidator.revalidate}
          >
            {s.carousels.flatMap((id) => {
              const p = byId.get(id)
              return p ? [card(p)] : []
            })}
          </SeriesSection>
        ))}
        {loose.length > 0 && series.length > 0 && (
          <h2 className="font-semibold">{ts("otherCarousels")}</h2>
        )}
        {loose.length ? (
          <ul className={GRID}>{loose.map(card)}</ul>
        ) : series.length ? null : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="font-medium">{t("projects.empty")}</p>
            <p className="max-w-sm text-sm text-balance text-muted-foreground">
              {t("projects.emptyHint")}
            </p>
            <Form method="post" className="mt-3">
              <Button
                type="submit"
                name="intent"
                value="new"
                isDisabled={creating}
              >
                {creating ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                )}
                {t("projects.new")}
              </Button>
            </Form>
          </div>
        )}
      </main>
      {naming && (
        <SeriesPicker
          onDone={() => {
            setNaming(false)
            void revalidator.revalidate()
          }}
          onClose={() => setNaming(false)}
        />
      )}
    </div>
  )
}

const GRID =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"

// One series' carousels, in order, under its name.
function SeriesSection({
  series,
  onChanged,
  children,
}: {
  series: SeriesSummary
  onChanged: () => unknown
  children: React.ReactNode
}) {
  const t = useT(seriesMessages)
  const navigate = useNavigate()
  const [managing, setManaging] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const start = async () => {
    setBusy(true)
    try {
      const { id } = await seriesRequest({ intent: "carousel", id: series.id })
      navigate(`/p/${id}`)
    } catch {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label={series.title || t("untitled")}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="min-w-0 truncate font-semibold">
          {series.title || t("untitled")}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("carousels", { count: series.carousels.length })}
        </span>
        <div className="ms-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onPress={() => setManaging(true)}>
            {t("manage")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            isDisabled={busy}
            onPress={() => void start()}
          >
            {busy ? (
              <Spinner />
            ) : (
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            )}
            {t("newCarousel")}
          </Button>
        </div>
      </div>
      {series.carousels.length ? (
        <ul className={GRID}>{children}</ul>
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}
      {managing && (
        <ManageSeries
          series={series}
          onChanged={onChanged}
          onClose={() => setManaging(false)}
        />
      )}
    </section>
  )
}

function ProjectCard({
  project,
  inSeries,
  onSeries,
}: {
  project: Route.ComponentProps["loaderData"]["projects"][number]
  inSeries: boolean
  onSeries: () => unknown
}) {
  const t = useT(messages)
  const ago = useRelativeTime()
  const submit = useSubmit()
  const ts = useT(seriesMessages)
  const [confirming, setConfirming] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const title = project.title || t("sync.untitled")

  return (
    <li className="group relative flex flex-col gap-2">
      <Link
        to={`/p/${project.id}`}
        className="flex flex-col gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition-shadow group-hover:ring-foreground/25">
          {project.cover && (
            <img
              src={project.cover}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-contain"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{title}</span>
          <span
            className="truncate text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            {t("projects.edited", { when: ago(project.updated_at) })} ·{" "}
            {t("projects.slides", { count: project.slide_count })}
          </span>
        </div>
      </Link>
      <div className="absolute end-1.5 top-1.5 rounded-md bg-background/90 opacity-0 shadow-sm ring-1 ring-foreground/10 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100">
        <DropdownMenuTrigger>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("projects.actions", { title })}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </Button>
            <Tooltip>{t("projects.actions", { title })}</Tooltip>
          </TooltipTrigger>
          <DropdownMenu
            placement="bottom end"
            className="w-max min-w-40"
            onAction={(key) => {
              if (key === "duplicate")
                submit(
                  {
                    intent: "duplicate",
                    id: project.id,
                    title: t("projects.copyOf", { title }),
                  },
                  { method: "post" }
                )
              if (key === "add") setPicking(true)
              if (key === "leave")
                void seriesRequest({
                  intent: "leave",
                  projectId: project.id,
                }).then(onSeries)
              if (key === "delete") setConfirming(true)
            }}
          >
            <DropdownMenuItem id="duplicate">
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              {t("projects.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem id={inSeries ? "leave" : "add"}>
              <HugeiconsIcon icon={LibraryIcon} strokeWidth={2} />
              {ts(inSeries ? "leave" : "add")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem id="delete" variant="destructive">
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              {t("projects.delete")}
            </DropdownMenuItem>
          </DropdownMenu>
        </DropdownMenuTrigger>
      </div>
      {picking && (
        <SeriesPicker
          projectId={project.id}
          onDone={() => {
            setPicking(false)
            void onSeries()
          }}
          onClose={() => setPicking(false)}
        />
      )}
      <AlertDialog isOpen={confirming} onOpenChange={setConfirming}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("projects.deleteTitle", { title })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("projects.deleteBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("projects.cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            onPress={() => {
              setConfirming(false)
              submit({ intent: "delete", id: project.id }, { method: "post" })
            }}
          >
            {t("projects.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialog>
    </li>
  )
}

// The canvas someone made before signing in, kept in localStorage. Moved
// to the account from the browser, since its images can be large.
function ImportLocal() {
  const t = useT(messages)
  const supabase = useSupabase()
  const navigate = useNavigate()
  const [local, setLocal] = React.useState<ReturnType<typeof toProject>>(null)
  const [pending, setPending] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    try {
      setLocal(
        toProject(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))
      )
    } catch {}
  }, [])

  if (!local) return null

  const onImport = async () => {
    setPending(true)
    setFailed(false)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("Signed out")
      const project = await withStoredImages(supabase, auth.user.id, local)
      const { data: row, error } = await supabase
        .from("comic_projects")
        .insert({ data: project })
        .select("id")
        .single()
      if (error) throw error
      // Kept under another key rather than deleted, in case anything went wrong.
      try {
        localStorage.setItem(
          `${STORAGE_KEY}:imported`,
          localStorage.getItem(STORAGE_KEY)!
        )
        localStorage.removeItem(STORAGE_KEY)
      } catch {}
      navigate(`/p/${row.id}`)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/50 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium">{t("projects.importTitle")}</p>
        <p
          className={cn(
            "text-sm",
            failed ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {failed ? t("projects.importFailed") : t("projects.importBody")}
        </p>
      </div>
      <Button variant="outline" isDisabled={pending} onPress={onImport}>
        {pending && <Spinner />}
        {t("projects.import")}
      </Button>
    </div>
  )
}
