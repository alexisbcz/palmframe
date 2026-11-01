import { expect, test } from "bun:test"

import { lint } from "./lint"
import { emptyNovel, newScene } from "./model"

test("flags unreachable scenes, dead ends and missing endings", () => {
  const n = emptyNovel("t")
  n.scenes[0]!.steps = [
    { id: "a", t: "say", who: null, text: "hi", pose: null, voice: null },
  ]
  n.scenes.push(newScene("Lost"))
  const codes = lint(n).map((i) => i.code)
  expect(codes).toContain("unreachable")
  expect(codes).toContain("deadEnd")
  expect(codes).toContain("emptyScene")
  expect(codes).toContain("noEnding")
})

test("a finished novel is clean", () => {
  const n = emptyNovel("t")
  n.scenes[0]!.steps = [
    { id: "a", t: "say", who: null, text: "hi", pose: null, voice: null },
    { id: "b", t: "end", ending: null },
  ]
  expect(lint(n)).toEqual([])
})

test("a jump to a deleted scene is an error", () => {
  const n = emptyNovel("t")
  n.scenes[0]!.steps = [{ id: "j", t: "jump", scene: "gone" }]
  expect(lint(n).find((i) => i.code === "missingTarget")?.level).toBe("error")
})

test("one unpainted set is one issue however often it's used", () => {
  const n = emptyNovel("t")
  n.backdrops = [{ id: "b", name: "Pier", url: "", kind: "bg", prompt: "" }]
  n.scenes[0]!.steps = [
    { id: "1", t: "bg", ref: "b", trans: "cut", dur: 0 },
    { id: "2", t: "bg", ref: "b", trans: "cut", dur: 0 },
    { id: "3", t: "end", ending: null },
  ]
  expect(lint(n).filter((i) => i.code === "noArt")).toHaveLength(1)
})
