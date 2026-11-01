import { expect, test } from "bun:test"

import { duplicatesIn, pileFor } from "./photos"

const photo = (...tags: string[]) => ({
  has: (tag: string) => tags.includes(tag),
  scores: { keeper: 0.5 },
})

test("sorts by Eye's tags, rejects first", () => {
  expect(pileFor(photo("keeper"), false)).toBe("keepers")
  expect(pileFor(photo(), false)).toBe("maybes")
  expect(pileFor(photo("keeper", "unusable"), false)).toBe("rejects")
})

test("a duplicate is rejected whatever its tags", () => {
  expect(pileFor(photo("keeper"), true)).toBe("rejects")
})

test("keeps the best of each duplicate group", () => {
  expect(
    [
      ...duplicatesIn([
        [3, 1, 2],
        [5, 4],
      ]),
    ].sort()
  ).toEqual([1, 2, 4])
})
