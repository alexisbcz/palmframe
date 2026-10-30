import {
  GENRES,
  groupOf,
  isColor,
  isGenre,
  isKind,
  matches,
  sorted,
  type Asset,
  type AssetGroup,
  type AssetKind,
  type AssetPayload,
  type Filters,
  type Genre,
} from "@/components/catalog/model"
import { OFFICIAL, PACKS } from "@/components/catalog/seed"
import { PALETTES, STYLES } from "@/components/comic-canvas/use-generator"

import type { ComicAssetRow, Viewer } from "./database"
import { supabaseAdmin } from "./supabase-admin.server"
import { supabaseEnv, type getSupabase } from "./supabase.server"

type Supabase = ReturnType<typeof getSupabase>["supabase"]

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

const COLUMNS =
  "id, user_id, author_name, kind, name, description, genres, color, image, payload, is_public, hidden, created_at, updated_at"
// How many community assets a search looks through, newest first.
const MAX_COMMUNITY = 500
const DAILY_LIMIT = 40
const MAX_TAGS = 24
const MAX_TAG = 80
const MAX_RECIPE = 400
const MAX_BRIEF = 2_000

// Past this, the official catalog answers alone. Without a limit, the client's
// retries hold every page for seconds while the database is unreachable.
const lookup = () => AbortSignal.timeout(1_500)

const toAsset = (row: ComicAssetRow, viewerId?: string): Asset | null => {
  if (!isKind(row.kind)) return null
  const mine = !!viewerId && row.user_id === viewerId
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    genres: row.genres.filter(isGenre),
    color: isColor(row.color) ? row.color : null,
    image: row.image,
    payload: row.payload,
    official: false,
    author: row.author_name,
    saves: 0,
    uses: 0,
    createdAt: row.created_at,
    ...(mine && { mine, isPublic: row.is_public, hidden: row.hidden }),
  }
}

// Each lookup degrades to nothing, so that the official catalog stays up
// without the database, and for people the database can't place.
async function community(supabase: Supabase, viewerId?: string) {
  const { data } = await supabase
    .from("comic_assets")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(MAX_COMMUNITY)
    .abortSignal(lookup())
  return ((data ?? []) as ComicAssetRow[]).flatMap(
    (r) => toAsset(r, viewerId) ?? []
  )
}

async function withCounts(
  supabase: Supabase,
  assets: Asset[],
  viewerId?: string
) {
  const [stats, saves] = await Promise.all([
    supabase.rpc("comic_asset_stats").abortSignal(lookup()),
    viewerId
      ? supabase
          .from("comic_asset_saves")
          .select("asset_id")
          .abortSignal(lookup())
      : Promise.resolve({ data: [] as { asset_id: string }[] }),
  ])
  const counts = new Map((stats.data ?? []).map((s) => [s.asset_id, s]))
  const saved = new Set((saves.data ?? []).map((s) => s.asset_id))
  return assets.map((a) => ({
    ...a,
    saves: Number(counts.get(a.id)?.saves ?? 0),
    uses: Number(counts.get(a.id)?.uses ?? 0),
    ...(saved.has(a.id) && { saved: true }),
  }))
}

export interface CatalogResult {
  assets: Asset[]
  total: number
  // Per kind and per group, with the other filters applied.
  kinds: Partial<Record<AssetKind, number>>
  groups: Partial<Record<AssetGroup, number>>
  genres: Partial<Record<Genre, number>>
}

export async function searchCatalog(
  supabase: Supabase,
  viewerId: string | undefined,
  filters: Filters
): Promise<CatalogResult> {
  const everything = await withCounts(
    supabase,
    [...OFFICIAL, ...(await community(supabase, viewerId))],
    viewerId
  )
  const found = sorted(
    everything.filter((a) => matches(a, filters)),
    filters.sort
  )
  const kinds: CatalogResult["kinds"] = {}
  const groups: CatalogResult["groups"] = {}
  for (const a of everything)
    if (matches(a, { ...filters, kind: null, group: null })) {
      kinds[a.kind] = (kinds[a.kind] ?? 0) + 1
      const group = groupOf(a.kind)
      groups[group] = (groups[group] ?? 0) + 1
    }
  const genres: CatalogResult["genres"] = {}
  for (const a of everything)
    if (matches(a, { ...filters, genres: [] }))
      for (const g of a.genres) genres[g] = (genres[g] ?? 0) + 1
  return {
    assets: found.slice(0, filters.limit),
    total: found.length,
    kinds,
    groups,
    genres,
  }
}

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id)

export async function getAssets(
  supabase: Supabase,
  viewerId: string | undefined,
  ids: string[]
) {
  const official = OFFICIAL.filter((a) => ids.includes(a.id))
  const uuids = ids.filter(isUuid)
  const { data } = uuids.length
    ? await supabase
        .from("comic_assets")
        .select(COLUMNS)
        .in("id", uuids)
        .abortSignal(lookup())
    : { data: [] }
  const found = await withCounts(
    supabase,
    [
      ...official,
      ...((data ?? []) as ComicAssetRow[]).flatMap(
        (r) => toAsset(r, viewerId) ?? []
      ),
    ],
    viewerId
  )
  // In the order asked for: a kit applies its style first.
  return ids.flatMap((id) => found.find((a) => a.id === id) ?? [])
}

export const getPack = (id: string) => PACKS.find((p) => p.id === id) ?? null

export function packCards() {
  return PACKS.map((p) => ({
    ...p,
    covers: p.assets
      .flatMap((id) => OFFICIAL.find((a) => a.id === id)?.image ?? [])
      .slice(0, 4),
  }))
}

// More of the same kind and genre, for the detail view.
export function relatedTo(asset: Asset) {
  return OFFICIAL.filter(
    (a) =>
      a.id !== asset.id &&
      a.image &&
      (a.kind === asset.kind || a.genres.some((g) => asset.genres.includes(g)))
  )
    .sort(
      (a, b) =>
        Number(b.kind === asset.kind) - Number(a.kind === asset.kind) ||
        b.genres.filter((g) => asset.genres.includes(g)).length -
          a.genres.filter((g) => asset.genres.includes(g)).length
    )
    .slice(0, 6)
}

// Public listings are read by everyone, including people far too young for
// them. This catches the honest cases before anything is published; reports
// and review handle the rest. Text only: it doesn't look at the image.
const SEXUAL =
  /\b(nsfw|nudes?|naked|topless|porn\w*|hentai|ecchi|explicit|erotic\w*|lewd|fetish\w*|sex|sexy|sexual\w*|lingerie|undress\w*|bikini|cleavage|nipples?|genitals?)\b/i
const MINORS =
  /\b(loli\w*|shota\w*|minors?|underage|child(ren)?|kids?|toddlers?|teen\w*|preteen|school ?(girl|boy)s?|little (girl|boy)s?|young (girl|boy)s?|\d{1,2} ?(yo|y\/o|years? old))\b/i

export function refusedText(text: string) {
  if (SEXUAL.test(text)) return "Sexual content can't be published."
  return null
}

export const refusedForPublic = (text: string) =>
  refusedText(text) ??
  (MINORS.test(text) ? "Public assets can't depict minors." : null)

const texts = (v: unknown, max: number, limit: number) =>
  (Array.isArray(v) ? v : [])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/\s+/g, " ").trim().slice(0, max))
    .filter(Boolean)
    .slice(0, limit)

const line = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : ""

const isHex = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)

// Only images the person uploaded to their own folder, so that a listing
// can't point the catalog's visitors at an arbitrary server.
const ownImage = (url: unknown, userId: string) =>
  typeof url === "string" &&
  !url.includes("..") &&
  url.startsWith(
    `${supabaseEnv().url}/storage/v1/object/public/comics/${userId}/`
  )

function cleanPayload(
  kind: AssetKind,
  value: unknown,
  userId: string
): AssetPayload | null {
  const v = (value ?? {}) as Record<string, unknown>
  const tags = texts(v.tags, MAX_TAG, MAX_TAGS)
  if (kind === "character" || kind === "creature")
    return tags.length
      ? {
          type: "character",
          character:
            kind === "creature"
              ? "other"
              : v.character === "boy"
                ? "boy"
                : v.character === "other"
                  ? "other"
                  : "girl",
          tags,
          ...(ownImage(v.sheet, userId) && { sheet: v.sheet as string }),
        }
      : null
  if (kind === "location" || kind === "prop")
    return tags.length ? { type: "world", world: kind, tags } : null
  if (kind === "outfit") return tags.length ? { type: "outfit", tags } : null
  if (kind === "background") return { type: "backdrop", tags }
  if (
    kind === "shot" ||
    kind === "lighting" ||
    kind === "pose" ||
    kind === "effect"
  ) {
    const prompt = line(v.prompt, MAX_RECIPE)
    return tags.length || prompt
      ? { type: "direction", tags, ...(prompt && { prompt }) }
      : null
  }
  if (kind === "style") {
    const look = (v.look ?? {}) as Record<string, unknown>
    const recipe = (v.recipe ?? {}) as Record<string, unknown>
    const style = look.style
    if (typeof style !== "string" || !(style in STYLES) || style === "raw")
      return null
    return {
      type: "look",
      look: {
        style: style as keyof typeof STYLES,
        palette: PALETTES.some((p) => p.id === look.palette)
          ? (look.palette as (typeof PALETTES)[number]["id"])
          : null,
        saturation:
          look.saturation === "vivid" || look.saturation === "muted"
            ? look.saturation
            : "balanced",
      },
      recipe: {
        name: line(recipe.name, 80),
        tags: line(recipe.tags, MAX_RECIPE),
        prose: line(recipe.prose, MAX_RECIPE),
        negative: line(recipe.negative, MAX_RECIPE),
      },
    }
  }
  if (kind === "sfx") {
    const text = line(v.text, 24)
    return text
      ? {
          type: "sfx",
          text,
          font: v.font === "comic" || v.font === "inter" ? v.font : "bangers",
          color: isHex(v.color) ? v.color : "#facc15",
          strokeColor: isHex(v.strokeColor) ? v.strokeColor : "#111111",
        }
      : null
  }
  const brief = line(v.brief, MAX_BRIEF)
  return brief
    ? {
        type: "story",
        brief,
        ...(Array.isArray(v.facts) && { facts: texts(v.facts, 200, 12) }),
      }
    : null
}

const payloadText = (p: AssetPayload) =>
  [
    "tags" in p ? p.tags.join(" ") : "",
    p.type === "direction" ? (p.prompt ?? "") : "",
    p.type === "look" ? `${p.recipe?.tags ?? ""} ${p.recipe?.prose ?? ""}` : "",
    p.type === "sfx" ? p.text : "",
    p.type === "story" ? `${p.brief} ${(p.facts ?? []).join(" ")}` : "",
  ].join(" ")

// The display name, never the email-derived fallback that `viewer.name`
// uses when the account has none set.
const publicName = (viewer: Viewer) =>
  viewer.name === viewer.email.split("@")[0] ? null : viewer.name.slice(0, 80)

export async function createAsset(viewer: Viewer, draft: unknown) {
  const d = (draft ?? {}) as Record<string, unknown>
  if (!isKind(d.kind)) throw new CatalogError("Pick a kind of asset.", 400)
  const name = line(d.name, 80)
  if (!name) throw new CatalogError("Give the asset a name.", 400)
  const payload = cleanPayload(d.kind, d.payload, viewer.id)
  if (!payload)
    throw new CatalogError("Describe the asset before saving it.", 400)
  if (d.image != null && !ownImage(d.image, viewer.id))
    throw new CatalogError("That image isn't one of your uploads.", 400)
  const description = line(d.description, 400)
  const isPublic = d.isPublic === true
  const text = `${name} ${description} ${payloadText(payload)}`
  const refused = isPublic ? refusedForPublic(text) : refusedText(text)
  if (refused) throw new CatalogError(refused, 422)

  const admin = supabaseAdmin()
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await admin
    .from("comic_assets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.id)
    .gte("created_at", since)
  if ((count ?? 0) >= DAILY_LIMIT)
    throw new CatalogError("That's today's limit of new assets.", 429)

  const { data, error } = await admin
    .from("comic_assets")
    .insert({
      user_id: viewer.id,
      author_name: publicName(viewer),
      kind: d.kind,
      name,
      description,
      genres: texts(d.genres, 20, 4).filter((g) =>
        (GENRES as readonly string[]).includes(g)
      ),
      color: isColor(d.color) ? d.color : null,
      image: ownImage(d.image, viewer.id) ? (d.image as string) : null,
      payload,
      is_public: isPublic,
    })
    .select("id")
    .single()
  if (error) throw new CatalogError(error.message, 500)
  return data.id
}

async function ownRow(viewer: Viewer, id: string) {
  if (!isUuid(id)) throw new CatalogError("No such asset.", 404)
  const { data } = await supabaseAdmin()
    .from("comic_assets")
    .select(COLUMNS)
    .eq("id", id)
    .eq("user_id", viewer.id)
    .maybeSingle()
  if (!data) throw new CatalogError("No such asset.", 404)
  return data as ComicAssetRow
}

export async function setPublic(viewer: Viewer, id: string, isPublic: boolean) {
  const row = await ownRow(viewer, id)
  if (row.hidden)
    throw new CatalogError("This asset was reported and is under review.", 403)
  if (isPublic) {
    const refused = refusedForPublic(
      `${row.name} ${row.description} ${payloadText(row.payload)}`
    )
    if (refused) throw new CatalogError(refused, 422)
  }
  const { error } = await supabaseAdmin()
    .from("comic_assets")
    .update({ is_public: isPublic, author_name: publicName(viewer) })
    .eq("id", id)
  if (error) throw new CatalogError(error.message, 500)
}

export async function reportAsset(viewer: Viewer, id: string, reason: string) {
  if (!isUuid(id))
    throw new CatalogError("Only community assets take reports.", 400)
  if (!["sexual", "minor", "hate", "copyright", "else"].includes(reason))
    throw new CatalogError("Pick a reason.", 400)
  const { error } = await supabaseAdmin()
    .from("comic_asset_reports")
    .upsert(
      { asset_id: id, user_id: viewer.id, reason },
      { onConflict: "asset_id,user_id", ignoreDuplicates: true }
    )
  if (error) throw new CatalogError(error.message, 500)
}
