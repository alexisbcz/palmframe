import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  Delete02Icon,
  PlusSignIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import { refImage } from "./anima-tags"
import { messages } from "./composer.messages"
import { STYLE_CARDS } from "./look"
import { messages as lookMessages } from "./look.messages"
import type { StyleId } from "./model"
import { BEATS, dimensionTags, type Dimension, type Setup } from "./setups"
import { roving } from "./roving"
import { useMedia } from "./use-media"

const ROW = 140
const HEIGHT = 308
const COMPACT_ROW = 92
const COMPACT_HEIGHT = 156

interface WheelItem {
  id: string | null
  label: string
  image?: string
  badge?: string
}

// A vertical slot wheel: the centred card is the value. Scroll, drag the
// trackpad, click a card or use the arrow keys.
function Wheel({
  title,
  hint,
  items,
  value,
  onChange,
}: {
  title: string
  hint?: string
  items: WheelItem[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  // The four wheels share a phone's width, so cards shrink to fit a column.
  const compact = useMedia("(max-width: 639px)")
  const row = compact ? COMPACT_ROW : ROW
  const height = compact ? COMPACT_HEIGHT : HEIGHT
  const ref = React.useRef<HTMLDivElement>(null)
  const index = Math.max(
    0,
    items.findIndex((i) => i.id === value)
  )
  const [pos, setPos] = React.useState(index)
  const settle = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (Math.round(el.scrollTop / row) === index) return
    el.scrollTo({
      top: index * row,
      behavior: pos === index ? "auto" : "smooth",
    })
    // Only sync from outside; scrolling reports its own position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, row])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    setPos(el.scrollTop / row)
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const i = Math.min(
        items.length - 1,
        Math.max(0, Math.round(el.scrollTop / row))
      )
      if (items[i] && items[i]!.id !== value) onChange(items[i]!.id)
    }, 120)
  }

  const go = (i: number) =>
    ref.current?.scrollTo({ top: i * row, behavior: "smooth" })
  const current =
    items[Math.min(items.length - 1, Math.max(0, Math.round(pos)))]

  return (
    <div className="flex min-w-0 flex-col items-center">
      <div
        ref={ref}
        role="listbox"
        aria-label={title}
        tabIndex={0}
        data-roving
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            go(
              Math.min(
                items.length - 1,
                Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1))
              )
            )
          }
        }}
        className="relative w-full snap-y snap-mandatory [scrollbar-width:none] overflow-y-auto rounded-xl [mask-image:linear-gradient(transparent,black_30%,black_70%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ height: height, paddingBlock: (height - row) / 2 }}
      >
        {items.map((item, i) => {
          const d = Math.min(1.6, Math.abs(i - pos))
          const on = i === index
          return (
            <button
              key={item.id ?? "any"}
              type="button"
              role="option"
              aria-selected={on}
              tabIndex={-1}
              onClick={() => go(i)}
              className="flex w-full cursor-pointer snap-center items-center justify-center outline-none max-sm:px-1"
              style={{
                height: row,
                opacity: 1 - d * 0.5,
                transform: `scale(${1 - Math.min(1, d) * 0.14})`,
              }}
            >
              <span
                className={cn(
                  "relative flex w-full max-w-[100px] items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow",
                  on && "shadow-lg ring-2 ring-foreground/70"
                )}
                style={{ height: row - 16 }}
              >
                {item.image ? (
                  <img
                    src={item.image}
                    alt=""
                    draggable={false}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="text-2xl text-muted-foreground">—</span>
                )}
                {item.badge && (
                  <span className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-center text-[9px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">
                    {item.badge}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <span className="mt-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </span>
      <span className="line-clamp-2 max-w-full px-1 text-center text-sm font-medium break-words max-sm:text-xs sm:truncate">
        {current?.label}
      </span>
      {hint && (
        <span className="text-center text-[10px] text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  )
}

const MONO: StyleId[] = ["noir", "spot"]

export function SetupPanel({
  setup,
  saved,
  onStyle,
  onDimension,
  onApply,
  onSave,
  onDelete,
  onClose,
  footer,
  learned,
}: {
  footer?: React.ReactNode
  // The carousel's style learned from a comic: it takes a card on the wheel.
  learned?: { name: string; image?: string }
  setup: Omit<Setup, "id">
  saved: Setup[]
  onStyle: (style: StyleId) => void
  onDimension: (d: Dimension, tag: string | null) => void
  onApply: (s: Omit<Setup, "id" | "style"> & { style?: StyleId }) => void
  onSave: () => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const t = useT(messages)
  const tl = useT(lookMessages)
  const [tab, setTab] = React.useState<"custom" | "recommended" | "saved">(
    "custom"
  )
  const isSaved = saved.some(
    (s) =>
      s.style === setup.style &&
      s.framing === setup.framing &&
      s.angle === setup.angle &&
      s.light === setup.light
  )
  const tagItems = (d: Dimension): WheelItem[] => [
    { id: null, label: t("any") },
    ...dimensionTags(d).map((tag) => ({
      id: tag,
      label: tag,
      image: refImage(tag),
    })),
  ]
  const summary = (s: Omit<Setup, "id" | "style">) =>
    [s.framing, s.angle, s.light].filter(Boolean).join(" · ") || t("any")

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-popover p-2 text-popover-foreground shadow-2xl ring-1 ring-foreground/10">
      <div
        className="flex items-center gap-1 px-1 pt-1"
        data-roving-group
        onKeyDown={roving({ axis: "x", select: true })}
      >
        {(["custom", "recommended", "saved"] as const).map((id) => (
          <button
            key={id}
            type="button"
            data-roving
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "h-8 cursor-pointer rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:px-2 max-sm:text-xs",
              tab === id &&
                "bg-foreground text-background hover:text-background"
            )}
          >
            {t(`tabs.${id}`)}
            {id === "saved" && saved.length > 0 && (
              <span className="ms-1.5 tabular-nums opacity-60">
                {saved.length}
              </span>
            )}
          </button>
        ))}
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ms-auto"
            aria-label={t("close")}
            onPress={onClose}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
          <Tooltip>{t("close")}</Tooltip>
        </TooltipTrigger>
      </div>

      {tab === "custom" && (
        <div className="relative rounded-xl bg-muted/40 p-3 pb-12 max-sm:px-1">
          <div
            className="grid grid-cols-4 divide-x divide-foreground/10"
            data-roving-group
            onKeyDown={roving({ axis: "x" })}
          >
            <Wheel
              title={t("wheel.style")}
              hint={t("carouselWide")}
              items={[
                ...(learned
                  ? [{ id: "raw", label: learned.name, image: learned.image }]
                  : []),
                ...STYLE_CARDS.map((id) => ({
                  id,
                  label: tl(`styles.${id}`),
                  image: `/anima-styles/${id}.webp`,
                  badge: MONO.includes(id)
                    ? t("badge.mono")
                    : t("badge.colour"),
                })),
              ]}
              value={setup.style}
              onChange={(id) => id && onStyle(id as StyleId)}
            />
            {(["framing", "angle", "light"] as const).map((d) => (
              <Wheel
                key={d}
                title={t(`wheel.${d}`)}
                items={tagItems(d)}
                value={setup[d]}
                onChange={(tag) => onDimension(d, tag)}
              />
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
            isDisabled={isSaved}
            onPress={onSave}
          >
            <HugeiconsIcon
              icon={isSaved ? Tick02Icon : PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {isSaved ? t("saved") : t("saveSetup")}
          </Button>
        </div>
      )}
      {tab === "custom" && footer && (
        <div className="rounded-xl bg-muted/40 px-4 py-3">{footer}</div>
      )}

      {tab === "recommended" && (
        <div
          className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-4"
          data-roving-group
          onKeyDown={roving()}
        >
          {BEATS.map((b) => (
            <SetupCard
              key={b.id}
              title={t(`beats.${b.id}`)}
              subtitle={summary(b)}
              image={refImage(b.framing ?? "wide shot")}
              onPress={() => {
                onApply(b)
                setTab("custom")
              }}
            />
          ))}
        </div>
      )}

      {tab === "saved" && (
        <div className="rounded-xl bg-muted/40 p-3">
          {saved.length ? (
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              data-roving-group
              onKeyDown={roving()}
            >
              {saved.map((s) => (
                <SetupCard
                  key={s.id}
                  title={tl(`styles.${s.style}`)}
                  subtitle={summary(s)}
                  image={`/anima-styles/${s.style}.webp`}
                  onPress={() => {
                    onApply(s)
                    setTab("custom")
                  }}
                  onDelete={() => onDelete(s.id)}
                  deleteLabel={t("deleteSetup")}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("noSaved")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function SetupCard({
  title,
  subtitle,
  image,
  onPress,
  onDelete,
  deleteLabel,
}: {
  title: string
  subtitle: string
  image: string
  onPress: () => void
  onDelete?: () => void
  deleteLabel?: string
}) {
  return (
    <div className="group/setup relative">
      <button
        type="button"
        data-roving
        onClick={onPress}
        className="flex w-full cursor-pointer flex-col overflow-hidden rounded-xl bg-background text-start ring-1 ring-foreground/10 transition outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={image}
          alt=""
          className="aspect-[5/3] w-full object-cover object-top"
        />
        <span className="flex flex-col gap-0.5 p-2">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </button>
      {onDelete && (
        <TooltipTrigger>
          <button
            type="button"
            aria-label={deleteLabel}
            onClick={onDelete}
            className="absolute end-1.5 top-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition group-hover/setup:opacity-100 after:absolute after:-inset-2 hover:text-destructive focus-visible:opacity-100 pointer-coarse:opacity-100 pointer-fine:after:hidden"
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </button>
          <Tooltip>{deleteLabel}</Tooltip>
        </TooltipTrigger>
      )}
    </div>
  )
}
