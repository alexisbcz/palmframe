import { Link, useLocation } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { Layers01Icon } from "@hugeicons/core-free-icons"

import { FONTS } from "@/components/comic-canvas/model"
import { useT } from "@/i18n/core"

import { messages } from "./catalog.messages"
import { RATIO, hasReference, type Asset } from "./model"
import { SaveButton } from "./save-button"

const compact = new Intl.NumberFormat("en", { notation: "compact" })

// Lettering needs no picture: it's drawn live, in its own font and colours.
export function SfxArt({
  payload,
  className,
}: {
  payload: Extract<Asset["payload"], { type: "sfx" }>
  className?: string
}) {
  const font = FONTS[payload.font]
  return (
    <span
      className={cn(
        "[container-type:inline-size] flex size-full items-center justify-center overflow-hidden bg-muted",
        className
      )}
      style={{
        backgroundImage:
          "radial-gradient(circle, color-mix(in oklab, currentColor 16%, transparent) 1px, transparent 1.5px)",
        backgroundSize: "10px 10px",
      }}
    >
      <span
        className="-rotate-3 px-3 text-center text-[clamp(1.75rem,18cqw,4rem)] leading-none"
        style={{
          fontFamily: font.family,
          fontWeight: font.weight,
          color: payload.color,
          paintOrder: "stroke fill",
          WebkitTextStroke: `0.12em ${payload.strokeColor}`,
        }}
      >
        {payload.text}
      </span>
    </span>
  )
}

export function AssetCard({ asset }: { asset: Asset }) {
  const t = useT(messages)
  const { search } = useLocation()
  const usesRef = hasReference(asset)
  return (
    <article className="group relative mb-3 break-inside-avoid sm:mb-4">
      <Link
        to={`/catalog/${asset.id}${search}`}
        preventScrollReset
        aria-label={`${asset.name}, ${t(`kinds.${asset.kind}`)}`}
        className="relative block overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow duration-200 outline-none group-hover:ring-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/60"
        style={{ aspectRatio: RATIO[asset.kind] }}
      >
        {asset.payload.type === "sfx" ? (
          <SfxArt payload={asset.payload} />
        ) : asset.image ? (
          <img
            src={asset.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span className="flex size-full items-center justify-center p-4 text-center text-sm text-balance text-muted-foreground">
            {asset.description}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-linear-to-t from-black/90 via-black/65 to-transparent p-3 pt-14 text-white">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {asset.name}
            </span>
            <span className="block truncate text-xs text-white/80">
              {t(`kinds.${asset.kind}`)}
              {asset.author && ` · ${asset.author}`}
            </span>
          </span>
          {asset.uses > 0 && (
            <span className="shrink-0 text-xs text-white/70 tabular-nums">
              {t("card.uses", { n: compact.format(asset.uses) })}
            </span>
          )}
        </span>
        {usesRef && (
          <span
            title={t("card.reference")}
            className="absolute start-2 top-2 flex size-6 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur-sm"
          >
            <HugeiconsIcon
              icon={Layers01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            <span className="sr-only">{t("card.reference")}</span>
          </span>
        )}
      </Link>
      <SaveButton
        asset={asset}
        className="absolute end-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[saved=true]:opacity-100 pointer-coarse:opacity-100"
      />
    </article>
  )
}
