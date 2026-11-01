import type { Outline } from "./write.server"
import {
  CHARACTER_COLORS,
  SCENE_COLORS,
  emptyNovel,
  newCharacter,
  newScene,
  nid,
  type Novel,
} from "./model"
import { flatUrl, FLAT_PLACES, FLAT_TIMES, paperUrl, PAPER_HAIR } from "./paper"
import { slug } from "./script"
import { random, scoreRecipe } from "./synth"

const HAIRS = ["#2a1c1c", "#6a3d24", "#c9963f", "#8a2f2a", "#3a3f5c", "#c7c1b5"]
const SKINS = ["#f2d3b5", "#d9ab82", "#a9744f", "#7a5236"]
const COATS = ["#37506b", "#7a3b3b", "#3f6b55", "#6b4f7a", "#8a6a33", "#2f3a3f"]
const FACES: Record<
  string,
  "neutral" | "happy" | "sad" | "angry" | "surprised" | "shy"
> = {
  neutral: "neutral",
  calm: "neutral",
  happy: "happy",
  smile: "happy",
  joyful: "happy",
  sad: "sad",
  crying: "sad",
  angry: "angry",
  furious: "angry",
  surprised: "surprised",
  shocked: "surprised",
  shy: "shy",
  embarrassed: "shy",
}

// A plan from the writer as a working novel. Everything starts on paper sets and
// paper actors, so it plays at once, and real art replaces them one at a time.
export function fromOutline(o: Outline, language: string, seed: number): Novel {
  const rand = random(seed)
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(rand() * list.length)]!
  const n = emptyNovel(o.title)
  n.synopsis = o.synopsis
  n.artStyle = o.art_style || n.artStyle
  n.language = language
  n.characters = o.characters.map((c, i) => {
    const ch = newCharacter(c.name, i)
    ch.bio = c.bio
    ch.look = c.look
    ch.color = CHARACTER_COLORS[i % CHARACTER_COLORS.length]!
    const hair = pick(PAPER_HAIR)
    const hairColor = pick(HAIRS)
    const skin = pick(SKINS)
    const coat = COATS[i % COATS.length]!
    ch.sprites = (c.poses.length ? c.poses : ["neutral"]).map((name) => ({
      id: nid("sp"),
      name,
      url: paperUrl({
        hair,
        hairColor,
        skin,
        coat,
        face: FACES[name.toLowerCase()] ?? "neutral",
      }),
    }))
    return ch
  })
  n.backdrops = o.locations.map((l) => ({
    id: nid("bd"),
    name: l.name,
    kind: "bg",
    prompt: l.prompt,
    url: flatUrl(
      pick(FLAT_PLACES.filter((p) => p !== "chart")),
      pick(FLAT_TIMES),
      Math.floor(rand() * 90) + 1
    ),
  }))
  n.variables = o.variables.map((v) => ({
    id: nid("vr"),
    name: slug(v.name),
    kind: v.kind,
    initial: v.kind === "number" ? 0 : false,
    hud: v.hud,
    max: 10,
  }))
  n.tracks = [
    {
      id: nid("tk"),
      name: "Main theme",
      kind: "music",
      loop: true,
      recipe: scoreRecipe("tender", seed & 0xffff),
    },
    {
      id: nid("tk"),
      name: "Tension",
      kind: "music",
      loop: true,
      recipe: scoreRecipe("tension", (seed & 0xffff) + 1),
    },
  ]
  n.titleScreen.backdrop = n.backdrops[0]?.id ?? null
  n.titleScreen.music = n.tracks[0]!.id
  n.titleScreen.tagline = ""

  // Laid out left to right by distance from the opening.
  const scenes = o.scenes.map((s) => {
    const sc = newScene(s.name)
    sc.summary = s.summary
    return sc
  })
  const byName = new Map(o.scenes.map((s, i) => [s.name, i]))
  const depth = new Map<number, number>([[0, 0]])
  const queue = [0]
  while (queue.length) {
    const at = queue.shift()!
    for (const name of o.scenes[at]!.leads_to) {
      const i = byName.get(name)
      if (i !== undefined && !depth.has(i)) {
        depth.set(i, depth.get(at)! + 1)
        queue.push(i)
      }
    }
  }
  const rows = new Map<number, number>()
  scenes.forEach((sc, i) => {
    const d = depth.get(i) ?? 0
    const row = rows.get(d) ?? 0
    rows.set(d, row + 1)
    sc.x = 90 + d * 290
    sc.y = 90 + row * 210
    sc.color = SCENE_COLORS[d % SCENE_COLORS.length]!
    const plan = o.scenes[i]!
    const targets = plan.leads_to
      .map((name) => scenes[byName.get(name) ?? -1])
      .filter((s) => !!s)
    if (plan.is_ending || !targets.length) {
      const ending = {
        id: nid("en"),
        name: plan.name,
        description: plan.summary,
      }
      n.endings.push(ending)
      sc.steps = [
        {
          id: nid("st"),
          t: "say",
          who: null,
          text: plan.summary,
          pose: null,
          voice: null,
        },
        { id: nid("st"), t: "end", ending: ending.id },
      ]
    } else if (targets.length === 1) {
      sc.steps = [
        {
          id: nid("st"),
          t: "say",
          who: null,
          text: plan.summary,
          pose: null,
          voice: null,
        },
        { id: nid("st"), t: "jump", scene: targets[0]!.id },
      ]
    } else {
      sc.steps = [
        {
          id: nid("st"),
          t: "say",
          who: null,
          text: plan.summary,
          pose: null,
          voice: null,
        },
        {
          id: nid("st"),
          t: "choice",
          prompt: "",
          timer: 0,
          fallback: 0,
          options: targets.map((target) => ({
            id: nid("op"),
            text: target.name,
            goto: target.id,
            when: null,
            showLocked: false,
            effects: [],
          })),
        },
      ]
    }
    if (n.backdrops[0])
      sc.steps.unshift({
        id: nid("st"),
        t: "bg",
        ref: n.backdrops[i % n.backdrops.length]!.id,
        trans: "dissolve",
        dur: 1,
      })
  })
  n.scenes = scenes
  n.start = scenes[0]?.id ?? null
  return n
}

// Names the writer needs in order to use what the novel already has.
export function bible(n: Novel) {
  const list = (items: { name: string }[]) =>
    items.map((i) => slug(i.name)).join(", ") || "(none)"
  return [
    `Title: ${n.title}`,
    `Synopsis: ${n.synopsis}`,
    "Characters:",
    ...n.characters.map(
      (c) => `- ${slug(c.name)}: ${c.bio} Poses: ${list(c.sprites)}`
    ),
    `Sets: ${list(n.backdrops.filter((b) => b.kind === "bg"))}`,
    `Illustrations: ${list(n.backdrops.filter((b) => b.kind === "cg"))}`,
    `Music: ${list(n.tracks.filter((t) => t.kind === "music"))}`,
    `Ambience: ${list(n.tracks.filter((t) => t.kind === "ambience"))}`,
    `Sounds: ${list(n.tracks.filter((t) => t.kind === "sfx"))}`,
    `Variables: ${n.variables.map((v) => `${v.name} (${v.kind})`).join(", ") || "(none)"}`,
    `Items: ${list(n.items)}`,
    `Endings: ${list(n.endings)}`,
    `Scenes: ${list(n.scenes)}`,
  ].join("\n")
}
