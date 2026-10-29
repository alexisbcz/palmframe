import * as React from "react"
import { useSubmit } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  BubbleChatIcon,
  FileAddIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  ImageAdd01Icon,
  Redo02Icon,
  SparklesIcon,
  SquareIcon,
  TextIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Separator } from "@workspace/ui/components/separator"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { AccountMenu } from "@/components/account/account-menu"
import { CloudBar } from "@/components/account/cloud-bar"
import { GitHubButton } from "@/components/github-button"
import { LanguageToggle } from "@/components/language-toggle"
import { ModeToggle } from "@/components/mode-toggle"
import { PublishButton } from "@/components/zernio/publish-dialog"

import { Composer, type ComposerHandle } from "./composer"
import { ExportButton } from "./export-panel"
import { roving } from "./roving"
import { download, insertImageFile, pickFile } from "./actions"
import {
  CanvasMenu,
  type CanvasMenuRequest,
  type LayerClipboard,
} from "./canvas-menu"
import { Inspector } from "./inspector"
import {
  createBubble,
  createDefaultProject,
  createPanel,
  createText,
  toProject,
  uid,
  type ComicProject,
  type Layer,
} from "./model"
import type { ImageCache } from "./render"
import { PageStrip } from "./page-strip"
import { Sidebar, type SidebarTab } from "./sidebar"
import { Stage } from "./stage"
import type { CloudProject } from "./use-cloud-sync"
import { useComicEditor, type ComicEditor } from "./use-editor"
import { hasPrompt, useGenerator } from "./use-generator"
import { useT } from "@/i18n/core"
import { messages } from "./editor.messages"

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4]

// Focus on the page itself or the stage, not on some control.
function onCanvas(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return (
    !el || el === document.body || !!el.closest?.('[data-slot="comic-stage"]')
  )
}

const visible = (layers: Layer[]) => layers.filter((l) => !l.hidden)

function readingOrder(layers: Layer[]) {
  return [...visible(layers)].sort((a, b) => a.y - b.y || a.x - b.x)
}

// The closest visible layer whose centre lies in the arrow's direction.
function neighbour(layers: Layer[], from: Layer, key: string) {
  const [dx, dy] =
    key === "arrowleft"
      ? [-1, 0]
      : key === "arrowright"
        ? [1, 0]
        : key === "arrowup"
          ? [0, -1]
          : [0, 1]
  const cx = from.x + from.width / 2
  const cy = from.y + from.height / 2
  let best: Layer | null = null
  let score = Infinity
  for (const l of visible(layers)) {
    if (l.id === from.id) continue
    const ox = l.x + l.width / 2 - cx
    const oy = l.y + l.height / 2 - cy
    const along = ox * dx + oy * dy
    if (along <= 0) continue
    const s = along + Math.abs(dx ? oy : ox) * 2
    if (s < score) {
      score = s
      best = l
    }
  }
  return best
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  )
}

// `zernio` is on when the server has a ZERNIO_API_KEY: it adds posting to Instagram.
// With `cloud`, the carousel is a project of the signed-in account and saves there.
export function ComicCanvasEditor({
  zernio = false,
  cloud,
}: {
  zernio?: boolean
  cloud?: CloudProject & { project: ComicProject }
}) {
  const t = useT(messages)
  const editor = useComicEditor({ initial: cloud?.project })
  const submit = useSubmit()
  const generator = useGenerator(editor)
  const [tab, setTab] = React.useState<SidebarTab>("layers")
  const composerRef = React.useRef<ComposerHandle>(null)
  // The composer mounts with the selection, so wait a frame before focusing.
  const focusComposer = React.useCallback(
    () => requestAnimationFrame(() => composerRef.current?.focus()),
    []
  )
  const images = React.useMemo<ImageCache>(() => new Map(), [])
  const [view, setView] = React.useState({ zoom: 0.5, fit: true })
  const onZoom = React.useCallback(
    (zoom: number, fit = false) => setView({ zoom, fit }),
    []
  )
  const zoomBy = React.useCallback(
    (dir: 1 | -1) =>
      setView(({ zoom }) => ({
        fit: false,
        zoom:
          dir > 0
            ? (ZOOM_STEPS.find((z) => z > zoom + 0.001) ?? 4)
            : ([...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001) ?? 0.1),
      })),
    []
  )

  const saveProject = React.useCallback(() => {
    const json = JSON.stringify(editor.projectRef.current)
    download(
      new Blob([json], { type: "application/json" }),
      "palmframe-carousel.json"
    )
  }, [editor.projectRef])

  const openProject = React.useCallback(async () => {
    const file = await pickFile("application/json,.json")
    if (!file) return
    try {
      const project = toProject(JSON.parse(await file.text()))
      if (project) {
        editor.replaceProject(project)
        setView((v) => ({ ...v, fit: true }))
      }
    } catch {}
  }, [editor])

  const fitView = React.useCallback(
    () => setView((v) => ({ ...v, fit: true })),
    []
  )
  const [menu, setMenu] = React.useState<CanvasMenuRequest | null>(null)
  // Right-click also changes the selection. Open a frame later so the
  // inspector mounts before the menu makes the rest of the page inert.
  const openMenu = React.useCallback(
    (request: CanvasMenuRequest) =>
      requestAnimationFrame(() => setMenu(request)),
    []
  )

  // Layers copy within the app; images pasted from elsewhere still win.
  const copied = React.useRef<Layer | null>(null)
  const [hasCopy, setHasCopy] = React.useState(false)
  const clipboard = React.useMemo<LayerClipboard>(
    () => ({
      has: hasCopy,
      copy: (id) => {
        const found = editor.findLayer(id)?.layer
        if (!found) return
        copied.current = found
        setHasCopy(true)
      },
      paste: (at) => {
        const source = copied.current
        if (!source) return
        const layer = { ...source, id: uid(), locked: false, hidden: false }
        if (at) {
          layer.x = Math.round(at.x - layer.width / 2)
          layer.y = Math.round(at.y - layer.height / 2)
        } else {
          layer.x += 24
          layer.y += 24
          copied.current = layer
        }
        editor.add(layer)
      },
    }),
    [editor, hasCopy]
  )

  useShortcuts(editor, zoomBy, fitView, clipboard, focusComposer)

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const files = [...(e.clipboardData?.files ?? [])].filter((f) =>
        f.type.startsWith("image/")
      )
      e.preventDefault()
      if (files.length) files.forEach((f) => insertImageFile(editor, f))
      else clipboard.paste()
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [editor, clipboard])

  const prompted = editor.project.pages
    .flatMap((p) => p.layers)
    .filter((l) => l.type === "panel" && hasPrompt(l)).length
  const busy = Object.keys(generator.jobs).length > 0

  return (
    <div className="grid h-svh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background text-foreground">
      <header className="flex h-12 items-center justify-between gap-2 border-b px-2.5">
        <div className="flex items-center gap-2">
          <DropdownMenuTrigger>
            <Button variant="secondary">
              {t("menu.open")}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={2}
                data-icon="inline-end"
              />
            </Button>
            <DropdownMenu
              className="w-max max-w-[calc(100vw-2rem)] min-w-52"
              onAction={(key) => {
                // A new carousel in an account is a new project.
                if (key === "new" && cloud)
                  submit(
                    { intent: "new" },
                    { method: "post", action: "/projects" }
                  )
                else if (key === "new") {
                  editor.replaceProject(createDefaultProject())
                  setView((v) => ({ ...v, fit: true }))
                }
                if (key === "open") openProject()
                if (key === "generate-all") generator.generateAll()
                if (key === "save") saveProject()
                if (key === "image")
                  pickFile("image/*").then(
                    (f) => f && insertImageFile(editor, f)
                  )
              }}
            >
              <DropdownMenuItem id="new">
                <HugeiconsIcon icon={FileAddIcon} strokeWidth={2} />
                {t("menu.newCarousel")}
              </DropdownMenuItem>
              <DropdownMenuItem id="open">
                <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
                {t("menu.openProject")}
              </DropdownMenuItem>
              <DropdownMenuItem id="save">
                <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} />
                {t("menu.saveProject")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                id="generate-all"
                isDisabled={!prompted || busy}
              >
                <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
                {t("menu.generateAll", { count: prompted })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem id="image">
                <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} />
                {t("menu.importImage")}
                <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenu>
          </DropdownMenuTrigger>
          {cloud && <CloudBar editor={editor} cloud={cloud} images={images} />}
        </div>
        <div className="flex items-center gap-2">
          <GitHubButton />
          <LanguageToggle />
          <ModeToggle />
          <ExportButton editor={editor} images={images} />
          {zernio && <PublishButton editor={editor} images={images} />}
          <AccountMenu />
        </div>
      </header>

      <div className="flex min-h-0">
        <aside className="hidden w-72 shrink-0 border-e bg-background md:block">
          <Sidebar
            editor={editor}
            tab={tab}
            onTabChange={setTab}
            onContextMenu={openMenu}
          />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <PageStrip
            editor={editor}
            images={images}
            generating={generator.jobs}
          />
          <div className="relative flex min-h-0 flex-1">
            <Stage
              editor={editor}
              images={images}
              zoom={view.zoom}
              fit={view.fit}
              onZoom={onZoom}
              generating={generator.jobs}
              onContextMenu={openMenu}
            />
            <Toolbar
              editor={editor}
              zoom={view.zoom}
              onZoomAction={(key) => {
                if (key === "in") zoomBy(1)
                else if (key === "out") zoomBy(-1)
                else if (key === "fit") setView((v) => ({ ...v, fit: true }))
                else setView({ zoom: Number(key), fit: false })
              }}
            />
          </div>
          <Composer ref={composerRef} editor={editor} generator={generator} />
        </main>
        <aside className="hidden w-72 shrink-0 border-s bg-background lg:block">
          <Inspector editor={editor} onGenerate={focusComposer} />
        </aside>
      </div>
      <CanvasMenu
        request={menu}
        onClose={() => setMenu(null)}
        editor={editor}
        generator={generator}
        clipboard={clipboard}
        onOpenGenerate={focusComposer}
        onFit={fitView}
      />
    </div>
  )
}

function ToolButton({
  label,
  shortcut,
  icon,
  onPress,
  isDisabled,
}: {
  label: string
  shortcut?: string
  icon: typeof Undo02Icon
  onPress: () => void
  isDisabled?: boolean
}) {
  const button = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onPress={onPress}
      isDisabled={isDisabled}
      data-roving
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} />
    </Button>
  )
  if (isDisabled) return button
  return (
    <TooltipTrigger>
      {button}
      <Tooltip>
        {label}
        {shortcut && <span className="text-background/60">{shortcut}</span>}
      </Tooltip>
    </TooltipTrigger>
  )
}

function Toolbar({
  editor,
  zoom,
  onZoomAction,
}: {
  editor: ComicEditor
  zoom: number
  onZoomAction: (key: string) => void
}) {
  const t = useT(messages)
  const { doc } = editor
  const center = { x: doc.width / 2, y: doc.height / 2 }

  return (
    <div
      role="toolbar"
      aria-label={t("toolbar.label")}
      data-roving-group
      // Capture: react-aria buttons stop keydown from bubbling.
      onKeyDownCapture={roving({ axis: "x" })}
      className="absolute start-1/2 bottom-4 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg rtl:translate-x-1/2"
    >
      <ToolButton
        label={t("toolbar.undo")}
        shortcut="⌘Z"
        icon={Undo02Icon}
        onPress={editor.undo}
        isDisabled={!editor.canUndo}
      />
      <ToolButton
        label={t("toolbar.redo")}
        shortcut="⇧⌘Z"
        icon={Redo02Icon}
        onPress={editor.redo}
        isDisabled={!editor.canRedo}
      />
      <Separator orientation="vertical" className="mx-1 my-1.5" />
      <ToolButton
        label={t("toolbar.panel")}
        icon={SquareIcon}
        onPress={() =>
          editor.add(
            createPanel({
              x: center.x - 270,
              y: center.y - 200,
              width: 540,
              height: 400,
            })
          )
        }
      />
      <ToolButton
        label={t("toolbar.speech")}
        icon={BubbleChatIcon}
        onPress={() => editor.add(createBubble("speech", center))}
      />
      <ToolButton
        label={t("toolbar.sfx")}
        icon={TextIcon}
        onPress={() => editor.add(createText(center))}
      />
      <ToolButton
        label={t("toolbar.image")}
        icon={ImageAdd01Icon}
        onPress={() =>
          pickFile("image/*").then((f) => f && insertImageFile(editor, f))
        }
      />
      <Separator orientation="vertical" className="mx-1 my-1.5" />
      <DropdownMenuTrigger>
        <Button variant="ghost" className="w-20 tabular-nums" data-roving>
          {Math.round(zoom * 100)}%
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            data-icon="inline-end"
            className="rotate-180"
          />
        </Button>
        <DropdownMenu
          placement="top end"
          className="w-max max-w-[calc(100vw-2rem)] min-w-44"
          onAction={(key) => onZoomAction(String(key))}
        >
          <DropdownMenuItem id="in">
            {t("toolbar.zoomIn")}
            <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem id="out">
            {t("toolbar.zoomOut")}
            <DropdownMenuShortcut>⌘−</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem id="fit">
            {t("toolbar.zoomFit")}
            <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem id="0.5">50%</DropdownMenuItem>
          <DropdownMenuItem id="1">100%</DropdownMenuItem>
          <DropdownMenuItem id="2">200%</DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
    </div>
  )
}

function useShortcuts(
  editor: ComicEditor,
  zoomBy: (dir: 1 | -1) => void,
  fit: () => void,
  clipboard: LayerClipboard,
  compose: () => void
) {
  const ref = React.useRef({ editor, zoomBy, fit, clipboard, compose })
  ref.current = { editor, zoomBy, fit, clipboard, compose }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A focused list, menu or slider already used the key.
      if (e.defaultPrevented || isTyping(e.target)) return
      const { editor, zoomBy, fit, clipboard, compose } = ref.current
      const mod = e.metaKey || e.ctrlKey
      const sel = editor.selected
      const key = e.key.toLowerCase()

      if (mod && key === "z") {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
      } else if (mod && key === "y") {
        e.preventDefault()
        editor.redo()
      } else if (mod && (key === "=" || key === "+")) {
        e.preventDefault()
        zoomBy(1)
      } else if (mod && key === "-") {
        e.preventDefault()
        zoomBy(-1)
      } else if (e.shiftKey && e.code === "Digit1") {
        fit()
      } else if (key === "pagedown" || key === "pageup") {
        e.preventDefault()
        editor.goToPage(editor.pageIndex + (key === "pagedown" ? 1 : -1))
      } else if (!sel) {
        // With nothing selected and nothing focused, arrows browse: left and
        // right turn slides, down or up picks the first layer to work on.
        if (!onCanvas(e.target) || !key.startsWith("arrow")) return
        e.preventDefault()
        if (key === "arrowleft" || key === "arrowright")
          editor.goToPage(editor.pageIndex + (key === "arrowright" ? 1 : -1))
        else {
          const first = readingOrder(editor.docRef.current.layers)[0]
          if (first) editor.select(first.id)
        }
      } else if (
        key === "enter" &&
        sel.type === "panel" &&
        onCanvas(e.target)
      ) {
        e.preventDefault()
        compose()
      } else if (e.altKey && key.startsWith("arrow")) {
        // Option+arrows hop the selection to the nearest layer that way.
        e.preventDefault()
        const next = neighbour(editor.docRef.current.layers, sel, key)
        if (next) editor.select(next.id)
      } else if (key === "escape") {
        editor.select(null)
      } else if (key === "backspace" || key === "delete") {
        e.preventDefault()
        editor.remove(sel.id)
      } else if (mod && (key === "c" || key === "x")) {
        e.preventDefault()
        clipboard.copy(sel.id)
        if (key === "x") editor.remove(sel.id)
      } else if (mod && key === "d") {
        e.preventDefault()
        editor.duplicate(sel.id)
      } else if (key === "]") {
        editor.move(sel.id, mod ? "top" : "up")
      } else if (key === "[") {
        editor.move(sel.id, mod ? "bottom" : "down")
      } else if (key.startsWith("arrow") && !sel.locked) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0
        editor.update(
          sel.id,
          { x: sel.x + dx, y: sel.y + dy },
          `nudge-${sel.id}`
        )
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
