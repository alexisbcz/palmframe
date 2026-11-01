import { describe, expect, test } from "bun:test"

import { emptyNovel, newScene, newStep, type Novel, type Step } from "./model"
import { parseScene, printScene, slug } from "./script"

function novel(): Novel {
  const n = emptyNovel("t")
  n.characters = [
    {
      id: "m",
      name: "Mara Vey",
      color: "#fff",
      bio: "",
      look: "",
      blip: "soft",
      sprites: [{ id: "h", name: "Happy", url: "" }],
    },
  ]
  n.backdrops = [
    { id: "b", name: "Night Pier", url: "", kind: "bg", prompt: "" },
  ]
  n.tracks = [{ id: "t", name: "Tide", kind: "music", loop: true }]
  n.items = [{ id: "k", name: "Key", description: "", url: "" }]
  n.variables = [
    { id: "v", name: "trust", kind: "number", initial: 0, hud: false, max: 9 },
  ]
  n.scenes[0]!.name = "Harbor"
  n.scenes.push(newScene("Station"))
  return n
}

const strip = (steps: Step[]) =>
  JSON.parse(JSON.stringify(steps, (k, v) => (k === "id" ? undefined : v)))

describe("script", () => {
  test("slugs keep letters from every language", () => {
    expect(slug("Night Pier")).toBe("night_pier")
    expect(slug("Élodie")).toBe("elodie")
    expect(slug("夜の港")).toBe("夜の港")
  })

  test("reads a full scene", () => {
    const n = novel()
    const { steps, errors } = parseScene(
      n,
      `scene night_pier with dissolve 1s
music tide fade 2 vol 0.5
show mara_vey happy at left with dissolve 0.5s
"The tide was out."
mara_vey happy "You came."
set trust + 1
menu "Stay?" timer 8 fallback 1:
    "Yes" -> station set trust + 2
    "No" if trust >= 2 locked
if trust >= 3 -> station else -> harbor
end`
    )
    expect(errors).toEqual([])
    expect(steps.map((s) => s.t)).toEqual([
      "bg",
      "music",
      "show",
      "say",
      "say",
      "set",
      "choice",
      "if",
      "end",
    ])
    const menu = steps[6] as Extract<Step, { t: "choice" }>
    expect(menu.timer).toBe(8)
    expect(menu.options[0]!.effects[0]).toEqual({ on: "v", op: "+", value: 2 })
    expect(menu.options[1]!.when?.clauses[0]).toEqual({
      on: "v",
      op: ">=",
      value: 2,
    })
    expect(menu.options[1]!.showLocked).toBe(true)
  })

  test("printing then reading gives the same steps", () => {
    const n = novel()
    const scene = n.scenes[0]!
    scene.steps = [
      newStep("bg", n),
      newStep("show", n),
      { ...newStep("say", n), text: 'She said "go"\nand left.' } as Step,
      newStep("music", n),
      newStep("weather", n),
      newStep("grade", n),
      newStep("camera", n),
      newStep("shake", n),
      newStep("flash", n),
      newStep("fade", n),
      newStep("wait", n),
      newStep("set", n),
      newStep("hide", n),
      newStep("move", n),
      newStep("jump", n),
      newStep("item", n),
      newStep("end", n),
      { ...newStep("note", n), text: "fix this" } as Step,
    ]
    const printed = printScene(n, scene)
    const { steps, errors } = parseScene(n, printed)
    expect(errors).toEqual([])
    expect(strip(steps)).toEqual(strip(scene.steps))
    expect(printScene(n, { ...scene, steps })).toBe(printed)
  })

  test("names that don't exist are errors, or get created for a first draft", () => {
    const n = novel()
    const strict = parseScene(n, 'scene moon\nnoor "Hello"\njump nowhere')
    expect(strict.errors.map((e) => e.message)).toEqual([
      "unknownBackdrop",
      "unknownCharacter",
      "unknownScene",
    ])
    const made = parseScene(n, 'scene moon\nnoor glad "Hello"', {
      create: true,
    })
    expect(made.errors).toEqual([])
    expect(n.backdrops.at(-1)?.name).toBe("Moon")
    expect(n.characters.at(-1)?.name).toBe("Noor")
    expect(n.characters.at(-1)?.sprites[0]?.name).toBe("Glad")
  })

  test("a line it can't read says so", () => {
    const { errors } = parseScene(novel(), "dance wildly")
    expect(errors[0]?.message).toBe("notUnderstood")
  })
})
