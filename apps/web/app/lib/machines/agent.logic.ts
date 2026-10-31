import type { Item } from "./model"

export interface Filed {
  text: string
  scene: string
  alt: string
  // Only ever items from the inbox, however the agent cites them.
  sources: Item[]
  link: string | null
  // What the agent read beyond the headlines, which also counts as evidence.
  read: string
  prompt: string
}

// Fenced as data, with short ids, so URLs never travel through the model.
export function inboxBrief(items: Item[], recent: string[]) {
  return JSON.stringify({
    inbox: items.map((i, id) => ({
      id,
      source: i.source,
      title: i.title,
      summary: i.summary,
      at: new Date(i.at).toISOString(),
    })),
    recent_posts: recent,
  })
}

export interface Input {
  text?: unknown
  scene?: unknown
  alt?: unknown
  item_ids?: unknown
}

export function toFiled(
  input: Input,
  items: Item[],
  read: string,
  prompt: string
): Filed | null {
  const text = typeof input.text === "string" ? input.text.trim() : ""
  if (!text) return null
  const ids = Array.isArray(input.item_ids) ? input.item_ids : []
  const sources = [...new Set(ids)].flatMap((id) => {
    const item = typeof id === "number" ? items[id] : undefined
    return item ? [item] : []
  })
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : ""
  return {
    text: text.slice(0, 500),
    scene: str(input.scene, 1000),
    alt: str(input.alt, 500),
    sources,
    link: sources[0]?.url ?? null,
    read,
    prompt,
  }
}
