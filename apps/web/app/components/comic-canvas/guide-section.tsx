import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  GridViewIcon,
  ImageUploadIcon,
  PencilEdit01Icon,
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
import { cn } from "@workspace/ui/lib/utils"

import { CreditsPill } from "@/components/account/credits-pill"
import { useOpenRouter } from "@/components/account/account-menu"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import { INSUFFICIENT_CREDITS } from "@/lib/credits-store"

import { pickFile } from "./actions"
import { Section } from "./controls"
import { COVERAGE_CELLS, cellPatch, coverageSlides, cropCell } from "./coverage"
import { readGuideFile } from "./guide"
import { GuideDrawer } from "./guide-drawer"
import { messages } from "./guide.messages"
import type { GuideStrength, PanelLayer } from "./model"
import type { ComicEditor } from "./use-editor"
import { coverageJob, hasPrompt, type Generator } from "./use-generator"

// A panel's layout guide, and the coverage sheet that can supply one.
export function GuideSection({
  panel,
  editor,
  generator,
}: {
  panel: PanelLayer
  editor: ComicEditor
  generator: Generator
}) {
  const t = useT(messages)
  const openrouter = useOpenRouter()
  const [drawing, setDrawing] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const { guide, coverage } = panel
  const job = coverageJob(panel.id)
  const running = job in generator.jobs
  const error = generator.errors[job]
  const setGuide = (src: string) =>
    editor.update(panel.id, {
      guide: { src, strength: guide?.strength ?? "loose" },
    })

  const upload = async () => {
    const file = await pickFile("image/*")
    if (!file) return
    setFailed(false)
    try {
      setGuide(await readGuideFile(file))
    } catch {
      setFailed(true)
    }
  }

  return (
    <>
      <Section title={t("title")}>
        {guide && (
          <div className="flex items-center gap-2.5">
            <img
              src={guide.src}
              alt={t("preview")}
              className="size-14 shrink-0 rounded-md bg-white object-contain ring-1 ring-foreground/10"
            />
            <ToggleGroup
              variant="outline"
              spacing={0}
              className="min-w-0 flex-1"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[guide.strength]}
              onSelectionChange={(keys) => {
                const strength = [...keys][0] as GuideStrength | undefined
                if (strength)
                  editor.update(panel.id, { guide: { ...guide, strength } })
              }}
            >
              <ToggleGroupItem id="loose" className="flex-1">
                {t("strength.loose")}
              </ToggleGroupItem>
              <ToggleGroupItem id="strict" className="flex-1">
                {t("strength.strict")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
        {guide && (
          <p className="text-xs text-muted-foreground">
            {t(`strengthHint.${guide.strength}`)}
          </p>
        )}
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            className="min-w-0 flex-1"
            isDisabled={panel.locked}
            onPress={upload}
          >
            <HugeiconsIcon
              icon={ImageUploadIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            <span className="truncate">{t("upload")}</span>
          </Button>
          <Button
            variant="outline"
            className="min-w-0 flex-1"
            isDisabled={panel.locked}
            onPress={() => setDrawing(true)}
          >
            <HugeiconsIcon
              icon={PencilEdit01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            <span className="truncate">{guide ? t("edit") : t("draw")}</span>
          </Button>
          {guide && (
            <TooltipTrigger>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("remove")}
                isDisabled={panel.locked}
                onPress={() => editor.update(panel.id, { guide: undefined })}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
              <Tooltip>{t("remove")}</Tooltip>
            </TooltipTrigger>
          )}
        </div>
        {failed && (
          <p className="text-xs text-destructive">{t("uploadFailed")}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("kleinOnly", { count: COSTS.panel_ref })}
        </p>
      </Section>

      <Section title={t("coverage.title")}>
        <p className="text-xs text-muted-foreground">{t("coverage.hint")}</p>
        {coverage && (
          <button
            type="button"
            aria-label={t("coverage.pick")}
            className="cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/10 outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setPicking(true)}
          >
            <img src={coverage.src} alt="" className="w-full" />
          </button>
        )}
        {running ? (
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <Spinner className="size-4" />
              <span className="truncate">{t("coverage.drawing")}</span>
            </span>
            <TooltipTrigger>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("cancel")}
                onPress={() => generator.cancel(job)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
              <Tooltip>{t("cancel")}</Tooltip>
            </TooltipTrigger>
          </div>
        ) : (
          <Button
            variant="outline"
            isDisabled={panel.locked || !hasPrompt(panel)}
            onPress={() => void generator.drawCoverage(panel.id)}
          >
            <HugeiconsIcon
              icon={GridViewIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            <span className="truncate">
              {coverage ? t("coverage.again") : t("coverage.draw")}
            </span>
            {openrouter ? (
              <span className="ms-auto text-xs text-muted-foreground">
                {"OpenRouter"}
              </span>
            ) : (
              <CreditsPill className="ms-auto">
                {t("cost", { count: COSTS.coverage })}
              </CreditsPill>
            )}
          </Button>
        )}
        {!hasPrompt(panel) && (
          <p className="text-xs text-muted-foreground">
            {t("coverage.needsPrompt")}
          </p>
        )}
        {error && (
          <p className="text-xs break-words text-destructive">
            {error === INSUFFICIENT_CREDITS ? t("coverage.credits") : error}
          </p>
        )}
      </Section>

      {drawing && (
        <GuideDrawer
          panel={panel}
          onSave={setGuide}
          onClose={() => setDrawing(false)}
        />
      )}
      {picking && coverage && (
        <CoveragePicker
          panel={panel}
          sheet={coverage.src}
          editor={editor}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}

// The sheet with a button over each cell. One pick can reframe this panel;
// any number become new slides. Nothing is drawn yet: each pick is a strict
// guide, drawn at full size when the panel is generated.
function CoveragePicker({
  panel,
  sheet,
  editor,
  onClose,
}: {
  panel: PanelLayer
  sheet: string
  editor: ComicEditor
  onClose: () => void
}) {
  const t = useT(messages)
  const [picked, setPicked] = React.useState<number[]>([])
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const toggle = (i: number) =>
    setPicked((p) =>
      p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort((a, b) => a - b)
    )

  const apply = async (mode: "this" | "new") => {
    setBusy(true)
    setFailed(false)
    try {
      const picks = await Promise.all(
        picked.map(async (index) => ({
          index,
          src: await cropCell(sheet, index),
        }))
      )
      if (mode === "this") {
        const pick = picks[0]!
        editor.update(panel.id, cellPatch(panel, pick.index, pick.src))
      } else {
        const slides = coverageSlides(panel, picks, editor.project)
        editor.insertPages(slides)
        editor.select(slides[0]!.layers[0]!.id)
      }
      onClose()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle>{t("coverage.pickTitle")}</DialogTitle>
        <DialogDescription>{t("coverage.pickHint")}</DialogDescription>
      </DialogHeader>

      <div className="relative mx-auto w-fit">
        <img
          src={sheet}
          alt={t("coverage.title")}
          className="max-h-[60svh] rounded-md"
        />
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {COVERAGE_CELLS.map((cell, i) => (
            <button
              key={cell.id}
              type="button"
              aria-pressed={picked.includes(i)}
              onClick={() => toggle(i)}
              className={cn(
                "flex cursor-pointer items-end justify-start p-1 text-[10px] leading-tight outline-none hover:bg-black/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                picked.includes(i) &&
                  "bg-amber-500/30 ring-2 ring-amber-500 ring-inset hover:bg-amber-500/30"
              )}
            >
              <span className="rounded-sm bg-black/60 px-1 text-white">
                {t(`cells.${cell.id}`)}
              </span>
            </button>
          ))}
        </div>
      </div>
      {failed && (
        <p className="text-xs text-destructive">{t("coverage.cropFailed")}</p>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          isDisabled={busy || picked.length !== 1 || panel.locked}
          onPress={() => void apply("this")}
        >
          {t("coverage.useHere")}
        </Button>
        <Button
          isDisabled={busy || !picked.length}
          onPress={() => void apply("new")}
        >
          {t("coverage.addSlides", { count: picked.length })}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
