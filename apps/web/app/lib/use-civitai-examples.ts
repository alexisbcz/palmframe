import * as React from "react"

import {
  EXAMPLE_RATINGS,
  type CivitaiBase,
  type CivitaiExample,
  type ExampleQuery,
  type ExampleRating,
} from "./civitai"

type Page = { items: CivitaiExample[]; next: string | null }

// The rating is a choice someone makes once, so this browser keeps it.
const RATING_KEY = "palmframe.civitai.rating"
function storedRating(): ExampleRating {
  try {
    const value = localStorage.getItem(RATING_KEY)
    return EXAMPLE_RATINGS.includes(value as ExampleRating)
      ? (value as ExampleRating)
      : "None"
  } catch {
    return "None"
  }
}

// Pages of Civitai's gallery for one base model, sort, period and rating,
// starting over whenever one of them changes.
export function useCivitaiExamples(initialBase: CivitaiBase) {
  const [base, setBase] = React.useState<CivitaiBase>(initialBase)
  const [sort, setSort] = React.useState<ExampleQuery["sort"]>("Most Reactions")
  const [period, setPeriod] = React.useState<ExampleQuery["period"]>("Week")
  // Only ever mounted after a click, so reading storage here can't mismatch
  // the server's render.
  const [rating, setRatingState] = React.useState<ExampleRating>(storedRating)
  const [items, setItems] = React.useState<CivitaiExample[]>([])
  const [next, setNext] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const request = React.useRef<AbortController>(null)

  React.useEffect(() => setBase(initialBase), [initialBase])

  const setRating = React.useCallback((value: ExampleRating) => {
    setRatingState(value)
    try {
      localStorage.setItem(RATING_KEY, value)
    } catch {}
  }, [])

  const load = React.useCallback(
    async (cursor: string | null) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setLoading(true)
      setError(null)
      const q = new URLSearchParams({ base, sort, period, rating })
      if (cursor) q.set("cursor", cursor)
      try {
        const res = await fetch(`/api/civitai/examples?${q}`, {
          signal: controller.signal,
        })
        const body = (await res.json()) as Page & { error?: string }
        if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`)
        setItems((old) => {
          const seen = new Set(cursor ? old.map((i) => i.id) : [])
          const fresh = body.items.filter((i) => !seen.has(i.id))
          return cursor ? [...old, ...fresh] : fresh
        })
        setNext(body.next)
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (request.current === controller) setLoading(false)
      }
    },
    [base, sort, period, rating]
  )

  React.useEffect(() => {
    setItems([])
    setNext(null)
    void load(null)
    return () => request.current?.abort()
  }, [load])

  return {
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
    // Civitai has nothing further for these filters.
    done: !next && !loading && !error && items.length > 0,
    more: next && !loading && !error ? () => void load(next) : null,
    retry: () => void load(items.length ? next : null),
  }
}

// Calls `onMore` while the end of a scrolling list is within a screen of view,
// so the next page is there before anyone reaches it. Watching again after
// every load also catches a page too short to fill the list.
export function useLoadMore(
  root: React.RefObject<HTMLElement | null>,
  onMore: (() => void) | null
) {
  const sentinel = React.useRef<HTMLDivElement>(null)
  const latest = React.useRef(onMore)
  latest.current = onMore
  const ready = onMore !== null
  React.useEffect(() => {
    const target = sentinel.current
    if (!ready || !target || !root.current) return
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) latest.current?.()
      },
      { root: root.current, rootMargin: "0px 0px 100% 0px" }
    )
    watch.observe(target)
    return () => watch.disconnect()
  }, [ready, root])
  return sentinel
}
