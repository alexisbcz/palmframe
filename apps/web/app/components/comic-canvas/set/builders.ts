import * as THREE from "three"

import type { PropId, StageId } from "./scene"

// Every prop and stage is built from code: no asset to host or license, and
// the ink shader reads their clean silhouettes well.

type Mat = THREE.Material

const std = (color: string | number, roughness = 0.82, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })

function box(
  w: number,
  h: number,
  d: number,
  mat: Mat,
  x = 0,
  y = 0,
  z = 0,
  parent?: THREE.Object3D
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  parent?.add(mesh)
  return mesh
}

function cyl(
  top: number,
  bottom: number,
  h: number,
  mat: Mat,
  x = 0,
  y = 0,
  z = 0,
  parent?: THREE.Object3D
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(top, bottom, h, 18),
    mat
  )
  mesh.position.set(x, y, z)
  parent?.add(mesh)
  return mesh
}

function shade(group: THREE.Object3D) {
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })
  return group
}

function legs(
  g: THREE.Group,
  w: number,
  d: number,
  h: number,
  mat: Mat,
  t = 0.04
) {
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      box(t, h, t, mat, (x * (w - t)) / 2, h / 2, (z * (d - t)) / 2, g)
}

export function buildProp(id: PropId, color: string): THREE.Group {
  const g = new THREE.Group()
  const c = std(color)
  const dark = std("#26231f", 0.6)
  const metal = std("#8b8f94", 0.35, 0.7)
  const glass = std("#9fc4cf", 0.15, 0.2)
  switch (id) {
    case "chair":
      legs(g, 0.44, 0.44, 0.44, dark)
      box(0.46, 0.05, 0.46, c, 0, 0.46, 0, g)
      box(0.46, 0.46, 0.04, c, 0, 0.72, -0.21, g)
      break
    case "stool":
      cyl(0.17, 0.17, 0.05, c, 0, 0.7, 0, g)
      cyl(0.022, 0.022, 0.68, metal, 0, 0.34, 0, g)
      cyl(0.17, 0.19, 0.02, metal, 0, 0.01, 0, g)
      break
    case "table":
      legs(g, 1.3, 0.75, 0.72, dark, 0.06)
      box(1.4, 0.05, 0.85, c, 0, 0.74, 0, g)
      break
    case "desk":
      box(1.5, 0.05, 0.7, c, 0, 0.74, 0, g)
      box(0.45, 0.72, 0.62, c, 0.5, 0.36, 0, g)
      box(0.04, 0.72, 0.62, c, -0.72, 0.36, 0, g)
      for (let i = 0; i < 3; i++)
        box(0.38, 0.17, 0.01, dark, 0.5, 0.14 + i * 0.22, 0.316, g)
      break
    case "sofa":
      box(1.9, 0.26, 0.86, c, 0, 0.27, 0, g)
      box(1.9, 0.56, 0.2, c, 0, 0.62, -0.34, g)
      box(0.2, 0.42, 0.86, c, -0.95, 0.46, 0, g)
      box(0.2, 0.42, 0.86, c, 0.95, 0.46, 0, g)
      box(0.84, 0.1, 0.62, std(color), -0.43, 0.44, 0.08, g)
      box(0.84, 0.1, 0.62, std(color), 0.43, 0.44, 0.08, g)
      break
    case "bed":
      box(1.5, 0.24, 2.05, dark, 0, 0.16, 0, g)
      box(1.46, 0.2, 2, std("#d8d2c6"), 0, 0.36, 0, g)
      box(1.48, 0.1, 1.3, c, 0, 0.47, 0.36, g)
      box(0.62, 0.12, 0.38, std("#efeae0"), -0.36, 0.52, -0.76, g)
      box(0.62, 0.12, 0.38, std("#efeae0"), 0.36, 0.52, -0.76, g)
      box(1.56, 0.86, 0.06, dark, 0, 0.45, -1.05, g)
      break
    case "shelf":
      for (let i = 0; i < 5; i++)
        box(0.9, 0.03, 0.3, c, 0, 0.02 + i * 0.44, 0, g)
      box(0.03, 1.8, 0.3, c, -0.45, 0.9, 0, g)
      box(0.03, 1.8, 0.3, c, 0.45, 0.9, 0, g)
      box(0.9, 1.8, 0.02, dark, 0, 0.9, -0.15, g)
      for (let shelf = 0; shelf < 4; shelf++)
        for (let i = 0; i < 9; i++) {
          if ((i * 7 + shelf * 3) % 5 === 0) continue
          const h = 0.24 + ((i * 13 + shelf) % 7) * 0.015
          box(
            0.06,
            h,
            0.2,
            std(["#7a3b34", "#35586b", "#c3a76f", "#3d5240"][(i + shelf) % 4]!),
            -0.36 + i * 0.09,
            0.04 + shelf * 0.44 + h / 2,
            0,
            g
          )
        }
      break
    case "door":
      box(0.92, 2.04, 0.05, c, 0, 1.02, 0, g)
      box(0.08, 2.12, 0.1, dark, -0.5, 1.06, 0, g)
      box(0.08, 2.12, 0.1, dark, 0.5, 1.06, 0, g)
      box(1.08, 0.08, 0.1, dark, 0, 2.14, 0, g)
      cyl(0.03, 0.03, 0.05, metal, 0.36, 1, 0.05, g).rotateX(Math.PI / 2)
      break
    case "window":
      box(1.4, 1.4, 0.03, glass, 0, 1.5, 0, g)
      box(1.5, 0.07, 0.1, dark, 0, 0.8, 0, g)
      box(1.5, 0.07, 0.1, dark, 0, 2.2, 0, g)
      box(0.07, 1.47, 0.1, dark, -0.72, 1.5, 0, g)
      box(0.07, 1.47, 0.1, dark, 0.72, 1.5, 0, g)
      box(0.04, 1.4, 0.06, dark, 0, 1.5, 0, g)
      box(1.4, 0.04, 0.06, dark, 0, 1.5, 0, g)
      break
    case "crate":
      box(0.8, 0.8, 0.8, c, 0, 0.4, 0, g)
      for (const y of [0.04, 0.76]) {
        box(0.84, 0.08, 0.84, dark, 0, y, 0, g)
      }
      break
    case "barrel":
      cyl(0.3, 0.3, 0.9, c, 0, 0.45, 0, g)
      cyl(0.31, 0.31, 0.04, metal, 0, 0.2, 0, g)
      cyl(0.31, 0.31, 0.04, metal, 0, 0.7, 0, g)
      break
    case "bin":
      cyl(0.27, 0.22, 0.75, metal, 0, 0.375, 0, g)
      cyl(0.29, 0.29, 0.06, metal, 0, 0.78, 0, g)
      break
    case "lamppost": {
      cyl(0.05, 0.08, 4.2, dark, 0, 2.1, 0, g)
      box(0.7, 0.05, 0.05, dark, 0.34, 4.15, 0, g)
      const bulb = new THREE.MeshStandardMaterial({
        color: "#fff0c4",
        emissive: "#ffcf78",
        emissiveIntensity: 1.6,
      })
      box(0.34, 0.1, 0.18, bulb, 0.62, 4.08, 0, g)
      const glow = new THREE.PointLight("#ffd08a", 42, 16, 1.5)
      glow.position.set(0.62, 3.9, 0.1)
      g.add(glow)
      break
    }
    case "car":
      box(4.2, 0.55, 1.75, c, 0, 0.55, 0, g)
      box(2.2, 0.56, 1.58, c, -0.25, 1.1, 0, g)
      box(2.26, 0.4, 1.62, glass, -0.25, 1.1, 0, g)
      for (const x of [-1.36, 1.36])
        for (const z of [-0.84, 0.84])
          cyl(0.34, 0.34, 0.24, dark, x, 0.34, z, g).rotateX(Math.PI / 2)
      break
    case "tree": {
      cyl(0.13, 0.22, 2.2, std("#4d3a2b"), 0, 1.1, 0, g)
      const leaf = std(color === "#8b7a68" ? "#3d5a35" : color)
      for (const [y, r] of [
        [2.4, 1.3],
        [3.3, 1],
        [4.1, 0.7],
      ] as const) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.6, 12), leaf)
        cone.position.y = y
        g.add(cone)
      }
      break
    }
    case "bottle":
      cyl(0.035, 0.035, 0.18, c, 0, 0.09, 0, g)
      cyl(0.012, 0.033, 0.06, c, 0, 0.21, 0, g)
      cyl(0.013, 0.013, 0.05, c, 0, 0.265, 0, g)
      break
    case "mug":
      cyl(0.04, 0.04, 0.09, c, 0, 0.045, 0, g)
      g.add(
        new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 16), c)
          .translateX(0.05)
          .translateY(0.045)
      )
      break
    case "laptop": {
      box(0.34, 0.016, 0.24, dark, 0, 0.008, 0, g)
      const lid = new THREE.Group()
      lid.position.set(0, 0.016, -0.12)
      lid.rotation.x = -0.28
      box(0.34, 0.23, 0.01, dark, 0, 0.115, 0, lid)
      box(0.31, 0.2, 0.002, std("#a7c9dd", 0.3), 0, 0.115, 0.006, lid)
      g.add(lid)
      break
    }
    case "phone":
      box(0.075, 0.15, 0.009, dark, 0, 0.075, 0, g)
      box(0.067, 0.14, 0.002, std("#9cc1d6", 0.2), 0, 0.075, 0.0055, g)
      break
    case "book":
      box(0.17, 0.03, 0.23, c, 0, 0.015, 0, g)
      box(0.16, 0.022, 0.222, std("#ece5d6"), 0.006, 0.015, 0, g)
      break
    case "umbrella": {
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(0.62, 0.3, 8, 1, true),
        std(color === "#8b7a68" ? "#1d1d22" : color)
      )
      ;(canopy.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
      canopy.position.y = 0.9
      g.add(canopy)
      cyl(0.008, 0.008, 1, dark, 0, 0.55, 0, g)
      break
    }
    case "bag":
      box(0.36, 0.28, 0.14, c, 0, 0.16, 0, g)
      g.add(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.09, 0.012, 8, 20, Math.PI),
          dark
        ).translateY(0.3)
      )
      break
    case "sword":
      box(0.05, 0.9, 0.008, metal, 0, 0.62, 0, g)
      box(0.2, 0.025, 0.03, dark, 0, 0.17, 0, g)
      box(0.03, 0.16, 0.03, c, 0, 0.08, 0, g)
      break
    case "wall":
      box(3, 2.6, 0.14, c, 0, 1.3, 0, g)
      break
    case "floor":
      box(3, 0.06, 3, c, 0, 0.03, 0, g)
      break
    case "box":
      box(1, 1, 1, c, 0, 0.5, 0, g)
      break
    case "stairs":
      for (let i = 0; i < 9; i++)
        box(1.2, (i + 1) * 0.18, 0.28, c, 0, ((i + 1) * 0.18) / 2, -i * 0.28, g)
      break
    case "pillar":
      cyl(0.22, 0.22, 2.8, c, 0, 1.4, 0, g)
      break
  }
  return shade(g) as THREE.Group
}

// Procedural surfaces: drawn once on a canvas and tiled.
function surface(
  size: number,
  repeat: [number, number],
  draw: (ctx: CanvasRenderingContext2D, size: number) => void
) {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  draw(canvas.getContext("2d")!, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(...repeat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88 })
}

// Reproducible noise, so a stage looks the same each time it's opened.
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

const brick = (repeat: [number, number], base = "#7c4436") =>
  surface(512, repeat, (ctx, n) => {
    const r = seeded(11)
    ctx.fillStyle = "#3b332e"
    ctx.fillRect(0, 0, n, n)
    const rows = 12
    const h = n / rows
    for (let y = 0; y < rows; y++)
      for (let x = -1; x < 7; x++) {
        const shade = 0.82 + r() * 0.3
        ctx.fillStyle = base
        ctx.globalAlpha = 1
        ctx.fillRect(
          x * (n / 6) + (y % 2) * (n / 12) + 2,
          y * h + 2,
          n / 6 - 4,
          h - 4
        )
        ctx.fillStyle = shade > 1 ? "#ffffff" : "#000000"
        ctx.globalAlpha = Math.abs(shade - 1) * 0.6
        ctx.fillRect(
          x * (n / 6) + (y % 2) * (n / 12) + 2,
          y * h + 2,
          n / 6 - 4,
          h - 4
        )
        ctx.globalAlpha = 1
      }
  })

const planks = (repeat: [number, number], base = "#7d5a3d") =>
  surface(512, repeat, (ctx, n) => {
    const r = seeded(29)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, n, n)
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(0,0,0,${r() * 0.22})`
      ctx.fillRect(0, (i * n) / 8, n, n / 8)
      ctx.fillStyle = "rgba(0,0,0,.55)"
      ctx.fillRect(0, (i * n) / 8, n, 2)
    }
  })

const asphalt = (repeat: [number, number], base = "#34363a") =>
  surface(512, repeat, (ctx, n) => {
    const r = seeded(7)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, n, n)
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${r() * 0.14})`
      ctx.fillRect(r() * n, r() * n, 2, 2)
    }
  })

const facade = (lit: number, base: string) =>
  surface(512, [1, 1], (ctx, n) => {
    const r = seeded(lit * 100 + 3)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, n, n)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 6; x++) {
        ctx.fillStyle = r() < lit ? "#f0c978" : "#1b2026"
        ctx.fillRect(14 + (x * n) / 6, 12 + (y * n) / 8, n / 6 - 28, n / 8 - 26)
      }
  })

function plane(w: number, d: number, mat: Mat, parent: THREE.Object3D, y = 0) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = y
  parent.add(floor)
  return floor
}

function put(
  parent: THREE.Object3D,
  id: PropId,
  color: string,
  x: number,
  z: number,
  ry = 0,
  y = 0
) {
  const prop = buildProp(id, color)
  prop.position.set(x, y, z)
  prop.rotation.y = ry
  parent.add(prop)
  return prop
}

function room(
  g: THREE.Group,
  floorMat: Mat,
  backMat: Mat,
  sideMat: Mat,
  w = 8,
  d = 7,
  h = 3
) {
  plane(w, d, floorMat, g)
  box(w, h, 0.2, backMat, 0, h / 2, -d / 2, g)
  box(0.2, h, d, sideMat, -w / 2, h / 2, 0, g)
  box(0.2, h, d, sideMat, w / 2, h / 2, 0, g)
}

export function buildStage(id: StageId, tint: string | null): THREE.Group {
  const g = new THREE.Group()
  switch (id) {
    case "empty":
      plane(60, 60, std(tint ?? "#b9bcc0", 0.95), g)
      break
    case "apartment": {
      const wall = std(tint ?? "#d5d0c0")
      room(g, planks([5, 5]), brick([3, 1.2]), wall)
      put(g, "sofa", "#b98d78", 2.5, -2, -0.2)
      put(g, "shelf", "#5e4632", -3.6, -3.1)
      put(g, "desk", "#a87a4d", 0.4, -3)
      put(g, "chair", "#a15a3c", 0.4, -2.4, Math.PI)
      put(g, "laptop", "#222222", 0.3, -3.05, 0, 0.765)
      put(g, "mug", "#c13f3f", 0.8, -2.85, 0, 0.765)
      const window = put(g, "window", "#111111", -1.8, -3.38)
      window.scale.setScalar(1.05)
      break
    }
    case "street": {
      plane(60, 60, asphalt([10, 10]), g)
      box(60, 0.16, 3, std("#7a7a78"), 0, 0.08, -4.6, g)
      box(60, 0.16, 3, std("#7a7a78"), 0, 0.08, 6, g)
      for (let i = -3; i <= 3; i++)
        box(1.8, 0.01, 0.14, std("#d7d3c6"), i * 4.2, 0.01, 0.7, g)
      const r = seeded(5)
      for (let i = 0; i < 7; i++) {
        const h = 9 + r() * 12
        const w = 6 + r() * 3
        box(
          w,
          h,
          6,
          facade(0.2 + r() * 0.5, ["#4b3b36", "#3a4048", "#5a4c3f"][i % 3]!),
          -21 + i * 7,
          h / 2,
          -9,
          g
        )
      }
      put(g, "lamppost", "#222222", -4, -3.8)
      put(g, "lamppost", "#222222", 6, -3.8)
      put(g, "car", "#7b2a27", 3.5, -2)
      put(g, "bin", "#555555", -1.6, -4, 0, 0.16)
      break
    }
    case "alley": {
      plane(8, 40, asphalt([3, 12], "#2d2e30"), g)
      box(0.4, 12, 40, brick([12, 3.6], "#5a3a31"), -4, 6, 0, g)
      box(0.4, 12, 40, brick([12, 3.6], "#46362f"), 4, 6, 0, g)
      box(8, 12, 0.4, brick([3, 3.6], "#3d3a38"), 0, 6, -12, g)
      put(g, "bin", "#3f4a44", -3, -2)
      put(g, "bin", "#3f4a44", -3.1, -1.2)
      put(g, "crate", "#6b5439", 3, -3.2, 0.3)
      put(g, "crate", "#6b5439", 3.1, -4.3, -0.2)
      put(g, "door", "#40423f", 3.76, -0.8, -Math.PI / 2)
      box(1.3, 0.05, 0.9, std("#25272a"), -3.3, 3, -5, g)
      break
    }
    case "rooftop": {
      plane(14, 14, asphalt([4, 4], "#4b4a48"), g)
      for (const [w, d, x, z] of [
        [14, 0.3, 0, -7],
        [14, 0.3, 0, 7],
        [0.3, 14, -7, 0],
        [0.3, 14, 7, 0],
      ] as const)
        box(w, 0.9, d, std(tint ?? "#7a7875"), x, 0.45, z, g)
      box(2.4, 2.6, 2.4, std("#68625c"), -4, 1.3, -4, g)
      put(g, "door", "#3d3f43", -4, -2.77)
      box(1.4, 0.9, 1.4, std("#8e9092", 0.4, 0.5), 4, 0.45, -4, g)
      cyl(0.8, 0.8, 2, std("#64493a"), 4.5, 3.1, 4.6, g)
      for (const [x, z] of [
        [3.9, 4],
        [5.1, 4],
        [3.9, 5.2],
        [5.1, 5.2],
      ] as const)
        box(0.08, 2.1, 0.08, std("#2b2b2b"), x, 1.05, z, g)
      const r = seeded(19)
      for (let i = 0; i < 14; i++) {
        const h = 14 + r() * 26
        box(
          7,
          h,
          7,
          facade(0.35, "#3b4250"),
          -40 + i * 7 + r() * 2,
          h / 2 - 22,
          -24 - r() * 12,
          g
        )
      }
      break
    }
    case "bar": {
      room(
        g,
        planks([5, 5], "#4a3323"),
        brick([3, 1.2], "#4f2f28"),
        std(tint ?? "#37302b"),
        9,
        7,
        3.2
      )
      box(5, 1.05, 0.7, std("#4f3423"), 0, 0.53, -1.8, g)
      box(5.2, 0.06, 0.82, std("#2a1c13", 0.4), 0, 1.08, -1.8, g)
      box(5, 0.04, 0.32, std("#3a2a1f"), 0, 1.65, -3.2, g)
      box(5, 0.04, 0.32, std("#3a2a1f"), 0, 2.15, -3.2, g)
      for (let i = 0; i < 16; i++)
        put(
          g,
          "bottle",
          ["#35573b", "#7c5a2c", "#8a2e2e", "#c9c3b0"][i % 4]!,
          -2.2 + (i % 8) * 0.62,
          -3.2,
          0,
          i < 8 ? 1.67 : 2.17
        )
      for (let i = 0; i < 5; i++) put(g, "stool", "#6d2d29", -2 + i, -0.95)
      put(g, "mug", "#c7bda8", 0.4, -1.75, 0, 1.11)
      for (const x of [-2.4, 0, 2.4]) {
        cyl(0.16, 0.2, 0.14, std("#22201d", 0.5), x, 2.5, -1.2, g)
        const pendant = new THREE.PointLight("#ffbd7a", 11, 8, 1.6)
        pendant.position.set(x, 2.35, -1.2)
        g.add(pendant)
      }
      break
    }
    case "classroom": {
      room(
        g,
        planks([6, 6], "#a58660"),
        std(tint ?? "#dcd8c5"),
        std(tint ?? "#d3cfbc"),
        9,
        8
      )
      box(3.6, 1.2, 0.05, std("#23433a"), 0, 1.6, -3.87, g)
      box(3.8, 0.05, 0.1, std("#8c7050"), 0, 0.97, -3.84, g)
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 4; col++) {
          const x = -2.7 + col * 1.8
          const z = -1.6 + row * 1.6
          const desk = put(g, "table", "#b99a70", x, z)
          desk.scale.set(0.5, 1, 0.65)
          put(g, "chair", "#58656e", x, z + 0.55, Math.PI)
        }
      put(g, "window", "#2a2a2a", -4.42, -1, Math.PI / 2)
      put(g, "window", "#2a2a2a", -4.42, 2, Math.PI / 2)
      break
    }
    case "office": {
      room(
        g,
        std("#6c7178"),
        std(tint ?? "#c8c8c2"),
        std(tint ?? "#bdbdb6"),
        9,
        8
      )
      for (const x of [-3, -1, 1, 3]) {
        put(g, "window", "#222222", x * 1.05, -3.87).scale.set(1.3, 1.3, 1)
      }
      for (const [x, z] of [
        [-2.6, -1.4],
        [2.6, -1.4],
        [-2.6, 1.6],
        [2.6, 1.6],
      ] as const) {
        put(g, "desk", "#d0ccc1", x, z)
        put(g, "chair", "#2f3338", x, z + 0.65, Math.PI)
        put(g, "laptop", "#222222", x, z, 0, 0.765)
      }
      put(g, "pillar", "#a9a9a2", 0, 0)
      break
    }
    case "forest": {
      plane(
        70,
        70,
        surface(512, [12, 12], (ctx, n) => {
          const r = seeded(13)
          ctx.fillStyle = "#3f4a2c"
          ctx.fillRect(0, 0, n, n)
          for (let i = 0; i < 3000; i++) {
            ctx.fillStyle = ["#2f3a22", "#505a33", "#5b4c33"][
              Math.floor(r() * 3)
            ]!
            ctx.fillRect(r() * n, r() * n, 3, 3)
          }
        }),
        g
      )
      const r = seeded(23)
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2
        const d = 3.4 + r() * 22
        const tree = put(
          g,
          "tree",
          tint ?? "#3a5733",
          Math.cos(a) * d,
          Math.sin(a) * d - 3,
          r() * 6
        )
        tree.scale.setScalar(0.9 + r() * 1.1)
      }
      break
    }
  }
  return shade(g) as THREE.Group
}

// The sky a stage suits, for a scene that switches to it.
export const STAGE_MOODS: Record<
  StageId,
  {
    background: string
    ambient: number
    sun: number
    sunColor: string
    pitch: number
    yaw: number
    fog: number
  }
> = {
  empty: {
    background: "#d6d9dc",
    ambient: 0.85,
    sun: 1.7,
    sunColor: "#ffffff",
    pitch: 50,
    yaw: 30,
    fog: 0,
  },
  apartment: {
    background: "#c7d0d6",
    ambient: 0.8,
    sun: 1.7,
    sunColor: "#fff3e0",
    pitch: 52,
    yaw: 25,
    fog: 0,
  },
  street: {
    background: "#1c2436",
    ambient: 1,
    sun: 1.1,
    sunColor: "#9eb6d9",
    pitch: 40,
    yaw: -40,
    fog: 0.02,
  },
  alley: {
    background: "#232731",
    ambient: 1,
    sun: 1.2,
    sunColor: "#c6b28e",
    pitch: 66,
    yaw: 20,
    fog: 0.03,
  },
  rooftop: {
    background: "#d98a5e",
    ambient: 0.6,
    sun: 2.3,
    sunColor: "#ffc68a",
    pitch: 16,
    yaw: -55,
    fog: 0.008,
  },
  bar: {
    background: "#100c09",
    ambient: 0.85,
    sun: 0.7,
    sunColor: "#ffb872",
    pitch: 62,
    yaw: 15,
    fog: 0,
  },
  classroom: {
    background: "#bcd4e6",
    ambient: 0.9,
    sun: 1.6,
    sunColor: "#fff5e4",
    pitch: 38,
    yaw: -68,
    fog: 0,
  },
  office: {
    background: "#dfe7ec",
    ambient: 0.95,
    sun: 1.35,
    sunColor: "#ffffff",
    pitch: 60,
    yaw: 18,
    fog: 0,
  },
  forest: {
    background: "#a7bfae",
    ambient: 0.62,
    sun: 1.8,
    sunColor: "#fbf0cf",
    pitch: 58,
    yaw: 45,
    fog: 0.035,
  },
}
