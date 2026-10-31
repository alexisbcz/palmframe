import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "cn"

import { useT } from "@/i18n/core"

import { messages } from "./catalog.messages"

export type GalleryImage = {
  src: string
  alt: string
  // Keeps the whole image in view when it isn't the frame's shape.
  contain?: boolean
}

// Keys pressed in these already mean something, like moving between radios.
const OWNS_ARROWS = "input, textarea, select, [role=radiogroup], [role=menu]"

// Dark in both themes: they sit on the artwork, which can be any colour.
const ARROW =
  "absolute top-1/2 -translate-y-1/2 border-transparent bg-black/55 text-white hover:bg-black/75 hover:text-white dark:border-transparent dark:bg-black/55 dark:hover:bg-black/75"

// One image at a time, in a frame the size of the first.
export function Gallery({
  images,
  label,
  className,
  style,
}: {
  images: GalleryImage[]
  label: string
  className?: string
  style?: React.CSSProperties
}) {
  const t = useT(messages)
  const [index, setIndex] = React.useState(0)
  const count = images.length

  React.useEffect(() => {
    if (count < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest(OWNS_ARROWS)) return
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1))
      if (e.key === "ArrowRight") setIndex((i) => Math.min(count - 1, i + 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [count])

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("relative w-full", className)}
      style={style}
    >
      {/* All mounted, so switching never waits on a download. */}
      {images.map((image, i) => (
        <img
          key={image.src}
          src={image.src}
          alt={image.alt}
          aria-hidden={i !== index}
          className={cn(
            "absolute inset-0 size-full",
            image.contain ? "bg-white object-contain" : "object-cover",
            i !== index && "invisible"
          )}
        />
      ))}
      {count > 1 && (
        <>
          <TooltipTrigger isDisabled={index === 0}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("detail.previous")}
              isDisabled={index === 0}
              onPress={() => setIndex(index - 1)}
              className={cn(ARROW, "start-3")}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
            <Tooltip>{t("detail.previous")}</Tooltip>
          </TooltipTrigger>
          <TooltipTrigger isDisabled={index === count - 1}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("detail.next")}
              isDisabled={index === count - 1}
              onPress={() => setIndex(index + 1)}
              className={cn(ARROW, "end-3")}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
            <Tooltip>{t("detail.next")}</Tooltip>
          </TooltipTrigger>
          <span
            aria-live="polite"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white tabular-nums"
          >
            {index + 1} / {count}
          </span>
        </>
      )}
    </div>
  )
}
