import * as React from "react"

import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import { PRESETS, placePreset, presetRects, readingOrder } from "./layouts"
import { isPresetId, messages } from "./layouts.messages"
import { formatOf } from "./model"
import { roving } from "./roving"
import type { ComicEditor } from "./use-editor"

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

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={t("label")}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        data-roving-group
        onKeyDown={roving()}
      >
        {presets.map((preset) => {
          const rects = presetRects(preset, doc, rtl)
          const order = readingOrder(
            rects.map((r, i) => ({ ...r, i })),
            rtl
          ).map((r) => r.i)
          const best = !!format && preset.best?.includes(format)
          return (
            <button
              key={preset.id}
              type="button"
              title={`${label(preset.id)} · ${t("panels", { count: rects.length })}${best ? ` · ${t("best")}` : ""}`}
              className="group/layout flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-1.5 text-xs text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
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
              <span className={cn("w-full truncate text-center")}>
                {label(preset.id)}
              </span>
            </button>
          )
        })}
      </div>
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
