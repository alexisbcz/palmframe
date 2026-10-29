import * as React from "react"

// Danbooru's tag list with post counts and aliases, from
// DominikDoom/a1111-sd-webui-tagcomplete (MIT). Trimmed to general tags with
// 100+ posts, artists with 300+ and meta tags, minus adult tags: Anima
// knows a tag about as well as Danbooru uses it.
export type TagCategory = "general" | "artist" | "meta"

export interface TagInfo {
  name: string
  category: TagCategory
  count: number
  aliases: string[]
}

type Row = [string, number, number, string?]
const CATEGORY: Record<number, TagCategory> = {
  0: "general",
  1: "artist",
  5: "meta",
}

export interface TagDb {
  tags: TagInfo[]
  byName: Map<string, TagInfo>
  byAlias: Map<string, TagInfo>
}

let pending: Promise<TagDb> | null = null

export function loadTagDb() {
  pending ??= fetch("/anima-tags.json")
    .then((r) => r.json() as Promise<Row[]>)
    .then((rows) => {
      const tags = rows.map(([name, cat, count, aliases]) => ({
        name,
        category: CATEGORY[cat] ?? "general",
        count,
        aliases: aliases ? aliases.split("|") : [],
      }))
      const byName = new Map(tags.map((t) => [t.name, t]))
      const byAlias = new Map<string, TagInfo>()
      for (const t of tags)
        for (const a of t.aliases) if (!byName.has(a)) byAlias.set(a, t)
      return { tags, byName, byAlias }
    })
    .catch((e) => {
      pending = null
      throw e
    })
  return pending
}

export function useTagDb() {
  const [db, setDb] = React.useState<TagDb | null>(null)
  React.useEffect(() => {
    let live = true
    loadTagDb()
      .then((d) => live && setDb(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return db
}

// Artists are written @name in Anima prompts.
export const promptName = (t: TagInfo) =>
  t.category === "artist" ? `@${t.name}` : t.name

export function lookup(db: TagDb | null, tag: string) {
  if (!db) return undefined
  const name = tag.startsWith("@") ? tag.slice(1) : tag
  return db.byName.get(name)
}

export interface Suggestion {
  tag: TagInfo
  // The alias that matched, when the query matched an alias, not the name.
  via?: string
}

// Prefix matches on any word of a name or alias, most used first.
export function searchTags(
  db: TagDb,
  query: string,
  exclude: string[],
  limit = 8
): Suggestion[] {
  const q = query.trim().toLowerCase().replace(/_/g, " ").replace(/^@/, "")
  if (!q) return []
  const artistOnly = query.trim().startsWith("@")
  const hits: (Suggestion & { rank: number })[] = []
  const matches = (s: string) =>
    s.startsWith(q) ? 2 : s.includes(` ${q}`) ? 1 : 0
  for (const tag of db.tags) {
    if (artistOnly && tag.category !== "artist") continue
    if (exclude.includes(promptName(tag))) continue
    let rank = matches(tag.name)
    let via: string | undefined
    if (!rank) {
      for (const a of tag.aliases) {
        if (matches(a)) {
          rank = matches(a) - 0.5
          via = a
          break
        }
      }
    }
    if (rank) hits.push({ tag, via, rank })
  }
  // Exact prefix first, then popularity: the list is sorted by count already.
  hits.sort((a, b) => b.rank - a.rank)
  return hits.slice(0, limit)
}

export function formatCount(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}
