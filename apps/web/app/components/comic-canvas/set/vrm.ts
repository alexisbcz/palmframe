import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm"

import type { Rig } from "./rig"

const shadows = (root: THREE.Object3D) =>
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true
      node.receiveShadow = true
      node.frustumCulled = false
    }
  })

function freeMemory(root: THREE.Object3D) {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    node.geometry.dispose()
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material]
    for (const m of materials) {
      for (const value of Object.values(m))
        if (value instanceof THREE.Texture) value.dispose()
      m.dispose()
    }
  })
}

// The VRM names our shared expression keys map to, across VRM 0 and 1.
const NAMES: Record<string, string[]> = {
  happy: ["happy", "joy"],
  angry: ["angry"],
  sad: ["sad", "sorrow"],
  relaxed: ["relaxed", "fun"],
  surprised: ["surprised"],
  blink: ["blink"],
  aa: ["aa", "a"],
  oh: ["oh", "o"],
}

function vrmRig(vrm: VRM): Rig {
  const manager = vrm.expressionManager
  const known = new Set(Object.keys(manager?.expressionMap ?? {}).map((n) => n))
  const resolved = Object.fromEntries(
    Object.entries(NAMES).map(([key, names]) => [
      key,
      names.find((n) => known.has(n)) ?? null,
    ])
  )
  return {
    root: vrm.scene,
    bone: (name) =>
      vrm.humanoid.getNormalizedBoneNode(
        name as Parameters<typeof vrm.humanoid.getNormalizedBoneNode>[0]
      ),
    setExpression(weights) {
      for (const [key, name] of Object.entries(resolved))
        if (name) manager?.setValue(name, weights[key] ?? 0)
    },
    setGaze(yaw, pitch) {
      if (!vrm.lookAt) return
      vrm.lookAt.yaw = yaw
      vrm.lookAt.pitch = pitch
    },
    update() {
      vrm.update(0)
    },
    dispose() {
      freeMemory(vrm.scene)
    },
  }
}

// Only `.vrm` files carry a skeleton the pose library can drive.
export async function loadVrm(bytes: ArrayBuffer): Promise<Rig> {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.parseAsync(bytes, "")
  const vrm = gltf.userData.vrm as VRM | undefined
  if (!vrm) throw new Error("Not a VRM")
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.rotateVRM0(vrm)
  vrm.humanoid.autoUpdateHumanBones = true
  shadows(vrm.scene)
  return vrmRig(vrm)
}

export async function loadGlb(bytes: ArrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(bytes, "")
  const root = gltf.scene
  shadows(root)
  // Sit the model on the floor at a sensible size, whatever units it came in.
  const bounds = new THREE.Box3().setFromObject(root)
  const size = bounds.getSize(new THREE.Vector3())
  const tallest = Math.max(size.x, size.y, size.z)
  if (tallest > 0 && (tallest > 6 || tallest < 0.1)) {
    root.scale.multiplyScalar(2 / tallest)
    bounds.setFromObject(root)
  }
  root.position.y -= bounds.min.y
  const holder = new THREE.Group()
  holder.add(root)
  return { root: holder, dispose: () => freeMemory(root) }
}
