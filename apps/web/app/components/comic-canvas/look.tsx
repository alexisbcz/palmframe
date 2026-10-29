import { Input } from "@workspace/ui/components/input"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import { messages } from "./look.messages"
import {
  DEFAULT_LOOK,
  type PaletteId,
  type PanelLayer,
  type Saturation,
  type StyleId,
} from "./model"
import type { ComicEditor } from "./use-editor"
import { PALETTES, STYLES, lookOf } from "./use-generator"
import { roving } from "./roving"

// The styles worth a picture. "Raw" stays a per-panel override.
export const STYLE_CARDS: StyleId[] = [
  "graphic",
  "color",
  "retro",
  "spot",
  "noir",
  "anime",
]

const SELECTED =
  "data-selected:bg-primary data-selected:text-primary-foreground data-selected:hover:bg-primary/90"

// Palette and saturation for the whole carousel, plus what carries the
// colour when the panel is in spot colour. Shown under the setup wheels.
export function LookControls({
  editor,
  panel,
}: {
  editor: ComicEditor
  panel: PanelLayer
}) {
  const t = useT(messages)
  const look = editor.project.look ?? DEFAULT_LOOK
  const style = STYLES[look.style]
  const effective = lookOf(panel, look)

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      {style.palette && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              {t("palette")}
            </h4>
            <span className="text-xs">
              {look.palette
                ? t(`palettes.${look.palette}`)
                : look.style === "spot"
                  ? t("palettes.red")
                  : t("auto")}
            </span>
          </div>
          <PaletteSwatches
            value={
              look.style === "spot" ? (look.palette ?? "red") : look.palette
            }
            allowAuto={look.style !== "spot"}
            onChange={(palette) => editor.setLook({ palette })}
          />
        </div>
      )}

      {style.saturation && (
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            {t("saturation")}
          </h4>
          <ToggleGroup
            aria-label={t("saturation")}
            variant="outline"
            size="sm"
            spacing={0}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[look.saturation]}
            onSelectionChange={(keys) => {
              const saturation = [...keys][0] as Saturation | undefined
              if (saturation) editor.setLook({ saturation })
            }}
          >
            {(["vivid", "balanced", "muted"] as const).map((s) => (
              <ToggleGroupItem
                key={s}
                id={s}
                className={cn("px-2 text-xs", SELECTED)}
              >
                {t(s)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {effective.style === "spot" && (
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            {t("spotOn")}
          </h4>
          <Input
            aria-label={t("spotOn")}
            placeholder="hoodie, neon sign, eyes…"
            value={panel.spotOn ?? ""}
            onChange={(e) =>
              editor.update(
                panel.id,
                { spotOn: e.target.value },
                `${panel.id}-spotOn`
              )
            }
          />
        </div>
      )}
    </div>
  )
}

export function PaletteSwatches({
  value,
  allowAuto = true,
  onChange,
}: {
  value: PaletteId | null
  allowAuto?: boolean
  onChange: (palette: PaletteId | null) => void
}) {
  const t = useT(messages)
  const swatch = (id: PaletteId | null, background: string, label: string) => {
    const on = value === id
    return (
      <button
        key={id ?? "auto"}
        type="button"
        role="radio"
        data-roving
        tabIndex={on ? 0 : -1}
        aria-checked={on}
        aria-label={label}
        title={label}
        className={cn(
          "size-6 shrink-0 cursor-pointer rounded-full ring-1 ring-foreground/15 ring-offset-2 ring-offset-background transition outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
          on && "ring-2 ring-foreground"
        )}
        style={{ background }}
        onClick={() => onChange(id)}
      />
    )
  }
  return (
    <div
      role="radiogroup"
      data-roving-group
      onKeyDown={roving({ select: true })}
      aria-label={t("palette")}
      className="flex flex-wrap gap-2 p-0.5"
    >
      {allowAuto &&
        swatch(
          null,
          "conic-gradient(#e5484d, #ffc53d, #30a46c, #0090ff, #8e4ec6, #e5484d)",
          t("auto")
        )}
      {PALETTES.map((p) => swatch(p.id, p.swatch, t(`palettes.${p.id}`)))}
    </div>
  )
}
