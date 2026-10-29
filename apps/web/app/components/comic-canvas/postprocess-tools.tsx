import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  ImageUpscaleIcon,
  PaintBoardIcon,
  ScissorIcon,
  SmileIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import {
  INSUFFICIENT_CREDITS,
  setCredits,
  useCredits,
} from "@/lib/credits-store"
import type { PostprocessOp } from "@/lib/postprocess.server"

import { Row, Section, SliderInput } from "./controls"
import type { PanelLayer, PanelVersion } from "./model"
import { messages } from "./postprocess.messages"
import { readImageFile } from "./render"
import type { ComicEditor } from "./use-editor"
import { buildPrompt } from "./use-generator"

// Versions kept on a panel, as in edit-tools.
const MAX_VERSIONS = 8
// Upscales may go past the import limit; everything else keeps it.
const MAX_UPSCALE_SIDE = 4096

interface Job {
  op: PostprocessOp
  startedAt: number
  controller: AbortController
}

// Jobs live outside React so they survive the inspector remounting when
// the selection changes.
let state: { jobs: Record<string, Job>; errors: Record<string, string> } = {
  jobs: {},
  errors: {},
}
const listeners = new Set<() => void>()
function set(patch: Partial<typeof state>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
function usePostprocessState() {
  return React.useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state
  )
}

async function post(
  body: {
    op: PostprocessOp
    image: string
    scale?: 2 | 4
    strength?: number
    prompt?: string
    negative?: string
  },
  signal: AbortSignal
) {
  const res = await fetch("/api/postprocess", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify(body),
  })
  const credits = res.headers.get("x-credits")
  if (credits !== null) setCredits(Number(credits))
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    if (json?.code === INSUFFICIENT_CREDITS)
      throw new Error(INSUFFICIENT_CREDITS)
    throw new Error(json?.error ?? `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const img = await readImageFile(
    new File([blob], "panel.png", { type: blob.type }),
    body.op === "upscale" ? MAX_UPSCALE_SIDE : undefined
  )
  return img.src
}

// The result replaces the image and joins the panel's versions, next to
// the image it replaced; one undo step reverts it.
function apply(
  editor: ComicEditor,
  panelId: string,
  src: string,
  kind: PanelVersion["kind"]
) {
  const panel = editor.findLayer(panelId)?.layer
  if (panel?.type !== "panel") return
  let versions: PanelVersion[] = panel.versions ?? []
  if (panel.src && !versions.some((v) => v.src === panel.src))
    versions = [{ src: panel.src, kind: "original" }, ...versions]
  editor.update(panelId, {
    src,
    versions: [{ src, kind }, ...versions].slice(0, MAX_VERSIONS),
  })
}

export async function runPostprocess(
  editor: ComicEditor,
  panelId: string,
  op: PostprocessOp,
  { scale = 2, strength }: { scale?: 2 | 4; strength?: number } = {}
) {
  if (state.jobs[panelId]) return false
  const panel = editor.findLayer(panelId)?.layer
  if (panel?.type !== "panel" || !panel.src) return false
  const controller = new AbortController()
  const { [panelId]: _, ...errors } = state.errors
  set({
    jobs: {
      ...state.jobs,
      [panelId]: { op, startedAt: Date.now(), controller },
    },
    errors,
  })
  try {
    const src = await post(
      {
        op,
        image: panel.src,
        scale,
        strength,
        // Faces and restyles are redrawn with the panel's prompt and look.
        ...(op === "face_fix" || op === "restyle"
          ? buildPrompt(panel, editor.projectRef.current)
          : {}),
      },
      controller.signal
    )
    apply(editor, panelId, src, op)
    return true
  } catch (e) {
    if (!controller.signal.aborted)
      set({
        errors: {
          ...state.errors,
          [panelId]: e instanceof Error ? e.message : String(e),
        },
      })
    return false
  } finally {
    const { [panelId]: _, ...jobs } = state.jobs
    set({ jobs })
  }
}

export function cancelPostprocess(panelId: string) {
  state.jobs[panelId]?.controller.abort()
}

const errorOf = (error: string | undefined) =>
  error === INSUFFICIENT_CREDITS ? "credits" : error

// Upscale, background removal and face fix for the selected panel's image.
export function PostprocessSection({
  panel,
  editor,
}: {
  panel: PanelLayer
  editor: ComicEditor
}) {
  const t = useT(messages)
  const { jobs, errors } = usePostprocessState()
  const [scale, setScale] = React.useState<2 | 4>(2)
  const [strength, setStrength] = React.useState(40)
  const job = jobs[panel.id]
  const error = errorOf(errors[panel.id])

  const action = (
    op: PostprocessOp,
    icon: typeof ImageUpscaleIcon,
    label: string,
    run: () => void
  ) => (
    <Button
      variant="outline"
      className="justify-start"
      isDisabled={!!job}
      onPress={run}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} data-icon="inline-start" />
      {label}
      <span className="ms-auto text-xs text-muted-foreground tabular-nums">
        {t("cost", { count: COSTS[op] })}
      </span>
    </Button>
  )

  return (
    <Section title={t("title")}>
      <Row label={t("scale")}>
        <ToggleGroup
          variant="outline"
          spacing={0}
          className="flex-1"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[String(scale)]}
          onSelectionChange={(keys) => {
            const next = [...keys][0]
            if (next) setScale(Number(next) as 2 | 4)
          }}
        >
          <ToggleGroupItem id="2" className="flex-1">
            2×
          </ToggleGroupItem>
          <ToggleGroupItem id="4" className="flex-1">
            4×
          </ToggleGroupItem>
        </ToggleGroup>
      </Row>
      {action("upscale", ImageUpscaleIcon, t("upscale", { scale }), () =>
        runPostprocess(editor, panel.id, "upscale", { scale })
      )}
      <p className="text-[11px] text-muted-foreground">{t("hint")}</p>
      {action("remove_bg", ScissorIcon, t("removeBg"), () =>
        runPostprocess(editor, panel.id, "remove_bg")
      )}
      <SliderInput
        label={t("faceStrength")}
        suffix="%"
        min={20}
        max={70}
        value={strength}
        onChange={setStrength}
      />
      {action("face_fix", SmileIcon, t("faces"), () =>
        runPostprocess(editor, panel.id, "face_fix", {
          strength: strength / 100,
        })
      )}

      {job && (
        <div className="flex gap-1.5">
          <Button variant="outline" className="flex-1" isDisabled>
            <Spinner data-icon="inline-start" />
            <Elapsed since={job.startedAt} />
          </Button>
          <TooltipTrigger>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("cancel")}
              onPress={() => cancelPostprocess(panel.id)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
            <Tooltip>{t("cancel")}</Tooltip>
          </TooltipTrigger>
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive">
          {error === "credits" ? t("errors.credits") : error}
        </p>
      )}
    </Section>
  )
}

function Elapsed({ since }: { since: number }) {
  const t = useT(messages)
  const [now, setNow] = React.useState(Date.now)
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  return <>{t("working", { seconds: Math.round((now - since) / 1000) })}</>
}

// Every panel with art, in reading order, slide by slide.
function panelsWithArt(editor: ComicEditor) {
  return editor.projectRef.current.pages.flatMap((page) =>
    page.layers
      .filter((l): l is PanelLayer => l.type === "panel" && !!l.src)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((l) => l.id)
  )
}

// Batch restyle: redraws every panel that has art from its own image with
// the current look, one at a time. Empty panels are skipped.
export function RestyleDialog({
  editor,
  onClose,
}: {
  editor: ComicEditor
  onClose: () => void
}) {
  const t = useT(messages)
  const balance = useCredits()
  const [strength, setStrength] = React.useState(70)
  const [progress, setProgress] = React.useState<{
    done: number
    total: number
    running: boolean
    failed?: { n: number; error: string }
  } | null>(null)
  const stopped = React.useRef(false)
  // Counted when the dialog opens; the project is what it is until then.
  const ids = React.useMemo(() => panelsWithArt(editor), [editor])
  const cost = ids.length * COSTS.restyle
  const short = balance !== null && balance < cost
  const running = !!progress?.running

  const start = async () => {
    stopped.current = false
    let done = 0
    setProgress({ done, total: ids.length, running: true })
    for (const [i, id] of ids.entries()) {
      if (stopped.current) break
      const ok = await runPostprocess(editor, id, "restyle", {
        strength: strength / 100,
      })
      if (ok) done++
      else {
        const error = errorOf(state.errors[id])
        if (!stopped.current && error) {
          setProgress({
            done,
            total: ids.length,
            running: false,
            failed: {
              n: i + 1,
              error: error === "credits" ? t("errors.credits") : error,
            },
          })
          return
        }
      }
      setProgress({ done, total: ids.length, running: true })
    }
    setProgress({ done, total: ids.length, running: false })
  }

  const stop = () => {
    stopped.current = true
    for (const id of ids) cancelPostprocess(id)
  }

  return (
    <Dialog
      isOpen
      isDismissable={!running}
      onOpenChange={(open) => !open && !running && onClose()}
    >
      <DialogHeader>
        <DialogTitle>{t("restyle.title")}</DialogTitle>
        <DialogDescription>{t("restyle.description")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <SliderInput
          label={t("restyle.strength")}
          suffix="%"
          min={30}
          max={90}
          value={strength}
          onChange={setStrength}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("restyle.strengthHint")}
        </p>
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span>{t("restyle.panels", { count: ids.length })}</span>
          {!!ids.length && (
            <span className="text-muted-foreground tabular-nums">
              {t("restyle.estimate", { count: cost })}
            </span>
          )}
        </div>
        {balance !== null && !!ids.length && (
          <p
            className={
              short
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {short
              ? t("restyle.short")
              : t("restyle.balance", {
                  balance: t("cost", { count: balance }),
                })}
          </p>
        )}
        {progress && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {progress.running
              ? t("restyle.progress", {
                  done: progress.done + 1,
                  total: progress.total,
                })
              : t("restyle.done", { count: progress.done })}
          </p>
        )}
        {progress?.failed && (
          <p className="text-xs text-destructive">
            {t("restyle.failed", progress.failed)}
          </p>
        )}
      </div>
      <DialogFooter>
        {running ? (
          <Button variant="outline" onPress={stop}>
            <Spinner data-icon="inline-start" />
            {t("restyle.stop")}
          </Button>
        ) : (
          <>
            <Button variant="outline" onPress={onClose}>
              {t("restyle.close")}
            </Button>
            <Button isDisabled={!ids.length || short} onPress={start}>
              <HugeiconsIcon
                icon={PaintBoardIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("restyle.start", { count: ids.length })}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  )
}

export { messages as postprocessMessages }
