import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BubbleChatIcon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  ImageUploadIcon,
  Layers01Icon,
  LayoutGridIcon,
  LockIcon,
  Note01Icon,
  PlusSignIcon,
  ScissorIcon,
  SparklesIcon,
  SquareIcon,
  SquareUnlock02Icon,
  TextIcon,
  ViewOffSlashIcon,
  ZoomInAreaIcon,
  ArrowRight01Icon,
  ClipboardIcon,
  Edit02Icon,
} from "@hugeicons/core-free-icons"

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@workspace/ui/components/context-menu"

import { insertImageFile, pickFile } from "./actions"
import {
  LAYOUTS,
  createBubble,
  createPanel,
  createText,
  type BubbleShape,
  type Layer,
} from "./model"
import type { ComicEditor } from "./use-editor"
import { hasPrompt, type Generator } from "./use-generator"
import { MAX_SLIDES } from "./page-strip"
import { useT } from "@/i18n/core"
import { messages, type LayoutId } from "./canvas-menu.messages"

export interface CanvasMenuRequest {
  clientX: number
  clientY: number
  // Page coordinates when the click landed on the page itself.
  point: { x: number; y: number } | null
  layerId: string | null
}

export interface LayerClipboard {
  has: boolean
  copy: (id: string) => void
  paste: (at?: { x: number; y: number }) => void
}

const SHAPES: BubbleShape[] = ["speech", "thought", "shout", "caption"]

function focusLayerText() {
  // Let the popover hand focus back before taking it.
  setTimeout(() => {
    const input =
      document.querySelector<HTMLTextAreaElement>("[data-layer-text]")
    input?.focus()
    input?.select()
  }, 50)
}

export function CanvasMenu({
  request,
  onClose,
  editor,
  generator,
  clipboard,
  onOpenGenerate,
  onFit,
}: {
  request: CanvasMenuRequest | null
  onClose: () => void
  editor: ComicEditor
  generator: Generator
  clipboard: LayerClipboard
  onOpenGenerate: () => void
  onFit: () => void
}) {
  const t = useT(messages)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const layer = request?.layerId
    ? (editor.doc.layers.find((l) => l.id === request.layerId) ?? null)
    : null

  const run = (key: React.Key) => {
    onClose()
    const doc = editor.docRef.current
    const at = request?.point ?? { x: doc.width / 2, y: doc.height / 2 }
    if (String(key).startsWith("layout:"))
      return editor.applyLayout(String(key).slice(7))
    if (String(key).startsWith("slide:")) {
      const target = String(key).slice(6)
      if (layer)
        editor.moveLayerToPage(
          layer.id,
          target === "new" ? "new" : Number(target)
        )
      return
    }
    if (String(key).startsWith("shape:") && layer?.type === "bubble") {
      return editor.update(layer.id, {
        shape: String(key).slice(6) as BubbleShape,
      })
    }
    switch (key) {
      case "paste":
        return clipboard.paste(request?.point ?? undefined)
      case "add-panel":
        return editor.add(
          createPanel({ x: at.x - 270, y: at.y - 200, width: 540, height: 400 })
        )
      case "add-speech":
        return editor.add(createBubble("speech", at))
      case "add-caption":
        return editor.add(createBubble("caption", at))
      case "add-sfx":
        return editor.add(createText(at))
      case "import":
        return void pickFile("image/*").then(
          (f) => f && insertImageFile(editor, f, request?.point ?? undefined)
        )
      case "fit":
        return onFit()
      case "add-slide":
        return editor.addPage()
    }
    if (!layer) return
    switch (key) {
      case "upload":
        return void pickFile("image/*").then(
          (f) => f && insertImageFile(editor, f)
        )
      case "generate":
        return void generator.generate(layer.id)
      case "prompt":
        return onOpenGenerate()
      case "remove-image":
        return editor.update(layer.id, { src: null })
      case "tail":
        return (
          layer.type === "bubble" &&
          editor.update(layer.id, { tail: !layer.tail })
        )
      case "edit-text":
        return focusLayerText()
      case "cut":
        clipboard.copy(layer.id)
        return editor.remove(layer.id)
      case "copy":
        return clipboard.copy(layer.id)
      case "duplicate":
        return editor.duplicate(layer.id)
      case "top":
      case "up":
      case "down":
      case "bottom":
        return editor.move(layer.id, key)
      case "lock":
        return editor.update(layer.id, { locked: !layer.locked })
      case "hide":
        editor.update(layer.id, { hidden: true })
        return editor.select(null)
      case "delete":
        return editor.remove(layer.id)
    }
  }

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden
        className="pointer-events-none fixed size-0"
        style={{ left: request?.clientX ?? 0, top: request?.clientY ?? 0 }}
      />
      <ContextMenu
        aria-label={
          layer ? t("layerActions", { name: layer.name }) : t("canvasActions")
        }
        isOpen={!!request}
        onOpenChange={(open) => !open && onClose()}
        triggerRef={anchorRef}
        placement="bottom start"
        offset={2}
        className="w-60"
        onAction={run}
        disabledKeys={clipboard.has ? [] : ["paste"]}
      >
        {layer ? (
          <LayerItems
            layer={layer}
            editor={editor}
            generator={generator}
            run={run}
          />
        ) : (
          <CanvasItems editor={editor} onPage={!!request?.point} run={run} />
        )}
      </ContextMenu>
    </>
  )
}

function Icon({ icon }: { icon: typeof SquareIcon }) {
  return <HugeiconsIcon icon={icon} strokeWidth={2} />
}

function LayerItems({
  layer,
  editor,
  generator,
  run,
}: {
  layer: Layer
  editor: ComicEditor
  generator: Generator
  run: (key: React.Key) => void
}) {
  const t = useT(messages)
  const slides = editor.project.pages.length
  const busy = layer.id in generator.jobs

  return (
    <>
      <ContextMenuLabel className="truncate">{layer.name}</ContextMenuLabel>

      {layer.type === "panel" && (
        <>
          <ContextMenuItem id="upload">
            <Icon icon={ImageUploadIcon} />
            {layer.src ? t("replaceImage") : t("uploadImage")}
          </ContextMenuItem>
          {hasPrompt(layer) ? (
            <ContextMenuItem id="generate" isDisabled={busy || layer.locked}>
              <Icon icon={SparklesIcon} />
              {busy
                ? t("generating")
                : layer.src
                  ? t("generateTake")
                  : t("generate")}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem id="prompt">
              <Icon icon={SparklesIcon} />
              {t("generateWith")}
            </ContextMenuItem>
          )}
          {layer.src && (
            <ContextMenuItem id="remove-image">
              <Icon icon={Cancel01Icon} />
              {t("removeImage")}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
        </>
      )}

      {layer.type === "bubble" && (
        <>
          <ContextMenuItem id="edit-text">
            <Icon icon={Edit02Icon} />
            {t("editText")}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Icon icon={BubbleChatIcon} />
              {t("shape")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent
              className="w-40"
              selectionMode="single"
              selectedKeys={[`shape:${layer.shape}`]}
              onAction={run}
            >
              {SHAPES.map((id) => (
                <ContextMenuItem key={id} id={`shape:${id}`}>
                  {t(`shapes.${id}`)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {layer.shape !== "caption" && (
            <ContextMenuItem id="tail">
              <Icon icon={ArrowRight01Icon} />
              {layer.tail ? t("hideTail") : t("showTail")}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
        </>
      )}

      {layer.type === "text" && (
        <>
          <ContextMenuItem id="edit-text">
            <Icon icon={Edit02Icon} />
            {t("editText")}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}

      <ContextMenuItem id="cut">
        <Icon icon={ScissorIcon} />
        {t("cut")}
        <ContextMenuShortcut>⌘X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem id="copy">
        <Icon icon={Copy01Icon} />
        {t("copy")}
        <ContextMenuShortcut>⌘C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem id="paste">
        <Icon icon={ClipboardIcon} />
        {t("paste")}
        <ContextMenuShortcut>⌘V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem id="duplicate">
        <Icon icon={Copy01Icon} />
        {t("duplicate")}
        <ContextMenuShortcut>⌘D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Icon icon={Layers01Icon} />
          {t("arrange")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52" onAction={run}>
          <ContextMenuItem id="top">
            {t("bringToFront")}
            <ContextMenuShortcut>⌘]</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem id="up">
            {t("bringForward")}
            <ContextMenuShortcut>]</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem id="down">
            {t("sendBackward")}
            <ContextMenuShortcut>[</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem id="bottom">
            {t("sendToBack")}
            <ContextMenuShortcut>⌘[</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Icon icon={ArrowRight01Icon} />
          {t("moveToSlide")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent
          className="w-44"
          onAction={run}
          disabledKeys={[
            `slide:${editor.pageIndex}`,
            ...(slides >= MAX_SLIDES ? ["slide:new"] : []),
          ]}
        >
          {editor.project.pages.map((page, i) => (
            <ContextMenuItem key={page.id} id={`slide:${i}`}>
              {t("slide", { n: i + 1 })}
              {i === editor.pageIndex && (
                <ContextMenuShortcut>{t("current")}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem id="slide:new">
            <Icon icon={PlusSignIcon} />
            {t("newSlide")}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem id="lock">
        <Icon icon={layer.locked ? SquareUnlock02Icon : LockIcon} />
        {layer.locked ? t("unlock") : t("lock")}
      </ContextMenuItem>
      <ContextMenuItem id="hide">
        <Icon icon={ViewOffSlashIcon} />
        {t("hide")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem id="delete" variant="destructive">
        <Icon icon={Delete02Icon} />
        {t("delete")}
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  )
}

function CanvasItems({
  editor,
  onPage,
  run,
}: {
  editor: ComicEditor
  onPage: boolean
  run: (key: React.Key) => void
}) {
  const t = useT(messages)
  return (
    <>
      <ContextMenuItem id="paste">
        <Icon icon={ClipboardIcon} />
        {onPage ? t("pasteHere") : t("paste")}
        <ContextMenuShortcut>⌘V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem id="add-panel">
        <Icon icon={SquareIcon} />
        {onPage ? t("addPanelHere") : t("addPanel")}
      </ContextMenuItem>
      <ContextMenuItem id="add-speech">
        <Icon icon={BubbleChatIcon} />
        {onPage ? t("addSpeechHere") : t("addSpeech")}
      </ContextMenuItem>
      <ContextMenuItem id="add-caption">
        <Icon icon={Note01Icon} />
        {onPage ? t("addCaptionHere") : t("addCaption")}
      </ContextMenuItem>
      <ContextMenuItem id="add-sfx">
        <Icon icon={TextIcon} />
        {onPage ? t("addSfxHere") : t("addSfx")}
      </ContextMenuItem>
      <ContextMenuItem id="import">
        <Icon icon={ImageUploadIcon} />
        {t("importImage")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Icon icon={LayoutGridIcon} />
          {t("layout")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-40" onAction={run}>
          {LAYOUTS.map((l) => (
            <ContextMenuItem key={l.id} id={`layout:${l.id}`}>
              {t(`layouts.${l.id as LayoutId}`)}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem
        id="add-slide"
        isDisabled={editor.project.pages.length >= MAX_SLIDES}
      >
        <Icon icon={PlusSignIcon} />
        {t("addSlide")}
      </ContextMenuItem>
      <ContextMenuItem id="fit">
        <Icon icon={ZoomInAreaIcon} />
        {t("zoomFit")}
        <ContextMenuShortcut>⇧1</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  )
}
