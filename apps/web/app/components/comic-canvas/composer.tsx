import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  AtIcon,
  CropIcon,
  DashboardSpeed02Icon,
  MinusSignIcon,
  PlusSignIcon,
  Image02Icon,
  Settings02Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
  StopIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import { Avatar, CastRow } from "./cast"
import { messages } from "./composer.messages"
import { LookControls } from "./look"
import { messages as lookMessages } from "./look.messages"
import { AdvancedFields, TagBrowser, TakesGrid } from "./panel-tools"
import { DEFAULT_LOOK, type PanelLayer } from "./model"
import { roving } from "./roving"
import { SetupPanel } from "./setup-panel"
import { applySetup, readSetup, setDimension, useSavedSetups } from "./setups"
import { TagField } from "./tag-field"
import type { ComicEditor } from "./use-editor"
import { hasPrompt, renderSize, type Generator } from "./use-generator"

const QUALITY = [
  { id: "fast", steps: 6 },
  { id: "balanced", steps: 8 },
  { id: "best", steps: 12 },
] as const
const MAX_TAKES = 4

// Closes a floating piece on a click outside it or on Escape.
function useDismiss(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void
) {
  React.useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("pointerdown", down, true)
    document.addEventListener("keydown", key, true)
    return () => {
      document.removeEventListener("pointerdown", down, true)
      document.removeEventListener("keydown", key, true)
    }
  }, [ref, open, onClose])
}

function Chip({
  children,
  pressed,
  className,
  ...props
}: React.ComponentProps<"button"> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      data-roving
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-foreground/10 bg-background/70 px-2.5 text-sm font-medium transition-colors outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 dark:bg-foreground/5 dark:hover:bg-foreground/10 [&_svg]:size-4 [&_svg]:shrink-0",
        pressed && "border-foreground/30 bg-background dark:bg-foreground/15",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function ratio(w: number, h: number) {
  const common = [
    [1, 1],
    [4, 5],
    [5, 4],
    [3, 4],
    [4, 3],
    [2, 3],
    [3, 2],
    [9, 16],
    [16, 9],
    [1, 2],
    [2, 1],
  ]
  const r = w / h
  const [a, b] = common.reduce((best, c) =>
    Math.abs(c[0]! / c[1]! - r) < Math.abs(best[0]! / best[1]! - r) ? c : best
  )
  return Math.abs(a! / b! - r) < 0.04 ? `${a}:${b}` : r.toFixed(2)
}

// The director's bar under the canvas: what happens, who's in it, the shot
// setup, how many takes, and the big button.
export interface ComposerHandle {
  focus: () => void
}

export function Composer({
  ref,
  editor,
  generator,
}: {
  ref?: React.Ref<ComposerHandle>
  editor: ComicEditor
  generator: Generator
}) {
  const t = useT(messages)
  const tl = useT(lookMessages)
  const panel = editor.selected?.type === "panel" ? editor.selected : null
  const look = editor.project.look ?? DEFAULT_LOOK
  const [takes, setTakes] = React.useState(1)
  const [open, setOpen] = React.useState<
    "setup" | "cast" | "tags" | "advanced" | "takes" | null
  >(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  React.useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }))
  const close = React.useCallback(() => setOpen(null), [])
  const rootRef = React.useRef<HTMLDivElement>(null)
  useDismiss(rootRef, open !== null, close)
  const saved = useSavedSetups()

  const job = panel ? generator.jobs[panel.id] : undefined
  const anyBusy = Object.keys(generator.jobs).length > 0
  const prompted = editor.project.pages
    .flatMap((p) => p.layers)
    .filter((l) => l.type === "panel" && hasPrompt(l)).length
  const allTakes = Object.values(generator.takes).flat()
  const average = allTakes.length
    ? allTakes.reduce((n, x) => n + x.ms, 0) / allTakes.length / 1000
    : 13
  const setup = panel
    ? readSetup(panel, look)
    : { style: look.style, framing: null, angle: null, light: null }
  const quality =
    QUALITY.find((q) => q.steps === (panel?.steps ?? 8)) ?? QUALITY[1]
  const cast = editor.project.cast ?? []
  const inShot = panel?.cast ?? []
  const tags = panel?.tags ?? []

  const update = (patch: Partial<PanelLayer>, key?: string) =>
    panel && editor.update(panel.id, patch, key)

  const run = () => {
    if (job && panel) return generator.cancel(panel.id)
    if (panel) return void generator.generate(panel.id, takes)
    generator.generateAll()
  }

  // Everything but Setup is about one panel: close it when there is none.
  React.useEffect(() => {
    if (!panel) setOpen((o) => (o === "setup" ? o : null))
  }, [panel])

  return (
    <div
      ref={rootRef}
      data-slot="comic-composer"
      className="relative shrink-0 border-t bg-background px-3 py-2.5"
    >
      {open === "setup" && (
        <div className="absolute inset-x-3 bottom-full z-30 mx-auto mb-2 max-w-3xl">
          <SetupPanel
            setup={setup}
            saved={saved.setups}
            onStyle={(style) => editor.setLook({ style })}
            onDimension={(d, tag) =>
              update({ tags: setDimension(tags, d, tag) })
            }
            onApply={(s) => {
              update({ tags: applySetup(tags, s) })
              if (s.style) editor.setLook({ style: s.style })
            }}
            onSave={() => saved.save(setup)}
            onDelete={saved.remove}
            onClose={close}
            footer={panel && <LookControls editor={editor} panel={panel} />}
          />
        </div>
      )}

      {panel && generator.errors[panel.id] && (
        <p
          role="alert"
          className="mx-auto mb-2 max-w-5xl rounded-lg bg-destructive/10 px-3 py-2 text-sm break-words text-destructive"
        >
          {generator.errors[panel.id]}
        </p>
      )}
      <div
        data-roving-group
        onKeyDown={roving()}
        className="mx-auto flex max-w-5xl gap-2 rounded-2xl bg-muted/60 p-2 ring-1 ring-foreground/10"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <textarea
            ref={textareaRef}
            aria-label={t("placeholder")}
            rows={2}
            disabled={!panel}
            placeholder={panel ? t("placeholder") : t("noPanel")}
            value={panel?.prompt ?? ""}
            onChange={(e) =>
              update({ prompt: e.target.value }, `${panel?.id}-prompt`)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                run()
              }
            }}
            className="min-h-12 w-full resize-none bg-transparent px-2 py-1 text-[15px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <div className="-m-1 flex min-w-0 [scrollbar-width:none] items-center gap-1.5 overflow-x-auto p-1">
            <div className="relative">
              <Chip
                pressed={open === "cast"}
                disabled={!panel}
                aria-label={t("cast")}
                onClick={() => setOpen(open === "cast" ? null : "cast")}
              >
                {inShot.length ? (
                  <span className="flex -space-x-1.5">
                    {inShot.slice(0, 3).map((id) => {
                      const c = cast.find((x) => x.id === id)
                      return c ? (
                        <Avatar
                          key={id}
                          character={c}
                          className="size-5 ring-2 ring-background"
                        />
                      ) : null
                    })}
                  </span>
                ) : (
                  <HugeiconsIcon icon={AtIcon} strokeWidth={2} />
                )}
                {inShot.length > 0 && (
                  <span className="max-w-28 truncate">
                    {inShot
                      .map((id) => cast.find((c) => c.id === id)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </Chip>
            </div>
            <Chip
              pressed={open === "tags"}
              disabled={!panel}
              onClick={() => setOpen(open === "tags" ? null : "tags")}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              {t("tags", { count: tags.length })}
            </Chip>
            <Chip
              pressed={open === "setup"}
              onClick={() => setOpen(open === "setup" ? null : "setup")}
            >
              <HugeiconsIcon icon={SlidersHorizontalIcon} strokeWidth={2} />
              {t("setup")}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className={cn(
                  "transition-transform",
                  open === "setup" && "-rotate-90"
                )}
              />
            </Chip>
            {panel && (
              <Chip
                disabled
                title={`${renderSize(panel.width, panel.height).width}×${renderSize(panel.width, panel.height).height}`}
              >
                <HugeiconsIcon icon={CropIcon} strokeWidth={2} />
                {ratio(panel.width, panel.height)}
              </Chip>
            )}
            <Chip
              disabled={!panel}
              title={t("steps", { count: quality.steps })}
              onClick={() => {
                const next =
                  QUALITY[(QUALITY.indexOf(quality) + 1) % QUALITY.length]!
                update({ steps: next.steps })
              }}
            >
              <HugeiconsIcon icon={DashboardSpeed02Icon} strokeWidth={2} />
              {t(`quality.${quality.id}`)}
            </Chip>
            <Chip
              pressed={open === "advanced"}
              disabled={!panel}
              aria-label={t("advanced")}
              title={t("advanced")}
              onClick={() => setOpen(open === "advanced" ? null : "advanced")}
            >
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
            </Chip>
            {panel && (generator.takes[panel.id]?.length ?? 0) > 0 && (
              <Chip
                pressed={open === "takes"}
                onClick={() => setOpen(open === "takes" ? null : "takes")}
              >
                <HugeiconsIcon icon={Image02Icon} strokeWidth={2} />
                {t("takesCount", {
                  count: generator.takes[panel.id]!.length,
                })}
              </Chip>
            )}
            <div className="flex h-8 shrink-0 items-center rounded-lg border border-foreground/10 bg-background/70 dark:bg-foreground/5">
              <button
                type="button"
                data-roving
                aria-label={t("fewer")}
                disabled={takes <= 1}
                onClick={() => setTakes((n) => Math.max(1, n - 1))}
                className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40"
              >
                <HugeiconsIcon
                  icon={MinusSignIcon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              </button>
              <span
                className="min-w-9 text-center text-sm font-semibold tabular-nums"
                aria-label={t("takes")}
              >
                {takes}
                <span className="text-muted-foreground">/{MAX_TAKES}</span>
              </span>
              <button
                type="button"
                data-roving
                aria-label={t("more")}
                disabled={takes >= MAX_TAKES}
                onClick={() => setTakes((n) => Math.min(MAX_TAKES, n + 1))}
                className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40"
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          data-roving
          onClick={() => setOpen(open === "setup" ? null : "setup")}
          className="group/setup relative hidden w-48 shrink-0 cursor-pointer flex-col justify-end overflow-hidden rounded-xl bg-background p-2.5 text-start ring-1 ring-foreground/10 transition outline-none hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring sm:flex dark:bg-foreground/5"
        >
          <img
            src={`/anima-styles/${setup.style}.webp`}
            alt=""
            className="absolute end-2 top-2 size-9 rounded-full object-cover ring-2 ring-background"
          />
          <span className="truncate pe-10 text-sm font-semibold">
            {tl(`styles.${setup.style}`)}
          </span>
          <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {[setup.framing, setup.angle, setup.light]
              .filter(Boolean)
              .join(", ") || t("any")}
          </span>
        </button>

        <button
          type="button"
          data-roving
          onClick={run}
          disabled={
            panel
              ? !job && (!hasPrompt(panel) || panel.locked)
              : !prompted || anyBusy
          }
          className={cn(
            "flex w-36 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl bg-amber-400 text-amber-950 shadow-[inset_0_-3px_0_rgb(0_0_0/0.15)] transition outline-none hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-amber-400",
            job && "bg-amber-300"
          )}
        >
          {job ? (
            <>
              <span className="flex items-center gap-1.5 text-sm font-bold tracking-wide uppercase">
                <Spinner className="size-4" />
                {job.of > 1 ? t("take", { take: job.take, of: job.of }) : ""}
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold">
                <HugeiconsIcon
                  icon={StopIcon}
                  strokeWidth={2.5}
                  className="size-3.5"
                />
                {t("cancel")}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-extrabold tracking-wide uppercase">
                {panel ? t("generate") : t("generateAll")}
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold tabular-nums">
                <HugeiconsIcon
                  icon={SparklesIcon}
                  strokeWidth={2.5}
                  className="size-3.5"
                />
                {panel
                  ? `×${takes} · ${t("estimate", { seconds: Math.round(average * takes) })}`
                  : `×${prompted}`}
              </span>
            </>
          )}
        </button>
      </div>

      {open === "cast" && panel && (
        <div className="absolute start-3 bottom-full z-30 mb-2 w-72 rounded-xl bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
          <CastRow panel={panel} editor={editor} />
        </div>
      )}

      {open === "tags" && panel && (
        <div className="absolute start-3 bottom-full z-30 mb-2 w-[26rem] max-w-[calc(100%-1.5rem)] rounded-xl bg-popover p-2.5 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
          <p className="pb-2 text-xs font-medium text-muted-foreground">
            {t("addTags")}
          </p>
          <TagField
            tags={tags}
            autoFocus
            onChange={(next) => update({ tags: next })}
          />
          <div className="mt-2 max-h-72 overflow-y-auto pe-1">
            <TagBrowser
              tags={tags}
              onChange={(next) => update({ tags: next })}
            />
          </div>
        </div>
      )}

      {open === "advanced" && panel && (
        <div className="absolute start-3 bottom-full z-30 mb-2 max-h-[70vh] w-[24rem] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
          <AdvancedFields panel={panel} editor={editor} />
        </div>
      )}

      {open === "takes" && panel && (
        <div className="absolute start-3 bottom-full z-30 mb-2 max-h-[70vh] w-[26rem] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
          <TakesGrid panel={panel} editor={editor} generator={generator} />
        </div>
      )}
    </div>
  )
}
