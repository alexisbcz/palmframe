import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  BringToFrontIcon,
  BubbleChatIcon,
  Cancel01Icon,
  CloudIcon,
  Copy01Icon,
  Delete02Icon,
  FlashIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  ImageUploadIcon,
  Message01Icon,
  Note01Icon,
  RotateCcwIcon,
  RotateCwIcon,
  SendToBackIcon,
  SparklesIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextAllCapsIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { useT } from "@/i18n/core"

import { insertImageFile, pickFile } from "./actions"
import {
  ColorInput,
  NumberInput,
  Row,
  Section,
  SliderInput,
  UsedColorsContext,
} from "./controls"
import {
  FONTS,
  FORMATS,
  formatOf,
  type BubbleLayer,
  type BubbleShape,
  type FontId,
  type ImageFit,
  type Layer,
  type PanelLayer,
  type TextAlign,
  type TextLayer,
} from "./model"
import type { ComicEditor } from "./use-editor"
import { hasPrompt, usesKlein, type Generator } from "./use-generator"
import { messages } from "./inspector.messages"
import { EditSection } from "./edit-section"
import { GuideSection } from "./guide-section"
import { PostprocessSection } from "./postprocess-tools"

type Setter<L extends Layer> = <K extends keyof L>(key: K, value: L[K]) => void

function IconButton({
  label,
  icon,
  onPress,
  isDisabled,
}: {
  label: string
  icon: typeof Copy01Icon
  onPress: () => void
  isDisabled?: boolean
}) {
  const button = (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      onPress={onPress}
      isDisabled={isDisabled}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} />
    </Button>
  )
  // Disabled buttons can't take focus, so they can't trigger a tooltip.
  if (isDisabled) return button
  return (
    <TooltipTrigger>
      {button}
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  )
}

export function Inspector({
  editor,
  generator,
  onGenerate,
}: {
  editor: ComicEditor
  generator: Generator
  onGenerate: () => void
}) {
  const layer = editor.selected
  const project = editor.project
  // Every colour on any slide, most used first, for the pickers' swatches.
  const used = React.useMemo(() => {
    const count = new Map<string, number>()
    const add = (c?: unknown) => {
      if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
        count.set(c.toLowerCase(), (count.get(c.toLowerCase()) ?? 0) + 1)
    }
    add(project.background)
    for (const page of project.pages)
      for (const l of page.layers) {
        const c = l as unknown as Record<string, unknown>
        add(c.fill)
        add(c.borderColor)
        add(c.textColor)
        add(c.color)
        add(c.strokeColor)
      }
    return [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [project])
  return (
    <UsedColorsContext.Provider value={used}>
      <ScrollArea className="h-full">
        {layer ? (
          <LayerInspector
            key={layer.id}
            editor={editor}
            layer={layer}
            generator={generator}
            onGenerate={onGenerate}
          />
        ) : (
          <PageInspector editor={editor} />
        )}
      </ScrollArea>
    </UsedColorsContext.Provider>
  )
}

function LayerInspector({
  editor,
  layer,
  generator,
  onGenerate,
}: {
  editor: ComicEditor
  layer: Layer
  generator: Generator
  onGenerate: () => void
}) {
  const t = useT(messages)
  const set = React.useCallback(
    (key: string, value: unknown) =>
      editor.update(
        layer.id,
        { [key]: value } as Partial<Layer>,
        `${layer.id}-${key}`
      ),
    [editor, layer.id]
  )
  const index = editor.doc.layers.findIndex((l) => l.id === layer.id)
  const last = editor.doc.layers.length - 1

  return (
    <>
      <Section title={t("sections.layer")}>
        <Row label={t("rows.position")}>
          <NumberInput
            prefix="X"
            value={layer.x}
            onChange={(v) => set("x", v)}
          />
          <NumberInput
            prefix="Y"
            value={layer.y}
            onChange={(v) => set("y", v)}
          />
        </Row>
        <Row label={t("rows.size")}>
          <NumberInput
            prefix={t("prefix.width")}
            aria-label={t("aria.width")}
            min={1}
            value={layer.width}
            onChange={(v) => set("width", v)}
          />
          <NumberInput
            prefix={t("prefix.height")}
            aria-label={t("aria.height")}
            min={1}
            value={layer.height}
            onChange={(v) => set("height", v)}
          />
        </Row>
        <Row label={t("rows.rotate")}>
          <NumberInput
            aria-label={t("aria.rotation")}
            suffix="°"
            min={-180}
            max={180}
            value={layer.rotation}
            onChange={(v) => set("rotation", v)}
          />
          <IconButton
            label={t("aria.rotateLeft")}
            icon={RotateCcwIcon}
            onPress={() =>
              set("rotation", ((layer.rotation - 90 + 540) % 360) - 180)
            }
          />
          <IconButton
            label={t("aria.rotateRight")}
            icon={RotateCwIcon}
            onPress={() =>
              set("rotation", ((layer.rotation + 90 + 540) % 360) - 180)
            }
          />
        </Row>
        <SliderInput
          label={t("rows.opacity")}
          suffix="%"
          min={0}
          max={100}
          value={layer.opacity}
          onChange={(v) => set("opacity", v)}
        />
      </Section>

      {layer.type === "panel" && (
        <PanelSections
          layer={layer}
          set={set as Setter<PanelLayer>}
          editor={editor}
          generator={generator}
          onGenerate={onGenerate}
        />
      )}
      {layer.type === "bubble" && (
        <BubbleSections
          layer={layer}
          set={set as Setter<BubbleLayer>}
          patch={(p) => editor.update(layer.id, p)}
        />
      )}
      {layer.type === "text" && (
        <TextSections layer={layer} set={set as Setter<TextLayer>} />
      )}

      <Section title={t("sections.arrange")}>
        <div className="flex flex-wrap gap-1.5">
          <IconButton
            label={t("aria.bringToFront")}
            icon={BringToFrontIcon}
            isDisabled={index === last}
            onPress={() => editor.move(layer.id, "top")}
          />
          <IconButton
            label={t("aria.bringForward")}
            icon={ArrowUp01Icon}
            isDisabled={index === last}
            onPress={() => editor.move(layer.id, "up")}
          />
          <IconButton
            label={t("aria.sendBackward")}
            icon={ArrowDown01Icon}
            isDisabled={index === 0}
            onPress={() => editor.move(layer.id, "down")}
          />
          <IconButton
            label={t("aria.sendToBack")}
            icon={SendToBackIcon}
            isDisabled={index === 0}
            onPress={() => editor.move(layer.id, "bottom")}
          />
          <div className="flex-1" />
          <IconButton
            label={t("aria.duplicate")}
            icon={Copy01Icon}
            onPress={() => editor.duplicate(layer.id)}
          />
          <TooltipTrigger>
            <Button
              variant="destructive"
              size="icon"
              aria-label={t("aria.delete")}
              onPress={() => editor.remove(layer.id)}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
            <Tooltip>{t("aria.delete")}</Tooltip>
          </TooltipTrigger>
        </div>
      </Section>
    </>
  )
}

function PanelSections({
  layer,
  set,
  editor,
  generator,
  onGenerate,
}: {
  layer: PanelLayer
  set: Setter<PanelLayer>
  editor: ComicEditor
  generator: Generator
  onGenerate: () => void
}) {
  const t = useT(messages)
  const upload = async () => {
    const file = await pickFile("image/*")
    if (file) await insertImageFile(editor, file)
  }

  return (
    <>
      <Section title={t("sections.styles")}>
        <Row label={t("rows.border")}>
          <NumberInput
            aria-label={t("aria.borderWidth")}
            min={0}
            max={80}
            value={layer.borderWidth}
            onChange={(v) => set("borderWidth", v)}
            className="w-16 flex-none"
          />
          <ColorInput
            aria-label={t("aria.borderColor")}
            value={layer.borderColor}
            onChange={(v) => set("borderColor", v)}
          />
        </Row>
        <Row label={t("rows.radius")}>
          <NumberInput
            aria-label={t("aria.cornerRadius")}
            min={0}
            value={layer.radius}
            onChange={(v) => set("radius", v)}
          />
        </Row>
        <Row label={t("rows.fill")}>
          <ColorInput
            aria-label={t("aria.fillColor")}
            value={layer.fill}
            onChange={(v) => set("fill", v)}
          />
        </Row>
      </Section>

      <Section title={t("sections.image")}>
        <Row label={t("rows.source")}>
          <Button
            variant="outline"
            className="min-w-0 flex-1 justify-start"
            onPress={upload}
          >
            {layer.src ? (
              <img
                src={layer.src}
                alt=""
                className="size-5 shrink-0 rounded-sm object-cover ring-1 ring-foreground/10"
              />
            ) : (
              <HugeiconsIcon
                icon={ImageUploadIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            <span className="truncate">
              {layer.src ? t("image.replace") : t("image.upload")}
            </span>
          </Button>
          {layer.src && (
            <IconButton
              label={t("aria.removeImage")}
              icon={Cancel01Icon}
              onPress={() => set("src", null)}
            />
          )}
        </Row>
        <Row label={t("rows.generate")}>
          <Button
            variant="outline"
            className="min-w-0 flex-1 justify-start"
            onPress={onGenerate}
          >
            <HugeiconsIcon
              icon={SparklesIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            <span className="truncate">
              {hasPrompt(layer)
                ? t("image.editPrompt")
                : t("image.withModel", {
                    model: usesKlein(layer, editor.project.cast)
                      ? "FLUX.2 Klein"
                      : "Anima Turbo",
                  })}
            </span>
          </Button>
        </Row>
        {layer.src && (
          <>
            <Row label={t("rows.fit")}>
              <NativeSelect
                size="sm"
                className="w-full"
                aria-label={t("rows.fit")}
                value={layer.fit}
                onChange={(e) => set("fit", e.target.value as ImageFit)}
              >
                <NativeSelectOption value="cover">
                  {t("fit.cover")}
                </NativeSelectOption>
                <NativeSelectOption value="contain">
                  {t("fit.contain")}
                </NativeSelectOption>
                <NativeSelectOption value="fill">
                  {t("fit.fill")}
                </NativeSelectOption>
              </NativeSelect>
            </Row>
            <SliderInput
              label={t("rows.zoom")}
              suffix="%"
              min={25}
              max={400}
              value={layer.imageZoom}
              onChange={(v) => set("imageZoom", v)}
            />
            <SliderInput
              label={t("rows.panX")}
              min={-100}
              max={100}
              value={layer.panX}
              onChange={(v) => set("panX", v)}
            />
            <SliderInput
              label={t("rows.panY")}
              min={-100}
              max={100}
              value={layer.panY}
              onChange={(v) => set("panY", v)}
            />
            <Row label={t("rows.flip")}>
              <div className="flex-1" />
              <Toggle
                variant="outline"
                aria-label={t("aria.flipH")}
                isSelected={layer.flipX}
                onChange={(v) => set("flipX", v)}
              >
                <HugeiconsIcon icon={FlipHorizontalIcon} strokeWidth={2} />
              </Toggle>
              <Toggle
                variant="outline"
                aria-label={t("aria.flipV")}
                isSelected={layer.flipY}
                onChange={(v) => set("flipY", v)}
              >
                <HugeiconsIcon icon={FlipVerticalIcon} strokeWidth={2} />
              </Toggle>
            </Row>
          </>
        )}
      </Section>

      <GuideSection panel={layer} editor={editor} generator={generator} />

      {layer.src && <EditSection panel={layer} editor={editor} />}
      {layer.src && <PostprocessSection panel={layer} editor={editor} />}

      {layer.src && (
        <Section title={t("sections.filters")}>
          <SliderInput
            label={t("rows.blur")}
            min={0}
            max={40}
            value={layer.blur}
            onChange={(v) => set("blur", v)}
          />
          <SliderInput
            label={t("rows.brightness")}
            min={0}
            max={200}
            value={layer.brightness}
            onChange={(v) => set("brightness", v)}
          />
          <SliderInput
            label={t("rows.contrast")}
            min={0}
            max={200}
            value={layer.contrast}
            onChange={(v) => set("contrast", v)}
          />
          <SliderInput
            label={t("rows.saturation")}
            min={0}
            max={200}
            value={layer.saturation}
            onChange={(v) => set("saturation", v)}
          />
          <SliderInput
            label={t("rows.grayscale")}
            min={0}
            max={100}
            value={layer.grayscale}
            onChange={(v) => set("grayscale", v)}
          />
        </Section>
      )}
    </>
  )
}

const SHAPES: { id: BubbleShape; icon: typeof CloudIcon }[] = [
  { id: "speech", icon: BubbleChatIcon },
  { id: "thought", icon: CloudIcon },
  { id: "shout", icon: FlashIcon },
  { id: "caption", icon: Note01Icon },
  { id: "message", icon: Message01Icon },
]

function LetteringRows({
  layer,
  set,
}: {
  layer: BubbleLayer | TextLayer
  set: (
    key: "text" | "font" | "fontSize" | "uppercase",
    value: string | number | boolean
  ) => void
}) {
  const t = useT(messages)
  return (
    <>
      <Textarea
        data-layer-text
        aria-label={t("aria.text")}
        className="min-h-20 resize-none"
        value={layer.text}
        onChange={(e) => set("text", e.target.value)}
      />
      <Row label={t("rows.font")}>
        <NativeSelect
          size="sm"
          className="w-full"
          aria-label={t("rows.font")}
          value={layer.font}
          onChange={(e) => set("font", e.target.value as FontId)}
        >
          {Object.entries(FONTS).map(([id, f]) => (
            <NativeSelectOption key={id} value={id}>
              {f.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Row>
      <Row label={t("rows.size")}>
        <NumberInput
          aria-label={t("aria.fontSize")}
          min={8}
          max={600}
          suffix="px"
          value={layer.fontSize}
          onChange={(v) => set("fontSize", v)}
        />
        <TooltipTrigger>
          <Toggle
            variant="outline"
            aria-label={t("aria.allCaps")}
            isSelected={layer.uppercase}
            onChange={(v) => set("uppercase", v)}
          >
            <HugeiconsIcon icon={TextAllCapsIcon} strokeWidth={2} />
          </Toggle>
          <Tooltip>{t("aria.allCaps")}</Tooltip>
        </TooltipTrigger>
      </Row>
    </>
  )
}

function BubbleSections({
  layer,
  set,
  patch,
}: {
  layer: BubbleLayer
  set: Setter<BubbleLayer>
  patch: (patch: Partial<BubbleLayer>) => void
}) {
  const t = useT(messages)
  return (
    <>
      <Section
        title={t("sections.bubble")}
        action={
          <span className="text-xs text-muted-foreground">
            {t(`shapes.${layer.shape}`)}
          </span>
        }
      >
        <ToggleGroup
          variant="outline"
          spacing={0}
          className="w-full"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[layer.shape]}
          onSelectionChange={(keys) => {
            const shape = [...keys][0] as BubbleShape | undefined
            if (!shape) return
            // Swap the paper colour when moving between balloons and captions.
            const fill =
              shape === "caption" && layer.fill === "#ffffff"
                ? "#fff3b0"
                : shape !== "caption" && layer.fill === "#fff3b0"
                  ? "#ffffff"
                  : layer.fill
            patch({ shape, fill })
          }}
        >
          {SHAPES.map((s) => (
            <ToggleGroupItem
              key={s.id}
              id={s.id}
              aria-label={t(`shapes.${s.id}`)}
              className="flex-1"
            >
              <HugeiconsIcon icon={s.icon} strokeWidth={2} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {layer.shape !== "caption" && (
          <Row label={t("rows.tail")}>
            <Switch
              aria-label={t("aria.showTail")}
              isSelected={layer.tail}
              onChange={(v) => set("tail", v)}
            />
            <span className="truncate text-xs text-muted-foreground">
              {t("notes.tail")}
            </span>
          </Row>
        )}
        <Row label={t("rows.fill")}>
          <ColorInput
            aria-label={t("aria.fillColor")}
            value={layer.fill}
            onChange={(v) => set("fill", v)}
          />
        </Row>
        <Row label={t("rows.border")}>
          <NumberInput
            aria-label={t("aria.borderWidth")}
            min={0}
            max={40}
            value={layer.borderWidth}
            onChange={(v) => set("borderWidth", v)}
            className="w-16 flex-none"
          />
          <ColorInput
            aria-label={t("aria.borderColor")}
            value={layer.borderColor}
            onChange={(v) => set("borderColor", v)}
          />
        </Row>
      </Section>
      <Section title={t("sections.lettering")}>
        <LetteringRows layer={layer} set={set as never} />
        <Row label={t("rows.color")}>
          <ColorInput
            aria-label={t("aria.textColor")}
            value={layer.textColor}
            onChange={(v) => set("textColor", v)}
          />
        </Row>
        <p className="text-xs text-muted-foreground">{t("notes.lettering")}</p>
      </Section>
    </>
  )
}

function TextSections({
  layer,
  set,
}: {
  layer: TextLayer
  set: Setter<TextLayer>
}) {
  const t = useT(messages)
  return (
    <Section title={t("sections.text")}>
      <LetteringRows layer={layer} set={set as never} />
      <Row label={t("rows.align")}>
        <ToggleGroup
          variant="outline"
          spacing={0}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[layer.align]}
          onSelectionChange={(keys) => {
            const align = [...keys][0] as TextAlign | undefined
            if (align) set("align", align)
          }}
        >
          <ToggleGroupItem id="left" aria-label={t("aria.alignLeft")}>
            <HugeiconsIcon icon={TextAlignLeftIcon} strokeWidth={2} />
          </ToggleGroupItem>
          <ToggleGroupItem id="center" aria-label={t("aria.alignCenter")}>
            <HugeiconsIcon icon={TextAlignCenterIcon} strokeWidth={2} />
          </ToggleGroupItem>
          <ToggleGroupItem id="right" aria-label={t("aria.alignRight")}>
            <HugeiconsIcon icon={TextAlignRightIcon} strokeWidth={2} />
          </ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <Row label={t("rows.color")}>
        <ColorInput
          aria-label={t("aria.textColor")}
          value={layer.color}
          onChange={(v) => set("color", v)}
        />
      </Row>
      <Row label={t("rows.stroke")}>
        <NumberInput
          aria-label={t("aria.strokeWidth")}
          min={0}
          max={60}
          value={layer.strokeWidth}
          onChange={(v) => set("strokeWidth", v)}
          className="w-16 flex-none"
        />
        <ColorInput
          aria-label={t("aria.strokeColor")}
          value={layer.strokeColor}
          onChange={(v) => set("strokeColor", v)}
        />
      </Row>
    </Section>
  )
}

// Keys are symbols, except "scroll", which is looked up per locale.
const SHORTCUTS: [keyof (typeof messages)["en"]["shortcuts"], string][] = [
  ["undoRedo", "⌘Z  ⇧⌘Z"],
  ["duplicate", "⌘D"],
  ["delete", "⌫"],
  ["nudge", "←↑→↓"],
  ["forwardBack", "]  ["],
  ["zoom", "scroll"],
  ["fitPage", "⇧1"],
  ["nextPrevSlide", "PgDn  PgUp  ← →"],
  ["hopLayer", "⌥ ←↑→↓"],
  ["describe", "↵"],
  ["browse", "← → ↑ ↓"],
]

function PageInspector({ editor }: { editor: ComicEditor }) {
  const t = useT(messages)
  const { doc } = editor
  const format = formatOf(doc)
  const setPage = (patch: Partial<typeof doc>, key: string) =>
    editor.commit((d) => ({ ...d, ...patch }), `page-${key}`)

  return (
    <>
      <Section
        title={t("sections.carousel")}
        action={
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("slideCount", { count: editor.project.pages.length })}
          </span>
        }
      >
        <Row label={t("rows.format")}>
          <NativeSelect
            size="sm"
            className="w-full"
            aria-label={t("rows.format")}
            value={format?.id ?? "custom"}
            onChange={(e) => {
              const f = FORMATS.find((f) => f.id === e.target.value)
              if (f) setPage({ width: f.width, height: f.height }, "format")
            }}
          >
            {FORMATS.map((f) => (
              <NativeSelectOption key={f.id} value={f.id}>
                {t(`formats.${f.id}`)}
              </NativeSelectOption>
            ))}
            {!format && (
              <NativeSelectOption value="custom">
                {t("formats.custom")}
              </NativeSelectOption>
            )}
          </NativeSelect>
        </Row>
        <Row label={t("rows.size")}>
          <NumberInput
            prefix={t("prefix.width")}
            aria-label={t("aria.width")}
            min={100}
            max={8000}
            value={doc.width}
            onChange={(v) => setPage({ width: v }, "width")}
          />
          <NumberInput
            prefix={t("prefix.height")}
            aria-label={t("aria.height")}
            min={100}
            max={8000}
            value={doc.height}
            onChange={(v) => setPage({ height: v }, "height")}
          />
        </Row>
        <Row label={t("rows.paper")}>
          <ColorInput
            aria-label={t("aria.pageColor")}
            value={doc.background}
            onChange={(v) => setPage({ background: v }, "background")}
          />
        </Row>
        <p className="text-xs text-muted-foreground">{t("notes.carousel")}</p>
      </Section>
      <Section title={t("sections.shortcuts")}>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
          {SHORTCUTS.map(([id, keys]) => (
            <React.Fragment key={id}>
              <dt className="text-muted-foreground">{t(`shortcuts.${id}`)}</dt>
              <dd className="flex justify-end gap-1">
                {(keys === "scroll" ? t("keys.scroll") : keys)
                  .split("  ")
                  .map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      </Section>
    </>
  )
}
