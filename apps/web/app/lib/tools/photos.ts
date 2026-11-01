export type Pile = "keepers" | "maybes" | "rejects"

export const PILES: readonly Pile[] = ["keepers", "maybes", "rejects"]

type Reading = { has(tag: string): boolean; scores: { keeper: number } | null }

// Eye's "keep or delete" tags. Anything broken goes first, since a sharp photo
// of nothing can still read as a keeper.
const REJECT = ["unusable", "accidental", "technical_flaw", "low_content"]

export function pileFor(photo: Reading, duplicate: boolean): Pile {
  if (duplicate || REJECT.some((tag) => photo.has(tag))) return "rejects"
  return photo.has("keeper") ? "keepers" : "maybes"
}

// The photos that lose out in each near-duplicate group. The first of a group
// is its best, so it stays.
export const duplicatesIn = (groups: number[][]) =>
  new Set(groups.flatMap((group) => group.slice(1)))
