import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BubbleChatIcon,
  CloudIcon,
  FlashIcon,
  Image01Icon,
  LockIcon,
  Message01Icon,
  Note01Icon,
  SquareIcon,
  SquareUnlock02Icon,
  TextIcon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { CatalogTab } from "@/components/catalog/editor-tab"
import { useT } from "@/i18n/core"

import {
  createBubble,
  createPanel,
  createText,
  type BubbleShape,
  type Layer,
} from "./model"
import type { CanvasMenuRequest } from "./canvas-menu"
import { roving } from "./roving"
import type { ComicEditor } from "./use-editor"
import { messages } from "./sidebar.messages"
import { LayoutPicker } from "./layout-picker"

function layerIcon(layer: Layer) {
  if (layer.type === "panel") return layer.src ? Image01Icon : SquareIcon
  if (layer.type === "text") return TextIcon
  return {
    speech: BubbleChatIcon,
    thought: CloudIcon,
    shout: FlashIcon,
    caption: Note01Icon,
    message: Message01Icon,
  }[layer.shape]
}

export type SidebarTab = "layers" | "library" | "catalog"

export function Sidebar({
  editor,
  tab,
  onTabChange,
  onContextMenu,
}: {
  editor: ComicEditor
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  onContextMenu: (request: CanvasMenuRequest) => void
}) {
  const t = useT(messages)
  return (
    <Tabs
      selectedKey={tab}
      onSelectionChange={(key) => onTabChange(key as SidebarTab)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="p-3 pb-2">
        <TabsList className="w-full">
          <TabsTrigger id="layers">{t("tabs.layers")}</TabsTrigger>
          <TabsTrigger id="library">{t("tabs.library")}</TabsTrigger>
          <TabsTrigger id="catalog">{t("tabs.catalog")}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent id="layers" className="min-h-0">
        <ScrollArea className="h-full px-3 pb-3">
          <LayerList editor={editor} onContextMenu={onContextMenu} />
        </ScrollArea>
      </TabsContent>
      <TabsContent id="library" className="min-h-0">
        <ScrollArea className="h-full px-3 pb-3">
          <Library editor={editor} />
        </ScrollArea>
      </TabsContent>
      <TabsContent id="catalog" className="min-h-0">
        <ScrollArea className="h-full px-3 pb-3">
          <CatalogTab editor={editor} />
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

function LayerList({
  editor,
  onContextMenu,
}: {
  editor: ComicEditor
  onContextMenu?: (request: CanvasMenuRequest) => void
}) {
  const t = useT(messages)
  const { doc, selected } = editor
  const [renaming, setRenaming] = React.useState<string | null>(null)
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dropIndex, setDropIndex] = React.useState<number | null>(null)
  // The list shows the top of the stack first.
  const rows = [...doc.layers].reverse()

  if (!rows.length) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>{t("empty.title")}</EmptyTitle>
          <EmptyDescription>{t("empty.description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul
      aria-label={t("tabs.layers")}
      data-roving-group
      onKeyDown={roving({ axis: "y", select: true })}
      className="flex flex-col gap-0.5"
      onDragLeave={() => setDropIndex(null)}
    >
      {rows.map((layer, row) => {
        const isSelected = selected?.id === layer.id
        return (
          <li
            key={layer.id}
            draggable={renaming !== layer.id}
            onDragStart={(e) => {
              setDragId(layer.id)
              e.dataTransfer.effectAllowed = "move"
            }}
            onDragOver={(e) => {
              if (!dragId) return
              e.preventDefault()
              const rect = e.currentTarget.getBoundingClientRect()
              setDropIndex(
                e.clientY < rect.top + rect.height / 2 ? row : row + 1
              )
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId && dropIndex !== null) {
                const from = rows.findIndex((l) => l.id === dragId)
                const to = dropIndex > from ? dropIndex - 1 : dropIndex
                editor.move(dragId, rows.length - 1 - to)
              }
              setDragId(null)
              setDropIndex(null)
            }}
            onDragEnd={() => {
              setDragId(null)
              setDropIndex(null)
            }}
            className={cn(
              "group/layer relative flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              isSelected && "bg-muted text-foreground",
              layer.hidden && "text-muted-foreground",
              dragId === layer.id && "opacity-50",
              dropIndex === row &&
                "before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded-full before:bg-amber-500",
              dropIndex === row + 1 &&
                row === rows.length - 1 &&
                "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-amber-500"
            )}
            data-roving
            tabIndex={isSelected || (!selected && row === 0) ? 0 : -1}
            aria-selected={isSelected}
            onClick={() => editor.select(layer.id)}
            onDoubleClick={() => setRenaming(layer.id)}
            // Enter or F2 renames, Option+arrows restack.
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === "Enter" || e.key === "F2") {
                e.preventDefault()
                setRenaming(layer.id)
              } else if (
                e.altKey &&
                (e.key === "ArrowUp" || e.key === "ArrowDown")
              ) {
                e.preventDefault()
                editor.move(layer.id, e.key === "ArrowUp" ? "up" : "down")
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              editor.select(layer.id)
              onContextMenu?.({
                clientX: e.clientX,
                clientY: e.clientY,
                point: null,
                layerId: layer.id,
              })
            }}
          >
            {layer.type === "panel" && layer.src ? (
              <img
                src={layer.src}
                alt=""
                className="size-5 shrink-0 rounded-sm object-cover ring-1 ring-foreground/10"
              />
            ) : (
              <HugeiconsIcon
                icon={layerIcon(layer)}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
            {renaming === layer.id ? (
              <input
                autoFocus
                aria-label={t("layer.name")}
                defaultValue={layer.name}
                className="h-7 min-w-0 flex-1 rounded-md border border-ring bg-background px-1.5 text-sm outline-none"
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => {
                  const name = e.currentTarget.value.trim()
                  if (name && name !== layer.name)
                    editor.update(layer.id, { name })
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur()
                  if (e.key === "Escape") setRenaming(null)
                }}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{layer.name}</span>
            )}
            <RowToggle
              label={layer.locked ? t("layer.unlock") : t("layer.lock")}
              icon={layer.locked ? LockIcon : SquareUnlock02Icon}
              active={layer.locked}
              onToggle={() =>
                editor.update(layer.id, { locked: !layer.locked })
              }
            />
            <RowToggle
              label={layer.hidden ? t("layer.show") : t("layer.hide")}
              icon={layer.hidden ? ViewOffSlashIcon : ViewIcon}
              active={layer.hidden}
              onToggle={() =>
                editor.update(layer.id, { hidden: !layer.hidden })
              }
            />
          </li>
        )
      })}
    </ul>
  )
}

function RowToggle({
  label,
  icon,
  active,
  onToggle,
}: {
  label: string
  icon: typeof ViewIcon
  active: boolean
  onToggle: () => void
}) {
  return (
    <TooltipTrigger>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/layer:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none dark:hover:bg-input/50 pointer-coarse:opacity-100",
          active && "opacity-100"
        )}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
      </button>
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  )
}

function Library({ editor }: { editor: ComicEditor }) {
  const t = useT(messages)
  const { doc } = editor
  const center = { x: doc.width / 2, y: doc.height / 2 }
  const elements: {
    id: string
    label: string
    icon: typeof SquareIcon
    add: () => Layer
  }[] = [
    {
      id: "panel",
      label: t("elements.panel"),
      icon: SquareIcon,
      add: () =>
        createPanel({
          x: center.x - 270,
          y: center.y - 200,
          width: 540,
          height: 400,
        }),
    },
    ...(
      [
        ["speech", BubbleChatIcon],
        ["thought", CloudIcon],
        ["shout", FlashIcon],
        ["caption", Note01Icon],
        ["message", Message01Icon],
      ] as const
    ).map(([shape, icon]) => ({
      id: shape,
      label: t(`elements.${shape}`),
      icon,
      add: () => createBubble(shape as BubbleShape, center),
    })),
    {
      id: "sfx",
      label: t("elements.sfx"),
      icon: TextIcon,
      add: () => createText(center),
    },
  ]

  return (
    <div className="flex flex-col gap-5 pt-1">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t("library.layouts")}
        </h3>
        <LayoutPicker editor={editor} />
        <p className="text-xs text-muted-foreground">
          {t("library.layoutNote")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t("library.elements")}
        </h3>
        <div
          className="grid grid-cols-3 gap-2"
          data-roving-group
          onKeyDown={roving()}
        >
          {elements.map((el) => (
            <button
              key={el.id}
              type="button"
              className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-border bg-background px-1 py-3 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
              data-roving
              onClick={() => editor.add(el.add())}
            >
              <HugeiconsIcon
                icon={el.icon}
                strokeWidth={1.8}
                className="size-5"
              />
              {el.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
