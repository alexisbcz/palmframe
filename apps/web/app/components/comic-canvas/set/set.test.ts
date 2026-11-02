import { describe, expect, test } from "bun:test"
import * as THREE from "three"

import { solveLimb } from "./ik"
import {
  BODY_POSES,
  HAND_POSE_IDS,
  bodyPose,
  handPose,
  mirrorPose,
} from "./poses"
import { HUMAN_BONES, applyPose, createFigure } from "./rig"
import {
  FIGURES,
  assetsIn,
  castIn,
  cloneScene,
  createActor,
  createModel,
  createProp,
  createScene,
  uniqueName,
} from "./scene"

const world = (o: THREE.Object3D) => {
  o.updateWorldMatrix(true, false)
  return o.getWorldPosition(new THREE.Vector3())
}

const figure = () => createFigure(FIGURES[0]!)

describe("the figure", () => {
  test("has every humanoid bone a pose can name", () => {
    const rig = figure()
    expect(HUMAN_BONES.filter((b) => !rig.bone(b))).toEqual([])
  })

  test("rests in a T-pose facing +Z with its left on +X", () => {
    const rig = figure()
    expect(world(rig.bone("leftHand")!).x).toBeGreaterThan(0.4)
    expect(world(rig.bone("rightHand")!).x).toBeLessThan(-0.4)
    expect(world(rig.bone("leftToes")!).z).toBeGreaterThan(0.05)
  })
})

describe("poses", () => {
  test("each names only real bones", () => {
    const known = new Set(HUMAN_BONES)
    for (const p of BODY_POSES)
      expect(Object.keys(p.bones).filter((b) => !known.has(b))).toEqual([])
  })

  test("ids are unique", () => {
    const ids = BODY_POSES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("the standing pose lowers both arms", () => {
    const rig = figure()
    applyPose(rig, bodyPose(BODY_POSES[0]!), HUMAN_BONES)
    for (const side of ["left", "right"]) {
      const shoulder = world(rig.bone(`${side}UpperArm`)!)
      expect(world(rig.bone(`${side}Hand`)!).y).toBeLessThan(shoulder.y - 0.3)
    }
  })

  test("sitting folds the knees forward with the drop lowering the hips", () => {
    const sit = BODY_POSES.find((p) => p.id === "sit")!
    const rig = figure()
    applyPose(rig, bodyPose(sit), HUMAN_BONES)
    const knee = world(rig.bone("leftLowerLeg")!)
    const hip = world(rig.bone("leftUpperLeg")!)
    expect(knee.z).toBeGreaterThan(hip.z + 0.3)
    expect(Math.abs(knee.y - hip.y)).toBeLessThan(0.05)
    expect(sit.drop).toBeGreaterThan(0)
  })

  test("a new body pose keeps the hands' fingers", () => {
    const fist = handPose("fist", "left", {})
    const next = bodyPose(BODY_POSES[1]!, fist)
    expect(next.leftIndexProximal).toEqual(fist.leftIndexProximal!)
  })

  test("a fist curls the fingers towards the palm on both hands", () => {
    for (const [side, sign] of [
      ["left", 1],
      ["right", -1],
    ] as const) {
      const rig = figure()
      const open = world(rig.bone(`${side}IndexDistal`)!).clone()
      applyPose(rig, handPose("fist", side, {}), HUMAN_BONES)
      const shut = world(rig.bone(`${side}IndexDistal`)!)
      expect(shut.y).toBeLessThan(open.y)
      expect(shut.x * sign).toBeLessThan(open.x * sign)
    }
  })

  test("every hand pose leaves the other hand alone", () => {
    const left = handPose("fist", "left", {})
    for (const id of HAND_POSE_IDS) {
      const next = handPose(id, "right", left)
      expect(next.leftIndexProximal).toEqual(left.leftIndexProximal!)
    }
  })

  test("mirroring swaps sides and twice is the original", () => {
    const pose = bodyPose(BODY_POSES.find((p) => p.id === "wave")!)
    const mirror = mirrorPose(pose)
    expect(mirror.leftUpperArm).toBeDefined()
    const rig = figure()
    applyPose(rig, pose, HUMAN_BONES)
    const hand = world(rig.bone("rightHand")!)
    const other = figure()
    applyPose(other, mirror, HUMAN_BONES)
    const flipped = world(other.bone("leftHand")!)
    expect(flipped.x).toBeCloseTo(-hand.x, 3)
    expect(flipped.y).toBeCloseTo(hand.y, 3)
    expect(mirrorPose(mirror)).toEqual(pose)
  })
})

describe("two-bone IK", () => {
  const arm = () => {
    const rig = figure()
    applyPose(rig, bodyPose(BODY_POSES[0]!), HUMAN_BONES)
    return {
      upper: rig.bone("leftUpperArm")!,
      lower: rig.bone("leftLowerArm")!,
      hand: rig.bone("leftHand")!,
    }
  }
  const hint = new THREE.Vector3(0, 0, -1)

  test("puts the wrist on a reachable target", () => {
    const { upper, lower, hand } = arm()
    const target = world(upper).add(new THREE.Vector3(0.2, 0.2, 0.25))
    solveLimb(upper, lower, hand, target, hint)
    expect(world(hand).distanceTo(target)).toBeLessThan(1e-3)
  })

  test("keeps the limb's length", () => {
    const { upper, lower, hand } = arm()
    const before = world(lower).distanceTo(world(hand))
    const target = world(upper).add(new THREE.Vector3(-0.1, 0.3, 0.1))
    solveLimb(upper, lower, hand, target, hint)
    expect(world(lower).distanceTo(world(hand))).toBeCloseTo(before, 4)
  })

  test("stretches towards a target out of reach", () => {
    const { upper, lower, hand } = arm()
    const reach =
      world(upper).distanceTo(world(lower)) +
      world(lower).distanceTo(world(hand))
    const target = world(upper).add(new THREE.Vector3(2, 0.5, 1))
    solveLimb(upper, lower, hand, target, hint)
    expect(world(hand).distanceTo(world(upper))).toBeCloseTo(reach, 2)
    const pointing = world(hand).sub(world(upper)).normalize()
    const wanted = target.clone().sub(world(upper)).normalize()
    expect(pointing.dot(wanted)).toBeGreaterThan(0.999)
  })

  test("solves a dead-straight limb using the hint", () => {
    const rig = figure()
    const upper = rig.bone("leftUpperArm")!
    const target = world(upper).add(new THREE.Vector3(0.3, 0, 0))
    solveLimb(
      upper,
      rig.bone("leftLowerArm")!,
      rig.bone("leftHand")!,
      target,
      hint
    )
    expect(world(rig.bone("leftHand")!).distanceTo(target)).toBeLessThan(1e-3)
    expect(world(rig.bone("leftLowerArm")!).z).toBeLessThan(world(upper).z)
  })
})

describe("scenes", () => {
  test("survive JSON, as they do on a saved project", () => {
    const scene = createScene("street")
    scene.items.push(createActor(FIGURES[1]!, "Mira"))
    expect(JSON.parse(JSON.stringify(scene))).toEqual(scene)
  })

  test("a clone shares no item ids or state with its source", () => {
    const scene = createScene()
    scene.items.push(createProp("chair", "Chair"))
    const copy = cloneScene(scene)
    expect(copy.items[0]!.id).not.toBe(scene.items[0]!.id)
    copy.items[0]!.position[0] = 4
    expect(scene.items[0]!.position[0]).toBe(0)
  })

  test("names stay unique", () => {
    const items = [createProp("chair", "Chair"), createProp("chair", "Chair 2")]
    expect(uniqueName("Chair", items)).toBe("Chair 3")
    expect(uniqueName("Table", items)).toBe("Table")
  })

  test("reports the cast and the uploaded models it needs", () => {
    const scene = createScene()
    const actor = createActor(FIGURES[0]!, "A")
    actor.castId = "c1"
    actor.model = { hash: "abc", name: "a.vrm" }
    scene.items.push(
      actor,
      { ...createActor(FIGURES[0]!, "B"), castId: "c1" },
      createModel({ hash: "def", name: "b.glb" })
    )
    expect(castIn(scene)).toEqual(["c1"])
    expect(assetsIn(scene).map((a) => a.hash)).toEqual(["abc", "def"])
  })
})
