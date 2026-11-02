import * as THREE from "three"

import type { Build, FigureLook, HumanPose } from "./scene"
import { FINGERS, type Finger } from "./poses"

// The two kinds of actor share this surface, so the engine and the IK don't
// care whether they're holding the built-in figure or an uploaded VRM.
export interface Rig {
  root: THREE.Object3D
  bone(name: string): THREE.Object3D | null
  setExpression(weights: Record<string, number>): void
  setGaze(yaw: number, pitch: number): void
  // Runs after a pose changes, to push it onto the visible skeleton.
  update(): void
  dispose(): void
}

interface Measures {
  shoulder: number
  hip: number
  chest: number
  waist: number
  limb: number
}

const BUILDS: Record<Build, Measures> = {
  slim: { shoulder: 0.17, hip: 0.088, chest: 0.1, waist: 0.082, limb: 0.82 },
  average: { shoulder: 0.2, hip: 0.095, chest: 0.12, waist: 0.102, limb: 1 },
  broad: {
    shoulder: 0.235,
    hip: 0.105,
    chest: 0.145,
    waist: 0.125,
    limb: 1.24,
  },
}

const material = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 })

// A capsule running from the bone's origin along `to`.
function limb(
  parent: THREE.Object3D,
  to: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
  end = radius
) {
  const length = to.length()
  const shape = new THREE.Group()
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(end, radius, length, 14, 1, true),
    mat
  )
  shaft.position.y = length / 2
  const a = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), mat)
  const b = new THREE.Mesh(new THREE.SphereGeometry(end, 14, 10), mat)
  b.position.y = length
  shape.add(shaft, a, b)
  shape.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    to.clone().normalize()
  )
  parent.add(shape)
}

function ellipsoid(
  parent: THREE.Object3D,
  size: THREE.Vector3,
  at: THREE.Vector3,
  mat: THREE.Material
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat)
  mesh.scale.copy(size)
  mesh.position.copy(at)
  parent.add(mesh)
  return mesh
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// A jointed figure with VRM's bone names, in its rest T-pose facing +Z.
export function createFigure(look: FigureLook): Rig {
  const root = new THREE.Group()
  const bones = new Map<string, THREE.Object3D>()
  const k = look.height / 1.75
  const m = BUILDS[look.build]
  const skin = material(look.skin)
  const top = material(look.top)
  const bottom = material(look.bottom)
  const shoes = material(look.shoes)
  const hair = material(look.hair)
  const ink = new THREE.MeshBasicMaterial({ color: "#16130f" })
  const white = new THREE.MeshBasicMaterial({ color: "#f6f2ea" })
  const materials = [skin, top, bottom, shoes, hair, ink, white]

  const bone = (
    name: string,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z = 0
  ) => {
    const node = new THREE.Object3D()
    node.name = name
    node.position.set(x, y, z).multiplyScalar(k)
    parent.add(node)
    bones.set(name, node)
    return node
  }
  const s = (x: number, y: number, z = 0) => v(x * k, y * k, z * k)

  const hips = bone("hips", root, 0, 0.93)
  const spine = bone("spine", hips, 0, 0.1)
  const chest = bone("chest", spine, 0, 0.14)
  const upperChest = bone("upperChest", chest, 0, 0.13)
  const neck = bone("neck", upperChest, 0, 0.14)
  const head = bone("head", neck, 0, 0.08)

  // Overlapping shapes, so the torso reads as one form when the spine bends.
  ellipsoid(hips, s(m.hip * 1.8, 0.115, m.chest * 0.86), s(0, 0), bottom)
  ellipsoid(hips, s(m.waist * 1.32, 0.13, m.waist * 0.92), s(0, 0.12), top)
  ellipsoid(spine, s(m.waist * 1.34, 0.17, m.waist * 0.96), s(0, 0.1), top)
  ellipsoid(chest, s(m.chest * 1.42, 0.2, m.chest * 0.98), s(0, 0.1), top)
  ellipsoid(
    upperChest,
    s(m.shoulder * 1.06, 0.095, m.chest * 0.84),
    s(0, 0.075),
    top
  )
  limb(neck, s(0, 0.1), 0.046 * k * m.limb, skin)

  // Head and face.
  ellipsoid(head, s(0.098, 0.122, 0.108), s(0, 0.1), skin)
  const eye = (x: number) => {
    const ball = ellipsoid(
      head,
      s(0.018, 0.014, 0.008),
      s(x, 0.108, 0.098),
      white
    )
    const pupil = ellipsoid(
      head,
      s(0.009, 0.011, 0.005),
      s(x, 0.108, 0.105),
      ink
    )
    const lid = ellipsoid(
      head,
      s(0.021, 0.004, 0.006),
      s(x, 0.094, 0.104),
      skin
    )
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.044 * k, 0.008 * k, 0.008 * k),
      ink
    )
    brow.position.copy(s(x, 0.135, 0.103))
    head.add(brow)
    return { ball, pupil, lid, brow, x }
  }
  const eyes = [eye(0.038), eye(-0.038)]
  const nose = ellipsoid(head, s(0.009, 0.015, 0.012), s(0, 0.08, 0.108), skin)
  nose.castShadow = false
  const mouth = ellipsoid(head, s(0.028, 0.004, 0.006), s(0, 0.043, 0.098), ink)

  addHair(head, look, k, hair)

  // Arms.
  const arm = (side: "left" | "right", sign: number) => {
    const shoulder = bone(`${side}Shoulder`, upperChest, sign * 0.03, 0.09)
    const upper = bone(
      `${side}UpperArm`,
      shoulder,
      sign * (m.shoulder - 0.03),
      0
    )
    const lower = bone(`${side}LowerArm`, upper, sign * 0.27, 0)
    const hand = bone(`${side}Hand`, lower, sign * 0.25, 0)
    const r = 0.043 * m.limb * k
    ellipsoid(
      upper,
      s(0.06 * m.limb, 0.058 * m.limb, 0.06 * m.limb),
      s(sign * 0.01, 0),
      top
    )
    limb(upper, s(sign * 0.27, 0), r * 1.06, top, r * 0.92)
    limb(lower, s(sign * 0.25, 0), r * 0.9, top, r * 0.64)
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.085 * k, 0.026 * k, 0.082 * k),
      skin
    )
    palm.position.copy(s(sign * 0.045, 0))
    hand.add(palm)
    addFingers(bone, hand, side, sign, k, skin, limb)
  }
  arm("left", 1)
  arm("right", -1)

  // Legs.
  const leg = (side: "left" | "right", sign: number) => {
    const upper = bone(`${side}UpperLeg`, hips, sign * m.hip, -0.05)
    const lower = bone(`${side}LowerLeg`, upper, 0, -0.42)
    const foot = bone(`${side}Foot`, lower, 0, -0.41)
    bone(`${side}Toes`, foot, 0, -0.04, 0.13)
    const r = 0.073 * m.limb * k
    limb(upper, s(0, -0.42), r, bottom, r * 0.72)
    limb(lower, s(0, -0.41), r * 0.72, bottom, r * 0.5)
    const shoe = ellipsoid(
      foot,
      s(0.052, 0.046, 0.128),
      s(0, -0.04, 0.066),
      shoes
    )
    shoe.castShadow = true
  }
  leg("left", 1)
  leg("right", -1)

  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = node.material !== ink && node.material !== white
      node.receiveShadow = true
    }
  })
  bones.set("root", root)

  const browBase = eyes.map((e) => e.brow.position.y)
  const mouthY = mouth.position.y
  let gaze: [number, number] = [0, 0]
  let open = 1

  const placePupils = () => {
    for (const e of eyes) {
      e.pupil.position.x = (e.x + (gaze[0] / 40) * 0.012) * k
      e.pupil.position.y = (0.108 + (gaze[1] / 40) * 0.008) * k
      e.pupil.scale.y = Math.max(0.0005, 0.011 * k * open)
    }
  }

  return {
    root,
    bone: (name) => bones.get(name) ?? null,
    setExpression(w) {
      const happy = w.happy ?? 0
      const angry = w.angry ?? 0
      const sad = w.sad ?? 0
      const surprised = w.surprised ?? 0
      const relaxed = w.relaxed ?? 0
      const blink = w.blink ?? 0
      const aa = w.aa ?? 0
      const oh = w.oh ?? 0
      open = Math.max(
        0.02,
        1 - Math.min(1, blink + happy * 0.35 + relaxed * 0.28) + surprised * 0.4
      )
      eyes.forEach((e, i) => {
        const sign = i === 0 ? 1 : -1
        e.ball.scale.y = Math.max(0.0015, 0.014 * k * open)
        e.lid.position.y = (0.094 + 0.014 * (1 - open)) * k
        e.lid.scale.x = (0.021 + 0.004 * (1 - open)) * k
        e.brow.position.y =
          browBase[i]! + (surprised * 0.018 - angry * 0.012) * k
        e.brow.rotation.z = sign * (sad * 0.45 - angry * 0.55)
      })
      mouth.scale.x = (0.028 + happy * 0.016 - oh * 0.012) * k
      mouth.scale.y = (0.004 + aa * 0.022 + oh * 0.018 + surprised * 0.006) * k
      mouth.position.y = mouthY + (happy * 0.004 - sad * 0.006 - aa * 0.006) * k
      placePupils()
    },
    setGaze(yaw, pitch) {
      gaze = [yaw, pitch]
      placePupils()
    },
    update() {},
    dispose() {
      root.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose()
      })
      for (const mat of materials) mat.dispose()
    },
  }
}

function addFingers(
  bone: (
    name: string,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z?: number
  ) => THREE.Object3D,
  hand: THREE.Object3D,
  side: "left" | "right",
  sign: number,
  k: number,
  skin: THREE.Material,
  capsule: typeof limb
) {
  const lengths: Record<Finger, number> = {
    Thumb: 0.03,
    Index: 0.03,
    Middle: 0.033,
    Ring: 0.03,
    Little: 0.024,
  }
  const offsets: Record<Finger, number> = {
    Thumb: 0.05,
    Index: 0.03,
    Middle: 0.01,
    Ring: -0.01,
    Little: -0.03,
  }
  for (const finger of FINGERS) {
    const length = lengths[finger]
    const start = finger === "Thumb" ? 0.03 : 0.086
    const names =
      finger === "Thumb"
        ? ["Metacarpal", "Proximal", "Distal"]
        : ["Proximal", "Intermediate", "Distal"]
    let parent = bone(
      `${side}${finger}${names[0]}`,
      hand,
      sign * start,
      finger === "Thumb" ? -0.006 : 0,
      offsets[finger]
    )
    names.forEach((name, i) => {
      if (i > 0)
        parent = bone(`${side}${finger}${name}`, parent, sign * length, 0)
      capsule(parent, v(sign * length * k, 0, 0), 0.0085 * k, skin)
    })
  }
}

function addHair(
  head: THREE.Object3D,
  look: FigureLook,
  k: number,
  mat: THREE.Material
) {
  const s = (x: number, y: number, z = 0) => v(x * k, y * k, z * k)
  switch (look.hairStyle) {
    case "none":
      return
    case "short":
      ellipsoid(head, s(0.106, 0.1, 0.116), s(0, 0.145, -0.012), mat)
      return
    case "bob":
      ellipsoid(head, s(0.112, 0.112, 0.122), s(0, 0.128, -0.018), mat)
      ellipsoid(head, s(0.116, 0.1, 0.096), s(0, 0.056, -0.052), mat)
      return
    case "long":
      ellipsoid(head, s(0.11, 0.108, 0.12), s(0, 0.138, -0.014), mat)
      ellipsoid(head, s(0.112, 0.24, 0.07), s(0, -0.05, -0.08), mat)
      return
    case "spiky": {
      ellipsoid(head, s(0.104, 0.08, 0.112), s(0, 0.158, -0.012), mat)
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.034 * k, 0.11 * k, 7),
          mat
        )
        spike.position.copy(
          s(Math.cos(angle) * 0.07, 0.205, Math.sin(angle) * 0.07 - 0.01)
        )
        spike.rotation.set(Math.sin(angle) * 0.6, 0, -Math.cos(angle) * 0.6)
        head.add(spike)
      }
    }
  }
}

const NO_POSE = new THREE.Quaternion()

// Puts a stored pose on a rig: bones it doesn't mention go back to rest.
export function applyPose(rig: Rig, pose: HumanPose, names: Iterable<string>) {
  for (const name of names) {
    const node = rig.bone(name)
    if (!node) continue
    const q = pose[name]
    if (q) node.quaternion.set(q[0], q[1], q[2], q[3])
    else node.quaternion.copy(NO_POSE)
  }
}

export const HUMAN_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  ...(["left", "right"] as const).flatMap((side) => [
    `${side}Shoulder`,
    `${side}UpperArm`,
    `${side}LowerArm`,
    `${side}Hand`,
    `${side}UpperLeg`,
    `${side}LowerLeg`,
    `${side}Foot`,
    `${side}Toes`,
    `${side}ThumbMetacarpal`,
    `${side}ThumbProximal`,
    `${side}ThumbDistal`,
    ...(["Index", "Middle", "Ring", "Little"] as const).flatMap((f) => [
      `${side}${f}Proximal`,
      `${side}${f}Intermediate`,
      `${side}${f}Distal`,
    ]),
  ]),
]

// Rotatable joints with a handle in the viewport, besides the IK hands and feet.
export const JOINT_HANDLES = [
  "head",
  "neck",
  "chest",
  "spine",
  "hips",
  "leftShoulder",
  "rightShoulder",
  "leftLowerArm",
  "rightLowerArm",
  "leftLowerLeg",
  "rightLowerLeg",
]
