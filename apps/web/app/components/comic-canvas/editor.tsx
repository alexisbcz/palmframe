import * as React from "react"
import { useSubmit } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  BubbleChatIcon,
  FileAddIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  ImageAdd01Icon,
  Layers01Icon,
  PaintBoardIcon,
  Redo02Icon,
  ScanEyeIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  TextIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Separator } from "@workspace/ui/components/separator"
import { Sheet } from "@workspace/ui/components/sheet"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { AccountMenu, useViewer } from "@/components/account/account-menu"
import { CloudBar } from "@/components/account/cloud-bar"
import { GitHubButton } from "@/components/github-button"
import { LanguageToggle } from "@/components/language-toggle"
import { ModeToggle } from "@/components/mode-toggle"
import { PublishButton } from "@/components/instagram/publish-dialog"

import { Composer, type ComposerHandle } from "./composer"
import { ExportButton } from "./export-panel"
import { RunButton } from "./run-panel"
import { StoryButton } from "./story-panel"
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
import { CheckDialog, type CheckScope } from "./check-tools"
import { messages as checkMessages } from "./check.messages"
import { RestyleDialog, postprocessMessages } from "./postprocess-tools"
import { ShareButton } from "./share-dialog"
import { Sidebar, type SidebarTab } from "./sidebar"
import { Stage } from "./stage"
import type { SeriesContext } from "./series"
import { useSeries } from "./series-dialog"
import type { CloudProject } from "./use-cloud-sync"
import { useComicEditor, type ComicEditor } from "./use-editor"
import { hasPrompt, useGenerator } from "./use-generator"
import { useAssetsFromUrl } from "@/components/catalog/editor-tab"
import { useT } from "@/i18n/core"
import { messages } from "./editor.messages"

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4]

const DOCKS_KEY = "palmframe:docks"
const ALL_DOCKS = {
  left: true,
  right: true,
  top: true,
  bottom: true,
  sizes: {} as Partial<Record<Side, number>>,
}
type Side = "left" | "right" | "top" | "bottom"
type Docks = typeof ALL_DOCKS

// In pixels. The share caps what one panel may take from a small window.
const DOCK_SIZES: Record<
  Side,
  { min: number; max: number; share: number; initial: number }
> = {
  left: { min: 200, max: 480, share: 0.35, initial: 288 },
  right: { min: 240, max: 480, share: 0.35, initial: 288 },
  top: { min: 90, max: 250, share: 0.3, initial: 117 },
  bottom: { min: 130, max: 420, share: 0.4, initial: 130 },
}
// How far past its minimum a panel is dragged before it collapses instead.
const COLLAPSE_PAST = 48
// The strip's padding and border around a thumbnail.
const STRIP_CHROME = 33

// Each rail lies just outside its panel, against the border, so it never
// covers the panel's own controls. `after` is the line, `before` the grip that
// marks a closed panel.
const RAIL: Record<Side, string> = {
  left: "inset-y-0 start-full w-3 after:inset-y-0 after:start-0 after:w-0.5 before:start-0.5 before:top-1/2 before:h-8 before:w-1 before:-translate-y-1/2",
  right:
    "inset-y-0 end-full w-3 after:inset-y-0 after:end-0 after:w-0.5 before:end-0.5 before:top-1/2 before:h-8 before:w-1 before:-translate-y-1/2",
  top: "inset-x-0 top-full h-3 after:inset-x-0 after:top-0 after:h-0.5 before:top-0.5 before:left-1/2 before:h-1 before:w-8 before:-translate-x-1/2",
  bottom:
    "inset-x-0 bottom-full h-3 after:inset-x-0 after:bottom-0 after:h-0.5 before:bottom-0.5 before:left-1/2 before:h-1 before:w-8 before:-translate-x-1/2",
}

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

// A dialog's keys are its own: the guide drawer has an undo of its own.
const inDialog = (target: EventTarget | null) =>
  !!(target as HTMLElement | null)?.closest?.("[data-slot=dialog-content]")

// `instagram` is on when the server can post: signed-in users then connect
// their own accounts from the Post dialog.
// With `cloud`, the carousel is a project of the signed-in account and saves there.
export function ComicCanvasEditor({
  instagram = false,
  cloud,
}: {
  instagram?: boolean
  cloud?: CloudProject & {
    project: ComicProject
    series: SeriesContext | null
  }
}) {
  const t = useT(messages)
  const editor = useComicEditor({ initial: cloud?.project })
  const series = useSeries(cloud?.series ?? null, editor)
  const submit = useSubmit()
  const viewer = useViewer()
  const generator = useGenerator(editor)
  const [tab, setTab] = React.useState<SidebarTab>("layers")
  const showCatalog = React.useCallback(() => setTab("catalog"), [])
  useAssetsFromUrl(editor, showCatalog)
  const tp = useT(postprocessMessages)
  const [restyling, setRestyling] = React.useState(false)
  const tc = useT(checkMessages)
  const [checking, setChecking] = React.useState<CheckScope | null>(null)
  const [sheet, setSheet] = React.useState<"layers" | "inspect" | null>(null)
  // Tablets get the properties as a side sheet, phones from the bottom.
  const wide = useMedia("(min-width: 768px)")
  const [docks, setDocks, setDockSize] = useDocks()
  const dockSize = (side: Side) => docks.sizes[side] ?? DOCK_SIZES[side].initial
  const composerRef = React.useRef<ComposerHandle>(null)
  // The composer mounts with the selection, so wait a frame before focusing.
  const focusComposer = React.useCallback(() => {
    setDocks({ bottom: true })
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [setDocks])
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
    <div className="grid h-svh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background text-foreground">
      <header className="flex h-12 items-center justify-between gap-1.5 border-b px-2 sm:gap-2 sm:px-2.5">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
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
                if (key === "restyle-all") setRestyling(true)
                if (key === "check-all") setChecking({ page: null })
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
              <DropdownMenuItem id="restyle-all" isDisabled={busy}>
                <HugeiconsIcon icon={PaintBoardIcon} strokeWidth={2} />
                {tp("restyle.menu")}
              </DropdownMenuItem>
              <DropdownMenuItem id="check-all">
                <HugeiconsIcon icon={ScanEyeIcon} strokeWidth={2} />
                {tc("menu")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem id="image">
                <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} />
                {t("menu.importImage")}
                <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenu>
          </DropdownMenuTrigger>
          <StoryButton
            editor={editor}
            generator={generator}
            series={series.context}
          />
          <RunButton
            editor={editor}
            generator={generator}
            series={series.context}
          />
          {cloud && (
            <CloudBar
              editor={editor}
              cloud={cloud}
              images={images}
              series={series}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Signed in, these live in the account menu. */}
          {!viewer && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="contents max-sm:hidden">
                <GitHubButton />
              </span>
              <LanguageToggle />
              <ModeToggle />
            </div>
          )}
          {cloud && <ShareButton projectId={cloud.id} />}
          <ExportButton editor={editor} images={images} />
          {instagram && viewer && (
            <PublishButton editor={editor} images={images} />
          )}
          <AccountMenu />
        </div>
      </header>

      <div className="flex min-h-0">
        <Dock
          side="left"
          label={t("toolbar.layers")}
          isExpanded={docks.left}
          onExpandedChange={(left) => setDocks({ left })}
          onResize={(size) => setDockSize("left", size)}
          className="max-md:hidden"
        >
          <aside
            className="h-full border-e bg-background"
            style={{ width: dockSize("left") }}
          >
            <Sidebar
              editor={editor}
              tab={tab}
              onTabChange={setTab}
              onContextMenu={openMenu}
            />
          </aside>
        </Dock>
        <main className="flex min-w-0 flex-1 flex-col">
          <Dock
            side="top"
            label={t("toolbar.slides")}
            isExpanded={docks.top || !wide}
            onExpandedChange={(top) => setDocks({ top })}
            onResize={(size) => setDockSize("top", size)}
          >
            <PageStrip
              editor={editor}
              images={images}
              generating={generator.jobs}
              onCheck={(page) => setChecking({ page })}
              thumbHeight={wide ? dockSize("top") - STRIP_CHROME : undefined}
            />
          </Dock>
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
              onPanel={setSheet}
              onZoomAction={(key) => {
                if (key === "in") zoomBy(1)
                else if (key === "out") zoomBy(-1)
                else if (key === "fit") setView((v) => ({ ...v, fit: true }))
                else setView({ zoom: Number(key), fit: false })
              }}
            />
          </div>
          <Dock
            side="bottom"
            label={t("toolbar.prompt")}
            isExpanded={docks.bottom || !wide}
            onExpandedChange={(bottom) => setDocks({ bottom })}
            onResize={(size) => setDockSize("bottom", size)}
          >
            <Composer
              ref={composerRef}
              editor={editor}
              generator={generator}
              height={wide ? docks.sizes.bottom : undefined}
            />
          </Dock>
        </main>
        <Dock
          side="right"
          label={t("toolbar.inspect")}
          isExpanded={docks.right}
          onExpandedChange={(right) => setDocks({ right })}
          onResize={(size) => setDockSize("right", size)}
          className="max-lg:hidden"
        >
          <aside
            className="h-full border-s bg-background"
            style={{ width: dockSize("right") }}
          >
            <Inspector
              editor={editor}
              generator={generator}
              onGenerate={focusComposer}
            />
          </aside>
        </Dock>
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
      {/* Below md and lg the side panels are hidden; on phones and tablets
          they open as sheets from the toolbar instead. */}
      <Sheet
        side="bottom"
        isOpen={sheet === "layers"}
        onOpenChange={(o) => !o && setSheet(null)}
        className="gap-0 rounded-t-2xl pt-8 data-[side=bottom]:h-[min(75svh,40rem)] md:hidden"
      >
        <Sidebar
          editor={editor}
          tab={tab}
          onTabChange={setTab}
          onContextMenu={openMenu}
        />
      </Sheet>
      <Sheet
        side={wide ? "right" : "bottom"}
        isOpen={sheet === "inspect"}
        onOpenChange={(o) => !o && setSheet(null)}
        isDismissable
        className={cn(
          "gap-0 pt-10 lg:hidden",
          wide
            ? "data-[side=right]:w-80"
            : "rounded-t-2xl data-[side=bottom]:h-[min(75svh,40rem)]"
        )}
      >
        <Inspector
          editor={editor}
          generator={generator}
          onGenerate={() => {
            setSheet(null)
            focusComposer()
          }}
        />
      </Sheet>
      {checking && (
        <CheckDialog
          editor={editor}
          initial={checking}
          onClose={() => setChecking(null)}
        />
      )}
      {restyling && (
        <RestyleDialog editor={editor} onClose={() => setRestyling(false)} />
      )}
    </div>
  )
}

// A panel at the edge of the workspace. Its rail collapses it on a click, giving
// its room to the stage, and resizes it on a drag or with the arrow keys.
function Dock({
  side,
  label,
  isExpanded,
  onExpandedChange,
  onResize,
  className,
  children,
}: {
  side: Side
  label: string
  isExpanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onResize: (size: number) => void
  className?: string
  children: React.ReactNode
}) {
  const horizontal = side === "left" || side === "right"
  const dragged = React.useRef(false)

  const measure = (rail: Element) => {
    const rect = rail.previousElementSibling!.getBoundingClientRect()
    return horizontal ? rect.width : rect.height
  }
  const clamp = (size: number) => {
    const { min, max, share } = DOCK_SIZES[side]
    const room = horizontal ? window.innerWidth : window.innerHeight
    return Math.round(Math.max(min, Math.min(size, max, room * share)))
  }

  const startDrag = (e: React.PointerEvent) => {
    dragged.current = false
    if (!isExpanded || e.button !== 0) return
    const start = horizontal ? e.clientX : e.clientY
    const from = measure(e.currentTarget)
    const sign = side === "left" || side === "top" ? 1 : -1
    let size = from
    const onMove = (move: PointerEvent) => {
      const delta = (horizontal ? move.clientX : move.clientY) - start
      if (Math.abs(delta) < 3 && !dragged.current) return
      dragged.current = true
      size = from + delta * sign
      onResize(clamp(size))
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      document.body.style.userSelect = ""
      // Reopening brings back the size it had before the drag.
      if (size < DOCK_SIZES[side].min - COLLAPSE_PAST) {
        onResize(clamp(from))
        onExpandedChange(false)
      }
    }
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = horizontal
      ? { ArrowLeft: -1, ArrowRight: 1 }
      : { ArrowUp: -1, ArrowDown: 1 }
    const dir = keys[e.key as keyof typeof keys]
    if (!dir || !isExpanded) return
    e.preventDefault()
    const sign = side === "left" || side === "top" ? 1 : -1
    const size = measure(e.currentTarget)
    if (dir * sign < 0 && size <= DOCK_SIZES[side].min) onExpandedChange(false)
    else onResize(clamp(size + dir * sign * 16))
  }

  return (
    <Collapsible
      isExpanded={isExpanded}
      // The press that ends a drag isn't a click.
      onExpandedChange={(expanded) =>
        dragged.current ? (dragged.current = false) : onExpandedChange(expanded)
      }
      className={cn("relative min-w-0 shrink-0", className)}
    >
      <CollapsibleContent
        className={cn(
          "overflow-clip duration-200 ease-out motion-reduce:transition-none",
          side === "left" || side === "right"
            ? "h-full w-(--disclosure-panel-width) transition-[width]"
            : "h-(--disclosure-panel-height) transition-[height]",
          // The composer's popovers rise out of it.
          side === "bottom" && "aria-[hidden=false]:overflow-visible"
        )}
      >
        {children}
      </CollapsibleContent>
      <CollapsibleTrigger
        aria-label={label}
        onPointerDown={startDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute z-20 cursor-pointer touch-none outline-none before:absolute before:rounded-full before:bg-foreground/25 before:transition-colors after:absolute after:transition-colors hover:before:bg-ring hover:after:bg-ring focus-visible:before:bg-ring focus-visible:after:bg-ring aria-expanded:before:opacity-0 max-md:hidden",
          horizontal
            ? "aria-expanded:cursor-col-resize"
            : "aria-expanded:cursor-row-resize",
          RAIL[side]
        )}
      />
    </Collapsible>
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

function useMedia(query: string) {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

function useDocks() {
  const [docks, setDocks] = React.useState(ALL_DOCKS)

  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DOCKS_KEY) ?? "null")
      if (saved) setDocks({ ...ALL_DOCKS, ...saved })
    } catch {}
  }, [])

  const store = React.useCallback((change: (docks: Docks) => Docks) => {
    setDocks((current) => {
      const next = change(current)
      try {
        localStorage.setItem(DOCKS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])
  const update = React.useCallback(
    (patch: Partial<Docks>) => store((d) => ({ ...d, ...patch })),
    [store]
  )
  const resize = React.useCallback(
    (side: Side, size: number) =>
      store((d) => ({ ...d, sizes: { ...d.sizes, [side]: size } })),
    [store]
  )

  return [docks, update, resize] as const
}

function Toolbar({
  editor,
  zoom,
  onZoomAction,
  onPanel,
}: {
  editor: ComicEditor
  zoom: number
  onZoomAction: (key: string) => void
  onPanel: (panel: "layers" | "inspect") => void
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
      className="absolute start-1/2 bottom-3 flex max-w-[calc(100%-1rem)] -translate-x-1/2 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg sm:bottom-4 rtl:translate-x-1/2"
    >
      <span className="contents md:hidden">
        <ToolButton
          label={t("toolbar.layers")}
          icon={Layers01Icon}
          onPress={() => onPanel("layers")}
        />
        <Separator orientation="vertical" className="mx-0.5 my-1.5 sm:mx-1" />
      </span>
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
      <Separator orientation="vertical" className="mx-0.5 my-1.5 sm:mx-1" />
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
      <Separator orientation="vertical" className="mx-0.5 my-1.5 sm:mx-1" />
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          className="w-14 px-1.5 tabular-nums sm:w-20"
          data-roving
        >
          {Math.round(zoom * 100)}%
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            data-icon="inline-end"
            className="rotate-180 max-sm:hidden"
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
      <span className="contents lg:hidden">
        <Separator orientation="vertical" className="mx-0.5 my-1.5 sm:mx-1" />
        <ToolButton
          label={t("toolbar.inspect")}
          icon={SlidersHorizontalIcon}
          onPress={() => onPanel("inspect")}
        />
      </span>
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
      if (e.defaultPrevented || isTyping(e.target) || inDialog(e.target)) return
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
