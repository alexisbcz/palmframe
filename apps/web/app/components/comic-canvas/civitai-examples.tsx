import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  FavouriteIcon,
} from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import {
  FadeImage,
  Masonry,
  tileRatio,
  useColumnCount,
} from "@/components/masonry"
import { useT } from "@/i18n/core"
import {
  CIVITAI_BASES,
  EXAMPLE_PERIODS,
  EXAMPLE_RATINGS,
  EXAMPLE_SORTS,
  plainPrompt,
  type CivitaiBase,
  type CivitaiExample,
} from "@/lib/civitai"
import { useCivitaiExamples, useLoadMore } from "@/lib/use-civitai-examples"

import { messages } from "./civitai-examples.messages"

// A tile in the grid: an example, or a placeholder shaped like one while a
// page is on its way.
type Tile = CivitaiExample | { wait: number }
const WAIT_SHAPES = [4 / 3, 1, 3 / 2, 5 / 4, 4 / 3, 1]
const ratioOf = (tile: Tile) =>
  "wait" in tile
    ? WAIT_SHAPES[tile.wait % WAIT_SHAPES.length]!
    : tileRatio(tile.width, tile.height)
const GAP = 8

// Civitai's gallery inside the composer: browse what a model draws, open one
// image and start the panel's prompt from the words behind it.
export function CivitaiExamples({
  base: initialBase,
  onUse,
  onClose,
}: {
  base: CivitaiBase
  onUse: (prompt: string, negative: string | undefined) => void
  onClose: () => void
}) {
  const t = useT(messages)
  const g = useCivitaiExamples(initialBase)
  const [picked, setPicked] = React.useState<CivitaiExample | null>(null)
  const grid = React.useRef<HTMLDivElement>(null)
  React.useEffect(
    // Braced: Chrome's scrollTo returns a promise, which React takes for a cleanup.
    () => {
      grid.current?.scrollTo({ top: 0 })
    },
    [g.base, g.sort, g.period, g.rating]
  )
  const columns = useColumnCount(grid, 150, 4, GAP)
  const sentinel = useLoadMore(grid, picked ? null : g.more)
  const tiles = React.useMemo<Tile[]>(
    () =>
      g.loading
        ? [
            ...g.items,
            ...Array.from(
              { length: g.items.length ? columns * 2 : columns * 3 },
              (_, i) => ({ wait: i })
            ),
          ]
        : g.items,
    [g.items, g.loading, columns]
  )

  return (
    <div className="flex h-[min(34rem,calc(100svh-10rem))] flex-col">
      <div className="flex items-start justify-between gap-3 pb-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("close")}
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
      {picked && (
        <Detail example={picked} onBack={() => setPicked(null)} onUse={onUse} />
      )}
      {/* Kept mounted under the detail, so going back finds the same scroll. */}
      <div className={cn("flex min-h-0 flex-1 flex-col", picked && "hidden")}>
        <div className="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 pt-0.5 pb-2.5">
          <Filter
            label={t("base")}
            value={g.base}
            options={CIVITAI_BASES.map((b) => [b, b])}
            onChange={g.setBase}
          />
          <Filter
            label={t("sort")}
            value={g.sort}
            options={EXAMPLE_SORTS.map((s) => [s, t(`sorts.${s}`)])}
            onChange={g.setSort}
            bare
          />
          <Filter
            label={t("period")}
            value={g.period}
            options={EXAMPLE_PERIODS.map((p) => [p, t(`periods.${p}`)])}
            onChange={g.setPeriod}
            bare
          />
          <Filter
            label={t("rating")}
            value={g.rating}
            options={EXAMPLE_RATINGS.map((r) => [r, t(`ratings.${r}`)])}
            onChange={g.setRating}
            mature={g.rating !== "None"}
            className="ms-auto"
          />
        </div>
        <div
          ref={grid}
          aria-busy={g.loading}
          className="-me-1 min-h-0 flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain pe-1"
        >
          <Masonry items={tiles} columns={columns} ratio={ratioOf} gap={GAP}>
            {(tile) =>
              "wait" in tile ? (
                <div
                  key={`wait-${tile.wait}`}
                  aria-hidden
                  className="w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
                  style={{ aspectRatio: `1 / ${ratioOf(tile)}` }}
                />
              ) : (
                <button
                  key={tile.id}
                  type="button"
                  title={tile.meta.prompt}
                  onClick={() => setPicked(tile)}
                  style={{ aspectRatio: `1 / ${ratioOf(tile)}` }}
                  className="group/example relative block w-full shrink-0 cursor-pointer overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FadeImage
                    src={tile.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-cover opacity-0 transition-[opacity,scale] duration-300 ease-out group-hover/example:scale-[1.03] data-[shown=true]:opacity-100 motion-reduce:transition-none"
                  />
                  {tile.level !== "None" && (
                    <span className="absolute end-1.5 top-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] leading-none font-medium text-white backdrop-blur-sm">
                      {t(`levels.${tile.level as "Soft" | "Mature" | "X"}`)}
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 line-clamp-3 bg-gradient-to-t from-black/85 to-transparent px-2 pt-6 pb-1.5 text-start text-[11px] leading-snug text-white opacity-0 transition-opacity duration-150 group-hover/example:opacity-100 group-focus-visible/example:opacity-100">
                    {tile.meta.prompt}
                  </span>
                </button>
              )
            }
          </Masonry>
          <div ref={sentinel} aria-hidden className="h-px" />
          {g.error ? (
            <p
              role="alert"
              className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <span className="min-w-0 break-words">{g.error}</span>
              <Button variant="outline" size="sm" onClick={g.retry}>
                {t("retry")}
              </Button>
            </p>
          ) : !g.loading && !g.items.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : g.done ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {t("end")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// A filter as a chip sized to its value. The native select lies invisibly
// over it, so the system picker, keyboard and screen readers all still work.
function Filter<T extends string>({
  label,
  value,
  options,
  onChange,
  mature,
  bare,
  className,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (value: T) => void
  mature?: boolean
  // The value says what it is ("This week"), so the label is only for
  // screen readers.
  bare?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full ps-3 pe-2 text-xs whitespace-nowrap ring-1 transition-colors focus-within:ring-2 focus-within:ring-ring",
        mature
          ? "bg-destructive/10 ring-destructive/25"
          : "bg-muted/50 ring-foreground/10 hover:bg-muted",
        className
      )}
    >
      {!bare && <span className="text-muted-foreground">{label}</span>}
      <span
        className={cn(
          "flex items-center gap-1.5 font-medium",
          mature && "text-destructive"
        )}
      >
        {mature && (
          <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
        )}
        {options.find(([v]) => v === value)?.[1] ?? value}
      </span>
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        strokeWidth={2}
        className="size-3.5 text-muted-foreground"
      />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}

function Detail({
  example,
  onBack,
  onUse,
}: {
  example: CivitaiExample
  onBack: () => void
  onUse: (prompt: string, negative: string | undefined) => void
}) {
  const t = useT(messages)
  const prompt = plainPrompt(example.meta.prompt ?? "")
  const negative = example.meta.negativePrompt?.trim() || undefined

  return (
    <div className="flex min-h-0 flex-1 gap-3 max-sm:flex-col max-sm:overflow-y-auto">
      <div
        className="flex min-h-0 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted bg-contain bg-center bg-no-repeat max-sm:h-56 sm:w-[42%]"
        style={{ backgroundImage: `url(${example.thumb})` }}
      >
        <img
          src={example.thumb.replace("/width=450/", "/width=900/")}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              strokeWidth={2}
              className="rtl:rotate-180"
            />
            {t("back")}
          </Button>
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground tabular-nums">
            <HugeiconsIcon
              icon={FavouriteIcon}
              strokeWidth={2}
              className="size-3.5 shrink-0"
            />
            {example.reactions}
            {example.username ? ` · ${example.username}` : ""}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 [scrollbar-width:thin] flex-col gap-3 overflow-y-auto pe-1">
          <section>
            <h4 className="pb-1 text-xs font-medium text-muted-foreground">
              {t("prompt")}
            </h4>
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
              {prompt}
            </p>
          </section>
          {negative && (
            <section>
              <h4 className="pb-1 text-xs font-medium text-muted-foreground">
                {t("negative")}
              </h4>
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                {negative}
              </p>
            </section>
          )}
          {example.model && (
            <p className="text-xs text-muted-foreground">
              {t("madeWith")}{" "}
              <span className="text-foreground">{example.model}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-2.5">
          <Button size="sm" onClick={() => onUse(prompt, negative)}>
            {t("use")}
          </Button>
          <a
            href={`https://civitai.com/images/${example.id}`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("viewOn")}
            <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} />
          </a>
          <span className="text-xs text-muted-foreground">{t("replaces")}</span>
        </div>
      </div>
    </div>
  )
}
