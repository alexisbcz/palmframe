import { expect, test } from "bun:test"

import {
  assetUrl,
  actorSvg,
  FLAT_PLACES,
  FLAT_TIMES,
  flatSvg,
  flatUrl,
  paperUrl,
  PAPER_FACES,
  PAPER_HAIR,
} from "./paper"

test("every set and time draws well-formed, deterministic SVG", () => {
  for (const p of FLAT_PLACES)
    for (const t of FLAT_TIMES) {
      const svg = flatSvg(p, t, 3)
      expect(svg).toBe(flatSvg(p, t, 3))
      expect(svg).not.toContain("NaN")
      expect(svg).not.toContain("undefined")
      expect(svg.startsWith("<svg")).toBe(true)
    }
})

test("every actor combination draws", () => {
  for (const hair of PAPER_HAIR)
    for (const face of PAPER_FACES) {
      const svg = actorSvg({
        hair,
        face,
        hairColor: "#111111",
        skin: "#eebb99",
        coat: "#335577",
      })
      expect(svg).not.toContain("undefined")
    }
})

test("urls resolve to loadable images and pass real urls through", () => {
  expect(assetUrl(flatUrl("harbor", "night"))).toStartWith("data:image/svg+xml")
  expect(
    assetUrl(
      paperUrl({
        hair: "bob",
        hairColor: "#111",
        skin: "#eee",
        coat: "#333",
        face: "happy",
      })
    )
  ).toStartWith("data:image/svg+xml")
  expect(assetUrl("https://x/y.png")).toBe("https://x/y.png")
  expect(assetUrl(null)).toBe("")
})
