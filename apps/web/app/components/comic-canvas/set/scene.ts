// A panel's 3D set, as plain JSON on the project. Nothing here imports three,
// so the editor can carry sets around without loading the 3D engine.

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]

export interface Transform {
  position: Vec3
  // Degrees, in XYZ order.
  rotation: Vec3
  scale: Vec3
}

// How a capture is drawn. The shader treats imported models like built-in ones.
export type SetLook = "clay" | "toon" | "ink" | "line"

export type Build = "slim" | "average" | "broad"
export type HairStyle = "none" | "short" | "bob" | "long" | "spiky"

// The built-in figure's looks. Uploaded models ignore them.
export interface FigureLook {
  skin: string
  hair: string
  hairStyle: HairStyle
  top: string
  bottom: string
  shoes: string
  build: Build
  height: number
}

export type HumanPose = Record<string, Quat>

export interface ActorState {
  // Sparse: a missing bone rests in the T-pose.
  pose: HumanPose
  // Metres from the standing height, for sitting and kneeling.
  hipsDrop: number
  // Named expression weights, 0 to 1.
  expression: Record<string, number>
  // Eye direction in degrees: yaw to the character's left, pitch up.
  gaze: [number, number]
}

export interface ActorItem extends Transform, ActorState {
  kind: "actor"
  id: string
  name: string
  figure: FigureLook
  // A VRM in this browser's model store. Missing here, the figure stands in.
  model?: AssetRef
  // A character of the project's cast, handed to the AI with the guide.
  castId?: string
  outlines?: boolean
}

export interface AssetRef {
  hash: string
  name: string
}

export type PropId = (typeof PROP_IDS)[number]

export const PROP_IDS = [
  "chair",
  "stool",
  "table",
  "desk",
  "sofa",
  "bed",
  "shelf",
  "door",
  "window",
  "crate",
  "barrel",
  "bin",
  "lamppost",
  "car",
  "tree",
  "bottle",
  "mug",
  "laptop",
  "phone",
  "book",
  "umbrella",
  "bag",
  "sword",
  "wall",
  "floor",
  "box",
  "stairs",
  "pillar",
] as const

export interface PropItem extends Transform {
  kind: "prop"
  id: string
  name: string
  prop: PropId
  color: string
}

export interface ModelItem extends Transform {
  kind: "model"
  id: string
  name: string
  model: AssetRef
}

// A flat picture standing in the set: a poster, a backdrop, a drawn effect.
export interface ImageItem extends Transform {
  kind: "image"
  id: string
  name: string
  src: string
  // Height over width, so scaling keeps the picture's shape.
  aspect: number
  // Turns to face the camera.
  billboard: boolean
}

export interface LampItem extends Transform {
  kind: "lamp"
  id: string
  name: string
  color: string
  intensity: number
  distance: number
}

export type SetItem = ActorItem | PropItem | ModelItem | ImageItem | LampItem

export type StageId = (typeof STAGE_IDS)[number]

export const STAGE_IDS = [
  "empty",
  "apartment",
  "street",
  "alley",
  "rooftop",
  "bar",
  "classroom",
  "office",
  "forest",
] as const

export interface Lighting {
  ambient: number
  ambientColor: string
  sun: number
  sunColor: string
  // Degrees: how high the sun stands, and where it comes from.
  pitch: number
  yaw: number
  shadows: boolean
}

export interface SetCamera {
  position: Vec3
  target: Vec3
  // Vertical field of view in degrees. Small is a long lens.
  fov: number
  roll: number
}

export interface SetScene {
  version: 1
  stage: StageId
  stageColor: string | null
  background: string
  fog: number
  light: Lighting
  camera: SetCamera
  look: SetLook
  // Outline width in pixels at capture size.
  ink: number
  items: SetItem[]
}

// A set kept for reuse, as a project's saved layouts are.
export interface SavedSet {
  id: string
  name: string
  scene: SetScene
}

export const MAX_SAVED_SETS = 24
export const MAX_ITEMS = 64

export const IDENTITY: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
}

export const FIGURES: FigureLook[] = [
  {
    skin: "#e9b995",
    hair: "#2b211c",
    hairStyle: "short",
    top: "#38424f",
    bottom: "#23262c",
    shoes: "#17181b",
    build: "average",
    height: 1.78,
  },
  {
    skin: "#c98f65",
    hair: "#17110e",
    hairStyle: "long",
    top: "#a43a37",
    bottom: "#2a2d3a",
    shoes: "#ded9cf",
    build: "slim",
    height: 1.66,
  },
  {
    skin: "#7f5238",
    hair: "#0e0c0b",
    hairStyle: "spiky",
    top: "#d7cdb7",
    bottom: "#4c5a46",
    shoes: "#2a1d15",
    build: "broad",
    height: 1.86,
  },
  {
    skin: "#f1cfb4",
    hair: "#b3552c",
    hairStyle: "bob",
    top: "#3f6f73",
    bottom: "#3b3039",
    shoes: "#5b2d2a",
    build: "slim",
    height: 1.6,
  },
  {
    skin: "#a8a39c",
    hair: "#a8a39c",
    hairStyle: "none",
    top: "#a8a39c",
    bottom: "#a8a39c",
    shoes: "#a8a39c",
    build: "average",
    height: 1.75,
  },
]

export function createScene(stage: StageId = "apartment"): SetScene {
  return {
    version: 1,
    stage,
    stageColor: null,
    background: "#c7d0d6",
    fog: 0,
    light: {
      ambient: 0.75,
      ambientColor: "#ffffff",
      sun: 1.9,
      sunColor: "#fff3e0",
      pitch: 48,
      yaw: 35,
      shadows: true,
    },
    camera: { position: [0.6, 1.55, 4.2], target: [0, 1, 0], fov: 32, roll: 0 },
    look: "toon",
    ink: 2,
    items: [],
  }
}

let counter = 0
export function itemId() {
  counter += 1
  return `set-${Date.now().toString(36)}-${counter}`
}

export function createActor(figure: FigureLook, name: string): ActorItem {
  return {
    kind: "actor",
    id: itemId(),
    name,
    ...structuredClone(IDENTITY),
    pose: {},
    hipsDrop: 0,
    expression: {},
    gaze: [0, 0],
    figure: { ...figure },
    outlines: true,
  }
}

export function createProp(prop: PropId, name: string): PropItem {
  return {
    kind: "prop",
    id: itemId(),
    name,
    prop,
    color: "#8b7a68",
    ...structuredClone(IDENTITY),
  }
}

export function createLamp(name: string): LampItem {
  return {
    kind: "lamp",
    id: itemId(),
    name,
    color: "#ffd9a0",
    intensity: 8,
    distance: 8,
    ...structuredClone(IDENTITY),
    position: [1, 2.2, 1],
  }
}

export function createImage(
  src: string,
  aspect: number,
  name: string
): ImageItem {
  return {
    kind: "image",
    id: itemId(),
    name,
    src,
    aspect,
    billboard: false,
    ...structuredClone(IDENTITY),
    position: [0, 1.2, -1],
  }
}

export function createModel(model: AssetRef): ModelItem {
  return {
    kind: "model",
    id: itemId(),
    name: model.name,
    model,
    ...structuredClone(IDENTITY),
  }
}

// Deep, with new item ids, so a reused set never shares ids with its source.
export function cloneScene(scene: SetScene): SetScene {
  const copy = structuredClone(scene)
  copy.items = copy.items.map((item) => ({ ...item, id: itemId() }))
  return copy
}

// The next free "Name 2" for a new item.
export function uniqueName(base: string, items: SetItem[]) {
  const taken = new Set(items.map((i) => i.name))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`
    if (!taken.has(name)) return name
  }
}

// The cast ids a set's actors stand for, to carry over to the panel.
export function castIn(scene: SetScene) {
  return [
    ...new Set(
      scene.items.flatMap((i) =>
        i.kind === "actor" && i.castId ? [i.castId] : []
      )
    ),
  ]
}

// Every uploaded model a scene needs.
export function assetsIn(scene: SetScene): AssetRef[] {
  return scene.items.flatMap((i) =>
    (i.kind === "actor" || i.kind === "model") && i.model ? [i.model] : []
  )
}
