import { emptyNovel, newScene, type Novel, type Scene } from "./model"
import { flatUrl, paperUrl, type PaperFace } from "./paper"
import { parseScene } from "./script"
import { scoreRecipe } from "./synth"

// The sample at /vn/the-last-ferry, and what a new author can open and take
// apart. It's made with nothing but the built-in sets, actors and synthesiser,
// and it uses the features a longer novel would.
export const DEMO_SLUG = "the-last-ferry"

const FACES: PaperFace[] = [
  "neutral",
  "happy",
  "sad",
  "surprised",
  "angry",
  "shy",
]

const SCENES: {
  id: string
  name: string
  x: number
  y: number
  color: string
  summary: string
  layout?: "nvl"
  script: string
}[] = [
  {
    id: "opening",
    name: "Last Call",
    x: 90,
    y: 250,
    color: "#e8dcc2",
    summary: "Mara closes the ticket office. A stranger needs the last ferry.",
    script: `scene harbor_dusk with fade 2s
ambience sea fade 3 vol 0.6
music tide_tables fade 3 vol 0.7
weather dust 0.4
"The ferry to Saint Oren ran for sixty-one years. Tonight is its last crossing."
show mara neutral at center with dissolve 0.8s
mara "Ticket office is closed. Boat goes in twenty minutes, and I go with it."
ask player "The clerk looks you over. What name do you give?" max 16
mara happy "[player]. All right. You're the only soul on my list."
mara neutral "Why does anyone want the island on the night it shuts?"
menu "You look at the boat, then at her.":
    "I'm carrying my father's ashes home." -> pier set trust + 2
    "Someone owes me an answer over there." -> pier set trust + 1 set suspicious = true
    "That's my business." -> pier set suspicious = true`,
  },
  {
    id: "pier",
    name: "The Pier",
    x: 390,
    y: 250,
    color: "#f0c987",
    summary: "On the pier, Mara hands over the old key.",
    script: `scene harbor_night with dissolve 1.5s
grade dusk 0.4 1s
show mara neutral at left with dissolve 0.5s
sfx bell vol 0.8
mara "That's the ten-minute bell. My grandmother rang it for forty years."
if suspicious == true -> doubts
give lighthouse_key
sfx chime vol 0.7
mara happy "Here. The keeper's key. Nobody's left to give it to, so it's yours."
jump crossing`,
  },
  {
    id: "doubts",
    name: "Doubts",
    x: 390,
    y: 480,
    color: "#e8a598",
    summary: "Mara doesn't trust you. You have to earn the key.",
    script: `move mara to center 0.8s
mara angry "People who won't say why they're running usually have a reason."
camera 1.25 0 -0.2 1.5s
menu "She waits.":
    "Tell her the truth." set trust + 2 set suspicious = false
    "Stare at the water." set trust - 1
camera 1 0 0 1s
if trust >= 2 -> forgiven else -> crossing`,
  },
  {
    id: "forgiven",
    name: "The Key",
    x: 660,
    y: 480,
    color: "#a9c8a4",
    summary: "The truth buys you the key.",
    script: `mara sad "My father's on that island too. In a manner of speaking."
give lighthouse_key
sfx chime vol 0.7
mara neutral "Take this. You'll want somewhere to stand tonight."
jump crossing`,
  },
  {
    id: "crossing",
    name: "The Crossing",
    x: 660,
    y: 250,
    color: "#a5c3d9",
    summary: "A storm catches the ferry halfway across.",
    script: `music off fade 2
scene harbor_storm with wipe 1.5s
ambience rain fade 2 vol 0.8
weather storm 0.8
grade cold 0.6 2s
show mara surprised at right with dissolve 0.3s
sfx thunder vol 1
shake 0.8 0.7s
flash #dfe6ff 0.4s
mara "{shake}Hold on to something!{/shake}"
music undertow fade 1 vol 0.8
"The hull drops, and for a long second the whole sea stands above the rail."
menu "A wave tears a crate loose, rolling at Mara." timer 7 fallback 1:
    "Throw yourself at it." set trust + 3
    "Grab the rail."
shake 0.5 0.4s
sfx hit vol 0.9
if trust >= 4 -> island
hide mara with dissolve 0.6s
"When the rain stops, Mara steers without a word. She doesn't look at you again."
jump island`,
  },
  {
    id: "island",
    name: "Saint Oren",
    x: 930,
    y: 250,
    color: "#c9b4d8",
    summary: "The island. Where do you go first?",
    script: `music tide_tables fade 3 vol 0.6
ambience night_air fade 3 vol 0.5
weather fireflies 0.6
grade none 0 2s
scene oren_forest with fade 2s
"Saint Oren is smaller than it was in your father's stories. Three paths, one night."
map saint_oren`,
  },
  {
    id: "shrine",
    name: "The Shrine",
    x: 1200,
    y: 110,
    color: "#e8dcc2",
    summary: "You leave the ashes at the shrine and the night ends quietly.",
    script: `scene oren_shrine with dissolve 1.5s
weather petals 0.6
"You open the box. The wind takes what's in it, gently, a little at a time."
cg the_scattering with dissolve 2s
"Your father would have complained about the cold."
cg off with dissolve 1s
end quiet_water`,
  },
  {
    id: "lighthouse",
    name: "The Lighthouse",
    x: 1200,
    y: 330,
    color: "#f0c987",
    summary: "With the key, you light the lamp one last time.",
    script: `scene oren_night with dissolve 1.5s
show mara happy at center with dissolve 0.8s
mara "You're the first person to climb these stairs in nine years."
sfx door vol 0.8
flash #ffe9b0 1s
grade dream 0.5 2s
music dawn_chorus fade 3 vol 0.8
"The lamp turns over, and a white line goes out across the water toward the mainland."
mara shy "Stay for the morning boat? Oh. Right. There isn't one."
mara happy "Then I suppose we'd better learn to row, [player]."
end the_keeper`,
  },
  {
    id: "harborback",
    name: "Back to the Boat",
    x: 1200,
    y: 550,
    color: "#a9c8a4",
    summary: "You go back with what you came with.",
    script: `scene harbor_night with dissolve 1.5s
"The box is still under your arm when the engine starts."
"Some things, it turns out, you don't put down."
end carried_home`,
  },
]

export function demoNovel(): Novel {
  const n = emptyNovel("The Last Ferry")
  n.author = "Palmframe"
  n.synopsis =
    "The ferry to Saint Oren makes its final crossing tonight, with one clerk, one passenger and a box of ashes."
  n.artStyle = "Cut-paper theatre, deep flat colour"
  n.theme = {
    ...n.theme,
    font: "serif",
    box: "veil",
    accent: "#f2b866",
    spotlight: true,
  }
  n.characters = [
    {
      id: "mara",
      name: "Mara",
      color: "#f2b866",
      bio: "Ticket clerk on the Saint Oren ferry. Third generation, and the last.",
      look: "Woman in her thirties, dark bob, navy clerk's coat",
      blip: "soft",
      sprites: FACES.map((face) => ({
        id: `mara_${face}`,
        name: face,
        url: paperUrl({
          hair: "bob",
          hairColor: "#2a1c1c",
          skin: "#e0b48c",
          coat: "#37506b",
          face,
        }),
      })),
    },
  ]
  const set = (
    id: string,
    name: string,
    url: string,
    kind: "bg" | "cg" = "bg"
  ) => ({ id, name, url, kind, prompt: "" })
  n.backdrops = [
    set("harbor_dusk", "Harbor Dusk", flatUrl("harbor", "dusk", 4)),
    set("harbor_night", "Harbor Night", flatUrl("harbor", "night", 4)),
    set("harbor_storm", "Harbor Storm", flatUrl("mountains", "night", 8)),
    set("oren_forest", "Oren Forest", flatUrl("forest", "night", 3)),
    set("oren_shrine", "Oren Shrine", flatUrl("shrine", "dawn", 2)),
    set("oren_night", "Oren Night", flatUrl("mountains", "dusk", 6)),
    set("the_scattering", "The Scattering", flatUrl("shrine", "day", 9), "cg"),
  ]
  const song = (
    id: string,
    name: string,
    recipe: ReturnType<typeof scoreRecipe>
  ) => ({ id, name, kind: "music" as const, loop: true, recipe })
  n.tracks = [
    song("tide_tables", "Tide Tables", scoreRecipe("melancholy", 7, 2)),
    song("undertow", "Undertow", scoreRecipe("tension", 11, 2)),
    song("dawn_chorus", "Dawn Chorus", scoreRecipe("dream", 5, 5)),
    {
      id: "sea",
      name: "Sea",
      kind: "ambience",
      loop: true,
      recipe: { type: "noise", kind: "sea", seed: 3, tone: 0.4, drift: 0.5 },
    },
    {
      id: "rain",
      name: "Rain",
      kind: "ambience",
      loop: true,
      recipe: { type: "noise", kind: "rain", seed: 4, tone: 0.5, drift: 0.5 },
    },
    {
      id: "night_air",
      name: "Night Air",
      kind: "ambience",
      loop: true,
      recipe: { type: "noise", kind: "night", seed: 5, tone: 0.5, drift: 0.5 },
    },
    ...(["bell", "chime", "thunder", "hit", "door"] as const).map(
      (kind, i) => ({
        id: kind,
        name: kind[0]!.toUpperCase() + kind.slice(1),
        kind: "sfx" as const,
        loop: false,
        recipe: { type: "sfx" as const, kind, seed: i + 1, pitch: 0.5 },
      })
    ),
  ]
  n.variables = [
    {
      id: "trust",
      name: "trust",
      kind: "number",
      initial: 0,
      hud: true,
      max: 8,
    },
    {
      id: "suspicious",
      name: "suspicious",
      kind: "flag",
      initial: false,
      hud: false,
      max: 1,
    },
    {
      id: "player",
      name: "player",
      kind: "text",
      initial: "Traveller",
      hud: false,
      max: 16,
    },
  ]
  n.items = [
    {
      id: "lighthouse_key",
      name: "Lighthouse Key",
      description: "Brass, heavy, older than the ferry.",
      url: "",
    },
  ]
  n.endings = [
    {
      id: "quiet_water",
      name: "Quiet Water",
      description: "You did what you came to do.",
    },
    {
      id: "the_keeper",
      name: "The Keeper",
      description: "The light goes on, and so do you.",
    },
    { id: "carried_home", name: "Carried Home", description: "Not yet." },
  ]
  n.maps = [
    {
      id: "saint_oren",
      name: "Saint Oren",
      url: flatUrl("chart", "day", 12),
      prompt: "",
      pins: [
        {
          id: "p1",
          x: 0.24,
          y: 0.3,
          label: "The shrine",
          scene: "shrine",
          when: null,
        },
        {
          id: "p2",
          x: 0.72,
          y: 0.55,
          label: "The lighthouse",
          scene: "lighthouse",
          when: {
            all: true,
            clauses: [{ on: "item:lighthouse_key", op: "==", value: true }],
          },
        },
        {
          id: "p3",
          x: 0.12,
          y: 0.78,
          label: "Back to the boat",
          scene: "harborback",
          when: null,
        },
      ],
    },
  ]
  n.scenes = SCENES.map((s) => ({
    ...newScene(s.name, s.x, s.y),
    id: s.id,
    color: s.color,
    summary: s.summary,
    ...(s.layout && { layout: s.layout }),
  })) as Scene[]
  n.start = "opening"
  SCENES.forEach((s, i) => {
    const { steps, errors } = parseScene(n, s.script)
    if (errors.length)
      throw new Error(`Demo scene ${s.id}: ${JSON.stringify(errors)}`)
    // Stable ids, so a reader's saves survive a reload.
    n.scenes[i]!.steps = steps.map((step, k) => {
      const id = `${s.id}_${k}`
      return step.t === "choice"
        ? {
            ...step,
            id,
            options: step.options.map((o, j) => ({ ...o, id: `${id}_${j}` })),
          }
        : { ...step, id }
    })
  })
  n.titleScreen = {
    backdrop: "harbor_dusk",
    music: "tide_tables",
    tagline: "One crossing left.",
    weather: "dust",
  }
  return n
}
