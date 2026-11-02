import * as React from "react"

import {
  allSections,
  findElement,
  frameKey,
  mapElements,
  mapSections,
  removeElements,
  cloneElement,
} from "@/lib/sites/edit"
import {
  frameOf,
  phoneLayout,
  type Box,
  type Device,
  type El,
  type Page,
  type Section,
  type Site,
} from "@/lib/sites/model"
import { useSupabase } from "@/lib/supabase.browser"

const LIMIT = 120

export type SaveState = "saved" | "saving" | "dirty" | "conflict" | "failed"

export interface Selection {
  elements: string[]
  section: string | null
}

export function useEditor(id: string, initial: Site, revision: number) {
  const supabase = useSupabase()
  const [site, setSite] = React.useState(initial)
  const [pageId, setPageId] = React.useState(initial.pages[0]!.id)
  const [device, setDevice] = React.useState<Device>("desktop")
  const [selection, setSelection] = React.useState<Selection>({
    elements: [],
    section: null,
  })
  const [save, setSave] = React.useState<SaveState>("saved")

  // Undo holds whole documents. Edits share structure, so this stays cheap.
  const past = React.useRef<Site[]>([])
  const future = React.useRef<Site[]>([])
  const lastKey = React.useRef<{ key: string; at: number } | null>(null)
  const current = React.useRef(site)
  current.current = site
  const [, tick] = React.useReducer((n: number) => n + 1, 0)

  const rev = React.useRef(revision)
  const timer = React.useRef<number | undefined>(undefined)
  const dirty = React.useRef(false)
  const inFlight = React.useRef(false)

  const persist = React.useCallback(async () => {
    if (!dirty.current || inFlight.current) return
    inFlight.current = true
    dirty.current = false
    setSave("saving")
    const next = rev.current + 1
    const { data, error } = await supabase
      .from("comic_sites")
      .update({
        data: current.current,
        name: current.current.name.slice(0, 120),
        revision: next,
      })
      .eq("id", id)
      .eq("revision", rev.current)
      .select("revision")
    inFlight.current = false
    if (error) {
      dirty.current = true
      setSave("failed")
      return
    }
    if (!data?.length) {
      setSave("conflict")
      return
    }
    rev.current = next
    if (dirty.current) void persist()
    else setSave("saved")
  }, [id, supabase])

  const touch = React.useCallback(() => {
    dirty.current = true
    setSave((s) => (s === "conflict" ? s : "dirty"))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void persist(), 900)
  }, [persist])

  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return
      void persist()
      e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [persist])

  // A `key` folds a run of small edits, like typing, into one undo step.
  const edit = React.useCallback(
    (fn: (s: Site) => Site, key?: string) => {
      const before = current.current
      const after = fn(before)
      if (after === before) return
      const now = Date.now()
      const fold =
        key && lastKey.current?.key === key && now - lastKey.current.at < 900
      if (!fold) {
        past.current = [...past.current, before].slice(-LIMIT)
        future.current = []
      }
      lastKey.current = key ? { key, at: now } : null
      current.current = after
      setSite(after)
      touch()
    },
    [touch]
  )

  const undo = React.useCallback(() => {
    const previous = past.current.at(-1)
    if (!previous) return
    past.current = past.current.slice(0, -1)
    future.current = [current.current, ...future.current]
    lastKey.current = null
    current.current = previous
    setSite(previous)
    touch()
    tick()
  }, [touch])

  const redo = React.useCallback(() => {
    const next = future.current[0]
    if (!next) return
    future.current = future.current.slice(1)
    past.current = [...past.current, current.current]
    lastKey.current = null
    current.current = next
    setSite(next)
    touch()
    tick()
  }, [touch])

  const page: Page = site.pages.find((p) => p.id === pageId) ?? site.pages[0]!

  const selected = React.useMemo(
    () =>
      selection.elements.flatMap((elementId) => {
        const hit = findElement(site, elementId)
        return hit ? [hit.element] : []
      }),
    [selection.elements, site]
  )

  const section: Section | null =
    allSections(site, page).find((s) => s.id === selection.section) ??
    (selected[0] ? (findElement(site, selected[0].id)?.section ?? null) : null)

  const frame = React.useCallback(
    (e: El, s: Section): Box =>
      frameOf(e, device, device === "mobile" ? phoneLayout(s) : null),
    [device]
  )

  // Writes positions on the current device. On a phone that fixes the element
  // in place, and everything else keeps following the automatic layout.
  const setFrames = React.useCallback(
    (frames: Map<string, Box>, key?: string) => {
      const field = frameKey(device)
      edit(
        (s) =>
          mapElements(s, [...frames.keys()], (e) => ({
            ...e,
            [field]: frames.get(e.id)!,
          })),
        key
      )
    },
    [device, edit]
  )

  const patchEl = React.useCallback(
    (elementId: string, fn: (e: El) => El, key?: string) =>
      edit((s) => mapElements(s, [elementId], fn), key),
    [edit]
  )

  const patchSection = React.useCallback(
    (sectionId: string, fn: (s: Section) => Section, key?: string) =>
      edit((s) => mapSections(s, (x) => (x.id === sectionId ? fn(x) : x)), key),
    [edit]
  )

  const patchPage = React.useCallback(
    (fn: (p: Page) => Page, key?: string) =>
      edit(
        (s) => ({
          ...s,
          pages: s.pages.map((p) => (p.id === page.id ? fn(p) : p)),
        }),
        key
      ),
    [edit, page.id]
  )

  const select = React.useCallback(
    (elements: string[], sectionId: string | null = null) =>
      setSelection({ elements, section: sectionId }),
    []
  )

  const remove = React.useCallback(() => {
    if (!selection.elements.length) return
    edit((s) => removeElements(s, selection.elements))
    select([])
  }, [edit, select, selection.elements])

  const duplicate = React.useCallback(() => {
    const ids: string[] = []
    edit((s) => {
      let next = s
      for (const elementId of selection.elements) {
        const hit = findElement(next, elementId)
        if (!hit) continue
        const copy = cloneElement(hit.element)
        ids.push(copy.id)
        next = mapSections(next, (x) =>
          x.id === hit.section.id
            ? { ...x, elements: [...x.elements, copy] }
            : x
        )
      }
      return next
    })
    if (ids.length) select(ids)
  }, [edit, select, selection.elements])

  return {
    id,
    site,
    page,
    pageId,
    setPageId,
    device,
    setDevice,
    selection,
    select,
    selected,
    section,
    frame,
    setFrames,
    edit,
    patchEl,
    patchSection,
    patchPage,
    remove,
    duplicate,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    save,
    persist,
    flush: React.useCallback(async () => {
      window.clearTimeout(timer.current)
      await persist()
    }, [persist]),
  }
}

export type Editor = ReturnType<typeof useEditor>
