import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowExpandIcon,
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  Delete02Icon,
  Eraser01Icon,
  MagicWand01Icon,
  PaintBoardIcon,
  PaintBrush01Icon,
  SquareIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { useOpenRouter } from "@/components/account/account-menu"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import { INSUFFICIENT_CREDITS } from "@/lib/credits-store"

import { Row, Section, SliderInput } from "./controls"
import {
  cancelEdit,
  clearMask,
  loadImage,
  outpaintFrame,
  runEdit,
  startMask,
  updateMask,
  useEditState,
  type EditTool,
} from "./edit-tools"
import { messages } from "./edit-tools.messages"
import type { PanelLayer } from "./model"
import { roving } from "./roving"
import type { ComicEditor } from "./use-editor"

const TOOLS: { id: EditTool; icon: typeof MagicWand01Icon }[] = [
  { id: "edit", icon: MagicWand01Icon },
  { id: "vary", icon: ArrowReloadHorizontalIcon },
  { id: "inpaint", icon: PaintBrush01Icon },
  { id: "erase", icon: Eraser01Icon },
  { id: "outpaint", icon: ArrowExpandIcon },
]

const masked = (tool: EditTool) => tool === "inpaint" || tool === "erase"

// AI edits of the selected panel's image, and the versions they leave.
export function EditSection({
  panel,
  editor,
}: {
  panel: PanelLayer
  editor: ComicEditor
}) {
  const t = useT(messages)
  const openrouter = useOpenRouter()
  const { mask, jobs, errors } = useEditState()
  const [tool, setTool] = React.useState<EditTool>("edit")
  const [instruction, setInstruction] = React.useState("")
  const [what, setWhat] = React.useState("")
  const [strength, setStrength] = React.useState(45)
  const [fits, setFits] = React.useState(true)
  const job = jobs[panel.id]
  const error = errors[panel.id]
  const ownMask =
    mask && mask.panelId === panel.id && mask.src === panel.src ? mask : null

  // The brush is out while a mask tool is picked, and put down on leaving.
  React.useEffect(() => {
    if (masked(tool)) startMask(panel)
    else updateMask({ active: false })
  }, [tool, panel.id, panel.src])
  React.useEffect(() => () => updateMask({ active: false }), [])

  React.useEffect(() => {
    if (!panel.src) return
    let live = true
    loadImage(panel.src)
      .then((img) => {
        if (live)
          setFits(!outpaintFrame(panel, img.naturalWidth, img.naturalHeight))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [panel.src, panel.width, panel.height])

  const run = () =>
    runEdit(editor, panel.id, tool, {
      text: tool === "edit" ? instruction : what,
      strength: strength / 100,
    })
  const ready =
    !job &&
    (tool === "edit"
      ? !!instruction.trim()
      : masked(tool)
        ? !!ownMask?.painted
        : tool === "outpaint"
          ? !fits
          : true)

  return (
    <Section
      title={t("title")}
      action={
        <span className="text-xs text-muted-foreground">
          {t(`tools.${tool}`)}
        </span>
      }
    >
      <ToggleGroup
        variant="outline"
        spacing={0}
        className="w-full"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[tool]}
        onSelectionChange={(keys) => {
          const next = [...keys][0] as EditTool | undefined
          if (next) setTool(next)
        }}
      >
        {TOOLS.map((item) => (
          <TooltipTrigger key={item.id}>
            <ToggleGroupItem
              id={item.id}
              aria-label={t(`tools.${item.id}`)}
              className="flex-1"
            >
              <HugeiconsIcon icon={item.icon} strokeWidth={2} />
            </ToggleGroupItem>
            <Tooltip>{t(`tools.${item.id}`)}</Tooltip>
          </TooltipTrigger>
        ))}
      </ToggleGroup>

      <p className="text-[11px] text-muted-foreground">
        {tool === "outpaint" && fits ? t("hints.fits") : t(`hints.${tool}`)}
      </p>

      {tool === "edit" && (
        <Textarea
          aria-label={t("instruction")}
          placeholder={t("instructionPlaceholder")}
          className="min-h-16 resize-none"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) run()
          }}
        />
      )}

      {tool === "vary" && (
        <SliderInput
          label={t("strength")}
          suffix="%"
          min={10}
          max={90}
          value={strength}
          onChange={setStrength}
        />
      )}

      {masked(tool) && (
        <>
          <Row label={t("mask")}>
            <ToggleGroup
              variant="outline"
              spacing={0}
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[ownMask?.tool ?? "brush"]}
              onSelectionChange={(keys) => {
                const next = [...keys][0] as "brush" | "rect" | undefined
                if (next) updateMask({ tool: next, active: true })
              }}
            >
              <ToggleGroupItem id="brush" aria-label={t("brush")}>
                <HugeiconsIcon icon={PaintBrush01Icon} strokeWidth={2} />
              </ToggleGroupItem>
              <ToggleGroupItem id="rect" aria-label={t("rect")}>
                <HugeiconsIcon icon={SquareIcon} strokeWidth={2} />
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="flex-1" />
            <TooltipTrigger>
              <Toggle
                variant="outline"
                aria-label={t("paint")}
                isSelected={!!ownMask?.active}
                onChange={(on) =>
                  on ? startMask(panel) : updateMask({ active: false })
                }
              >
                <HugeiconsIcon icon={PaintBoardIcon} strokeWidth={2} />
              </Toggle>
              <Tooltip>{t("paint")}</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("clear")}
                isDisabled={!ownMask?.painted}
                onPress={clearMask}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
              <Tooltip>{t("clear")}</Tooltip>
            </TooltipTrigger>
          </Row>
          {(ownMask?.tool ?? "brush") === "brush" && (
            <SliderInput
              label={t("size")}
              min={8}
              max={240}
              value={ownMask?.size ?? 60}
              onChange={(size) => updateMask({ size })}
            />
          )}
          {tool === "inpaint" && (
            <Input
              aria-label={t("what")}
              placeholder={t("whatPlaceholder")}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
            />
          )}
          <p className="text-[11px] text-muted-foreground">{t("hints.mask")}</p>
        </>
      )}

      {job ? (
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
              onPress={() => cancelEdit(panel.id)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
            <Tooltip>{t("cancel")}</Tooltip>
          </TooltipTrigger>
        </div>
      ) : (
        <Button variant="outline" isDisabled={!ready} onPress={run}>
          <HugeiconsIcon
            icon={TOOLS.find((x) => x.id === tool)!.icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t(`run.${tool}`)}
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
            {openrouter ? "OpenRouter" : t("cost", { count: COSTS[tool] })}
          </span>
        </Button>
      )}

      {error && (
        <p className="text-xs text-destructive">
          {error === "mask"
            ? t("errors.mask")
            : error === "fits"
              ? t("errors.fits")
              : error === INSUFFICIENT_CREDITS
                ? t("errors.credits")
                : error}
        </p>
      )}

      {!!panel.versions?.length && (
        <div className="flex flex-col gap-2 pt-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("versions")}
          </span>
          <div
            className="grid grid-cols-3 gap-1.5"
            data-roving-group
            onKeyDown={roving()}
          >
            {panel.versions.map((v) => (
              <button
                key={v.src.slice(-64)}
                type="button"
                data-roving
                title={t("versionTitle", { kind: t(`kinds.${v.kind}`) })}
                className={cn(
                  "relative cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/10 outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
                  panel.src === v.src &&
                    "ring-2 ring-amber-500 hover:ring-amber-500"
                )}
                style={{ aspectRatio: `${panel.width} / ${panel.height}` }}
                onClick={() =>
                  editor.update(
                    panel.id,
                    { src: v.src, engine: v.engine },
                    `${panel.id}-version`
                  )
                }
              >
                <img src={v.src} alt="" className="size-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 text-[10px] leading-4">
                  {t(`kinds.${v.kind}`)}
                </span>
              </button>
            ))}
          </div>
        </div>
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
