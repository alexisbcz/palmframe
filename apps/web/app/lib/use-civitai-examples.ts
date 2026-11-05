import * as React from "react"

import type { CivitaiBase, CivitaiExample, ExampleQuery } from "./civitai"

type Page = { items: CivitaiExample[]; next: string | null }

// Pages of Civitai's gallery for one base model, sort and period, starting
// over whenever one of them changes.
export function useCivitaiExamples(initialBase: CivitaiBase) {
  const [base, setBase] = React.useState<CivitaiBase>(initialBase)
  const [sort, setSort] = React.useState<ExampleQuery["sort"]>("Most Reactions")
  const [period, setPeriod] = React.useState<ExampleQuery["period"]>("Week")
  const [items, setItems] = React.useState<CivitaiExample[]>([])
  const [next, setNext] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const request = React.useRef<AbortController>(null)

  React.useEffect(() => setBase(initialBase), [initialBase])

  const load = React.useCallback(
    async (cursor: string | null) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setLoading(true)
      setError(null)
      const q = new URLSearchParams({ base, sort, period })
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
    [base, sort, period]
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
    items,
    loading,
    error,
    more: next && !loading && !error ? () => void load(next) : null,
    retry: () => void load(items.length ? next : null),
  }
}
