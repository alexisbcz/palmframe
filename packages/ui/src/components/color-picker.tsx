"use client"

import * as React from "react"
import { cn } from "cn"
import {
  ColorArea as ColorAreaPrimitive,
  ColorField as ColorFieldPrimitive,
  ColorPicker as ColorPickerPrimitive,
  ColorPickerStateContext,
  ColorSlider as ColorSliderPrimitive,
  ColorSwatch as ColorSwatchPrimitive,
  ColorSwatchPicker as ColorSwatchPickerPrimitive,
  ColorSwatchPickerItem as ColorSwatchPickerItemPrimitive,
  ColorThumb as ColorThumbPrimitive,
  Dialog as DialogPrimitive,
  DialogTrigger,
  Input as InputPrimitive,
  SliderTrack,
  composeRenderProps,
  parseColor,
  type ColorAreaProps,
  type ColorFieldProps,
  type ColorPickerProps,
  type ColorSliderProps,
  type ColorSwatchPickerItemProps,
  type ColorSwatchPickerProps,
  type ColorSwatchProps,
  type ColorThumbProps,
} from "react-aria-components"
import { HugeiconsIcon } from "@hugeicons/react"
import { ColorPickerIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Popover } from "@workspace/ui/components/popover"

function ColorPicker(props: ColorPickerProps) {
  return <ColorPickerPrimitive {...props} />
}

function ColorThumb({ className, ...props }: ColorThumbProps) {
  return (
    <ColorThumbPrimitive
      data-slot="color-thumb"
      className={composeRenderProps(className, (className) =>
        cn(
          "size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_1px_3px_rgb(0_0_0/0.3)] transition-[width,height] data-dragging:size-5 data-focus-visible:size-5 data-focus-visible:ring-3 data-focus-visible:ring-ring/50",
          className
        )
      )}
      {...props}
    />
  )
}

function ColorArea({ className, ...props }: ColorAreaProps) {
  return (
    <ColorAreaPrimitive
      data-slot="color-area"
      className={composeRenderProps(className, (className) =>
        cn(
          "aspect-[4/3] w-full shrink-0 rounded-md ring-1 ring-foreground/10 ring-inset data-disabled:opacity-50",
          className
        )
      )}
      {...props}
    >
      <ColorThumb />
    </ColorAreaPrimitive>
  )
}

function ColorSlider({ className, ...props }: ColorSliderProps) {
  return (
    <ColorSliderPrimitive
      data-slot="color-slider"
      className={composeRenderProps(className, (className) =>
        cn("flex w-full flex-col gap-1", className)
      )}
      {...props}
    >
      <SliderTrack className="h-3 w-full rounded-full ring-1 ring-foreground/10 ring-inset">
        <ColorThumb className="top-1/2" />
      </SliderTrack>
    </ColorSliderPrimitive>
  )
}

function ColorSwatch({ className, ...props }: ColorSwatchProps) {
  return (
    <ColorSwatchPrimitive
      data-slot="color-swatch"
      className={composeRenderProps(className, (className) =>
        cn(
          "size-5 shrink-0 rounded-[min(var(--radius-sm),6px)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]",
          className
        )
      )}
      {...props}
    />
  )
}

function ColorSwatchPicker({ className, ...props }: ColorSwatchPickerProps) {
  return (
    <ColorSwatchPickerPrimitive
      data-slot="color-swatch-picker"
      className={composeRenderProps(className, (className) =>
        cn("flex flex-wrap gap-1.5", className)
      )}
      {...props}
    />
  )
}

function ColorSwatchPickerItem({
  className,
  children,
  ...props
}: ColorSwatchPickerItemProps) {
  return (
    <ColorSwatchPickerItemPrimitive
      data-slot="color-swatch-picker-item"
      className={composeRenderProps(className, (className) =>
        cn(
          "relative cursor-pointer rounded-[min(var(--radius-sm),6px)] outline-none data-focus-visible:ring-3 data-focus-visible:ring-ring/50 data-selected:ring-2 data-selected:ring-foreground data-selected:ring-offset-1 data-selected:ring-offset-popover",
          className
        )
      )}
      {...props}
    >
      {children ?? <ColorSwatch />}
    </ColorSwatchPickerItemPrimitive>
  )
}

function ColorField({ className, ...props }: ColorFieldProps) {
  return (
    <ColorFieldPrimitive
      data-slot="color-field"
      className={composeRenderProps(className, (className) =>
        cn("flex min-w-0 flex-1", className)
      )}
      {...props}
    >
      <InputPrimitive className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 font-mono text-xs uppercase transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30" />
    </ColorFieldPrimitive>
  )
}

// The browser's EyeDropper (Chromium). Renders nothing where unsupported.
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

function ColorPickerEyeDropper({ label = "Pick a colour from the screen" }) {
  const state = React.useContext(ColorPickerStateContext)
  const [supported, setSupported] = React.useState(false)
  React.useEffect(() => setSupported("EyeDropper" in window), [])
  if (!supported || !state) return null
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onPress={async () => {
        const Dropper = (window as unknown as { EyeDropper: EyeDropperCtor })
          .EyeDropper
        try {
          const { sRGBHex } = await new Dropper().open()
          state.setColor(parseColor(sRGBHex))
        } catch {
          // Cancelled with Escape.
        }
      }}
    >
      <HugeiconsIcon icon={ColorPickerIcon} strokeWidth={2} />
    </Button>
  )
}

// A swatch button that opens the picker in a popover: area, hue, eyedropper,
// hex field and swatch groups. `value` and `onChange` are hex strings.
function ColorPickerPopover({
  value,
  onChange,
  swatches = [],
  "aria-label": ariaLabel,
  labels = {},
  className,
}: {
  value: string
  onChange: (hex: string) => void
  swatches?: { label: string; colors: string[] }[]
  "aria-label": string
  labels?: { hex?: string; hue?: string; eyeDropper?: string }
  className?: string
}) {
  const color = React.useMemo(() => {
    try {
      return parseColor(value)
    } catch {
      return parseColor("#000000")
    }
  }, [value])

  return (
    <ColorPicker
      value={color}
      onChange={(c) => onChange(c.toString("hex").toLowerCase())}
    >
      <DialogTrigger>
        <Button
          variant="ghost"
          aria-label={ariaLabel}
          className={cn(
            "size-5 min-w-0 rounded-[min(var(--radius-sm),6px)] p-0 hover:bg-transparent",
            className
          )}
        >
          <ColorSwatch className="size-full" />
        </Button>
        <Popover placement="bottom start" className="w-60 gap-3 p-3">
          <DialogPrimitive
            aria-label={ariaLabel}
            className="flex flex-col gap-3 outline-none"
          >
            <ColorArea
              colorSpace="hsb"
              xChannel="saturation"
              yChannel="brightness"
            />
            <div className="flex items-center gap-2">
              <ColorPickerEyeDropper label={labels.eyeDropper} />
              <ColorSlider
                colorSpace="hsb"
                channel="hue"
                aria-label={labels.hue ?? "Hue"}
              />
            </div>
            <div className="flex items-center gap-2">
              <ColorSwatch className="size-8 rounded-lg" />
              <ColorField aria-label={labels.hex ?? "Hex"} />
            </div>
            {swatches
              .filter((g) => g.colors.length)
              .map((group) => (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {group.label}
                  </span>
                  <ColorSwatchPicker aria-label={group.label}>
                    {group.colors.map((c) => (
                      <ColorSwatchPickerItem key={c} color={c} />
                    ))}
                  </ColorSwatchPicker>
                </div>
              ))}
          </DialogPrimitive>
        </Popover>
      </DialogTrigger>
    </ColorPicker>
  )
}

export {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorPickerEyeDropper,
  ColorPickerPopover,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  ColorSwatchPickerItem,
  ColorThumb,
}
