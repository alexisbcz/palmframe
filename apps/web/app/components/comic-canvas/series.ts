import type {
  Character,
  ComicProject,
  Layer,
  Outfit,
  PanelLayer,
  WorldItem,
} from "./model"

// A series: carousels sharing a cast, a world and a list of facts. Each
// carousel keeps a full copy of the cast and world, so it never depends on
// the series to open; the shared version is merged in when it's opened and
// updated when a character or item is edited in any of them.

export const MAX_FACTS = 60
export const MAX_FACT = 200

// What the editor knows of the carousel's series.
export interface SeriesContext {
  id: string
  title: string
  facts: string[]
  // This carousel's place in the series, from 1, and how many there are.
  episode: number
  episodes: number
  // How the carousel before this one ended; empty for the first.
  previous: string
}

export type SharedLists = { characters: Character[]; world: WorldItem[] }

// Facts as stored and as sent to the planner: one line each, no blanks.
export function cleanFacts(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.replace(/\s+/g, " ").trim().slice(0, MAX_FACT))
    .filter(Boolean)
    .slice(0, MAX_FACTS)
}

const sameName = (a: { name: string }, b: { name: string }) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase()

// The series' version of each entry over the carousel's copy. An entry the
// series doesn't have stays: a character removed elsewhere keeps its panels.
function overlay<T extends { id: string }>(local: T[] = [], shared: T[]) {
  const byId = new Map(shared.map((s) => [s.id, s]))
  const own = new Set(local.map((l) => l.id))
  return [
    ...local.map((l) => byId.get(l.id) ?? l),
    ...shared.filter((s) => !own.has(s.id)),
  ]
}

// A carousel of the series, as opened. Nothing is written until the next edit.
export function withShared(
  project: ComicProject,
  shared: SharedLists
): ComicProject {
  if (!shared.characters.length && !shared.world.length) return project
  return {
    ...project,
    cast: overlay(project.cast, shared.characters),
    world: overlay(project.world, shared.world),
  }
}

// Outfits with the same name are one outfit; the series' id wins.
function mergeOutfits(local: Outfit[] = [], shared: Outfit[] = []) {
  const ids = new Map<string, string>()
  const added = local.filter((o) => {
    const match = shared.find((s) => s.id === o.id || sameName(s, o))
    if (match) ids.set(o.id, match.id)
    return !match
  })
  return { outfits: [...shared, ...added], ids }
}

function renamePanel(
  panel: PanelLayer,
  who: Map<string, string>,
  what: Map<string, string>,
  outfits: Map<string, string>
): PanelLayer {
  const renamed = (map: Map<string, string>, ids: string[]) => [
    ...new Set(ids.map((id) => map.get(id) ?? id)),
  ]
  const { check } = panel
  return {
    ...panel,
    ...(panel.cast && { cast: renamed(who, panel.cast) }),
    ...(panel.world && { world: renamed(what, panel.world) }),
    ...(panel.outfits && {
      outfits: Object.fromEntries(
        Object.entries(panel.outfits).map(([c, o]) => [
          who.get(c) ?? c,
          outfits.get(o) ?? o,
        ])
      ),
    }),
    ...(check && {
      check: {
        ...check,
        cast: renamed(who, check.cast),
        faces: check.faces.map((f) => ({
          ...f,
          who: f.who && (who.get(f.who) ?? f.who),
        })),
      },
    }),
  }
}

// A carousel joins a series. An entry with the same id or name is the same
// entry: the series' fields win, it keeps anything the series lacks (a model
// sheet, say), and panels are pointed at the series' id. Anything else is
// new to the series. Returns the carousel and the series' lists.
export function joinSeries(project: ComicProject, shared: SharedLists) {
  const who = new Map<string, string>()
  const what = new Map<string, string>()
  const outfits = new Map<string, string>()
  const characters = [...shared.characters]
  const world = [...shared.world]

  for (const c of project.cast ?? []) {
    const i = characters.findIndex((s) => s.id === c.id || sameName(s, c))
    if (i < 0) {
      characters.push(c)
      continue
    }
    const series = characters[i]!
    who.set(c.id, series.id)
    const merged = mergeOutfits(c.outfits, series.outfits)
    merged.ids.forEach((to, from) => outfits.set(from, to))
    characters[i] = {
      ...c,
      ...series,
      ...(merged.outfits.length && { outfits: merged.outfits }),
    }
  }
  for (const w of project.world ?? []) {
    const i = world.findIndex(
      (s) => s.id === w.id || (s.kind === w.kind && sameName(s, w))
    )
    if (i < 0) {
      world.push(w)
      continue
    }
    what.set(w.id, world[i]!.id)
    world[i] = { ...w, ...world[i]! }
  }

  const rename = (l: Layer) =>
    l.type === "panel" ? renamePanel(l, who, what, outfits) : l
  return {
    characters,
    world,
    project: {
      ...project,
      cast: characters,
      world,
      pages: project.pages.map((p) => ({ ...p, layers: p.layers.map(rename) })),
    } as ComicProject,
  }
}

// What changed in a carousel's cast and world since the last sync; null when
// nothing did.
export function sharedChanges(
  before: SharedLists,
  now: Pick<ComicProject, "cast" | "world">
) {
  const diff = <T extends { id: string }>(old: T[], next: T[] = []) => {
    const was = new Map(old.map((o) => [o.id, JSON.stringify(o)]))
    return {
      upsert: next.filter((n) => was.get(n.id) !== JSON.stringify(n)),
      remove: old
        .filter((o) => !next.some((n) => n.id === o.id))
        .map((o) => o.id),
    }
  }
  const characters = diff(before.characters, now.cast)
  const world = diff(before.world, now.world)
  const empty =
    !characters.upsert.length &&
    !characters.remove.length &&
    !world.upsert.length &&
    !world.remove.length
  return empty ? null : { characters, world }
}

export type SharedChanges = NonNullable<ReturnType<typeof sharedChanges>>

// Applies one carousel's changes to the series, entry by entry, so carousels
// saving at once don't undo each other's edits.
export function applyChanges(shared: SharedLists, changes: SharedChanges) {
  const apply = <T extends { id: string }>(
    list: T[],
    { upsert, remove }: { upsert: T[]; remove: string[] }
  ) => [
    ...list
      .filter((e) => !remove.includes(e.id))
      .map((e) => upsert.find((u) => u.id === e.id) ?? e),
    ...upsert.filter((u) => !list.some((e) => e.id === u.id)),
  ]
  return {
    characters: apply(shared.characters, changes.characters),
    world: apply(shared.world, changes.world),
  }
}
