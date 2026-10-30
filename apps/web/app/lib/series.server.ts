import {
  createDefaultProject,
  toProject,
  type ComicProject,
} from "@/components/comic-canvas/model"
import {
  applyChanges,
  joinSeries,
  type SeriesContext,
  type SharedChanges,
  type SharedLists,
} from "@/components/comic-canvas/series"
import { seriesRecap } from "@/components/comic-canvas/story"

import type { ComicSeriesRow } from "./database"
import type { getSupabase } from "./supabase.server"

type Supabase = ReturnType<typeof getSupabase>["supabase"]

// All of this runs as the signed-in person: row-level security limits it to
// their own series and carousels.
export class SeriesError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function newSeries(supabase: Supabase, title: string) {
  const { data, error } = await supabase
    .from("comic_series")
    .insert({ title })
    .select("id")
    .single()
  if (error) throw new SeriesError(error.message, 500)
  return data.id
}

// Read, change, write if nobody else did, as placeImage does for projects.
async function change(
  supabase: Supabase,
  id: string,
  fn: (row: ComicSeriesRow) => Partial<SharedLists & { facts: string[] }>
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row } = await supabase
      .from("comic_series")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (!row) throw new SeriesError("No such series.", 404)
    const patch = fn(row)
    const { data: rows, error } = await supabase
      .from("comic_series")
      .update({ ...patch, revision: row.revision + 1 })
      .eq("id", id)
      .eq("revision", row.revision)
      .select("id")
    if (error) throw new SeriesError(error.message, 500)
    if (rows.length) return { ...row, ...patch }
  }
  throw new SeriesError("The series is busy; try again.", 409)
}

export const setFacts = (supabase: Supabase, id: string, facts: string[]) =>
  change(supabase, id, () => ({ facts }))

export const syncChanges = (
  supabase: Supabase,
  id: string,
  changes: SharedChanges
) => change(supabase, id, (row) => applyChanges(row, changes))

async function nextPosition(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("comic_projects")
    .select("series_position")
    .eq("series_id", id)
    .order("series_position", { ascending: false })
    .limit(1)
  return (data?.[0]?.series_position ?? 0) + 1
}

// The revision goes up, so a tab still open on the old copy stops saving
// rather than bringing back the ids this rewrites.
export async function addToSeries(
  supabase: Supabase,
  id: string,
  projectId: string
) {
  const { data: row } = await supabase
    .from("comic_projects")
    .select("data, revision")
    .eq("id", projectId)
    .maybeSingle()
  const project = row && toProject(row.data)
  if (!row || !project) throw new SeriesError("No such carousel.", 404)
  let joined: ComicProject | undefined
  await change(supabase, id, (series) => {
    const { characters, world, project: next } = joinSeries(project, series)
    joined = next
    return { characters, world }
  })
  const { data: rows, error } = await supabase
    .from("comic_projects")
    .update({
      data: joined,
      revision: row.revision + 1,
      series_id: id,
      series_position: await nextPosition(supabase, id),
    })
    .eq("id", projectId)
    .eq("revision", row.revision)
    .select("id")
  if (error) throw new SeriesError(error.message, 500)
  if (!rows.length) throw new SeriesError("The carousel just changed.", 409)
}

export async function leaveSeries(supabase: Supabase, projectId: string) {
  const { error } = await supabase
    .from("comic_projects")
    .update({ series_id: null, series_position: null })
    .eq("id", projectId)
  if (error) throw new SeriesError(error.message, 500)
}

// A new carousel with the series' cast and world already in it.
export async function newCarousel(supabase: Supabase, id: string) {
  const { data: series } = await supabase
    .from("comic_series")
    .select("characters, world")
    .eq("id", id)
    .maybeSingle()
  if (!series) throw new SeriesError("No such series.", 404)
  const { data, error } = await supabase
    .from("comic_projects")
    .insert({
      data: {
        ...createDefaultProject(),
        cast: series.characters,
        world: series.world,
      },
      series_id: id,
      series_position: await nextPosition(supabase, id),
    })
    .select("id")
    .single()
  if (error) throw new SeriesError(error.message, 500)
  return data.id
}

// The series a carousel opens with. Null for a carousel outside one, and if
// the lookup fails, since a carousel always opens from its own copy.
export async function seriesOf(
  supabase: Supabase,
  projectId: string
): Promise<(SharedLists & { context: SeriesContext }) | null> {
  const { data: link } = await supabase
    .from("comic_projects")
    .select("series_id")
    .eq("id", projectId)
    .maybeSingle()
  if (!link?.series_id) return null
  const { data: series } = await supabase
    .from("comic_series")
    .select("*")
    .eq("id", link.series_id)
    .maybeSingle()
  const { data: order } = await supabase
    .from("comic_projects")
    .select("id")
    .eq("series_id", link.series_id)
    .order("series_position")
    .order("created_at")
  if (!series || !order) return null
  const index = order.findIndex((p) => p.id === projectId)
  const before = order[index - 1]
  const { data: previous } = before
    ? await supabase
        .from("comic_projects")
        .select("data")
        .eq("id", before.id)
        .maybeSingle()
    : { data: null }
  const project = previous && toProject(previous.data)
  return {
    characters: series.characters,
    world: series.world,
    context: {
      id: series.id,
      title: series.title,
      facts: series.facts,
      episode: index + 1,
      episodes: order.length,
      previous: project ? seriesRecap(project) : "",
    },
  }
}

// The account's series with their carousels in order, for /projects. Empty if
// the lookup fails, so the list of projects doesn't depend on it.
export async function listSeries(supabase: Supabase) {
  const [{ data: series }, { data: links }] = await Promise.all([
    supabase
      .from("comic_series")
      .select("id, title, facts")
      .order("created_at"),
    supabase
      .from("comic_projects")
      .select("id, series_id")
      .not("series_id", "is", null)
      .order("series_position")
      .order("created_at"),
  ])
  return (series ?? []).map((s) => ({
    ...s,
    carousels: (links ?? [])
      .filter((l) => l.series_id === s.id)
      .map((l) => l.id),
  }))
}

export type SeriesSummary = Awaited<ReturnType<typeof listSeries>>[number]
