import type { MachineFeedStateRow } from "@/lib/database"

import type { Feed, Item } from "./model"

// What the runner remembers about each feed, apart from a machine's `state`, which
// every save wipes. Pure, so it can be tested without a database.
export const FEED_OUTCOMES = ["ok", "busy", "unreadable", "failed"] as const
export type FeedOutcome = (typeof FEED_OUTCOMES)[number]

// A row a dataset still returns has to stay here. The longest window a dataset
// returns is far shorter than this, and the database holds to the same number.
export const MAX_SEEN = 500
// Failed reads in a row before a feed shows as failing, not just unlucky.
const FAILING_AFTER = 3

export const feedKey = (feed: Feed) => {
  switch (feed.kind) {
    case "rss":
      return `rss:${feed.url}`
    case "hackernews":
      return "hackernews"
    case "dataset":
      return `dataset:${feed.preset}`
    case "rival":
      return `rival:${feed.machine}`
    default:
      return `${feed.kind}:${feed.query}`
  }
}

// What a dataset read adds to the inbox. The first good read is a backlog, not
// news, so it's only remembered, even if a failed read came before it. This list
// and not the inbox decides what's been heard: the inbox is pruned after two weeks,
// and a slow dataset still returns older rows.
export function unseen(
  items: Item[],
  state: Pick<MachineFeedStateRow, "seen" | "last_ok_at"> | null
) {
  const before = new Set(state?.seen ?? [])
  const fresh = state?.last_ok_at ? items.filter((i) => !before.has(i.key)) : []
  const seen = [...items.map((i) => i.key), ...(state?.seen ?? [])]
  return { fresh, seen: [...new Set(seen)].slice(0, MAX_SEEN) }
}

export type StateChange = Pick<
  MachineFeedStateRow,
  | "seen"
  | "outcome"
  | "failures"
  | "last_read_at"
  | "last_ok_at"
  | "last_item_at"
  | "last_item_title"
>

// The row after one read. A busy source isn't a failing one, and either way the
// last good read and the last item stay, so a dead source can't look fresh.
export function afterRead(
  state: MachineFeedStateRow | null,
  outcome: FeedOutcome,
  fresh: Item[],
  seen: string[] | null,
  now: number
): StateChange {
  const at = new Date(now).toISOString()
  const newest = fresh[0]
  return {
    seen: seen ?? state?.seen ?? [],
    outcome,
    failures:
      outcome === "ok" || outcome === "busy" ? 0 : (state?.failures ?? 0) + 1,
    last_read_at: at,
    last_ok_at: outcome === "ok" ? at : (state?.last_ok_at ?? null),
    // The first read counts as life: a dataset that just answered isn't quiet.
    last_item_at:
      newest || (outcome === "ok" && !state?.last_ok_at)
        ? at
        : (state?.last_item_at ?? null),
    last_item_title:
      newest?.title.slice(0, 500) ?? state?.last_item_title ?? null,
  }
}

export type FeedHealth = "waiting" | "ok" | "quiet" | "failing"

// A dataset that stops updating answers 200 with nothing new, the same as a quiet
// day. `quietDays` is what tells them apart, for sources that have one.
export function feedHealth(
  state:
    | Pick<MachineFeedStateRow, "failures" | "last_read_at" | "last_item_at">
    | undefined,
  quietDays: number | null,
  now: number
): FeedHealth {
  if (!state?.last_read_at) return "waiting"
  if (state.failures >= FAILING_AFTER) return "failing"
  if (
    quietDays &&
    state.last_item_at &&
    now - Date.parse(state.last_item_at) > quietDays * 86_400_000
  )
    return "quiet"
  return "ok"
}
