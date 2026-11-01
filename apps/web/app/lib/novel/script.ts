import {
  newOption,
  nid,
  type ChoiceOption,
  type Clause,
  type CompareOp,
  type Condition,
  type Effect,
  type Ease,
  type Grade,
  type Novel,
  type Scene,
  type SetOp,
  type Step,
  type Track,
  type TrackKind,
  type Transition,
  type Weather,
  EASES,
  GRADES,
  TRANSITIONS,
  WEATHERS,
} from "./model"

// The script language: Ren'Py's shape, one line per step, names instead of ids.
// Writers can type a scene here, and the writing model answers in it. Reading
// a scene and printing it again gives the same scene.

export const slug = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")

const quote = (s: string) =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`

const POSITIONS: Record<string, number> = {
  far_left: 0.12,
  left: 0.25,
  center: 0.5,
  right: 0.75,
  far_right: 0.88,
}

const position = (x: number) =>
  Object.entries(POSITIONS).find(([, v]) => Math.abs(v - x) < 0.001)?.[0] ??
  String(Number(x.toFixed(3)))

function lookups(novel: Novel) {
  const name = <T extends { id: string; name: string }>(
    list: T[],
    id: string | null
  ) => (id ? slug(list.find((x) => x.id === id)?.name ?? id) : "")
  return {
    character: (id: string | null) => name(novel.characters, id),
    pose: (who: string | null, id: string | null) =>
      name(novel.characters.find((c) => c.id === who)?.sprites ?? [], id),
    backdrop: (id: string | null) => name(novel.backdrops, id),
    track: (id: string | null) => name(novel.tracks, id),
    scene: (id: string | null) => name(novel.scenes, id),
    item: (id: string | null) => name(novel.items, id),
    map: (id: string | null) => name(novel.maps, id),
    ending: (id: string | null) => name(novel.endings, id),
    on: (on: string) =>
      on.startsWith("item:")
        ? `item.${name(novel.items, on.slice(5))}`
        : on.startsWith("seen:")
          ? `seen.${name(novel.scenes, on.slice(5))}`
          : (novel.variables.find((v) => v.id === on)?.name ?? on),
  }
}

const withTrans = (t: Transition, dur: number) =>
  t === "cut" ? "" : ` with ${t} ${dur}s`

const value = (v: boolean | number | string) =>
  typeof v === "string" ? quote(v) : String(v)

export function printScene(novel: Novel, scene: Scene): string {
  const n = lookups(novel)
  const cond = (c: Condition) =>
    c.clauses
      .map((x) => `${n.on(x.on)} ${x.op} ${value(x.value)}`)
      .join(c.all ? " and " : " or ")
  const effect = (e: Effect) =>
    e.op === "toggle"
      ? `${n.on(e.on)} toggle`
      : `${n.on(e.on)} ${e.op} ${value(e.value)}`
  const print = (s: Step): string => {
    switch (s.t) {
      case "say": {
        const head = [n.character(s.who), n.pose(s.who, s.pose)]
          .filter(Boolean)
          .join(" ")
        return `${head ? `${head} ` : ""}${quote(s.text)}`
      }
      case "bg":
        return `scene ${n.backdrop(s.ref) || "off"}${withTrans(s.trans, s.dur)}`
      case "cg":
        return `cg ${n.backdrop(s.ref) || "off"}${withTrans(s.trans, s.dur)}`
      case "show":
        return [
          `show ${n.character(s.who)}`,
          n.pose(s.who, s.pose),
          `at ${position(s.x)}`,
          s.y ? `lift ${s.y}` : "",
          s.scale !== 1 ? `scale ${s.scale}` : "",
          s.flip ? "flip" : "",
          withTrans(s.trans, s.dur).trim(),
        ]
          .filter(Boolean)
          .join(" ")
      case "hide":
        return `hide ${n.character(s.who) || "all"}${withTrans(s.trans, s.dur)}`
      case "move":
        return [
          `move ${n.character(s.who)} to ${position(s.x)}`,
          s.y ? `lift ${s.y}` : "",
          s.scale !== 1 ? `scale ${s.scale}` : "",
          `${s.dur}s`,
          s.ease !== "ease" ? s.ease : "",
        ]
          .filter(Boolean)
          .join(" ")
      case "music":
      case "ambience":
        return `${s.t} ${n.track(s.track) || "off"} fade ${s.fade} vol ${s.vol}`
      case "sfx":
        return `sfx ${n.track(s.track)} vol ${s.vol}`
      case "weather":
        return `weather ${s.kind} ${s.amount}`
      case "grade":
        return `grade ${s.look} ${s.amount} ${s.dur}s`
      case "camera":
        return `camera ${s.zoom} ${s.x} ${s.y} ${s.dur}s${s.ease !== "ease" ? ` ${s.ease}` : ""}`
      case "shake":
        return `shake ${s.power} ${s.dur}s`
      case "flash":
        return `flash ${s.color} ${s.dur}s`
      case "fade":
        return `fade ${s.out ? "out" : "in"} ${s.color} ${s.dur}s`
      case "wait":
        return `wait ${s.dur}s`
      case "choice": {
        const head = `menu${s.prompt ? ` ${quote(s.prompt)}` : ""}${s.timer ? ` timer ${s.timer} fallback ${s.fallback}` : ""}:`
        const lines = s.options.map((o) =>
          [
            `    ${quote(o.text)}`,
            o.goto ? `-> ${n.scene(o.goto)}` : "",
            o.when?.clauses.length ? `if ${cond(o.when)}` : "",
            o.showLocked ? "locked" : "",
            ...o.effects.map((e) => `set ${effect(e)}`),
          ]
            .filter(Boolean)
            .join(" ")
        )
        return [head, ...lines].join("\n")
      }
      case "map":
        return `map ${n.map(s.map)}`
      case "set":
        return `set ${effect(s)}`
      case "if":
        return `if ${cond(s.when)}${s.then ? ` -> ${n.scene(s.then)}` : ""}${
          s.otherwise ? ` else -> ${n.scene(s.otherwise)}` : ""
        }`
      case "jump":
        return `jump ${n.scene(s.scene)}`
      case "call":
        return `call ${n.scene(s.scene)}`
      case "return":
        return "return"
      case "ask":
        return `ask ${n.on(s.on)} ${quote(s.prompt)} max ${s.max}`
      case "item":
        return `${s.give ? "give" : "take"} ${n.item(s.item)}`
      case "end":
        return `end${s.ending ? ` ${n.ending(s.ending)}` : ""}`
      case "note":
        return `# ${s.text}`
    }
  }
  return scene.steps.map(print).join("\n")
}

export interface ScriptError {
  line: number
  message: string
  args?: Record<string, string>
}

interface Token {
  text: string
  quoted: boolean
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < line.length) {
    const c = line[i]!
    if (c === " " || c === "\t") {
      i++
    } else if (c === '"' || c === "“" || c === "”") {
      let text = ""
      i++
      while (i < line.length && line[i] !== '"' && line[i] !== "”") {
        if (line[i] === "\\" && i + 1 < line.length) {
          i++
          text += line[i] === "n" ? "\n" : line[i]
        } else text += line[i]
        i++
      }
      i++
      tokens.push({ text, quoted: true })
    } else {
      let text = ""
      while (i < line.length && line[i] !== " " && line[i] !== "\t")
        text += line[i++]
      tokens.push({ text, quoted: false })
    }
  }
  return tokens
}

const seconds = (s: string | undefined, fallback: number) => {
  const n = parseFloat(s ?? "")
  return Number.isFinite(n) ? n : fallback
}

const OPS: CompareOp[] = ["==", "!=", ">=", "<=", ">", "<"]

function literal(t: Token): boolean | number | string {
  if (t.quoted) return t.text
  if (t.text === "true") return true
  if (t.text === "false") return false
  const n = Number(t.text)
  return Number.isFinite(n) ? n : t.text
}

export interface ParseOptions {
  // Add cast, sets and sounds the script names that don't exist yet, so a
  // first draft arrives whole and its art can follow.
  create?: boolean
}

// Reads a scene's script against the novel. `novel` is changed when `create`
// is on. Steps keep their ids when `previous` holds an identical line.
export function parseScene(
  novel: Novel,
  source: string,
  options: ParseOptions = {}
): { steps: Step[]; errors: ScriptError[] } {
  const errors: ScriptError[] = []
  const steps: Step[] = []
  const lines = source.split("\n")
  const fail = (line: number, message: string, args?: Record<string, string>) =>
    void errors.push({ line: line + 1, message, ...(args && { args }) })

  const find = <T extends { id: string; name: string }>(
    list: T[],
    name: string
  ) => list.find((x) => slug(x.name) === name || x.id === name)

  const character = (name: string, line: number) => {
    const found = find(novel.characters, name)
    if (found) return found
    if (options.create) {
      const c = {
        id: nid("ch"),
        name: pretty(name),
        color: "#f0b35a",
        bio: "",
        look: "",
        blip: "soft" as const,
        sprites: [],
      }
      novel.characters.push(c)
      return c
    }
    fail(line, "unknownCharacter", { name })
    return null
  }
  const pose = (who: string, name: string | undefined) => {
    if (!name) return null
    const c = novel.characters.find((x) => x.id === who)
    if (!c) return null
    const found = find(c.sprites, name)
    if (found) return found.id
    if (options.create) {
      const s = { id: nid("sp"), name: pretty(name), url: "" }
      c.sprites.push(s)
      return s.id
    }
    return null
  }
  const backdrop = (name: string, kind: "bg" | "cg", line: number) => {
    if (name === "off") return null
    const found = find(novel.backdrops, name)
    if (found) return found.id
    if (options.create) {
      const b = { id: nid("bd"), name: pretty(name), url: "", kind, prompt: "" }
      novel.backdrops.push(b)
      return b.id
    }
    fail(line, "unknownBackdrop", { name })
    return null
  }
  const track = (name: string, kind: TrackKind, line: number) => {
    if (name === "off") return null
    const found = find(novel.tracks, name)
    if (found) return found.id
    if (options.create) {
      const t: Track = {
        id: nid("tk"),
        name: pretty(name),
        kind,
        loop: kind !== "sfx",
      }
      novel.tracks.push(t)
      return t.id
    }
    fail(line, "unknownTrack", { name })
    return null
  }
  const scene = (name: string, line: number) => {
    const found = find(novel.scenes, name)
    if (found) return found.id
    fail(line, "unknownScene", { name })
    return null
  }
  const variable = (
    name: string,
    line: number,
    sample?: boolean | number | string
  ) => {
    if (name.startsWith("item.")) {
      const it = find(novel.items, name.slice(5))
      if (it) return `item:${it.id}`
    }
    if (name.startsWith("seen.")) {
      const sc = find(novel.scenes, name.slice(5))
      if (sc) return `seen:${sc.id}`
    }
    const found = novel.variables.find((v) => v.name === name || v.id === name)
    if (found) return found.id
    if (options.create) {
      const kind =
        typeof sample === "number"
          ? "number"
          : typeof sample === "string"
            ? "text"
            : "flag"
      const v = {
        id: nid("vr"),
        name,
        kind,
        initial: kind === "number" ? 0 : kind === "text" ? "" : false,
        hud: false,
        max: 10,
      } as const
      novel.variables.push({ ...v })
      return v.id
    }
    fail(line, "unknownVariable", { name })
    return null
  }

  // `a >= 1 and b == true`; stops at `->`, `else`, `locked`, `set`.
  const condition = (tokens: Token[], at: number, line: number) => {
    const clauses: Clause[] = []
    let all = true
    let i = at
    while (i + 2 < tokens.length + 0) {
      const a = tokens[i]!
      const op = tokens[i + 1]!.text as CompareOp
      const b = tokens[i + 2]!
      if (!OPS.includes(op)) break
      const value = literal(b)
      const on = variable(a.text, line, value)
      if (on) clauses.push({ on, op, value })
      i += 3
      const joiner = tokens[i]?.text
      if (joiner === "or") all = false
      if (joiner === "and" || joiner === "or") i++
      else break
    }
    return { when: { all, clauses } as Condition, next: i }
  }

  const effect = (tokens: Token[], at: number, line: number) => {
    const name = tokens[at]?.text ?? ""
    const op = tokens[at + 1]?.text
    if (op === "toggle") {
      const on = variable(name, line, true)
      return {
        effect: on ? ({ on, op: "toggle", value: true } as Effect) : null,
        next: at + 2,
      }
    }
    const value = tokens[at + 2] ? literal(tokens[at + 2]!) : 1
    const on = variable(name, line, value)
    return {
      effect:
        on && (op === "=" || op === "+" || op === "-")
          ? ({ on, op: op as SetOp, value } as Effect)
          : null,
      next: at + 3,
    }
  }

  const transition = (tokens: Token[], fallback: Transition, dur: number) => {
    const at = tokens.findIndex((t) => t.text === "with" && !t.quoted)
    if (at < 0) return { trans: fallback, dur }
    const name = tokens[at + 1]?.text as Transition
    return {
      trans: TRANSITIONS.includes(name) ? name : fallback,
      dur: seconds(tokens[at + 2]?.text, dur),
    }
  }
  const named = (tokens: Token[], key: string, fallback: number) => {
    const at = tokens.findIndex((t) => t.text === key && !t.quoted)
    return at < 0 ? fallback : seconds(tokens[at + 1]?.text, fallback)
  }
  const place = (t: string | undefined, fallback: number) =>
    t === undefined ? fallback : (POSITIONS[t] ?? seconds(t, fallback))

  for (let l = 0; l < lines.length; l++) {
    const raw = lines[l]!
    const line = raw.trim()
    if (!line) continue
    const id = nid("st")
    if (line.startsWith("#")) {
      steps.push({ id, t: "note", text: line.slice(1).trim() })
      continue
    }
    const tokens = tokenize(line)
    const head = tokens[0]!
    const word = head.quoted ? "" : head.text.replace(/:$/, "")
    switch (word) {
      case "scene":
      case "cg": {
        const ref = backdrop(
          tokens[1]?.text ?? "off",
          word === "cg" ? "cg" : "bg",
          l
        )
        steps.push({
          id,
          t: word === "cg" ? "cg" : "bg",
          ref,
          ...transition(tokens, "cut", 0),
        })
        continue
      }
      case "show": {
        const c = character(tokens[1]?.text ?? "", l)
        if (!c) continue
        const second = tokens[2]?.text
        const named_pose =
          second && !["at", "with", "flip", "scale", "lift"].includes(second)
            ? second
            : undefined
        const at = tokens.findIndex((t) => t.text === "at")
        steps.push({
          id,
          t: "show",
          who: c.id,
          pose: pose(c.id, named_pose),
          x: at < 0 ? 0.5 : place(tokens[at + 1]?.text, 0.5),
          y: named(tokens, "lift", 0),
          scale: named(tokens, "scale", 1),
          flip: tokens.some((t) => t.text === "flip"),
          ...transition(tokens, "cut", 0),
        })
        continue
      }
      case "hide": {
        const name = tokens[1]?.text ?? "all"
        const who = name === "all" ? null : (character(name, l)?.id ?? null)
        steps.push({ id, t: "hide", who, ...transition(tokens, "cut", 0) })
        continue
      }
      case "move": {
        const c = character(tokens[1]?.text ?? "", l)
        if (!c) continue
        const last = tokens[tokens.length - 1]?.text as Ease
        const dur = tokens.find((t) => /^[\d.]+s$/.test(t.text))?.text
        steps.push({
          id,
          t: "move",
          who: c.id,
          x: place(tokens[3]?.text, 0.5),
          y: named(tokens, "lift", 0),
          scale: named(tokens, "scale", 1),
          dur: seconds(dur, 0.8),
          ease: EASES.includes(last) ? last : "ease",
        })
        continue
      }
      case "music":
      case "ambience":
        steps.push({
          id,
          t: word,
          track: track(tokens[1]?.text ?? "off", word, l),
          fade: named(tokens, "fade", 1.5),
          vol: named(tokens, "vol", 0.8),
        })
        continue
      case "sfx":
        steps.push({
          id,
          t: "sfx",
          track: track(tokens[1]?.text ?? "", "sfx", l) ?? "",
          vol: named(tokens, "vol", 0.9),
        })
        continue
      case "weather": {
        const kind = tokens[1]?.text as Weather
        if (!WEATHERS.includes(kind)) {
          fail(l, "unknownWeather", { name: tokens[1]?.text ?? "" })
          continue
        }
        steps.push({
          id,
          t: "weather",
          kind,
          amount: seconds(tokens[2]?.text, 0.6),
        })
        continue
      }
      case "grade": {
        const look = tokens[1]?.text as Grade
        if (!GRADES.includes(look)) {
          fail(l, "unknownGrade", { name: tokens[1]?.text ?? "" })
          continue
        }
        steps.push({
          id,
          t: "grade",
          look,
          amount: seconds(tokens[2]?.text, 0.7),
          dur: seconds(tokens[3]?.text, 1),
        })
        continue
      }
      case "camera": {
        const ease = tokens[5]?.text as Ease
        steps.push({
          id,
          t: "camera",
          zoom: seconds(tokens[1]?.text, 1),
          x: seconds(tokens[2]?.text, 0),
          y: seconds(tokens[3]?.text, 0),
          dur: seconds(tokens[4]?.text, 1),
          ease: EASES.includes(ease) ? ease : "ease",
        })
        continue
      }
      case "shake":
        steps.push({
          id,
          t: "shake",
          power: seconds(tokens[1]?.text, 0.5),
          dur: seconds(tokens[2]?.text, 0.5),
        })
        continue
      case "flash":
        steps.push({
          id,
          t: "flash",
          color: tokens[1]?.text ?? "#ffffff",
          dur: seconds(tokens[2]?.text, 0.4),
        })
        continue
      case "fade":
        steps.push({
          id,
          t: "fade",
          out: tokens[1]?.text !== "in",
          color: tokens[2]?.text ?? "#000000",
          dur: seconds(tokens[3]?.text, 1),
        })
        continue
      case "wait":
        steps.push({ id, t: "wait", dur: seconds(tokens[1]?.text, 1) })
        continue
      case "menu": {
        const prompt = tokens[1]?.quoted ? tokens[1].text : ""
        const opts: ChoiceOption[] = []
        while (l + 1 < lines.length && /^\s+\S/.test(lines[l + 1]!)) {
          l++
          const t = tokenize(lines[l]!.trim())
          const option = newOption()
          option.text = t[0]?.text ?? ""
          let i = 1
          while (i < t.length) {
            const w = t[i]!.text
            if (w === "->") {
              option.goto = scene(t[i + 1]?.text ?? "", l)
              i += 2
            } else if (w === "if") {
              const c = condition(t, i + 1, l)
              option.when = c.when
              i = c.next
            } else if (w === "locked") {
              option.showLocked = true
              i++
            } else if (w === "set") {
              const e = effect(t, i + 1, l)
              if (e.effect) option.effects.push(e.effect)
              i = e.next
            } else i++
          }
          opts.push(option)
        }
        if (!opts.length) fail(l, "emptyMenu")
        steps.push({
          id,
          t: "choice",
          prompt,
          options: opts,
          timer: named(tokens, "timer", 0),
          fallback: named(tokens, "fallback", 0),
        })
        continue
      }
      case "map": {
        const m = find(novel.maps, tokens[1]?.text ?? "")
        if (m) steps.push({ id, t: "map", map: m.id })
        else fail(l, "unknownMap", { name: tokens[1]?.text ?? "" })
        continue
      }
      case "set": {
        const e = effect(tokens, 1, l)
        if (e.effect) steps.push({ id, t: "set", ...e.effect })
        continue
      }
      case "if": {
        const c = condition(tokens, 1, l)
        let then: string | null = null
        let otherwise: string | null = null
        for (let i = c.next; i < tokens.length; i++) {
          if (
            tokens[i]!.text === "->" &&
            !then &&
            tokens[i - 1]?.text !== "else"
          )
            then = scene(tokens[i + 1]?.text ?? "", l)
          if (tokens[i]!.text === "else")
            otherwise = scene(tokens[i + 2]?.text ?? "", l)
        }
        steps.push({ id, t: "if", when: c.when, then, otherwise })
        continue
      }
      case "jump":
      case "call": {
        const target = scene(tokens[1]?.text ?? "", l)
        if (target) steps.push({ id, t: word, scene: target })
        continue
      }
      case "return":
        steps.push({ id, t: "return" })
        continue
      case "ask": {
        const on = variable(tokens[1]?.text ?? "", l, "")
        if (on)
          steps.push({
            id,
            t: "ask",
            on,
            prompt: tokens[2]?.quoted ? tokens[2].text : "",
            max: named(tokens, "max", 20),
          })
        continue
      }
      case "give":
      case "take": {
        const it = find(novel.items, tokens[1]?.text ?? "")
        if (it)
          steps.push({ id, t: "item", item: it.id, give: word === "give" })
        else if (options.create && tokens[1]) {
          const item = {
            id: nid("it"),
            name: pretty(tokens[1].text),
            description: "",
            url: "",
          }
          novel.items.push(item)
          steps.push({ id, t: "item", item: item.id, give: word === "give" })
        } else fail(l, "unknownItem", { name: tokens[1]?.text ?? "" })
        continue
      }
      case "end": {
        const name = tokens[1]?.text
        let ending = name ? (find(novel.endings, name)?.id ?? null) : null
        if (name && !ending && options.create) {
          const e = { id: nid("en"), name: pretty(name), description: "" }
          novel.endings.push(e)
          ending = e.id
        }
        steps.push({ id, t: "end", ending })
        continue
      }
    }
    // Everything else is a line of dialogue.
    const said = tokens[tokens.length - 1]!
    if (!said.quoted) {
      fail(l, "notUnderstood", { line })
      continue
    }
    if (tokens.length === 1) {
      steps.push({
        id,
        t: "say",
        who: null,
        text: said.text,
        pose: null,
        voice: null,
      })
      continue
    }
    const c = character(head.text, l)
    if (!c) continue
    steps.push({
      id,
      t: "say",
      who: c.id,
      text: said.text,
      pose: pose(c.id, tokens.length > 2 ? tokens[1]!.text : undefined),
      voice: null,
    })
  }
  return { steps, errors }
}

const pretty = (name: string) =>
  name
    .split("_")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ")

// Goes with `parseScene`: what the writing model is told it may write.
export const SCRIPT_GUIDE = `One step per line. Names are lowercase with underscores.

scene <backdrop> with dissolve 1s        change the set
cg <illustration> with dissolve 1s       show a full illustration; "cg off" removes it
show <character> <pose> at left|center|right with dissolve 0.5s
hide <character>                         or "hide all"
move <character> to right 1s
music <track> fade 2 vol 0.8             "music off fade 2" stops it
ambience <track> fade 2 vol 0.6
sfx <sound> vol 0.9
weather rain|storm|snow|petals|embers|fog|dust|fireflies|none 0.6
grade sepia|mono|night|dusk|dream|noir|cold|memory|none 0.7 1s
camera <zoom> <x> <y> 1.2s               1 is no zoom; x and y from -1 to 1
shake 0.5 0.4s
flash #ffffff 0.3s
fade out #000000 1s                      "fade in" brings the picture back
wait 1s
set trust + 1                            or "set met = true"
if trust >= 2 -> <scene> else -> <scene>
jump <scene>
give <item>                              "take <item>"
end <ending_name>

Dialogue:
"Narration in quotes."
mara "A line from Mara."
mara happy "A line, with her pose changing to happy."

Choices, each option indented on its own line:
menu "What do you do?":
    "Stay" -> harbor set trust + 1
    "Leave" -> station if trust >= 2

Text may use {i}italic{/i}, {b}bold{/b}, {shake}shaking{/shake}, {w=0.5} for a pause, and [variable] to print a variable.`
