import { expect, test } from "bun:test"

import { emptyNovel, newOption, newScene, type Novel } from "./model"
import { exportRenpy } from "./renpy"

function novel(): Novel {
  const n = emptyNovel('A "quoted" tale')
  n.characters = [
    {
      id: "m",
      name: "Mara",
      color: "#f00",
      bio: "",
      look: "",
      blip: "soft",
      sprites: [{ id: "h", name: "Happy", url: "https://x/y.webp" }],
    },
  ]
  n.backdrops = [
    {
      id: "b",
      name: "Pier",
      url: "flat:harbor:night:1",
      kind: "bg",
      prompt: "",
    },
  ]
  n.variables = [
    { id: "v", name: "trust", kind: "number", initial: 0, hud: false, max: 9 },
  ]
  n.scenes[0]!.name = "1 Start"
  const two = newScene("Two")
  n.scenes.push(two)
  n.scenes[0]!.steps = [
    { id: "1", t: "bg", ref: "b", trans: "dissolve", dur: 1 },
    {
      id: "2",
      t: "say",
      who: "m",
      text: 'He said "100%"',
      pose: "h",
      voice: null,
    },
    {
      id: "3",
      t: "choice",
      prompt: "Go?",
      timer: 0,
      fallback: 0,
      options: [
        {
          ...newOption(),
          text: "Yes",
          goto: two.id,
          effects: [{ on: "v", op: "+", value: 1 }],
        },
      ],
    },
  ]
  two.steps = [{ id: "4", t: "end", ending: null }]
  return n
}

test("writes valid labels, characters, menus and asset lists", () => {
  const { script, files } = exportRenpy(novel())
  expect(script).toContain('define mara = Character("Mara", color="#f00")')
  expect(script).toContain("default trust = 0")
  expect(script).toContain("label start:")
  expect(script).toContain("label scene_1_start:")
  expect(script).toContain("scene bg pier with Dissolve(1)")
  expect(script).toContain('mara "He said \\"100%%\\""')
  expect(script).toContain('"Yes":')
  expect(script).toContain("$ trust += 1")
  expect(script).toContain("jump two")
  expect(files.map((f) => f.path)).toEqual([
    "images/pier.png",
    "images/mara_happy.webp",
  ])
})

test("names that clash stay distinct", () => {
  const n = novel()
  n.scenes.push({ ...newScene("Two"), id: "dup" })
  const { script } = exportRenpy(n)
  expect(script).toContain("label two:")
  expect(script).toContain("label two_2:")
})
