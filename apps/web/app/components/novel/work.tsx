import * as React from "react"

import type { Storage } from "@/lib/novel/client"
import type { Novel } from "@/lib/novel/model"

// What every room shares: the document, its history and the current selection.

export type Room =
  | "board"
  | "stage"
  | "cast"
  | "sets"
  | "sound"
  | "maps"
  | "switchboard"
  | "front"
  | "release"

export interface Work {
  novel: Novel
  // `merge` folds repeated edits, such as a knob's turn, into one undo.
  update: (change: (draft: Novel) => void, merge?: string) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  storage: Storage
  room: Room
  setRoom: (room: Room) => void
  scene: string | null
  setScene: (id: string | null) => void
  step: string | null
  setStep: (id: string | null) => void
  play: (scene?: string | null) => void
  notify: (message: string) => void
  novelId: string | null
  signedIn: boolean
  art: ArtInfo | null
  writer: WriterInfo | null
  setCredits: (n: number | null) => void
}

export interface ArtInfo {
  route: "openrouter" | "credits" | null
  cost: number
  signedIn: boolean
}

export interface WriterInfo {
  available: boolean
  free: boolean
  costs: { outline: number; scene: number; score: number }
  signedIn: boolean
}

export const WorkContext = React.createContext<Work | null>(null)

export function useWork() {
  const work = React.useContext(WorkContext)
  if (!work) throw new Error("Outside the Stage.")
  return work
}

interface History {
  past: Novel[]
  present: Novel
  future: Novel[]
  merge: string | null
  mergedAt: number
}

const MAX_UNDO = 100
const MERGE_MS = 700

export function useHistory(initial: Novel, onChange: (novel: Novel) => void) {
  const [h, setH] = React.useState<History>({
    past: [],
    present: initial,
    future: [],
    merge: null,
    mergedAt: 0,
  })
  const ref = React.useRef(h)
  ref.current = h
  const commit = (next: History) => {
    ref.current = next
    setH(next)
    onChange(next.present)
  }
  const update = React.useCallback(
    (change: (draft: Novel) => void, merge?: string) => {
      const cur = ref.current
      const draft = structuredClone(cur.present)
      change(draft)
      const now = Date.now()
      const merging =
        !!merge && merge === cur.merge && now - cur.mergedAt < MERGE_MS
      commit({
        past: merging ? cur.past : [...cur.past.slice(-MAX_UNDO), cur.present],
        present: draft,
        future: [],
        merge: merge ?? null,
        mergedAt: now,
      })
    },
    // `commit` only reaches for refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const undo = React.useCallback(() => {
    const c = ref.current
    const last = c.past.at(-1)
    if (!last) return
    commit({
      past: c.past.slice(0, -1),
      present: last,
      future: [c.present, ...c.future],
      merge: null,
      mergedAt: 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const redo = React.useCallback(() => {
    const c = ref.current
    const next = c.future[0]
    if (!next) return
    commit({
      past: [...c.past, c.present],
      present: next,
      future: c.future.slice(1),
      merge: null,
      mergedAt: 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return {
    novel: h.present,
    update,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  }
}
