import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  FavouriteIcon,
} from "@hugeicons/core-free-icons"

import {
  FadeImage,
  Masonry,
  tileRatio,
  useColumnCount,
} from "@/components/masonry"
import {
  CIVITAI_BASES,
  EXAMPLE_PERIODS,
  EXAMPLE_RATINGS,
  EXAMPLE_SORTS,
  civitaiBase,
  fitSize,
  fromCivitai,
  type CivitaiBase,
  type CivitaiExample,
  type ExampleQuery,
  type ExampleRating,
  type LabRequest,
} from "@/lib/lab/model"
import { useCivitaiExamples, useLoadMore } from "@/lib/use-civitai-examples"

const PERIOD_LABELS: Record<ExampleQuery["period"], string> = {
  Day: "Today",
  Week: "This week",
  Month: "This month",
  Year: "This year",
  AllTime: "All time",
}

const RATING_LABELS: Record<ExampleRating, string> = {
  None: "Safe",
  Soft: "Suggestive",
  Mature: "Mature",
  X: "Everything",
  Only: "NSFW only",
}
const LEVEL_LABELS: Record<string, string> = {
  Soft: "Suggestive",
  Mature: "Mature",
  X: "Explicit",
}

// A tile in the grid: an example, or a placeholder shaped like one while a
// page is on its way.
type Tile = CivitaiExample | { wait: number }
const WAIT_SHAPES = [4 / 3, 1, 3 / 2, 5 / 4, 4 / 3, 1]
const ratioOf = (tile: Tile) =>
  "wait" in tile
    ? WAIT_SHAPES[tile.wait % WAIT_SHAPES.length]!
    : tileRatio(tile.width, tile.height)
const GAP = 8

// Civitai's gallery for the family of the model on this Mac: pick an image
// and its prompt becomes the starting point here.
export function Examples({
  model,
  loras,
  onUse,
}: {
  model: string
  loras: string[]
  onUse: (values: Partial<LabRequest>, missing: string[]) => void
}) {
  const {
    base,
    setBase,
    sort,
    setSort,
    period,
    setPeriod,
    rating,
    setRating,
    items,
    loading,
    error,
    done,
    more,
    retry,
  } = useCivitaiExamples(civitaiBase(model))
  const [picked, setPicked] = React.useState<CivitaiExample | null>(null)
  const grid = React.useRef<HTMLDivElement>(null)
  React.useEffect(
    // Braced: Chrome's scrollTo returns a promise, which React takes for a cleanup.
    () => {
      grid.current?.scrollTo({ top: 0 })
    },
    [base, sort, period, rating]
  )
  const columns = useColumnCount(grid, 150, 4, GAP)
  const sentinel = useLoadMore(grid, picked ? null : more)
  const tiles = React.useMemo<Tile[]>(
    () =>
      loading
        ? [
            ...items,
            ...Array.from(
              { length: items.length ? columns * 2 : columns * 3 },
              (_, i) => ({ wait: i })
            ),
          ]
        : items,
    [items, loading, columns]
  )

  return (
    <>
      {/* Kept mounted under the detail, so going back finds the same scroll. */}
      <div className="lab-examples" hidden={!!picked}>
        <div className="lab-examples-bar">
          <select
            className="lab-input"
            aria-label="Base model"
            value={base}
            onChange={(e) => setBase(e.target.value as CivitaiBase)}
          >
            {CIVITAI_BASES.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select
            className="lab-input"
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as ExampleQuery["sort"])}
          >
            {EXAMPLE_SORTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className="lab-input"
            aria-label="Period"
            value={period}
            onChange={(e) =>
              setPeriod(e.target.value as ExampleQuery["period"])
            }
          >
            {EXAMPLE_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
          <select
            className="lab-input"
            aria-label="Content"
            data-loose={rating !== "None"}
            value={rating}
            onChange={(e) => setRating(e.target.value as ExampleRating)}
          >
            {EXAMPLE_RATINGS.map((r) => (
              <option key={r} value={r}>
                {RATING_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="lab-examples-grid" ref={grid} aria-busy={loading}>
          <Masonry items={tiles} columns={columns} ratio={ratioOf} gap={GAP}>
            {(tile) =>
              "wait" in tile ? (
                <div
                  key={`wait-${tile.wait}`}
                  className="lab-example"
                  data-wait
                  aria-hidden
                  style={{ aspectRatio: `1 / ${ratioOf(tile)}` }}
                />
              ) : (
                <button
                  key={tile.id}
                  type="button"
                  className="lab-example"
                  style={{ aspectRatio: `1 / ${ratioOf(tile)}` }}
                  onClick={() => setPicked(tile)}
                  title={tile.meta.prompt}
                >
                  <FadeImage
                    src={tile.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  {tile.level !== "None" ? (
                    <b className="lab-example-level">
                      {LEVEL_LABELS[tile.level] ?? tile.level}
                    </b>
                  ) : null}
                  <span>{tile.meta.prompt}</span>
                </button>
              )
            }
          </Masonry>
          <div ref={sentinel} aria-hidden className="h-px" />
          {error ? (
            <p className="lab-warn lab-examples-note">
              {error}
              <button type="button" className="lab-pill" onClick={retry}>
                Try again
              </button>
            </p>
          ) : !loading && !items.length ? (
            <p className="lab-examples-empty">
              Nothing shared with a prompt in this period. Try a longer one.
            </p>
          ) : done ? (
            <p className="lab-examples-end">
              That&apos;s everything for these filters.
            </p>
          ) : null}
        </div>
      </div>
      {picked ? (
        <Detail
          example={picked}
          loras={loras}
          onBack={() => setPicked(null)}
          onUse={onUse}
        />
      ) : null}
    </>
  )
}

function Detail({
  example,
  loras,
  onBack,
  onUse,
}: {
  example: CivitaiExample
  loras: string[]
  onBack: () => void
  onUse: (values: Partial<LabRequest>, missing: string[]) => void
}) {
  const read = fromCivitai(example.meta, loras)
  const [w, h] = fitSize(example.meta.Size)
  const facts = [
    example.model && ["Model", example.model],
    example.level !== "None" && [
      "Rating",
      LEVEL_LABELS[example.level] ?? example.level,
    ],
    example.meta.Size && [
      "Size",
      w ? `${example.meta.Size} → ${w}×${h}` : example.meta.Size,
    ],
    example.meta.seed !== undefined && ["Seed", String(example.meta.seed)],
    example.steps && ["Steps", String(example.steps)],
    example.cfg && ["CFG", String(example.cfg)],
    example.sampler && ["Sampler", example.sampler],
  ].filter(Boolean) as [string, string][]
  const used = example.meta.resources ?? []

  return (
    <div className="lab-example-detail">
      <div
        className="lab-example-shot"
        style={{ backgroundImage: `url(${example.thumb})` }}
      >
        <img src={example.thumb.replace("/width=450/", "/width=900/")} alt="" />
      </div>
      <div className="lab-example-info">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="lab-pill" onClick={onBack}>
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              strokeWidth={2}
              className="size-3.5 rtl:rotate-180"
            />
            Examples
          </button>
          <span className="lab-example-by">
            <HugeiconsIcon
              icon={FavouriteIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            {example.reactions}
            {example.username ? ` · ${example.username}` : ""}
          </span>
        </div>
        <section>
          <h4>Prompt</h4>
          <p>{example.meta.prompt}</p>
        </section>
        {example.meta.negativePrompt ? (
          <section>
            <h4>Negative</h4>
            <p>{example.meta.negativePrompt}</p>
          </section>
        ) : null}
        {used.length ? (
          <section>
            <h4>LoRAs</h4>
            <ul className="lab-example-loras">
              {used.map((l) => (
                <li key={l.name} data-missing={read.missing.includes(l.name!)}>
                  {l.name} {l.weight}
                  {read.missing.includes(l.name!) ? " · not installed" : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {facts.length ? (
          <dl className="lab-example-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="lab-example-note">
          Steps, CFG and sampler stay on this Mac&apos;s settings.
        </p>
        <div className="lab-example-actions">
          <button
            type="button"
            className="lab-pill"
            data-on={false}
            onClick={() => onUse({ loras: [], ...read.values }, read.missing)}
          >
            Prompt from this
          </button>
          <button
            type="button"
            className="lab-pill"
            onClick={() => onUse({ prompt: example.meta.prompt }, [])}
          >
            Prompt only
          </button>
          <a
            className="lab-pill"
            href={`https://civitai.com/images/${example.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Civitai
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </a>
        </div>
      </div>
    </div>
  )
}
