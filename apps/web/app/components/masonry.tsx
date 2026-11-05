import * as React from "react"

// Tall or wide extremes would turn one tile into a column of its own, so
// shapes stay between these, cropped to fit.
const MIN_RATIO = 0.6
const MAX_RATIO = 1.8

// Height over width, held to a shape that sits well in a grid.
export const tileRatio = (width: number, height: number) =>
  Math.min(MAX_RATIO, Math.max(MIN_RATIO, height / Math.max(1, width)))

// How many columns of at least `min` pixels fit in an element, between 2 and
// `max`, kept current as it resizes.
export function useColumnCount(
  ref: React.RefObject<HTMLElement | null>,
  min: number,
  max: number,
  gap: number
) {
  const [count, setCount] = React.useState(Math.min(3, max))
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const width = el.clientWidth
      if (width)
        setCount(
          Math.max(2, Math.min(max, Math.floor((width + gap) / (min + gap))))
        )
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref, min, max, gap])
  return count
}

// Deals tiles into columns, each to the shortest one so far. Each tile's
// place depends only on those before it, so a new page only adds to the
// bottom and nothing already on screen moves.
export function Masonry<T>({
  items,
  columns,
  ratio,
  gap,
  className,
  columnClassName,
  children,
}: {
  items: T[]
  columns: number
  ratio: (item: T) => number
  gap: number
  className?: string
  columnClassName?: string
  children: (item: T) => React.ReactNode
}) {
  const dealt = React.useMemo(() => {
    const cols: T[][] = Array.from({ length: columns }, () => [])
    const heights = new Array<number>(columns).fill(0)
    for (const item of items) {
      let shortest = 0
      for (let c = 1; c < columns; c++)
        if (heights[c]! < heights[shortest]! - 0.01) shortest = c
      cols[shortest]!.push(item)
      // A gap counts as a sliver of a tile's width.
      heights[shortest]! += ratio(item) + 0.05
    }
    return cols
  }, [items, columns, ratio])

  return (
    <div className={className} style={{ display: "flex", gap }}>
      {dealt.map((col, i) => (
        <div
          key={i}
          className={columnClassName}
          style={{
            display: "flex",
            flex: "1 1 0",
            minWidth: 0,
            flexDirection: "column",
            gap,
          }}
        >
          {col.map(children)}
        </div>
      ))}
    </div>
  )
}

// An image that fades in once it has arrived, over the tile's own
// placeholder, instead of painting in line by line.
export function FadeImage({
  className,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [shown, setShown] = React.useState(false)
  const ref = React.useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth) setShown(true)
  }, [])
  return (
    <img
      {...props}
      ref={ref}
      data-shown={shown}
      onLoad={() => setShown(true)}
      onError={() => setShown(true)}
      className={className}
    />
  )
}
