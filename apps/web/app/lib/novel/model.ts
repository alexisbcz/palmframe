// A visual novel as one JSON document: the cast, the sets, the sound, and the
// scenes that use them. Everything refers to everything else by id, so a rename
// never breaks a scene.

export const NOVEL_VERSION = 1

export type Transition =
  "cut" | "dissolve" | "fade" | "wipe" | "blinds" | "iris" | "push"
export const TRANSITIONS: Transition[] = [
  "cut",
  "dissolve",
  "fade",
  "wipe",
  "blinds",
  "iris",
  "push",
]

export type Weather =
  | "none"
  | "rain"
  | "storm"
  | "snow"
  | "petals"
  | "embers"
  | "fog"
  | "dust"
  | "fireflies"
export const WEATHERS: Weather[] = [
  "none",
  "rain",
  "storm",
  "snow",
  "petals",
  "embers",
  "fog",
  "dust",
  "fireflies",
]

export type Grade =
  | "none"
  | "sepia"
  | "mono"
  | "night"
  | "dusk"
  | "dream"
  | "noir"
  | "cold"
  | "memory"
export const GRADES: Grade[] = [
  "none",
  "sepia",
  "mono",
  "night",
  "dusk",
  "dream",
  "noir",
  "cold",
  "memory",
]

export type Ease = "linear" | "ease" | "snap" | "drift"
export const EASES: Ease[] = ["ease", "linear", "snap", "drift"]

export interface Sprite {
  id: string
  // Pose and expression, as the script names it: "happy", "arms crossed".
  name: string
  url: string
}

export type Blip = "none" | "soft" | "bright" | "low"
export const BLIPS: Blip[] = ["none", "soft", "bright", "low"]

export interface Character {
  id: string
  name: string
  color: string
  bio: string
  // How they look, repeated in every prompt so they stay the same person.
  look: string
  blip: Blip
  sprites: Sprite[]
}

export interface Backdrop {
  id: string
  name: string
  url: string
  // "bg" is a set. "cg" is a full illustration the gallery collects.
  kind: "bg" | "cg"
  prompt: string
}

export type TrackKind = "music" | "ambience" | "sfx" | "voice"

export interface Track {
  id: string
  name: string
  kind: TrackKind
  // An uploaded or recorded file, or a recipe the synthesiser plays.
  url?: string
  recipe?: Recipe
  loop: boolean
}

export type MusicMode =
  "major" | "minor" | "dorian" | "lydian" | "phrygian" | "pentatonic"
export const MUSIC_MODES: MusicMode[] = [
  "major",
  "minor",
  "dorian",
  "lydian",
  "phrygian",
  "pentatonic",
]

export type NoiseKind =
  "rain" | "wind" | "sea" | "fire" | "night" | "city" | "crowd" | "room"
export const NOISE_KINDS: NoiseKind[] = [
  "rain",
  "wind",
  "sea",
  "fire",
  "night",
  "city",
  "crowd",
  "room",
]

export type SfxKind =
  | "knock"
  | "door"
  | "steps"
  | "heart"
  | "thunder"
  | "bell"
  | "glass"
  | "phone"
  | "page"
  | "whoosh"
  | "chime"
  | "hit"
export const SFX_KINDS: SfxKind[] = [
  "knock",
  "door",
  "steps",
  "heart",
  "thunder",
  "bell",
  "glass",
  "phone",
  "page",
  "whoosh",
  "chime",
  "hit",
]

export type Recipe =
  | {
      type: "score"
      seed: number
      root: number // semitones above C
      mode: MusicMode
      bpm: number
      bars: number
      swing: number // 0..1
      // Mixer: each voice 0..1.
      pad: number
      keys: number
      pluck: number
      bass: number
      drums: number
      bell: number
      // Master: 0..1.
      warmth: number
      space: number
      tape: number
    }
  | {
      type: "noise"
      kind: NoiseKind
      seed: number
      tone: number
      drift: number
    }
  | { type: "sfx"; kind: SfxKind; seed: number; pitch: number }

export interface MapPin {
  id: string
  x: number // 0..1
  y: number // 0..1
  label: string
  scene: string | null
  when: Condition | null
}

export interface GameMap {
  id: string
  name: string
  url: string
  prompt: string
  pins: MapPin[]
}

export type VarKind = "flag" | "number" | "text"

export interface Variable {
  id: string
  // Scripts use this name: `trust`, `[player]`.
  name: string
  kind: VarKind
  initial: boolean | number | string
  // On the player's HUD as a meter or a label.
  hud: boolean
  max: number
}

export interface Item {
  id: string
  name: string
  description: string
  url: string
}

export interface Ending {
  id: string
  name: string
  description: string
}

export type CompareOp = "==" | "!=" | ">" | ">=" | "<" | "<="
export interface Clause {
  // A variable's id, or `item:<id>`, `seen:<scene id>`.
  on: string
  op: CompareOp
  value: boolean | number | string
}
export interface Condition {
  all: boolean // every clause, or any one of them
  clauses: Clause[]
}

export type SetOp = "=" | "+" | "-" | "toggle"
export interface Effect {
  on: string
  op: SetOp
  value: boolean | number | string
}

export interface ChoiceOption {
  id: string
  text: string
  // The scene to go to, or null to carry on below the choice.
  goto: string | null
  when: Condition | null
  // Show a locked option greyed out instead of hiding it.
  showLocked: boolean
  effects: Effect[]
}

type Base = { id: string }

export type Step = Base &
  (
    | {
        t: "say"
        who: string | null // null is the narrator
        text: string
        pose: string | null
        voice: string | null
      }
    | { t: "bg"; ref: string | null; trans: Transition; dur: number }
    | { t: "cg"; ref: string | null; trans: Transition; dur: number }
    | {
        t: "show"
        who: string
        pose: string | null
        x: number // 0..1 across the stage
        y: number // 0 is on the floor, positive lifts
        scale: number
        flip: boolean
        trans: Transition
        dur: number
      }
    | { t: "hide"; who: string | null; trans: Transition; dur: number }
    | {
        t: "move"
        who: string
        x: number
        y: number
        scale: number
        dur: number
        ease: Ease
      }
    | { t: "music"; track: string | null; fade: number; vol: number }
    | { t: "ambience"; track: string | null; fade: number; vol: number }
    | { t: "sfx"; track: string; vol: number }
    | { t: "weather"; kind: Weather; amount: number }
    | { t: "grade"; look: Grade; amount: number; dur: number }
    | {
        t: "camera"
        zoom: number
        x: number // -1..1 pan
        y: number
        dur: number
        ease: Ease
      }
    | { t: "shake"; power: number; dur: number }
    | { t: "flash"; color: string; dur: number }
    | { t: "fade"; color: string; out: boolean; dur: number }
    | { t: "wait"; dur: number }
    | {
        t: "choice"
        prompt: string
        options: ChoiceOption[]
        timer: number // seconds, 0 for none
        // Index of the option taken when the timer runs out.
        fallback: number
      }
    | { t: "map"; map: string }
    | { t: "set"; on: string; op: SetOp; value: boolean | number | string }
    | {
        t: "if"
        when: Condition
        then: string | null
        otherwise: string | null
      }
    | { t: "jump"; scene: string }
    | { t: "call"; scene: string }
    | { t: "return" }
    | { t: "ask"; on: string; prompt: string; max: number }
    | { t: "item"; item: string; give: boolean }
    | { t: "end"; ending: string | null }
    | { t: "note"; text: string }
  )

export type StepType = Step["t"]
export type StepOf<T extends StepType> = Extract<Step, { t: T }>

export interface Scene {
  id: string
  name: string
  x: number // on the board
  y: number
  color: string
  summary: string
  // "adv" is a textbox over the stage, "nvl" a full page of text.
  layout: "adv" | "nvl"
  steps: Step[]
}

export type TextFont = "serif" | "sans" | "mono" | "hand"
export type BoxStyle = "veil" | "paper" | "ink" | "brass" | "letter"
export const TEXT_FONTS: TextFont[] = ["serif", "sans", "mono", "hand"]
export const BOX_STYLES: BoxStyle[] = [
  "veil",
  "paper",
  "ink",
  "brass",
  "letter",
]

export interface Theme {
  accent: string
  font: TextFont
  box: BoxStyle
  // Speaker's face beside the textbox.
  sideImage: boolean
  // Dim actors who aren't speaking.
  spotlight: boolean
}

export interface TitleScreen {
  backdrop: string | null
  music: string | null
  tagline: string
  weather: Weather
}

export interface Novel {
  version: number
  title: string
  author: string
  synopsis: string
  language: string
  // What every generated image shares.
  artStyle: string
  ratio: "16:9" | "4:3" | "3:2" | "9:16"
  theme: Theme
  titleScreen: TitleScreen
  start: string | null
  characters: Character[]
  backdrops: Backdrop[]
  tracks: Track[]
  maps: GameMap[]
  variables: Variable[]
  items: Item[]
  endings: Ending[]
  scenes: Scene[]
}

export const RATIOS: Record<Novel["ratio"], number> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "9:16": 9 / 16,
}

export const SCENE_COLORS = [
  "#e8dcc2",
  "#f0c987",
  "#e8a598",
  "#a9c8a4",
  "#a5c3d9",
  "#c9b4d8",
]

export const CHARACTER_COLORS = [
  "#f0b35a",
  "#e8806f",
  "#7fc4b0",
  "#8fb4e8",
  "#c79be0",
  "#e3d27a",
]

let counter = 0
export const nid = (prefix = "n") =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`

export function newScene(name: string, x = 80, y = 80): Scene {
  return {
    id: nid("sc"),
    name,
    x,
    y,
    color: SCENE_COLORS[0]!,
    summary: "",
    layout: "adv",
    steps: [],
  }
}

export function newCharacter(name: string, index = 0): Character {
  return {
    id: nid("ch"),
    name,
    color: CHARACTER_COLORS[index % CHARACTER_COLORS.length]!,
    bio: "",
    look: "",
    blip: "soft",
    sprites: [],
  }
}

export function emptyNovel(title: string): Novel {
  const first = newScene("Opening")
  return {
    version: NOVEL_VERSION,
    title,
    author: "",
    synopsis: "",
    language: "en",
    artStyle: "Hand-painted anime visual novel art, soft light, clean line",
    ratio: "16:9",
    theme: {
      accent: "#f0b35a",
      font: "serif",
      box: "veil",
      sideImage: false,
      spotlight: true,
    },
    titleScreen: { backdrop: null, music: null, tagline: "", weather: "none" },
    start: first.id,
    characters: [],
    backdrops: [],
    tracks: [],
    maps: [],
    variables: [],
    items: [],
    endings: [],
    scenes: [first],
  }
}

// The defaults for a step of each type, against what the novel already has.
export function newStep(t: StepType, novel: Novel): Step {
  const id = nid("st")
  const who = novel.characters[0]?.id ?? ""
  const scene = novel.scenes[0]?.id ?? ""
  const v = novel.variables[0]
  switch (t) {
    case "say":
      return { id, t, who: null, text: "", pose: null, voice: null }
    case "bg":
      return {
        id,
        t,
        ref: novel.backdrops.find((b) => b.kind === "bg")?.id ?? null,
        trans: "dissolve",
        dur: 1,
      }
    case "cg":
      return {
        id,
        t,
        ref: novel.backdrops.find((b) => b.kind === "cg")?.id ?? null,
        trans: "dissolve",
        dur: 1,
      }
    case "show":
      return {
        id,
        t,
        who,
        pose: null,
        x: 0.5,
        y: 0,
        scale: 1,
        flip: false,
        trans: "dissolve",
        dur: 0.5,
      }
    case "hide":
      return { id, t, who: who || null, trans: "dissolve", dur: 0.5 }
    case "move":
      return { id, t, who, x: 0.5, y: 0, scale: 1, dur: 0.8, ease: "ease" }
    case "music":
      return {
        id,
        t,
        track: novel.tracks.find((k) => k.kind === "music")?.id ?? null,
        fade: 1.5,
        vol: 0.8,
      }
    case "ambience":
      return {
        id,
        t,
        track: novel.tracks.find((k) => k.kind === "ambience")?.id ?? null,
        fade: 2,
        vol: 0.6,
      }
    case "sfx":
      return {
        id,
        t,
        track: novel.tracks.find((k) => k.kind === "sfx")?.id ?? "",
        vol: 0.9,
      }
    case "weather":
      return { id, t, kind: "rain", amount: 0.6 }
    case "grade":
      return { id, t, look: "dusk", amount: 0.7, dur: 1 }
    case "camera":
      return { id, t, zoom: 1.2, x: 0, y: 0, dur: 1.2, ease: "ease" }
    case "shake":
      return { id, t, power: 0.5, dur: 0.5 }
    case "flash":
      return { id, t, color: "#ffffff", dur: 0.4 }
    case "fade":
      return { id, t, color: "#000000", out: true, dur: 1 }
    case "wait":
      return { id, t, dur: 1 }
    case "choice":
      return {
        id,
        t,
        prompt: "",
        options: [newOption(), newOption()],
        timer: 0,
        fallback: 0,
      }
    case "map":
      return { id, t, map: novel.maps[0]?.id ?? "" }
    case "set":
      return {
        id,
        t,
        on: v?.id ?? "",
        op: v?.kind === "flag" ? "=" : "+",
        value: v?.kind === "flag" ? true : 1,
      }
    case "if":
      return {
        id,
        t,
        when: { all: true, clauses: [newClause(novel)] },
        then: scene || null,
        otherwise: null,
      }
    case "jump":
      return { id, t, scene }
    case "call":
      return { id, t, scene }
    case "return":
      return { id, t }
    case "ask":
      return { id, t, on: v?.id ?? "", prompt: "", max: 20 }
    case "item":
      return { id, t, item: novel.items[0]?.id ?? "", give: true }
    case "end":
      return { id, t, ending: null }
    case "note":
      return { id, t, text: "" }
  }
}

export function newOption(): ChoiceOption {
  return {
    id: nid("op"),
    text: "",
    goto: null,
    when: null,
    showLocked: false,
    effects: [],
  }
}

export function newClause(novel: Novel): Clause {
  const v = novel.variables[0]
  return {
    on: v?.id ?? "",
    op: v?.kind === "number" ? ">=" : "==",
    value: v?.kind === "number" ? 1 : v?.kind === "text" ? "" : true,
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)

// A saved or imported document, with anything missing filled in. Throws when
// it can't be a novel at all.
export function toNovel(value: unknown): Novel {
  if (!isObject(value) || !Array.isArray(value.scenes))
    throw new Error("This file isn't a novel.")
  const base = emptyNovel(typeof value.title === "string" ? value.title : "")
  const list = <K extends keyof Novel>(key: K) =>
    (Array.isArray(value[key]) ? value[key] : []) as Novel[K]
  const scenes = list("scenes")
  return {
    ...base,
    ...(value as Partial<Novel>),
    version: NOVEL_VERSION,
    theme: { ...base.theme, ...(isObject(value.theme) ? value.theme : {}) },
    titleScreen: {
      ...base.titleScreen,
      ...(isObject(value.titleScreen) ? value.titleScreen : {}),
    },
    characters: list("characters"),
    backdrops: list("backdrops"),
    tracks: list("tracks"),
    maps: list("maps"),
    variables: list("variables"),
    items: list("items"),
    endings: list("endings"),
    scenes,
    start:
      typeof value.start === "string" &&
      scenes.some((s) => s.id === value.start)
        ? value.start
        : (scenes[0]?.id ?? null),
  }
}

export const sceneById = (novel: Novel, id: string | null) =>
  novel.scenes.find((s) => s.id === id)

// Every scene a step can lead to.
export function stepTargets(step: Step): string[] {
  switch (step.t) {
    case "jump":
    case "call":
      return [step.scene]
    case "if":
      return [step.then, step.otherwise].filter((s): s is string => !!s)
    case "choice":
      return step.options.flatMap((o) => (o.goto ? [o.goto] : []))
    default:
      return []
  }
}

export function sceneTargets(novel: Novel, scene: Scene): string[] {
  const targets = scene.steps.flatMap((s) =>
    s.t === "map"
      ? (novel.maps
          .find((m) => m.id === s.map)
          ?.pins.flatMap((p) => (p.scene ? [p.scene] : [])) ?? [])
      : stepTargets(s)
  )
  return [...new Set(targets)]
}

// Plain words for how long a novel reads.
export function wordCount(novel: Novel) {
  let words = 0
  for (const s of novel.scenes)
    for (const step of s.steps)
      if (step.t === "say")
        words += step.text.trim().split(/\s+/).filter(Boolean).length
  return words
}
