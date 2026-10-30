import * as React from "react"

import {
  DEFAULT_LOOK,
  LAYOUTS,
  clonePage,
  createDefaultProject,
  createPage,
  createPanel,
  layoutRects,
  pageDoc,
  toProject,
  uid,
  type Character,
  type WorldItem,
  type ComicDoc,
  type ComicProject,
  type Layer,
  type Look,
  type PanelLayer,
} from "./model"

export const STORAGE_KEY = "palmframe:canvas"
const HISTORY_LIMIT = 100

interface History {
  project: ComicProject
  past: ComicProject[]
  future: ComicProject[]
  // Consecutive commits sharing a key collapse into one undo step
  // (a drag gesture, typing in one field).
  lastKey: string | null
}

type Action =
  | { type: "commit"; project: ComicProject; key?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; project: ComicProject }

function reducer(state: History, action: Action): History {
  switch (action.type) {
    case "commit": {
      if (action.project === state.project) return state
      if (action.key && action.key === state.lastKey) {
        return { ...state, project: action.project }
      }
      return {
        project: action.project,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: action.key ?? null,
      }
    }
    case "undo": {
      const prev = state.past.at(-1)
      if (!prev) return state
      return {
        project: prev,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
        lastKey: null,
      }
    }
    case "redo": {
      const next = state.future[0]
      if (!next) return state
      return {
        project: next,
        past: [...state.past, state.project],
        future: state.future.slice(1),
        lastKey: null,
      }
    }
    case "load":
      return { project: action.project, past: [], future: [], lastKey: null }
  }
}

// With `initial`, the project comes from the database and saves there
// (useCloudSync); without it, it lives in this browser's localStorage.
export function useComicEditor({ initial }: { initial?: ComicProject } = {}) {
  const local = !initial
  const [state, dispatch] = React.useReducer(reducer, undefined, () => ({
    project: initial ?? createDefaultProject(),
    past: [],
    future: [],
    lastKey: null,
  }))
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [loaded, setLoaded] = React.useState(false)

  // Undo can remove the slide being viewed, so clamp rather than trust state.
  const index = Math.min(pageIndex, state.project.pages.length - 1)
  const projectRef = React.useRef(state.project)
  projectRef.current = state.project
  const indexRef = React.useRef(index)
  indexRef.current = index
  const docRef = React.useMemo(
    () => ({
      get current() {
        return pageDoc(projectRef.current, indexRef.current)
      },
    }),
    []
  )

  // `?project=/comics/x.json` opens a comic file. Each file autosaves to
  // its own slot, so opening one never overwrites the default canvas.
  const storageKey = React.useRef(STORAGE_KEY)

  React.useEffect(() => {
    if (!local) return
    const source = new URLSearchParams(window.location.search).get("project")
    if (source) storageKey.current = `${STORAGE_KEY}:${source}`
    const fromStorage = () => {
      try {
        return toProject(
          JSON.parse(localStorage.getItem(storageKey.current) ?? "null")
        )
      } catch {
        return null
      }
    }
    let cancelled = false
    ;(async () => {
      let project = fromStorage()
      if (!project && source) {
        project = await fetch(source)
          .then((r) => (r.ok ? r.json() : null))
          .then(toProject)
          .catch(() => null)
      }
      if (cancelled) return
      if (project) dispatch({ type: "load", project })
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [local])

  React.useEffect(() => {
    if (!loaded || !local) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey.current, JSON.stringify(state.project))
      } catch {}
    }, 400)
    return () => clearTimeout(t)
  }, [state.project, loaded, local])

  const commitProject = React.useCallback(
    (fn: (project: ComicProject) => ComicProject, key?: string) => {
      const project = fn(projectRef.current)
      projectRef.current = project
      dispatch({ type: "commit", project, key })
    },
    []
  )

  // Edits the current slide. Format and paper colour are carousel-wide.
  const commit = React.useCallback(
    (fn: (doc: ComicDoc) => ComicDoc, key?: string) =>
      commitProject((p) => {
        const i = indexRef.current
        const view = pageDoc(p, i)
        const next = fn(view)
        if (next === view) return p
        return {
          ...p,
          width: next.width,
          height: next.height,
          background: next.background,
          pages: p.pages.map((page, j) =>
            j === i ? { ...page, layers: next.layers } : page
          ),
        }
      }, key),
    [commitProject]
  )

  const goToPage = React.useCallback((i: number) => {
    const clamped = Math.max(
      0,
      Math.min(projectRef.current.pages.length - 1, i)
    )
    indexRef.current = clamped
    setPageIndex(clamped)
    setSelectedId(null)
  }, [])

  const findLayer = React.useCallback((id: string) => {
    for (const [pageIndex, page] of projectRef.current.pages.entries()) {
      const layer = page.layers.find((l) => l.id === id)
      if (layer) return { layer, pageIndex }
    }
    return null
  }, [])

  // Works on any slide, so a render finishing after a slide change still lands.
  const update = React.useCallback(
    (id: string, patch: Partial<Layer>, key?: string) =>
      commitProject(
        (p) => ({
          ...p,
          pages: p.pages.map((page) =>
            page.layers.some((l) => l.id === id)
              ? {
                  ...page,
                  layers: page.layers.map((l) =>
                    l.id === id ? ({ ...l, ...patch } as Layer) : l
                  ),
                }
              : page
          ),
        }),
        key
      ),
    [commitProject]
  )

  const add = React.useCallback(
    (layer: Layer) => {
      commit((doc) => ({ ...doc, layers: [...doc.layers, layer] }))
      setSelectedId(layer.id)
    },
    [commit]
  )

  const remove = React.useCallback(
    (id: string) => {
      commit((doc) => ({
        ...doc,
        layers: doc.layers.filter((l) => l.id !== id),
      }))
      setSelectedId((s) => (s === id ? null : s))
    },
    [commit]
  )

  const duplicate = React.useCallback(
    (id: string) => {
      const source = docRef.current.layers.find((l) => l.id === id)
      if (!source) return
      const copy = {
        ...source,
        id: uid(),
        name: `${source.name} copy`,
        x: source.x + 24,
        y: source.y + 24,
        locked: false,
      }
      commit((doc) => {
        const i = doc.layers.findIndex((l) => l.id === id)
        const layers = [...doc.layers]
        layers.splice(i + 1, 0, copy)
        return { ...doc, layers }
      })
      setSelectedId(copy.id)
    },
    [commit, docRef]
  )

  // Index 0 is the bottom of the stack.
  const move = React.useCallback(
    (id: string, to: number | "up" | "down" | "top" | "bottom") =>
      commit((doc) => {
        const from = doc.layers.findIndex((l) => l.id === id)
        if (from < 0) return doc
        const last = doc.layers.length - 1
        const target =
          to === "up"
            ? from + 1
            : to === "down"
              ? from - 1
              : to === "top"
                ? last
                : to === "bottom"
                  ? 0
                  : to
        const index = Math.max(0, Math.min(last, target))
        if (index === from) return doc
        const layers = [...doc.layers]
        const [layer] = layers.splice(from, 1)
        layers.splice(index, 0, layer!)
        return { ...doc, layers }
      }),
    [commit]
  )

  // Replaces the panels with a layout, carrying images over in reading order.
  const applyLayout = React.useCallback(
    (layoutId: string) => {
      const layout = LAYOUTS.find((l) => l.id === layoutId)
      if (!layout) return
      commit((doc) => {
        const old = doc.layers
          .filter((l): l is PanelLayer => l.type === "panel")
          .sort((a, b) => a.y - b.y || a.x - b.x)
        const panels = layoutRects(layout.cells, doc.width, doc.height).map(
          (rect, i) => {
            const prev = old[i]
            const panel = createPanel(rect)
            return prev
              ? { ...prev, ...rect, rotation: 0, name: `Panel ${i + 1}` }
              : { ...panel, name: `Panel ${i + 1}` }
          }
        )
        return {
          ...doc,
          layers: [...panels, ...doc.layers.filter((l) => l.type !== "panel")],
        }
      })
      setSelectedId(null)
    },
    [commit]
  )

  const addPage = React.useCallback(() => {
    const i = indexRef.current
    commitProject((p) => {
      const pages = [...p.pages]
      pages.splice(i + 1, 0, createPage(p.pages[i]))
      return { ...p, pages }
    })
    goToPage(i + 1)
  }, [commitProject, goToPage])

  const duplicatePage = React.useCallback(
    (i: number) => {
      commitProject((p) => {
        const pages = [...p.pages]
        pages.splice(i + 1, 0, clonePage(p.pages[i]!))
        return { ...p, pages }
      })
      goToPage(i + 1)
    },
    [commitProject, goToPage]
  )

  // Moves a layer to another slide (or a new one after this) and follows it there.
  const moveLayerToPage = React.useCallback(
    (id: string, target: number | "new") => {
      const from = indexRef.current
      const layer = projectRef.current.pages[from]?.layers.find(
        (l) => l.id === id
      )
      if (!layer || target === from) return
      const to = target === "new" ? from + 1 : target
      commitProject((p) => {
        const pages = p.pages.map((page, i) =>
          i === from
            ? { ...page, layers: page.layers.filter((l) => l.id !== id) }
            : page
        )
        if (target === "new") pages.splice(to, 0, { id: uid(), layers: [] })
        pages[to] = { ...pages[to]!, layers: [...pages[to]!.layers, layer] }
        return { ...p, pages }
      })
      goToPage(to)
      setSelectedId(id)
    },
    [commitProject, goToPage]
  )

  const removePage = React.useCallback(
    (i: number) => {
      if (projectRef.current.pages.length <= 1) return
      commitProject((p) => ({ ...p, pages: p.pages.filter((_, j) => j !== i) }))
      goToPage(i <= indexRef.current ? indexRef.current - 1 : indexRef.current)
    },
    [commitProject, goToPage]
  )

  const movePage = React.useCallback(
    (from: number, to: number) => {
      const last = projectRef.current.pages.length - 1
      const target = Math.max(0, Math.min(last, to))
      if (target === from) return
      const viewing = projectRef.current.pages[indexRef.current]?.id
      commitProject((p) => {
        const pages = [...p.pages]
        const [page] = pages.splice(from, 1)
        pages.splice(target, 0, page!)
        return { ...p, pages }
      })
      // Keep showing the same slide wherever it ended up.
      const next = projectRef.current.pages.findIndex((p) => p.id === viewing)
      indexRef.current = next
      setPageIndex(next)
    },
    [commitProject]
  )

  const saveCharacter = React.useCallback(
    (character: Character, key?: string) =>
      commitProject((p) => {
        const cast = p.cast ?? []
        return {
          ...p,
          cast: cast.some((c) => c.id === character.id)
            ? cast.map((c) => (c.id === character.id ? character : c))
            : [...cast, character],
        }
      }, key),
    [commitProject]
  )

  // Also takes the character out of every panel they were cast in.
  const removeCharacter = React.useCallback(
    (id: string) =>
      commitProject((p) => ({
        ...p,
        cast: (p.cast ?? []).filter((c) => c.id !== id),
        pages: p.pages.map((page) => ({
          ...page,
          layers: page.layers.map((l) =>
            l.type === "panel" && l.cast?.includes(id)
              ? { ...l, cast: l.cast.filter((c) => c !== id) }
              : l
          ),
        })),
      })),
    [commitProject]
  )

  const saveWorldItem = React.useCallback(
    (item: WorldItem) =>
      commitProject((p) => {
        const world = p.world ?? []
        return {
          ...p,
          world: world.some((w) => w.id === item.id)
            ? world.map((w) => (w.id === item.id ? item : w))
            : [...world, item],
        }
      }),
    [commitProject]
  )

  // Also detaches the item from every panel it was on.
  const removeWorldItem = React.useCallback(
    (id: string) =>
      commitProject((p) => ({
        ...p,
        world: (p.world ?? []).filter((w) => w.id !== id),
        pages: p.pages.map((page) => ({
          ...page,
          layers: page.layers.map((l) =>
            l.type === "panel" && l.world?.includes(id)
              ? { ...l, world: l.world.filter((w) => w !== id) }
              : l
          ),
        })),
      })),
    [commitProject]
  )

  // `key` lets a run of changes to one control collapse into one undo step.
  const setLook = React.useCallback(
    (patch: Partial<Look>, key?: string) =>
      commitProject(
        (p) => ({ ...p, look: { ...(p.look ?? DEFAULT_LOOK), ...patch } }),
        key
      ),
    [commitProject]
  )

  // Opening or starting a carousel stays undoable.
  const replaceProject = React.useCallback(
    (project: ComicProject) => {
      commitProject(() => project)
      goToPage(0)
    },
    [commitProject, goToPage]
  )

  const doc = React.useMemo(
    () => pageDoc(state.project, index),
    [state.project, index]
  )
  const selected = doc.layers.find((l) => l.id === selectedId) ?? null

  return {
    project: state.project,
    projectRef,
    pageIndex: index,
    doc,
    docRef,
    selected,
    select: setSelectedId,
    commit,
    commitProject,
    findLayer,
    update,
    add,
    remove,
    duplicate,
    move,
    applyLayout,
    goToPage,
    addPage,
    duplicatePage,
    removePage,
    movePage,
    moveLayerToPage,
    replaceProject,
    saveCharacter,
    removeCharacter,
    saveWorldItem,
    removeWorldItem,
    setLook,
    undo: React.useCallback(() => dispatch({ type: "undo" }), []),
    redo: React.useCallback(() => dispatch({ type: "redo" }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

export type ComicEditor = ReturnType<typeof useComicEditor>
