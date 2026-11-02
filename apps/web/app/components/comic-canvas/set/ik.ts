import { Quaternion, Vector3, type Object3D } from "three"

// Analytic two-bone IK: places `end` (a wrist or an ankle) on `target` by
// turning `upper` and `lower`, keeping the joint bent towards where it already
// points so an elbow never flips. `hint` only matters on a straight limb.
export function solveLimb(
  upper: Object3D,
  lower: Object3D,
  end: Object3D,
  target: Vector3,
  hint: Vector3
) {
  upper.updateWorldMatrix(true, true)
  const a = upper.getWorldPosition(new Vector3())
  const b = lower.getWorldPosition(new Vector3())
  const c = end.getWorldPosition(new Vector3())
  const upperLength = a.distanceTo(b)
  const lowerLength = b.distanceTo(c)
  const toTarget = target.clone().sub(a)
  const shortest = Math.abs(upperLength - lowerLength) + 1e-3
  const longest = (upperLength + lowerLength) * 0.999
  const reach = Math.min(longest, Math.max(shortest, toTarget.length()))
  const direction = toTarget.normalize()

  // Where the joint leans, kept perpendicular to the limb's new direction.
  const lean = b.clone().sub(a.clone().add(c).multiplyScalar(0.5))
  if (lean.length() < 1e-3) lean.copy(hint)
  lean.addScaledVector(direction, -lean.dot(direction))
  if (lean.length() < 1e-4) {
    lean.copy(hint).addScaledVector(direction, -hint.dot(direction))
  }
  lean.normalize()

  const cos =
    (upperLength ** 2 + reach ** 2 - lowerLength ** 2) /
    (2 * upperLength * reach)
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos))
  const joint = a
    .clone()
    .addScaledVector(direction, upperLength * cos)
    .addScaledVector(lean, upperLength * sin)

  aim(upper, b.clone().sub(a), joint.clone().sub(a))
  const newEnd = end.getWorldPosition(new Vector3())
  const pivot = lower.getWorldPosition(new Vector3())
  aim(
    lower,
    newEnd.sub(pivot),
    a.clone().addScaledVector(direction, reach).sub(pivot)
  )
}

// Turns a bone in world space so that `from` comes to point along `to`.
function aim(bone: Object3D, from: Vector3, to: Vector3) {
  const turn = new Quaternion().setFromUnitVectors(
    from.clone().normalize(),
    to.clone().normalize()
  )
  const world = bone.getWorldQuaternion(new Quaternion())
  const parent = new Quaternion()
  bone.parent?.getWorldQuaternion(parent)
  bone.quaternion.copy(parent.invert().multiply(turn).multiply(world))
  bone.updateWorldMatrix(false, true)
}

export const LIMBS = {
  leftHand: {
    bones: ["leftUpperArm", "leftLowerArm", "leftHand"],
    hint: [0, 0, -1],
  },
  rightHand: {
    bones: ["rightUpperArm", "rightLowerArm", "rightHand"],
    hint: [0, 0, -1],
  },
  leftFoot: {
    bones: ["leftUpperLeg", "leftLowerLeg", "leftFoot"],
    hint: [0, 0, 1],
  },
  rightFoot: {
    bones: ["rightUpperLeg", "rightLowerLeg", "rightFoot"],
    hint: [0, 0, 1],
  },
} as const

export type LimbId = keyof typeof LIMBS
export const LIMB_IDS = Object.keys(LIMBS) as LimbId[]
