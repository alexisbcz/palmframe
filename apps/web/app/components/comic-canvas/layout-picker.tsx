import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, ScanImageIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import {
  PRESETS,
  placePreset,
  presetRects,
  readingOrder,
  type PagePreset,
} from "./layouts"
import { isPresetId, messages } from "./layouts.messages"
import { formatOf } from "./model"
import { PanelSplitter } from "./panel-splitter"
import { messages as splitterMessages } from "./panel-splitter.messages"
import { roving } from "./roving"
import type { ComicEditor } from "./use-editor"

function LayoutTile({
  editor,
  preset,
  label,
  best,
}: {
  editor: ComicEditor
  preset: PagePreset
  label: string
  best?: boolean
}) {
  const t = useT(messages)
  const { doc } = editor
  const rtl = !!editor.project.rtl
  const rects = presetRects(preset, doc, rtl)
  const order = readingOrder(
    rects.map((r, i) => ({ ...r, i })),
    rtl
  ).map((r) => r.i)
  return (
    <button
      type="button"
      title={`${label} · ${t("panels", { count: rects.length })}${best ? ` · ${t("best")}` : ""}`}
      className="group/layout flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg p-1.5 text-xs text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      data-roving
      onClick={() => {
        editor.commit((d) => ({
          ...d,
          layers: placePreset(d, preset, rtl),
        }))
        editor.select(null)
      }}
    >
      <div
        className="relative w-full rounded-sm bg-background ring-1 ring-border transition-shadow group-hover/layout:ring-foreground/30"
        style={{ aspectRatio: `${doc.width} / ${doc.height}` }}
      >
        {rects.map((r, i) => (
          <div
            key={i}
            className="absolute flex items-center justify-center rounded-[1px] bg-foreground/15 text-[9px] text-foreground/60 tabular-nums ring-1 ring-foreground/40"
            style={{
              left: `${(r.x / doc.width) * 100}%`,
              top: `${(r.y / doc.height) * 100}%`,
              width: `${(r.width / doc.width) * 100}%`,
              height: `${(r.height / doc.height) * 100}%`,
            }}
          >
            {order.indexOf(i) + 1}
          </div>
        ))}
        {best && (
          <span
            aria-hidden
            className="absolute -end-1 -top-1 size-2 rounded-full bg-amber-500 ring-2 ring-background"
          />
        )}
      </div>
      <span className={cn("w-full truncate text-center")}>{label}</span>
    </button>
  )
}

// One-click layouts for the current slide, the ones that suit its format
// first, plus the reading direction of the whole carousel.
export function LayoutPicker({
  editor,
  columns = 3,
}: {
  editor: ComicEditor
  columns?: number
}) {
  const t = useT(messages)
  const ts = useT(splitterMessages)
  const [splitting, setSplitting] = React.useState(false)
  const { doc } = editor
  const rtl = !!editor.project.rtl
  const format = formatOf(doc)?.id
  const presets = React.useMemo(
    () =>
      [...PRESETS].sort(
        (a, b) =>
          Number(!!format && !!b.best?.includes(format)) -
          Number(!!format && !!a.best?.includes(format))
      ),
    [format]
  )
  const label = (id: string) => (isPresetId(id) ? t(`presets.${id}`) : id)
  const saved = editor.project.layouts ?? []
  const grid = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={t("label")}
        className="grid gap-2"
        style={grid}
        data-roving-group
        onKeyDown={roving()}
      >
        {presets.map((preset) => (
          <LayoutTile
            key={preset.id}
            editor={editor}
            preset={preset}
            label={label(preset.id)}
            best={!!format && preset.best?.includes(format)}
          />
        ))}
      </div>
      {saved.length > 0 && (
        <>
          <h4 className="mt-1 text-xs font-medium text-muted-foreground">
            {ts("yours")}
          </h4>
          <div
            role="group"
            aria-label={ts("yours")}
            className="grid gap-2"
            style={grid}
            data-roving-group
            onKeyDown={roving()}
          >
            {saved.map((layout) => (
              <div key={layout.id} className="relative min-w-0">
                <LayoutTile
                  editor={editor}
                  preset={layout}
                  label={layout.name}
                />
                <Button
                  variant="outline"
                  size="icon-xs"
                  className="absolute end-0 top-0"
                  aria-label={ts("removeLayout", { name: layout.name })}
                  onPress={() =>
                    editor.commitProject((p) => ({
                      ...p,
                      layouts: p.layouts?.filter((l) => l.id !== layout.id),
                    }))
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
      <Button
        variant="outline"
        className="mt-1"
        onPress={() => {
          setSplitting(true)
        }}
      >
        <HugeiconsIcon
          icon={ScanImageIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {ts("open")}
      </Button>
      {splitting && (
        <PanelSplitter editor={editor} onClose={() => setSplitting(false)} />
      )}
      <div className="mt-1 flex items-center gap-2">
        <Switch
          size="sm"
          aria-label={t("rtl")}
          isSelected={rtl}
          onChange={(on) =>
            editor.commitProject((p) => ({ ...p, rtl: on || undefined }))
          }
        />
        <span className="text-xs">{t("rtl")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("rtlHint")}</p>
    </div>
  )
}
