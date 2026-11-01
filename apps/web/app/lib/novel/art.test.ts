import { expect, test } from "bun:test"

import { nearestAspect, parseArt } from "./art.server"
import { parseWrite } from "./write.server"

test("aspect ratios snap to what models offer", () => {
  expect(nearestAspect(1536, 864)).toBe("16:9")
  expect(nearestAspect(800, 1200)).toBe("2:3")
})

test("art requests reject junk and keep only safe references", () => {
  expect(parseArt({ prompt: "  " })).toBeNull()
  const r = parseArt({
    prompt: "a pier",
    width: 99999,
    height: 10,
    refs: [
      "https://a/b.png",
      "http://169.254.169.254/x",
      "file:///etc/passwd",
      "data:image/png;base64,x",
    ],
  })!
  expect(r.width).toBe(1536)
  expect(r.height).toBe(256)
  expect(r.refs).toEqual(["https://a/b.png", "data:image/png;base64,x"])
})

test("write requests are bounded", () => {
  expect(parseWrite({ mode: "outline", premise: "" })).toBeNull()
  expect(parseWrite({ mode: "nope" })).toBeNull()
  const r = parseWrite({ mode: "outline", premise: "x", length: 900 })
  expect(r).toMatchObject({ length: 24 })
})
