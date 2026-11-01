import {
  type Condition,
  type Effect,
  type Novel,
  type Scene,
  type Step,
} from "./model"
import { slug } from "./script"

// A real Ren'Py project from a novel: script.rpy plus the list of files to put
// next to it. Open the folder in the Ren'Py launcher to build for desktop and
// mobile. Nothing here touches the DOM, so the file is testable as text.

export interface RenpyFile {
  path: string
  source: string // the asset's url
  kind: "image" | "audio"
  recipe?: string // track id, when the synthesiser must render it
  transparent?: boolean
}

const py = (s: string) =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/%/g, "%%")}"`

const ident = (name: string, prefix: string) => {
  const s = slug(name).replace(/[^a-z0-9_]/g, "")
  return /^[a-z]/.test(s) ? s : `${prefix}_${s || "x"}`
}

function unique(items: { id: string; name: string }[], prefix: string) {
  const used = new Set<string>()
  const map = new Map<string, string>()
  for (const it of items) {
    const base = ident(it.name, prefix)
    let name = base
    for (let i = 2; used.has(name); i++) name = `${base}_${i}`
    used.add(name)
    map.set(it.id, name)
  }
  return map
}

const TRANSITIONS: Record<string, string> = {
  cut: "",
  dissolve: "Dissolve",
  fade: "Fade",
  wipe: "wipeleft",
  blinds: "blinds",
  iris: "irisin",
  push: "pushright",
}

const withClause = (t: string, dur: number) => {
  const name = TRANSITIONS[t]
  if (!name) return ""
  if (name === "Dissolve") return ` with Dissolve(${dur || 0.5})`
  if (name === "Fade") {
    const d = dur || 1
    return ` with Fade(${d / 3}, ${d / 3}, ${d / 3})`
  }
  return ` with ${name}`
}

const ext = (url: string, audio: boolean) => {
  const m = /\.(png|jpe?g|webp|ogg|mp3|wav|opus|m4a)(\?|$)/i.exec(url)
  if (m) return m[1]!.toLowerCase()
  return audio ? "ogg" : "png"
}

export function exportRenpy(novel: Novel) {
  const chars = unique(novel.characters, "c")
  const backs = unique(novel.backdrops, "b")
  const tracks = unique(novel.tracks, "t")
  const labels = unique(novel.scenes, "scene")
  const vars = unique(
    novel.variables.map((v) => ({ id: v.id, name: v.name })),
    "v"
  )
  const items = unique(novel.items, "item")
  const files: RenpyFile[] = []
  const out: string[] = []
  const line = (s = "") => out.push(s)

  line(`# ${novel.title}. Exported from Palmframe.`)
  line()
  line(`define config.name = ${py(novel.title)}`)
  line()
  for (const c of novel.characters)
    line(
      `define ${chars.get(c.id)} = Character(${py(c.name)}, color=${py(c.color)})`
    )
  line()
  for (const v of novel.variables)
    line(
      `default ${vars.get(v.id)} = ${
        v.kind === "text"
          ? py(String(v.initial))
          : v.kind === "number"
            ? Number(v.initial)
            : v.initial
              ? "True"
              : "False"
      }`
    )
  line("default inventory = set()")
  line("default seen_scenes = set()")
  line()

  const images = new Map<string, string>()
  for (const b of novel.backdrops) {
    if (!b.url) continue
    const name = backs.get(b.id)!
    const path = `images/${name}.${b.url.startsWith("flat:") ? "png" : ext(b.url, false)}`
    files.push({ path, source: b.url, kind: "image" })
    const tag = `${b.kind === "cg" ? "cg" : "bg"} ${name}`
    images.set(b.id, tag)
    line(`image ${tag} = ${py(path)}`)
  }
  const poses = new Map<string, string>()
  for (const c of novel.characters) {
    const cid = chars.get(c.id)!
    const spriteIds = unique(c.sprites, "pose")
    for (const s of c.sprites) {
      if (!s.url) continue
      const name = spriteIds.get(s.id)!
      const path = `images/${cid}_${name}.${s.url.startsWith("paper:") ? "png" : ext(s.url, false)}`
      files.push({ path, source: s.url, kind: "image", transparent: true })
      poses.set(s.id, `${cid} ${name}`)
      line(`image ${cid} ${name} = ${py(path)}`)
    }
  }
  line()

  const audio = new Map<string, string>()
  for (const t of novel.tracks) {
    if (!t.url && !t.recipe) continue
    const path = `audio/${tracks.get(t.id)}.${t.recipe ? "wav" : ext(t.url!, true)}`
    files.push({
      path,
      source: t.url ?? "",
      kind: "audio",
      ...(t.recipe && { recipe: t.id }),
    })
    audio.set(t.id, path)
  }

  const read = (on: string) => {
    if (on.startsWith("item:"))
      return `${py(items.get(on.slice(5)) ?? "")} in inventory`
    if (on.startsWith("seen:"))
      return `${py(labels.get(on.slice(5)) ?? "")} in seen_scenes`
    return vars.get(on) ?? on
  }
  const literal = (v: boolean | number | string) =>
    typeof v === "string"
      ? py(v)
      : typeof v === "boolean"
        ? v
          ? "True"
          : "False"
        : String(v)
  const cond = (c: Condition) =>
    c.clauses
      .map((x) =>
        x.on.includes(":")
          ? `${x.value ? "" : "not "}(${read(x.on)})`
          : `${read(x.on)} ${x.op} ${literal(x.value)}`
      )
      .join(c.all ? " and " : " or ") || "True"
  const assign = (e: Effect) => {
    const name = vars.get(e.on) ?? e.on
    if (e.op === "toggle") return `$ ${name} = not ${name}`
    if (e.op === "=") return `$ ${name} = ${literal(e.value)}`
    return `$ ${name} ${e.op}= ${literal(e.value)}`
  }

  const emit = (step: Step, pad: string, scene: Scene) => {
    const say = (s: string) => out.push(pad + s)
    switch (step.t) {
      case "say": {
        const text = step.text
        const pose = step.pose ? poses.get(step.pose) : null
        if (pose) say(`show ${pose}`)
        const voice = step.voice ? audio.get(step.voice) : null
        if (voice) say(`voice ${py(voice)}`)
        const who = step.who ? chars.get(step.who) : null
        say(`${who ? `${who} ` : ""}${py(text)}`)
        break
      }
      case "bg": {
        const tag = step.ref ? images.get(step.ref) : null
        say(
          `${tag ? `scene ${tag}` : "scene black"}${withClause(step.trans, step.dur)}`
        )
        break
      }
      case "cg": {
        const tag = step.ref ? images.get(step.ref) : null
        if (tag)
          say(`show ${tag} as novel_cg${withClause(step.trans, step.dur)}`)
        else say(`hide novel_cg${withClause(step.trans, step.dur)}`)
        break
      }
      case "show": {
        const c = novel.characters.find((x) => x.id === step.who)
        const pose =
          (step.pose && poses.get(step.pose)) ||
          (c?.sprites[0] && poses.get(c.sprites[0].id))
        if (!pose) break
        say(
          `show ${pose} at Transform(xalign=${step.x}, yalign=1.0, zoom=${step.scale}, xzoom=${step.flip ? -1 : 1})${withClause(step.trans, step.dur)}`
        )
        break
      }
      case "hide": {
        if (step.who)
          say(`hide ${chars.get(step.who)}${withClause(step.trans, step.dur)}`)
        else say(`scene black`)
        break
      }
      case "move": {
        const c = chars.get(step.who)
        const pose = novel.characters
          .find((x) => x.id === step.who)
          ?.sprites.find((s) => s.url)
        if (c && pose)
          say(
            `show ${poses.get(pose.id)} at Transform(xalign=${step.x}, yalign=1.0, zoom=${step.scale}) with MoveTransition(${step.dur})`
          )
        break
      }
      case "music":
      case "ambience": {
        const channel = step.t === "music" ? "music" : "sound"
        const path = step.track ? audio.get(step.track) : null
        if (path)
          say(
            `play ${channel} ${py(path)} fadein ${step.fade} volume ${step.vol}${step.t === "ambience" ? " loop" : ""}`
          )
        else say(`stop ${channel} fadeout ${step.fade}`)
        break
      }
      case "sfx": {
        const path = audio.get(step.track)
        if (path) say(`play audio ${py(path)} volume ${step.vol}`)
        break
      }
      case "shake":
        say(`with hpunch`)
        break
      case "flash":
        say(`with Fade(0.05, 0, ${step.dur}, color=${py(step.color)})`)
        break
      case "fade":
        if (step.out) say(`scene black with Dissolve(${step.dur})`)
        break
      case "wait":
        say(`pause ${step.dur}`)
        break
      case "camera":
        say(
          `camera at Transform(zoom=${step.zoom}, xoffset=${-step.x * 200}, yoffset=${-step.y * 120})`
        )
        break
      case "choice":
        say("menu:")
        if (step.prompt) say(`    ${py(step.prompt)}`)
        for (const o of step.options) {
          say(
            `    ${py(o.text)}${o.when?.clauses.length ? ` if ${cond(o.when)}:` : ":"}`
          )
          for (const e of o.effects) say(`        ${assign(e)}`)
          if (o.goto) say(`        jump ${labels.get(o.goto)}`)
          if (!o.goto && !o.effects.length) say("        pass")
        }
        break
      case "map": {
        const map = novel.maps.find((m) => m.id === step.map)
        const pins = map?.pins.filter((p) => p.scene) ?? []
        if (!pins.length) break
        say("menu:")
        for (const p of pins) {
          say(
            `    ${py(p.label)}${p.when?.clauses.length ? ` if ${cond(p.when)}:` : ":"}`
          )
          say(`        jump ${labels.get(p.scene!)}`)
        }
        break
      }
      case "set":
        say(assign(step))
        break
      case "if":
        if (step.then) {
          say(`if ${cond(step.when)}:`)
          say(`    jump ${labels.get(step.then)}`)
        }
        if (step.otherwise) {
          say(step.then ? "else:" : `if not (${cond(step.when)}):`)
          say(`    jump ${labels.get(step.otherwise)}`)
        }
        break
      case "jump":
        say(`jump ${labels.get(step.scene)}`)
        break
      case "call":
        say(`call ${labels.get(step.scene)}`)
        break
      case "return":
        say("return")
        break
      case "ask": {
        const name = vars.get(step.on)
        say(
          `$ ${name} = renpy.input(${py(step.prompt)}, length=${step.max}).strip()`
        )
        break
      }
      case "item":
        say(
          `$ inventory.${step.give ? "add" : "discard"}(${py(items.get(step.item) ?? "")})`
        )
        break
      case "end":
        say("return")
        break
      case "note":
        say(`# ${step.text.replace(/\n/g, " ")}`)
        break
      // Weather and colour grades have no plain Ren'Py equivalent: left as a
      // comment so they can be added with a project's own effects.
      case "weather":
      case "grade":
        say(`# ${step.t}: ${step.t === "weather" ? step.kind : step.look}`)
        break
    }
    void scene
  }

  line("label start:")
  line(`    jump ${novel.start ? labels.get(novel.start) : "ending"}`)
  line()
  for (const scene of novel.scenes) {
    line(`label ${labels.get(scene.id)}:`)
    line(`    $ seen_scenes.add(${py(labels.get(scene.id)!)})`)
    for (const step of scene.steps) emit(step, "    ", scene)
    const last = scene.steps.at(-1)?.t
    if (last !== "jump" && last !== "end" && last !== "return")
      line("    return")
    line()
  }
  if (!novel.start) line("label ending:\n    return\n")
  return { script: out.join("\n"), files }
}
