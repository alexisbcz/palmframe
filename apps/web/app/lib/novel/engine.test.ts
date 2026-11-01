import { describe, expect, test } from "bun:test"

import {
  answer,
  choose,
  holds,
  interpolate,
  parseText,
  plainText,
  run,
  stageAt,
  startState,
  travel,
} from "./engine"
import { emptyNovel, newOption, newScene, type Novel, type Step } from "./model"

const say = (text: string, id = text): Step => ({
  id,
  t: "say",
  who: null,
  text,
  pose: null,
  voice: null,
})

function novel(): Novel {
  const n = emptyNovel("t")
  n.variables = [
    { id: "v", name: "trust", kind: "number", initial: 0, hud: false, max: 10 },
    {
      id: "p",
      name: "player",
      kind: "text",
      initial: "Ada",
      hud: false,
      max: 0,
    },
  ]
  n.scenes[0]!.id = "a"
  n.start = "a"
  n.scenes.push({ ...newScene("B"), id: "b" }, { ...newScene("C"), id: "c" })
  return n
}

describe("run", () => {
  test("stops on each line and walks the scene in order", () => {
    const n = novel()
    n.scenes[0]!.steps = [say("one"), say("two")]
    let r = run(n, startState(n))
    expect(r.beat.kind === "say" && r.beat.step.text).toBe("one")
    r = run(n, r.state)
    expect(r.beat.kind === "say" && r.beat.step.text).toBe("two")
    r = run(n, r.state)
    expect(r.beat.kind).toBe("end")
  })

  test("a choice applies its effects and goes to its scene", () => {
    const n = novel()
    const go = {
      ...newOption(),
      text: "Go",
      goto: "b",
      effects: [{ on: "v", op: "+" as const, value: 2 }],
    }
    n.scenes[0]!.steps = [
      {
        id: "c1",
        t: "choice",
        prompt: "",
        options: [go],
        timer: 0,
        fallback: 0,
      },
    ]
    n.scenes[1]!.steps = [say("in b")]
    const r = run(n, startState(n))
    expect(r.beat.kind).toBe("choice")
    const next = choose(n, r.state, go)
    expect(next.vars.v).toBe(2)
    expect(next.seen).toContain("b")
    const after = run(n, next)
    expect(after.beat.kind === "say" && after.beat.step.text).toBe("in b")
  })

  test("locked options hide unless marked, and an empty choice falls through", () => {
    const n = novel()
    const when = {
      all: true,
      clauses: [{ on: "v", op: ">=" as const, value: 5 }],
    }
    n.scenes[0]!.steps = [
      {
        id: "c",
        t: "choice",
        prompt: "",
        options: [{ ...newOption(), when }],
        timer: 0,
        fallback: 0,
      },
      say("after"),
    ]
    const r = run(n, startState(n))
    expect(r.beat.kind === "say" && r.beat.step.text).toBe("after")
  })

  test("call returns to the line after it", () => {
    const n = novel()
    n.scenes[0]!.steps = [{ id: "x", t: "call", scene: "b" }, say("back")]
    n.scenes[1]!.steps = [say("away"), { id: "r", t: "return" }]
    let r = run(n, startState(n))
    expect(r.beat.kind === "say" && r.beat.step.text).toBe("away")
    r = run(n, r.state)
    expect(r.beat.kind === "say" && r.beat.step.text).toBe("back")
  })

  test("a condition picks the branch", () => {
    const n = novel()
    n.scenes[0]!.steps = [
      { id: "s", t: "set", on: "v", op: "=", value: 3 },
      {
        id: "i",
        t: "if",
        when: { all: true, clauses: [{ on: "v", op: ">", value: 2 }] },
        then: "b",
        otherwise: "c",
      },
    ]
    n.scenes[1]!.steps = [say("yes")]
    const r = run(n, startState(n))
    expect(r.beat.kind === "say" && r.beat.step.text).toBe("yes")
  })

  test("scenes jumping in a circle report it instead of hanging", () => {
    const n = novel()
    n.scenes[0]!.steps = [{ id: "j", t: "jump", scene: "b" }]
    n.scenes[1]!.steps = [{ id: "k", t: "jump", scene: "a" }]
    expect(run(n, startState(n)).beat).toMatchObject({
      kind: "error",
      message: "loop",
    })
  })

  test("items and seen scenes work in conditions", () => {
    const n = novel()
    const s = startState(n)
    s.items = ["key"]
    expect(
      holds(s, {
        all: true,
        clauses: [{ on: "item:key", op: "==", value: true }],
      })
    ).toBe(true)
    expect(
      holds(travel(s, "b"), {
        all: true,
        clauses: [{ on: "seen:b", op: "==", value: true }],
      })
    ).toBe(true)
  })

  test("a state survives JSON, so a save restores exactly", () => {
    const n = novel()
    n.scenes[0]!.steps = [say("one"), say("two")]
    const { state } = run(n, startState(n))
    const r = run(n, JSON.parse(JSON.stringify(state)))
    expect(r.beat.kind === "say" && r.beat.step.text).toBe("two")
  })

  test("running never changes the state it was given", () => {
    const n = novel()
    n.scenes[0]!.steps = [
      { id: "s", t: "set", on: "v", op: "+", value: 1 },
      say("one"),
    ]
    const start = startState(n)
    run(n, start)
    expect(start.vars.v).toBe(0)
    expect(start.pc).toBe(0)
  })
})

describe("stage", () => {
  test("actors enter, move, change pose and leave", () => {
    const n = novel()
    n.scenes[0]!.steps = [
      {
        id: "1",
        t: "show",
        who: "m",
        pose: "calm",
        x: 0.2,
        y: 0,
        scale: 1,
        flip: false,
        trans: "cut",
        dur: 0,
      },
      {
        id: "2",
        t: "move",
        who: "m",
        x: 0.8,
        y: 0,
        scale: 1,
        dur: 1,
        ease: "ease",
      },
      { id: "3", t: "say", who: "m", text: "hi", pose: "glad", voice: null },
      { id: "4", t: "hide", who: "m", trans: "cut", dur: 0 },
    ]
    expect(stageAt(n, "a", 2).actors[0]).toMatchObject({ x: 0.8, pose: "glad" })
    expect(stageAt(n, "a", 3).actors).toHaveLength(0)
  })

  test("a scene without a backdrop inherits the one leading into it", () => {
    const n = novel()
    n.scenes[0]!.steps = [
      { id: "1", t: "bg", ref: "street", trans: "cut", dur: 0 },
      { id: "2", t: "jump", scene: "b" },
    ]
    expect(stageAt(n, "b", 0).bg).toBe("street")
  })
})

describe("text", () => {
  test("variables fill in, unknown names stay visible", () => {
    const n = novel()
    expect(interpolate(n, startState(n), "Hi [player], [nope]")).toBe(
      "Hi Ada, [nope]"
    )
    const s = answer(startState(n), "p", "Bo")
    expect(interpolate(n, s, "[player]")).toBe("Bo")
  })

  test("tags become styled runs", () => {
    const runs = parseText("a {b}b{/b} {color=#f00}c{/color}{w=1}d")
    expect(runs.find((r) => r.text === "b")?.bold).toBe(true)
    expect(runs.find((r) => r.text === "c")?.color).toBe("#f00")
    expect(runs.find((r) => r.text === "d")?.pause).toBe(1)
    expect(plainText("a {i}b{/i}")).toBe("a b")
  })
})
