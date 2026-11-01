import { expect, test } from "bun:test"

import { demoNovel } from "./demo"
import { run, startState, answer, choose, travel } from "./engine"
import { lint } from "./lint"
import { exportRenpy } from "./renpy"
import { parseScene, printScene } from "./script"
import { fromOutline, bible } from "./outline"

test("the sample has nothing wrong with it", () => {
  expect(lint(demoNovel())).toEqual([])
})

test("the sample can be read from start to an ending", () => {
  const n = demoNovel()
  let state = startState(n)
  let ending: string | null = null
  for (let i = 0; i < 400 && !ending; i++) {
    const r = run(n, state)
    state = r.state
    if (r.beat.kind === "error") throw new Error(r.beat.message)
    if (r.beat.kind === "end") ending = r.beat.ending
    if (r.beat.kind === "ask") state = answer(state, r.beat.step.on, "Ada")
    if (r.beat.kind === "choice")
      state = choose(n, state, r.beat.options[0]!.option)
    if (r.beat.kind === "map") state = travel(state, n.maps[0]!.pins[1]!.scene)
  }
  expect(ending).toBe("the_keeper")
})

test("the map hides the lighthouse without the key", () => {
  const n = demoNovel()
  const pin = n.maps[0]!.pins[1]!
  expect(pin.when?.clauses[0]?.on).toBe("item:lighthouse_key")
})

test("the sample's scenes print and read back", () => {
  const n = demoNovel()
  for (const s of n.scenes) {
    const printed = printScene(n, s)
    const { errors, steps } = parseScene(n, printed)
    expect(errors).toEqual([])
    expect(printScene(n, { ...s, steps })).toBe(printed)
  }
})

test("the sample exports to Ren'Py", () => {
  const { script, files } = exportRenpy(demoNovel())
  expect(script).toContain("label start:")
  expect(script).toContain("jump opening".replace("opening", "last_call"))
  expect(files.some((f) => f.recipe)).toBe(true)
})

test("a writer's plan becomes a novel that plays", () => {
  const n = fromOutline(
    {
      title: "T",
      synopsis: "S",
      art_style: "A",
      characters: [
        { name: "Ines", bio: "b", look: "l", poses: ["happy", "weird"] },
      ],
      locations: [{ name: "Dock", prompt: "p" }],
      variables: [{ name: "Trust Level", kind: "number", hud: true }],
      scenes: [
        {
          name: "One",
          summary: "s1",
          leads_to: ["Two", "Three"],
          is_ending: false,
        },
        { name: "Two", summary: "s2", leads_to: [], is_ending: true },
        {
          name: "Three",
          summary: "s3",
          leads_to: ["Missing"],
          is_ending: false,
        },
      ],
    },
    "fr",
    42
  )
  expect(n.language).toBe("fr")
  expect(n.characters[0]!.sprites[0]!.url).toStartWith("paper:")
  expect(n.backdrops[0]!.url).toStartWith("flat:")
  expect(n.variables[0]!.name).toBe("trust_level")
  expect(n.endings).toHaveLength(2)
  const r = run(n, startState(n))
  expect(r.beat.kind).toBe("say")
  expect(lint(n).filter((i) => i.level === "error")).toEqual([])
  expect(bible(n)).toContain("ines")
})
