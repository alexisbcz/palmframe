import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon, StopIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { CreditsPill } from "@/components/account/credits-pill"
import { useOpenRouter } from "@/components/account/account-menu"
import { useT, type Translate } from "@/i18n/core"
import { INSUFFICIENT_CREDITS, useCredits } from "@/lib/credits-store"

import { messages } from "./compare.messages"
import type { Engine, PanelLayer } from "./model"
import { roving } from "./roving"
import type { ComicEditor } from "./use-editor"
import {
  engineCost,
  engineOf,
  panelRefs,
  hasPrompt,
  otherEngine,
  type Generator,
} from "./use-generator"

interface Candidate {
  src: string
  engine?: Engine
  model?: string
  seed?: number
}

const ENGINES: Record<Engine, string> = { anima: "Anima", klein: "Klein" }

// Every image of the shot, once each: the one showing, its versions, then
// this session's takes.
function candidatesOf(panel: PanelLayer, takes: Candidate[]) {
  const all = new Map<string, Candidate>()
  const sources: Candidate[] = [
    ...(panel.src
      ? [
          {
            src: panel.src,
            engine: panel.engine,
            model: panel.model,
            seed: panel.seed,
          },
        ]
      : []),
    ...(panel.versions ?? []),
    ...takes,
  ]
  for (const c of sources) {
    const known = all.get(c.src)
    all.set(c.src, {
      src: c.src,
      engine: known?.engine ?? c.engine,
      model: known?.model ?? c.model,
      seed: known?.seed ?? c.seed,
    })
  }
  return [...all.values()]
}

function label(c: Candidate, t: Translate<(typeof messages)["en"]>) {
  return [
    c.engine ? ENGINES[c.engine] : null,
    c.seed !== undefined ? t("seed", { seed: c.seed }) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

// Two images of one shot side by side, the rest in a row to swap in, and
// the same shot through the other engine for its price.
export function CompareDialog({
  panel,
  editor,
  generator,
  onClose,
}: {
  panel: PanelLayer
  editor: ComicEditor
  generator: Generator
  onClose: () => void
}) {
  const t = useT(messages)
  const openrouter = useOpenRouter()
  const balance = useCredits()
  const { project } = editor
  const candidates = candidatesOf(panel, generator.takes[panel.id] ?? [])
  const [left, setLeft] = React.useState(panel.src)
  const [picked, setPicked] = React.useState<string | null>(null)
  const others = candidates.filter((c) => c.src !== left)
  const right = others.find((c) => c.src === picked) ?? others[0]
  const shown = candidates.find((c) => c.src === left) ?? candidates[0]

  const job = generator.jobs[panel.id]
  const error = generator.errors[panel.id]
  const engine = otherEngine(panel.engine ?? engineOf(panel, project))
  const cost = engineCost(panel, engine, project)
  const short = !openrouter && balance !== null && balance < cost
  const noSheet = engine === "klein" && !panelRefs(panel, project).refs.length

  const run = async () => {
    const src = await generator.tryEngine(panel.id, engine)
    if (src) setPicked(src)
  }
  const choose = (c: Candidate) => {
    editor.update(
      panel.id,
      {
        src: c.src,
        ...(c.seed !== undefined && { seed: c.seed }),
        engine: c.engine,
        model: c.model,
      },
      `${panel.id}-version`
    )
  }
  // A thumbnail goes opposite the image it isn't, so the pair stays a pair.
  const show = (c: Candidate) => {
    if (c.src === left && right) setLeft(right.src)
    setPicked(c.src)
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-3xl"
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="-mx-4 flex max-h-[calc(100svh-19rem)] min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-1 sm:max-h-[calc(100svh-15rem)]">
        <div className="grid grid-cols-2 gap-3">
          {[shown, right].map((c, i) =>
            c ? (
              <figure key={i} className="flex min-w-0 flex-col gap-1.5">
                <img
                  src={c.src}
                  alt={label(c, t) || t("image")}
                  className="w-full rounded-md bg-muted object-contain ring-1 ring-foreground/10"
                  style={{ aspectRatio: `${panel.width} / ${panel.height}` }}
                />
                <figcaption className="flex min-h-7 flex-wrap items-center justify-between gap-1.5 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate tabular-nums">
                    {label(c, t) || t("unknown")}
                  </span>
                  {panel.src === c.src ? (
                    <span className="font-medium text-foreground">
                      {t("inUse")}
                    </span>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      onPress={() => choose(c)}
                    >
                      {t("use")}
                    </Button>
                  )}
                </figcaption>
              </figure>
            ) : (
              <div
                key={i}
                className="flex items-center justify-center rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground"
                style={{ aspectRatio: `${panel.width} / ${panel.height}` }}
              >
                {t("empty")}
              </div>
            )
          )}
        </div>

        {candidates.length > 2 && (
          <div
            className="grid grid-cols-5 gap-1.5 sm:grid-cols-8"
            data-roving-group
            onKeyDown={roving()}
          >
            {candidates.map((c) => (
              <button
                key={c.src.slice(-64)}
                type="button"
                data-roving
                title={label(c, t) || t("unknown")}
                aria-pressed={c.src === shown?.src || c.src === right?.src}
                className={cn(
                  "relative cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/10 outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
                  (c.src === shown?.src || c.src === right?.src) &&
                    "ring-2 ring-amber-500 hover:ring-amber-500"
                )}
                style={{ aspectRatio: `${panel.width} / ${panel.height}` }}
                onClick={() => show(c)}
              >
                <img
                  src={c.src}
                  alt={label(c, t) || t("image")}
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {openrouter ? (
          <p className="text-xs text-muted-foreground">{t("openrouter")}</p>
        ) : (
          noSheet && (
            <p className="text-xs text-muted-foreground">{t("noSheet")}</p>
          )
        )}
        {short && (
          <p className="text-xs text-destructive">
            {t("short", { balance, cost })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs break-words text-destructive">
            {error === INSUFFICIENT_CREDITS ? t("noCredits") : error}
          </p>
        )}
      </div>

      <DialogFooter>
        {job ? (
          <Button variant="outline" onPress={() => generator.cancel(panel.id)}>
            <Spinner data-icon="inline-start" />
            <HugeiconsIcon
              icon={StopIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("cancel")}
          </Button>
        ) : (
          <Button
            variant="outline"
            isDisabled={openrouter || short || !hasPrompt(panel)}
            onPress={run}
          >
            <HugeiconsIcon
              icon={SparklesIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("try", { engine: ENGINES[engine] })}
            {!openrouter && (
              <CreditsPill>{t("cost", { count: cost })}</CreditsPill>
            )}
          </Button>
        )}
        <Button variant="outline" onPress={onClose}>
          {t("close")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
