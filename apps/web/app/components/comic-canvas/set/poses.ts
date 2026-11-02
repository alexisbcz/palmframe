import { Euler, Quaternion } from "three"

import type { HumanPose, Quat } from "./scene"

// Poses use VRM's normalized humanoid: a T-pose facing +Z where every bone
// rests at identity, with the character's left on +X. A pose written once
// therefore fits the built-in figure and any uploaded VRoid model alike.
//
// Handy signs, in degrees. Arms: leftUpperArm z<0 lowers it, rightUpperArm
// z>0 lowers it; leftLowerArm y<0 and rightLowerArm y>0 bend the elbow forward.
// Legs: upperLeg x<0 swings forward, lowerLeg x>0 bends the knee. Spine and
// head: x>0 leans forward, y>0 turns to the character's left.

type Angles = [number, number, number]
type PoseAngles = Record<string, Angles>

export type PoseCategory = "standing" | "action" | "seated" | "floor"

export interface BodyPose {
  id: string
  category: PoseCategory
  drop: number
  bones: PoseAngles
}

const ARMS_DOWN: PoseAngles = {
  leftUpperArm: [0, 0, -74],
  rightUpperArm: [0, 0, 74],
  leftLowerArm: [0, -12, 0],
  rightLowerArm: [0, 12, 0],
}

const pose = (
  id: string,
  category: PoseCategory,
  bones: PoseAngles,
  drop = 0
): BodyPose => ({ id, category, drop, bones })

export const BODY_POSES: BodyPose[] = [
  pose("stand", "standing", ARMS_DOWN),
  pose("relaxed", "standing", {
    ...ARMS_DOWN,
    hips: [0, 0, 3],
    spine: [0, 0, -3],
    head: [4, 8, 2],
    leftUpperLeg: [-4, 0, 3],
    rightUpperLeg: [3, 0, -1],
    leftLowerLeg: [8, 0, 0],
  }),
  pose("armsCrossed", "standing", {
    leftShoulder: [0, -6, 0],
    rightShoulder: [0, 6, 0],
    leftUpperArm: [0, -24, -68],
    rightUpperArm: [0, 30, 68],
    leftLowerArm: [18, -122, 0],
    rightLowerArm: [-10, 118, 0],
    head: [-2, 0, 0],
  }),
  pose("handsOnHips", "standing", {
    leftUpperArm: [0, 18, -58],
    rightUpperArm: [0, -18, 58],
    leftLowerArm: [0, -102, 0],
    rightLowerArm: [0, 102, 0],
    leftHand: [0, 0, 22],
    rightHand: [0, 0, -22],
    leftUpperLeg: [0, 0, 6],
    rightUpperLeg: [0, 0, -6],
  }),
  pose("wave", "standing", {
    ...ARMS_DOWN,
    rightUpperArm: [0, 0, -14],
    rightLowerArm: [0, 0, -118],
    head: [0, -8, 3],
  }),
  pose("point", "standing", {
    ...ARMS_DOWN,
    leftUpperArm: [0, -82, -4],
    leftLowerArm: [0, -6, 0],
    head: [0, 12, 0],
    spine: [0, 10, 0],
  }),
  pose("thinking", "standing", {
    ...ARMS_DOWN,
    leftUpperArm: [0, -32, -62],
    leftLowerArm: [0, -138, 18],
    rightUpperArm: [0, 30, 70],
    rightLowerArm: [0, 96, 0],
    head: [8, 6, -6],
  }),
  pose("shrug", "standing", {
    leftShoulder: [0, 0, 12],
    rightShoulder: [0, 0, -12],
    leftUpperArm: [0, -14, -58],
    rightUpperArm: [0, 14, 58],
    leftLowerArm: [0, -88, 26],
    rightLowerArm: [0, 88, -26],
    head: [0, 0, 8],
  }),
  pose("facepalm", "standing", {
    ...ARMS_DOWN,
    leftUpperArm: [0, -38, -56],
    leftLowerArm: [0, -146, 10],
    spine: [10, 0, 0],
    head: [26, 0, 0],
  }),
  pose("lookUp", "standing", {
    ...ARMS_DOWN,
    spine: [-6, 0, 0],
    chest: [-6, 0, 0],
    head: [-30, 4, 0],
  }),
  pose("reach", "standing", {
    ...ARMS_DOWN,
    leftUpperArm: [0, -70, 10],
    leftLowerArm: [0, -8, 0],
    rightUpperArm: [0, 70, -10],
    rightLowerArm: [0, 8, 0],
    spine: [10, 0, 0],
    chest: [6, 0, 0],
  }),
  pose("hold", "standing", {
    leftUpperArm: [0, -36, -62],
    rightUpperArm: [0, 36, 62],
    leftLowerArm: [0, -70, 0],
    rightLowerArm: [0, 70, 0],
  }),
  pose(
    "walk",
    "action",
    {
      ...ARMS_DOWN,
      leftUpperArm: [0, 22, -74],
      rightUpperArm: [0, 22, 74],
      leftUpperLeg: [-24, 0, 0],
      rightUpperLeg: [18, 0, 0],
      leftLowerLeg: [10, 0, 0],
      rightLowerLeg: [24, 0, 0],
      spine: [4, 0, 0],
    },
    0.03
  ),
  pose(
    "run",
    "action",
    {
      leftUpperArm: [0, 40, -66],
      rightUpperArm: [0, -44, 66],
      leftLowerArm: [0, -88, 0],
      rightLowerArm: [0, 88, 0],
      leftUpperLeg: [24, 0, 0],
      rightUpperLeg: [-62, 0, 0],
      leftLowerLeg: [70, 0, 0],
      rightLowerLeg: [56, 0, 0],
      spine: [16, 0, 0],
      head: [-10, 0, 0],
    },
    0.1
  ),
  pose("jump", "action", {
    leftUpperArm: [0, 0, 28],
    rightUpperArm: [0, 0, -28],
    leftLowerArm: [0, -18, 0],
    rightLowerArm: [0, 18, 0],
    leftUpperLeg: [-52, 0, 6],
    rightUpperLeg: [-8, 0, -6],
    leftLowerLeg: [84, 0, 0],
    rightLowerLeg: [58, 0, 0],
    spine: [-6, 0, 0],
  }),
  pose(
    "punch",
    "action",
    {
      hips: [0, 18, 0],
      spine: [8, 16, 0],
      leftUpperArm: [0, -86, -8],
      leftLowerArm: [0, -6, 0],
      rightUpperArm: [0, 44, 66],
      rightLowerArm: [0, 118, 0],
      leftUpperLeg: [-30, 0, 4],
      rightUpperLeg: [24, 0, -4],
      leftLowerLeg: [24, 0, 0],
      rightLowerLeg: [14, 0, 0],
    },
    0.08
  ),
  pose("kick", "action", {
    leftUpperArm: [0, 0, -36],
    rightUpperArm: [0, 0, 40],
    leftLowerArm: [0, -40, 0],
    rightLowerArm: [0, 40, 0],
    leftUpperLeg: [-88, 0, 0],
    leftLowerLeg: [8, 0, 0],
    spine: [-12, 0, 0],
  }),
  pose(
    "guard",
    "action",
    {
      leftUpperArm: [0, -32, -56],
      rightUpperArm: [0, 32, 56],
      leftLowerArm: [0, -132, 0],
      rightLowerArm: [0, 132, 0],
      leftUpperLeg: [-24, 0, 6],
      rightUpperLeg: [18, 0, -6],
      leftLowerLeg: [24, 0, 0],
      rightLowerLeg: [20, 0, 0],
      spine: [10, 0, 0],
      head: [-6, 0, 0],
    },
    0.1
  ),
  pose(
    "aim",
    "action",
    {
      spine: [2, -14, 0],
      head: [0, 14, 0],
      leftUpperArm: [0, -86, 2],
      leftLowerArm: [0, 0, 0],
      rightUpperArm: [0, 64, 34],
      rightLowerArm: [0, 44, 0],
      leftUpperLeg: [-12, 0, 8],
      rightUpperLeg: [12, 0, -8],
    },
    0.02
  ),
  pose(
    "fallBack",
    "action",
    {
      hips: [-24, 0, 0],
      spine: [-16, 0, 0],
      head: [12, 0, 0],
      leftUpperArm: [0, 0, 18],
      rightUpperArm: [0, 0, -26],
      leftUpperLeg: [-40, 0, 6],
      rightUpperLeg: [-16, 0, -6],
      leftLowerLeg: [52, 0, 0],
      rightLowerLeg: [24, 0, 0],
    },
    0.2
  ),
  pose(
    "sit",
    "seated",
    {
      ...ARMS_DOWN,
      leftUpperArm: [0, 12, -74],
      rightUpperArm: [0, -12, 74],
      leftLowerArm: [0, -44, 0],
      rightLowerArm: [0, 44, 0],
      leftUpperLeg: [-88, 0, 3],
      rightUpperLeg: [-88, 0, -3],
      leftLowerLeg: [88, 0, 0],
      rightLowerLeg: [88, 0, 0],
    },
    0.44
  ),
  pose(
    "sitRelaxed",
    "seated",
    {
      ...ARMS_DOWN,
      hips: [-10, 0, 0],
      spine: [6, 0, 0],
      head: [6, 0, 0],
      leftUpperLeg: [-74, 0, 10],
      rightUpperLeg: [-82, 0, -10],
      leftLowerLeg: [58, 0, 0],
      rightLowerLeg: [78, 0, 0],
    },
    0.46
  ),
  pose(
    "sitLegsCrossed",
    "seated",
    {
      leftUpperArm: [0, 12, -74],
      rightUpperArm: [0, -12, 74],
      leftLowerArm: [0, -58, 0],
      rightLowerArm: [0, 58, 0],
      leftUpperLeg: [-86, -6, 12],
      leftLowerLeg: [76, 0, 0],
      rightUpperLeg: [-96, 18, -6],
      rightLowerLeg: [50, 0, 0],
    },
    0.44
  ),
  pose(
    "sitHeadInHands",
    "seated",
    {
      spine: [22, 0, 0],
      chest: [10, 0, 0],
      head: [22, 0, 0],
      leftUpperArm: [0, -44, -64],
      rightUpperArm: [0, 44, 64],
      leftLowerArm: [0, -146, 0],
      rightLowerArm: [0, 146, 0],
      leftUpperLeg: [-88, 0, 6],
      rightUpperLeg: [-88, 0, -6],
      leftLowerLeg: [88, 0, 0],
      rightLowerLeg: [88, 0, 0],
    },
    0.44
  ),
  pose(
    "crouch",
    "floor",
    {
      ...ARMS_DOWN,
      spine: [28, 0, 0],
      head: [-22, 0, 0],
      leftUpperArm: [0, -22, -66],
      rightUpperArm: [0, 22, 66],
      leftLowerArm: [0, -40, 0],
      rightLowerArm: [0, 40, 0],
      leftUpperLeg: [-118, 0, 12],
      rightUpperLeg: [-118, 0, -12],
      leftLowerLeg: [136, 0, 0],
      rightLowerLeg: [136, 0, 0],
    },
    0.56
  ),
  pose(
    "kneel",
    "floor",
    {
      ...ARMS_DOWN,
      leftUpperLeg: [-4, 0, 0],
      rightUpperLeg: [-4, 0, 0],
      leftLowerLeg: [92, 0, 0],
      rightLowerLeg: [92, 0, 0],
    },
    0.44
  ),
  pose(
    "kneelOne",
    "floor",
    {
      ...ARMS_DOWN,
      spine: [10, 0, 0],
      leftUpperLeg: [-86, 0, 2],
      leftLowerLeg: [86, 0, 0],
      rightUpperLeg: [14, 0, 0],
      rightLowerLeg: [100, 0, 0],
    },
    0.4
  ),
  pose(
    "sitFloor",
    "floor",
    {
      leftUpperArm: [0, 30, -70],
      rightUpperArm: [0, -30, 70],
      spine: [-8, 0, 0],
      head: [8, 0, 0],
      leftUpperLeg: [-82, 0, 10],
      rightUpperLeg: [-52, 0, -10],
      leftLowerLeg: [10, 0, 0],
      rightLowerLeg: [96, 0, 0],
    },
    0.8
  ),
  pose(
    "lieBack",
    "floor",
    {
      hips: [-90, 0, 0],
      leftUpperArm: [0, 0, -40],
      rightUpperArm: [0, 0, 40],
      head: [-4, 0, 0],
      leftUpperLeg: [0, 0, 5],
      rightUpperLeg: [0, 0, -5],
    },
    0.86
  ),
  pose(
    "lieFront",
    "floor",
    {
      hips: [90, 0, 0],
      leftUpperArm: [0, 0, 22],
      rightUpperArm: [0, 0, -22],
      head: [-34, 12, 0],
      leftUpperLeg: [0, 0, 5],
      rightUpperLeg: [0, 0, -5],
    },
    0.84
  ),
]

export const POSE_CATEGORIES: PoseCategory[] = [
  "standing",
  "action",
  "seated",
  "floor",
]

export const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Little"] as const
export type Finger = (typeof FINGERS)[number]

export const fingerBones = (side: "left" | "right", finger: Finger) =>
  finger === "Thumb"
    ? [`${side}ThumbMetacarpal`, `${side}ThumbProximal`, `${side}ThumbDistal`]
    : [
        `${side}${finger}Proximal`,
        `${side}${finger}Intermediate`,
        `${side}${finger}Distal`,
      ]

export const HAND_POSES = {
  open: { Thumb: 0, Index: 0, Middle: 0, Ring: 0, Little: 0 },
  relaxed: { Thumb: 0.2, Index: 0.3, Middle: 0.38, Ring: 0.44, Little: 0.5 },
  fist: { Thumb: 0.8, Index: 1, Middle: 1, Ring: 1, Little: 1 },
  point: { Thumb: 0.8, Index: 0, Middle: 1, Ring: 1, Little: 1 },
  peace: { Thumb: 0.8, Index: 0, Middle: 0, Ring: 1, Little: 1 },
  thumbsUp: { Thumb: 0, Index: 1, Middle: 1, Ring: 1, Little: 1 },
  grip: { Thumb: 0.55, Index: 0.68, Middle: 0.7, Ring: 0.72, Little: 0.74 },
} as const satisfies Record<string, Record<Finger, number>>

export type HandPoseId = keyof typeof HAND_POSES
export const HAND_POSE_IDS = Object.keys(HAND_POSES) as HandPoseId[]

function toQuat([x, y, z]: Angles): Quat {
  const d = Math.PI / 180
  const q = new Quaternion().setFromEuler(new Euler(x * d, y * d, z * d, "XYZ"))
  return round(q)
}

function round(q: Quaternion): Quat {
  const r = (n: number) => Math.round(n * 1e4) / 1e4
  return [r(q.x), r(q.y), r(q.z), r(q.w)]
}

export const quatOf = (q: Quaternion) => round(q)

export function bodyPose(p: BodyPose, keep: HumanPose = {}): HumanPose {
  const hands = Object.fromEntries(
    Object.entries(keep).filter(([bone]) => isFinger(bone))
  )
  const bones = Object.fromEntries(
    Object.entries(p.bones).map(([bone, angles]) => [bone, toQuat(angles)])
  )
  return { ...hands, ...bones }
}

export const isFinger = (bone: string) =>
  /(Thumb|Index|Middle|Ring|Little)/.test(bone)

export function handPose(
  id: HandPoseId,
  side: "left" | "right",
  keep: HumanPose
): HumanPose {
  const next = Object.fromEntries(
    Object.entries(keep).filter(
      ([bone]) => !(isFinger(bone) && bone.startsWith(side))
    )
  )
  // Fingers point along the arm, so a curl turns about the forward axis: the
  // sign flips between hands. The thumb folds across the palm around Y.
  const sign = side === "left" ? -1 : 1
  for (const finger of FINGERS) {
    const curl = HAND_POSES[id][finger]
    if (!curl) continue
    const bones = fingerBones(side, finger)
    const reach = finger === "Thumb" ? [38, 34, 30] : [78, 96, 62]
    bones.forEach((bone, i) => {
      const angle = sign * curl * reach[i]!
      next[bone] = toQuat(finger === "Thumb" ? [0, angle, 0] : [0, 0, angle])
    })
  }
  return next
}

const MIRRORED = (name: string) =>
  name.startsWith("left")
    ? `right${name.slice(4)}`
    : name.startsWith("right")
      ? `left${name.slice(5)}`
      : name

// The pose as seen in a mirror: left and right swap, and turns reverse.
export function mirrorPose(source: HumanPose): HumanPose {
  return Object.fromEntries(
    Object.entries(source).map(([bone, [x, y, z, w]]) => [
      MIRRORED(bone),
      [x, -y, -z, w],
    ])
  )
}

// The six VRM expression names sliders can blend, and two mouth shapes.
export const EXPRESSION_KEYS = [
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "blink",
  "aa",
  "oh",
] as const
export type ExpressionKey = (typeof EXPRESSION_KEYS)[number]

export const EXPRESSION_PRESETS: {
  id: string
  mood: "calm" | "up" | "down" | "strong"
  weights: Partial<Record<ExpressionKey, number>>
}[] = [
  { id: "neutral", mood: "calm", weights: {} },
  { id: "calm", mood: "calm", weights: { relaxed: 0.7 } },
  { id: "tired", mood: "calm", weights: { relaxed: 0.5, blink: 0.45 } },
  { id: "asleep", mood: "calm", weights: { blink: 1, relaxed: 0.5 } },
  { id: "smile", mood: "up", weights: { happy: 0.6 } },
  { id: "laugh", mood: "up", weights: { happy: 1, aa: 0.7 } },
  { id: "smug", mood: "up", weights: { happy: 0.45, blink: 0.3 } },
  { id: "sad", mood: "down", weights: { sad: 0.8 } },
  { id: "crying", mood: "down", weights: { sad: 1, blink: 0.5, oh: 0.3 } },
  { id: "worried", mood: "down", weights: { sad: 0.5, surprised: 0.3 } },
  { id: "annoyed", mood: "strong", weights: { angry: 0.55 } },
  { id: "furious", mood: "strong", weights: { angry: 1, aa: 0.6 } },
  { id: "shocked", mood: "strong", weights: { surprised: 1, oh: 0.8 } },
  {
    id: "scared",
    mood: "strong",
    weights: { surprised: 0.6, sad: 0.5, aa: 0.3 },
  },
]

export const MOODS = ["calm", "up", "down", "strong"] as const
