import type {
  ChoiceOption,
  Clause,
  Condition,
  Effect,
  Ease,
  Grade,
  Novel,
  Scene,
  Step,
  StepOf,
  Transition,
  Weather,
} from "./model"

// The runtime, with no DOM in it: a state goes in, the next thing the reader
// must see comes out. Everything in `RunState` is plain JSON, so a save is that
// object, and rolling back is restoring an earlier one.

export interface Actor {
  who: string
  pose: string | null
  x: number
  y: number
  scale: number
  flip: boolean
  dur: number
  ease: Ease
  trans: Transition
}

export interface StageState {
  bg: string | null
  bgTrans: Transition
  bgDur: number
  cg: string | null
  cgTrans: Transition
  cgDur: number
  actors: Actor[]
  weather: { kind: Weather; amount: number }
  grade: { look: Grade; amount: number; dur: number }
  camera: { zoom: number; x: number; y: number; dur: number; ease: Ease }
  fade: { color: string; on: boolean; dur: number }
  music: { track: string | null; vol: number; fade: number }
  ambience: { track: string | null; vol: number; fade: number }
}

export type VarValue = boolean | number | string

export interface RunState {
  scene: string
  pc: number
  stack: { scene: string; pc: number }[]
  vars: Record<string, VarValue>
  items: string[]
  seen: string[]
  stage: StageState
  ended: boolean
}

// Happens once and is gone: nothing a save needs to keep.
export type Cue =
  | { t: "sfx"; track: string; vol: number }
  | { t: "shake"; power: number; dur: number }
  | { t: "flash"; color: string; dur: number }
  | { t: "unlock-cg"; ref: string }
  | { t: "ending"; ending: string | null }

export type Beat =
  | { kind: "say"; step: StepOf<"say">; scene: Scene; cues: Cue[] }
  | {
      kind: "choice"
      step: StepOf<"choice">
      options: { option: ChoiceOption; locked: boolean }[]
      cues: Cue[]
    }
  | { kind: "map"; step: StepOf<"map">; cues: Cue[] }
  | { kind: "ask"; step: StepOf<"ask">; cues: Cue[] }
  | { kind: "wait"; dur: number; cues: Cue[] }
  | { kind: "end"; ending: string | null; cues: Cue[] }
  | { kind: "error"; message: string; cues: Cue[] }

export function emptyStage(): StageState {
  return {
    bg: null,
    bgTrans: "cut",
    bgDur: 0,
    cg: null,
    cgTrans: "cut",
    cgDur: 0,
    actors: [],
    weather: { kind: "none", amount: 0 },
    grade: { look: "none", amount: 0, dur: 0 },
    camera: { zoom: 1, x: 0, y: 0, dur: 0, ease: "ease" },
    fade: { color: "#000000", on: false, dur: 0 },
    music: { track: null, vol: 0.8, fade: 0 },
    ambience: { track: null, vol: 0.6, fade: 0 },
  }
}

export function startState(novel: Novel): RunState {
  const vars: Record<string, VarValue> = {}
  for (const v of novel.variables) vars[v.id] = v.initial
  const scene = novel.start ?? novel.scenes[0]?.id ?? ""
  return {
    scene,
    pc: 0,
    stack: [],
    vars,
    items: [],
    seen: [scene],
    stage: emptyStage(),
    ended: false,
  }
}

function read(state: RunState, on: string): VarValue {
  if (on.startsWith("item:")) return state.items.includes(on.slice(5))
  if (on.startsWith("seen:")) return state.seen.includes(on.slice(5))
  return state.vars[on] ?? false
}

function compare(a: VarValue, c: Clause) {
  const b = c.value
  // A form field gives "3" where a number was meant.
  const [x, y] =
    typeof a === "number" || typeof b === "number"
      ? [Number(a), Number(b)]
      : [a, b]
  switch (c.op) {
    case "==":
      return x === y
    case "!=":
      return x !== y
    case ">":
      return x > y
    case ">=":
      return x >= y
    case "<":
      return x < y
    case "<=":
      return x <= y
  }
}

export function holds(state: RunState, when: Condition | null) {
  if (!when || !when.clauses.length) return true
  const test = (c: Clause) => compare(read(state, c.on), c)
  return when.all ? when.clauses.every(test) : when.clauses.some(test)
}

export function applyEffect(state: RunState, e: Effect, novel: Novel) {
  const before = state.vars[e.on]
  const spec = novel.variables.find((v) => v.id === e.on)
  let next: VarValue
  switch (e.op) {
    case "toggle":
      next = !before
      break
    case "+":
      next = Number(before ?? 0) + Number(e.value)
      break
    case "-":
      next = Number(before ?? 0) - Number(e.value)
      break
    default:
      next = e.value
  }
  if (spec?.kind === "number") next = Number(next) || 0
  state.vars = { ...state.vars, [e.on]: next }
}

const clone = (s: RunState): RunState => structuredClone(s)

function goTo(state: RunState, scene: string) {
  state.scene = scene
  state.pc = 0
  if (!state.seen.includes(scene)) state.seen = [...state.seen, scene]
}

// A stage step's effect on the stage. Also used by the editor's monitor, which
// walks a scene without running it.
export function applyStage(stage: StageState, step: Step) {
  switch (step.t) {
    case "bg":
      stage.bg = step.ref
      stage.bgTrans = step.trans
      stage.bgDur = step.dur
      break
    case "cg":
      stage.cg = step.ref
      stage.cgTrans = step.trans
      stage.cgDur = step.dur
      break
    case "show": {
      const actor: Actor = {
        who: step.who,
        pose: step.pose,
        x: step.x,
        y: step.y,
        scale: step.scale,
        flip: step.flip,
        dur: step.dur,
        ease: "ease",
        trans: step.trans,
      }
      const i = stage.actors.findIndex((a) => a.who === step.who)
      if (i >= 0) stage.actors[i] = actor
      else stage.actors.push(actor)
      break
    }
    case "hide":
      stage.actors = step.who
        ? stage.actors.filter((a) => a.who !== step.who)
        : []
      break
    case "move": {
      const a = stage.actors.find((a) => a.who === step.who)
      if (a) {
        a.x = step.x
        a.y = step.y
        a.scale = step.scale
        a.dur = step.dur
        a.ease = step.ease
      }
      break
    }
    case "say": {
      const a = stage.actors.find((a) => a.who === step.who)
      if (a && step.pose) a.pose = step.pose
      break
    }
    case "music":
      stage.music = { track: step.track, vol: step.vol, fade: step.fade }
      break
    case "ambience":
      stage.ambience = { track: step.track, vol: step.vol, fade: step.fade }
      break
    case "weather":
      stage.weather = { kind: step.kind, amount: step.amount }
      break
    case "grade":
      stage.grade = { look: step.look, amount: step.amount, dur: step.dur }
      break
    case "camera":
      stage.camera = {
        zoom: step.zoom,
        x: step.x,
        y: step.y,
        dur: step.dur,
        ease: step.ease,
      }
      break
    case "fade":
      stage.fade = { color: step.color, on: step.out, dur: step.dur }
      break
  }
}

// How long the reader should wait on a step that blocks for its own timing.
const STEP_LIMIT = 5_000

// Runs from `state` to the next thing the reader sees. Returns a new state with
// `pc` already past the beat, so the beat's reply continues from there.
export function run(
  novel: Novel,
  from: RunState
): { state: RunState; beat: Beat } {
  const state = clone(from)
  const cues: Cue[] = []
  for (let guard = 0; guard < STEP_LIMIT; guard++) {
    const scene = novel.scenes.find((s) => s.id === state.scene)
    if (!scene)
      return {
        state,
        beat: { kind: "error", message: "missing-scene", cues },
      }
    const step = scene.steps[state.pc]
    if (!step) {
      // A scene that runs out returns to its caller, or the story stops.
      const back = state.stack.pop()
      if (back) {
        state.scene = back.scene
        state.pc = back.pc
        continue
      }
      state.ended = true
      return { state, beat: { kind: "end", ending: null, cues } }
    }
    state.pc++
    applyStage(state.stage, step)
    switch (step.t) {
      case "say":
        return { state, beat: { kind: "say", step, scene, cues } }
      case "cg":
        if (step.ref) cues.push({ t: "unlock-cg", ref: step.ref })
        break
      case "sfx":
        if (step.track)
          cues.push({ t: "sfx", track: step.track, vol: step.vol })
        break
      case "shake":
        cues.push({ t: "shake", power: step.power, dur: step.dur })
        break
      case "flash":
        cues.push({ t: "flash", color: step.color, dur: step.dur })
        break
      case "wait":
        return { state, beat: { kind: "wait", dur: step.dur, cues } }
      case "choice": {
        const options = step.options.flatMap((option) => {
          const locked = !holds(state, option.when)
          return locked && !option.showLocked ? [] : [{ option, locked }]
        })
        // Every option hidden: nothing to ask, so the story carries on.
        if (!options.some((o) => !o.locked)) break
        return { state, beat: { kind: "choice", step, options, cues } }
      }
      case "map":
        return { state, beat: { kind: "map", step, cues } }
      case "ask":
        return { state, beat: { kind: "ask", step, cues } }
      case "set":
        applyEffect(state, step, novel)
        break
      case "if": {
        const target = holds(state, step.when) ? step.then : step.otherwise
        if (target) goTo(state, target)
        break
      }
      case "jump":
        goTo(state, step.scene)
        break
      case "call":
        state.stack.push({ scene: state.scene, pc: state.pc })
        goTo(state, step.scene)
        break
      case "return": {
        const back = state.stack.pop()
        if (back) {
          state.scene = back.scene
          state.pc = back.pc
        }
        break
      }
      case "item":
        state.items = step.give
          ? [...new Set([...state.items, step.item])]
          : state.items.filter((i) => i !== step.item)
        break
      case "end":
        state.ended = true
        cues.push({ t: "ending", ending: step.ending })
        return { state, beat: { kind: "end", ending: step.ending, cues } }
    }
  }
  // Scenes jumping to each other with nothing to read in between.
  return { state, beat: { kind: "error", message: "loop", cues } }
}

export function choose(novel: Novel, state: RunState, option: ChoiceOption) {
  const next = clone(state)
  for (const e of option.effects) applyEffect(next, e, novel)
  if (option.goto) goTo(next, option.goto)
  return next
}

export function travel(state: RunState, scene: string | null) {
  const next = clone(state)
  if (scene) goTo(next, scene)
  return next
}

export function answer(state: RunState, on: string, value: string) {
  const next = clone(state)
  next.vars = { ...next.vars, [on]: value }
  return next
}

// The stage the editor's monitor shows at one step of a scene. A scene that
// doesn't set its own backdrop inherits from a scene leading into it.
export function stageAt(novel: Novel, sceneId: string, index: number) {
  const stage = inherited(novel, sceneId, new Set())
  const scene = novel.scenes.find((s) => s.id === sceneId)
  for (const step of scene?.steps.slice(0, index + 1) ?? [])
    applyStage(stage, step)
  return stage
}

function inherited(
  novel: Novel,
  sceneId: string,
  seen: Set<string>
): StageState {
  const stage = emptyStage()
  seen.add(sceneId)
  const before = novel.scenes.find(
    (s) =>
      !seen.has(s.id) &&
      s.steps.some(
        (step) =>
          (step.t === "jump" && step.scene === sceneId) ||
          (step.t === "if" &&
            (step.then === sceneId || step.otherwise === sceneId)) ||
          (step.t === "choice" && step.options.some((o) => o.goto === sceneId))
      )
  )
  if (!before) return stage
  const prior = inherited(novel, before.id, seen)
  for (const step of before.steps) applyStage(prior, step)
  return prior
}

// --- Dialogue text ---

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  color?: string
  shake?: boolean
  wave?: boolean
  big?: boolean
  // Pause this many seconds before this run types out.
  pause?: number
}

const name = (novel: Novel, state: RunState, key: string) => {
  const v = novel.variables.find((x) => x.name === key)
  return v ? String(state.vars[v.id] ?? v.initial) : `[${key}]`
}

// `[player]` becomes the value of the variable named player.
export function interpolate(novel: Novel, state: RunState, text: string) {
  return text.replace(/\[([a-zA-Z_][\w]*)\]/g, (_, key: string) =>
    name(novel, state, key)
  )
}

// Ren'Py's text tags: {b} {i} {color=#f00} {shake} {wave} {big} {w=0.5}.
export function parseText(text: string): TextRun[] {
  const runs: TextRun[] = []
  const style: Omit<TextRun, "text"> = {}
  let pause: number | undefined
  const push = (t: string) => {
    if (!t && pause === undefined) return
    runs.push({ text: t, ...style, ...(pause !== undefined && { pause }) })
    pause = undefined
  }
  const pattern = /\{(\/?)(b|i|color|shake|wave|big|w)(?:=([^}]*))?\}/g
  let last = 0
  for (const m of text.matchAll(pattern)) {
    push(text.slice(last, m.index))
    last = m.index + m[0].length
    const [, close, tag, value] = m
    switch (tag) {
      case "b":
        style.bold = !close
        break
      case "i":
        style.italic = !close
        break
      case "shake":
        style.shake = !close
        break
      case "wave":
        style.wave = !close
        break
      case "big":
        style.big = !close
        break
      case "color":
        style.color = close ? undefined : value
        break
      case "w":
        pause = Number(value) || 0.5
        break
    }
  }
  push(text.slice(last))
  return runs
}

export const plainText = (text: string) =>
  parseText(text)
    .map((r) => r.text)
    .join("")
