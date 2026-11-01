import { describe, expect, test } from "bun:test"

import pkg from "../../../package.json"
import {
  LAB_FEATURES,
  LITERT_VERSION,
  TOOL_IDS,
  TOOLS,
  readLabs,
} from "./catalog"

describe("readLabs", () => {
  test("every feature is off by default", () => {
    for (const stored of [undefined, null, {}]) {
      const labs = readLabs(stored)
      expect(LAB_FEATURES.every((f) => labs[f] === false)).toBe(true)
    }
  })

  test("only a literal true turns a feature on", () => {
    const labs = readLabs({
      voice: true,
      redact: "true",
      images: 1,
      sketch: {},
    })
    expect(labs.voice).toBe(true)
    expect(labs.redact).toBe(false)
    expect(labs.images).toBe(false)
    expect(labs.sketch).toBe(false)
  })

  test("drops keys that aren't features", () => {
    expect(readLabs({ admin: true })).not.toHaveProperty("admin")
  })
})

test("every tool has a catalog entry", () => {
  for (const id of TOOL_IDS) expect(TOOLS[id].models.length).toBeGreaterThan(0)
})

test("the LiteRT runtime matches the installed package", () => {
  expect(pkg.dependencies["@litertjs/core"]).toBe(LITERT_VERSION)
})
