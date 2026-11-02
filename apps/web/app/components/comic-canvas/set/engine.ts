import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { TransformControls } from "three/addons/controls/TransformControls.js"

import type { ModelStore } from "./assets"
import { buildProp, buildStage } from "./builders"
import { LIMBS, LIMB_IDS, solveLimb, type LimbId } from "./ik"
import { BODY_POSES, bodyPose, quatOf } from "./poses"
import {
  HUMAN_BONES,
  JOINT_HANDLES,
  applyPose,
  createFigure,
  type Rig,
} from "./rig"
import type {
  ActorItem,
  HumanPose,
  SetCamera,
  SetItem,
  SetLook,
  SetScene,
  Transform,
  Vec3,
} from "./scene"
import { loadGlb, loadVrm } from "./vrm"

export type GizmoMode = "translate" | "rotate" | "scale"

export interface Frame {
  x: number
  y: number
  width: number
  height: number
}

interface Entry {
  item: SetItem
  // Items are compared by what would need rebuilding when they change.
  key: string
  holder: THREE.Group
  rig?: Rig
  dispose?: () => void
  // True while a model loads, so a sync doesn't start a second copy.
  pending?: boolean
}

interface Callbacks {
  select(id: string | null): void
  transform(id: string, patch: Transform): void
  pose(id: string, pose: HumanPose): void
  camera(camera: SetCamera): void
  // A model that couldn't be loaded here: the figure stands in for it.
  missing(name: string): void
}

const HANDLE = {
  ik: new THREE.MeshBasicMaterial({
    color: "#5b6cff",
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  }),
  joint: new THREE.MeshBasicMaterial({
    color: "#ffffff",
    depthTest: false,
    transparent: true,
    opacity: 0.8,
  }),
  active: new THREE.MeshBasicMaterial({
    color: "#ffb02e",
    depthTest: false,
    transparent: true,
  }),
}

const toEuler = (r: Vec3) =>
  new THREE.Euler(
    THREE.MathUtils.degToRad(r[0]),
    THREE.MathUtils.degToRad(r[1]),
    THREE.MathUtils.degToRad(r[2])
  )

const round = (n: number, by = 1e3) => Math.round(n * by) / by

// Draws outlines and the ink looks over the rendered scene. Working from
// normals and depth means imported models get the same line as built-in ones.
const INK_FRAGMENT = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float width;
  uniform int mode;
  varying vec2 vUv;

  float linear(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return 2.0 * cameraNear * cameraFar /
      (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }

  float edge(vec2 uv) {
    vec2 s = width / resolution;
    float center = linear(uv);
    vec3 normal = texture2D(tNormal, uv).xyz;
    float depth = 0.0;
    float turn = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 at = uv + vec2(cos(a), sin(a)) * s;
      float d = linear(at);
      depth = max(depth, abs(d - center));
      turn = max(turn, distance(texture2D(tNormal, at).xyz, normal));
    }
    float gap = smoothstep(0.018, 0.05, depth / max(center, 0.4));
    float crease = smoothstep(0.45, 0.8, turn);
    return max(gap, crease);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // Spotted blacks, hatching only through the midtones, paper in the lights:
  // how an inker shades, rather than a flat screen tone everywhere.
  float hatch(vec2 uv, float light) {
    vec2 px = uv * resolution;
    float scale = resolution.y / 760.0;
    float wobble = sin(px.y * 0.04 / scale) * 2.0 * scale;
    float spacing = 9.0 * scale;
    float a = step(fract((px.x + px.y * 0.6 + wobble) / spacing), 0.3);
    float b = step(fract((px.x * 0.6 - px.y + wobble) / spacing), 0.3);
    // A few lifts of the pen, so long lines don't look ruled.
    float broken = step(0.05, hash(floor(px / vec2(26.0, 5.0) / scale)));
    if (light < 0.2) return 1.0;
    if (light < 0.27) return max(a, b) * broken;
    if (light < 0.36) return a * broken;
    return 0.0;
  }

  void main() {
    vec4 color = texture2D(tColor, vUv);
    float line = edge(vUv);
    vec3 result;
    if (mode == 3) {
      result = mix(vec3(1.0), vec3(0.04), line);
    } else if (mode == 2) {
      float light = dot(pow(color.rgb, vec3(1.0 / 2.2)), vec3(0.3, 0.59, 0.11));
      result = mix(vec3(0.95, 0.93, 0.88), vec3(0.05), hatch(vUv, light));
      result = mix(result, vec3(0.04), line);
    } else if (mode == 1) {
      // Bands of brightness only: stepping each channel would shift the hue.
      vec3 base = pow(color.rgb, vec3(1.0 / 2.2));
      float light = max(dot(base, vec3(0.3, 0.59, 0.11)), 0.001);
      float band = (floor(light * 5.0) + 0.65) / 5.0;
      base = pow(base * min(band / light, 2.4), vec3(2.2));
      result = mix(base, vec3(0.012), line);
      gl_FragColor = vec4(result, 1.0);
      #include <colorspace_fragment>
      return;
    } else {
      gl_FragColor = vec4(color.rgb, 1.0);
      #include <colorspace_fragment>
      return;
    }
    gl_FragColor = vec4(result, 1.0);
  }
`

const LOOK_MODE = { clay: 0, toon: 1, ink: 2, line: 3 } as const

export class SetEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private overlay = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400)
  private orbit: OrbitControls
  private gizmo: TransformControls
  private ambient = new THREE.AmbientLight()
  private sun = new THREE.DirectionalLight()
  private stage: THREE.Group | null = null
  private stageKey = ""
  private entries = new Map<string, Entry>()
  private lastScene: SetScene | null = null
  private selected: string | null = null
  private handles = new THREE.Group()
  private handleBone = new Map<THREE.Object3D, string>()
  private grabbed: { id: string; bone: string; limb?: LimbId } | null = null
  private ikTarget = new THREE.Object3D()
  private raycaster = new THREE.Raycaster()
  private keys = new Set<string>()
  private frameId = 0
  private last = performance.now()
  private colorTarget: THREE.WebGLRenderTarget
  private normalTarget: THREE.WebGLRenderTarget
  private normalMaterial = new THREE.MeshNormalMaterial()
  private quadScene = new THREE.Scene()
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private ink: THREE.ShaderMaterial
  private disposed = false
  private size = { width: 1, height: 1 }
  private dpr = Math.min(window.devicePixelRatio, 2)
  private textures = new Map<string, THREE.Texture>()

  constructor(
    private host: HTMLElement,
    private on: Callbacks,
    private models: ModelStore
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    })
    this.renderer.autoClear = false
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.domElement.className = "block size-full touch-none"
    host.appendChild(this.renderer.domElement)

    this.colorTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    })
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1),
    })
    this.ink = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: this.normalTarget.depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: this.camera.near },
        cameraFar: { value: this.camera.far },
        width: { value: 2 },
        mode: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: INK_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    })
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ink))

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const s = this.sun.shadow.camera
    s.left = s.bottom = -14
    s.right = s.top = 14
    s.near = 1
    s.far = 90
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.02
    this.scene.add(this.ambient, this.sun, this.sun.target, this.ikTarget)
    this.overlay.add(this.handles)

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement)
    // No damping: the saved camera has to be exactly what's on screen.
    this.orbit.addEventListener("end", () => this.reportCamera())

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement)
    this.gizmo.setSize(0.8)
    this.gizmo.addEventListener("dragging-changed", (e) => {
      const dragging = Boolean(e.value)
      this.orbit.enabled = !dragging
      if (!dragging) this.finishDrag()
    })
    this.overlay.add(this.gizmo.getHelper())

    const el = this.renderer.domElement
    // In the capture phase, to stop an orbit before it starts on a handle.
    el.addEventListener("pointerdown", this.pick, true)
    // Capture phase too: the dialog stops keys reaching the editor beneath.
    window.addEventListener("keydown", this.keyDown, true)
    window.addEventListener("keyup", this.keyUp, true)
    window.addEventListener("blur", this.clearKeys)
    this.resize()
    this.frameId = requestAnimationFrame(this.tick)
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.host
    if (!width || !height) return
    this.size = { width, height }
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.setTargets(width * this.dpr, height * this.dpr)
  }

  private setTargets(w: number, h: number) {
    const width = Math.round(w)
    const height = Math.round(h)
    this.colorTarget.setSize(width, height)
    this.normalTarget.setSize(width, height)
    ;(this.ink.uniforms.resolution!.value as THREE.Vector2).set(width, height)
  }

  // Full scene sync. Cheap: only what changed gets touched.
  async sync(next: SetScene) {
    const previous = this.lastScene
    this.lastScene = next
    const stageKey = `${next.stage}|${next.stageColor}`
    if (stageKey !== this.stageKey) {
      this.stageKey = stageKey
      if (this.stage) {
        this.scene.remove(this.stage)
        disposeGroup(this.stage)
      }
      this.stage = buildStage(next.stage, next.stageColor)
      this.scene.add(this.stage)
    }
    const background = new THREE.Color(next.background)
    this.scene.background = background
    this.scene.fog = next.fog
      ? new THREE.FogExp2(background.getHex(), next.fog)
      : null

    const { light } = next
    this.ambient.color.set(light.ambientColor)
    this.ambient.intensity = light.ambient
    this.sun.color.set(light.sunColor)
    this.sun.intensity = light.sun
    const pitch = THREE.MathUtils.degToRad(light.pitch)
    const yaw = THREE.MathUtils.degToRad(light.yaw)
    this.sun.position.set(
      Math.sin(yaw) * Math.cos(pitch) * 40,
      Math.sin(pitch) * 40,
      Math.cos(yaw) * Math.cos(pitch) * 40
    )
    this.sun.castShadow = light.shadows

    const cam = next.camera
    if (!previous || !sameCamera(previous.camera, cam)) this.placeCamera(cam)

    const uniforms = this.ink.uniforms
    uniforms.mode!.value = LOOK_MODE[next.look]
    uniforms.width!.value = Math.max(0.4, next.ink)

    const ids = new Set(next.items.map((i) => i.id))
    for (const [id, entry] of this.entries)
      if (!ids.has(id)) this.removeEntry(id, entry)
    await Promise.all(next.items.map((item) => this.syncItem(item)))
    if (this.selected && !ids.has(this.selected)) this.select(null)
  }

  private placeCamera(cam: SetCamera) {
    this.camera.position.set(...cam.position)
    this.orbit.target.set(...cam.target)
    this.camera.fov = cam.fov
    this.camera.updateProjectionMatrix()
    this.orbit.update()
    this.roll = THREE.MathUtils.degToRad(cam.roll)
  }

  private itemKey(item: SetItem) {
    switch (item.kind) {
      case "actor":
        return `actor:${item.model?.hash ?? JSON.stringify(item.figure)}`
      case "prop":
        return `prop:${item.prop}:${item.color}`
      case "model":
        return `model:${item.model.hash}`
      case "image":
        return `image:${item.src.length}:${item.src.slice(-40)}`
      case "lamp":
        return "lamp"
    }
  }

  private async syncItem(item: SetItem) {
    const key = this.itemKey(item)
    let entry = this.entries.get(item.id)
    if (entry && entry.key !== key) {
      this.removeEntry(item.id, entry)
      entry = undefined
    }
    if (!entry) {
      entry = { item, key, holder: new THREE.Group() }
      entry.holder.userData.itemId = item.id
      this.scene.add(entry.holder)
      this.entries.set(item.id, entry)
      await this.build(entry)
      if (this.entries.get(item.id) !== entry) return
    } else {
      entry.item = item
    }
    // A sync may have landed while a model loaded: use the newest item.
    if (!this.isDragging(item.id)) applyTransform(entry.holder, entry.item)
    this.applyLive(entry)
  }

  private isDragging(id: string) {
    return this.gizmo.dragging && this.selected === id
  }

  private limbDragging() {
    return this.gizmo.dragging || Boolean(this.grabbed?.limb)
  }

  private async build(entry: Entry) {
    const { item, holder } = entry
    switch (item.kind) {
      case "actor": {
        entry.pending = true
        let rig: Rig | null = null
        if (item.model) {
          const bytes = await this.models
            .read(item.model.hash)
            .catch(() => null)
          if (bytes) rig = await loadVrm(bytes).catch(() => null)
          if (!rig) this.on.missing(item.model.name)
        }
        rig ??= createFigure(item.figure)
        if (this.entries.get(item.id) !== entry) {
          rig.dispose()
          return
        }
        entry.rig = rig
        entry.pending = false
        holder.add(rig.root)
        entry.dispose = () => rig.dispose()
        if (this.selected === item.id) this.showHandles()
        break
      }
      case "prop": {
        const group = buildProp(item.prop, item.color)
        holder.add(group)
        entry.dispose = () => disposeGroup(group)
        break
      }
      case "model": {
        const bytes = await this.models.read(item.model.hash).catch(() => null)
        const model = bytes ? await loadGlb(bytes).catch(() => null) : null
        if (!model) {
          this.on.missing(item.model.name)
          break
        }
        holder.add(model.root)
        entry.dispose = model.dispose
        break
      }
      case "image": {
        const texture = await this.texture(item.src)
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1, item.aspect),
          new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.05,
            side: THREE.DoubleSide,
          })
        )
        mesh.castShadow = true
        holder.add(mesh)
        entry.dispose = () => {
          mesh.geometry.dispose()
          mesh.material.dispose()
        }
        break
      }
      case "lamp": {
        const light = new THREE.PointLight(
          item.color,
          item.intensity,
          item.distance,
          1.6
        )
        light.castShadow = false
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 12, 8),
          new THREE.MeshBasicMaterial({ color: item.color })
        )
        holder.add(light, bulb)
        entry.dispose = () => {
          bulb.geometry.dispose()
          bulb.material.dispose()
        }
        break
      }
    }
  }

  private texture(src: string) {
    const known = this.textures.get(src)
    if (known) return Promise.resolve(known)
    return new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        src,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace
          this.textures.set(src, texture)
          resolve(texture)
        },
        undefined,
        reject
      )
    })
  }

  private applyLive(entry: Entry) {
    const { item, holder, rig } = entry
    if (item.kind === "actor" && rig) {
      if (!(this.grabbed?.id === item.id && this.limbDragging())) {
        applyPose(rig, item.pose, HUMAN_BONES)
        const hips = rig.bone("hips")
        const rest = hips?.userData.restY ?? hips?.position.y
        if (hips) {
          hips.userData.restY = rest
          hips.position.y = rest - item.hipsDrop
        }
      }
      rig.setExpression(item.expression)
      rig.setGaze(item.gaze[0], item.gaze[1])
      rig.update()
    }
    if (item.kind === "lamp") {
      const light = holder.children[0] as THREE.PointLight | undefined
      if (light) {
        light.color.set(item.color)
        light.intensity = item.intensity
        light.distance = item.distance
      }
    }
  }

  private removeEntry(id: string, entry: Entry) {
    if (this.selected === id) this.gizmo.detach()
    this.scene.remove(entry.holder)
    entry.dispose?.()
    this.entries.delete(id)
  }

  select(id: string | null, mode?: GizmoMode) {
    this.selected = id
    this.grabbed = null
    if (mode) this.gizmo.setMode(mode)
    const entry = id ? this.entries.get(id) : null
    if (entry) this.gizmo.attach(entry.holder)
    else this.gizmo.detach()
    this.showHandles()
  }

  setMode(mode: GizmoMode) {
    this.gizmo.setMode(mode)
  }

  private showHandles() {
    this.handles.clear()
    this.handleBone.clear()
    const entry = this.selected ? this.entries.get(this.selected) : null
    if (entry?.item.kind !== "actor" || !entry.rig) return
    const add = (bone: string, ik: boolean) => {
      if (!entry.rig?.bone(bone)) return
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(ik ? 0.03 : 0.018, 14, 10),
        ik ? HANDLE.ik : HANDLE.joint
      )
      dot.renderOrder = 10
      this.handles.add(dot)
      this.handleBone.set(dot, bone)
    }
    for (const limb of LIMB_IDS) add(limb, true)
    for (const bone of JOINT_HANDLES) add(bone, false)
  }

  private moveHandles() {
    const entry = this.selected ? this.entries.get(this.selected) : null
    if (!entry?.rig) return
    entry.holder.updateWorldMatrix(true, true)
    for (const [dot, bone] of this.handleBone) {
      entry.rig.bone(bone)?.getWorldPosition(dot.position)
      // Constant size on screen.
      const d = this.camera.position.distanceTo(dot.position)
      dot.scale.setScalar(THREE.MathUtils.clamp(d / 3.2, 0.3, 3))
      const active = this.grabbed?.bone === bone
      ;(dot as THREE.Mesh).material = active
        ? HANDLE.active
        : LIMBS[bone as LimbId]
          ? HANDLE.ik
          : HANDLE.joint
    }
  }

  private pointer(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const x = (((e.clientX - rect.left) / rect.width) * 2 - 1) * aspect
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    // Undo the drawn tilt, so clicks land where things appear.
    const cos = Math.cos(this.roll)
    const sin = Math.sin(this.roll)
    return new THREE.Vector2((x * cos - y * sin) / aspect, x * sin + y * cos)
  }

  private pick = (e: PointerEvent) => {
    if (e.button !== 0 || this.gizmo.axis) return
    this.raycaster.setFromCamera(this.pointer(e), this.camera)
    const [dot] = this.raycaster.intersectObjects(this.handles.children, false)
    if (dot) {
      this.grabBone(this.handleBone.get(dot.object)!)
      return
    }
    const roots = [...this.entries.values()].map((entry) => entry.holder)
    const [hit] = this.raycaster.intersectObjects(roots, true)
    if (!hit) {
      this.startClick(e, null)
      return
    }
    let node: THREE.Object3D | null = hit.object
    while (node && !node.userData.itemId) node = node.parent
    this.startClick(e, (node?.userData.itemId as string | undefined) ?? null)
  }

  // Dragging starts an orbit, so a click only selects if the pointer stayed put.
  private startClick(e: PointerEvent, id: string | null) {
    const { clientX, clientY } = e
    const up = (end: PointerEvent) => {
      window.removeEventListener("pointerup", up)
      if (Math.hypot(end.clientX - clientX, end.clientY - clientY) > 4) return
      if (id === this.selected) return
      this.select(id, "translate")
      this.on.select(id)
    }
    window.addEventListener("pointerup", up)
  }

  private grabBone(bone: string) {
    const entry = this.selected ? this.entries.get(this.selected) : null
    if (!entry?.rig) return
    const node = entry.rig.bone(bone)
    if (!node) return
    const limb = bone in LIMBS ? (bone as LimbId) : undefined
    this.grabbed = { id: entry.item.id, bone, limb }
    if (limb) this.dragLimb(entry, node)
    else {
      this.gizmo.setSpace("local")
      this.gizmo.setMode("rotate")
      this.gizmo.attach(node)
    }
  }

  // A hand or foot follows the pointer on a plane facing the camera.
  private dragLimb(entry: Entry, node: THREE.Object3D) {
    const at = node.getWorldPosition(new THREE.Vector3())
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      this.camera.getWorldDirection(new THREE.Vector3()),
      at
    )
    this.orbit.enabled = false
    this.gizmo.detach()
    const hit = new THREE.Vector3()
    const move = (e: PointerEvent) => {
      this.raycaster.setFromCamera(this.pointer(e), this.camera)
      if (!this.raycaster.ray.intersectPlane(plane, hit)) return
      this.ikTarget.position.copy(hit)
      this.solveGrabbed()
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      this.orbit.enabled = true
      this.gizmo.setSpace("world")
      this.gizmo.setMode("translate")
      this.gizmo.attach(entry.holder)
      if (entry.rig && entry.item.kind === "actor")
        this.on.pose(entry.item.id, this.readPose(entry.rig, entry.item))
      this.grabbed = null
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  private solveGrabbed() {
    const grabbed = this.grabbed
    const entry = grabbed && this.entries.get(grabbed.id)
    if (!grabbed?.limb || !entry?.rig) return
    const limb = LIMBS[grabbed.limb]
    const [upper, lower, end] = limb.bones.map((b) => entry.rig!.bone(b))
    if (!upper || !lower || !end) return
    const hint = new THREE.Vector3(...limb.hint).transformDirection(
      entry.holder.matrixWorld
    )
    solveLimb(upper, lower, end, this.ikTarget.position.clone(), hint)
  }

  // Reads the gizmo's result back into the scene's JSON.
  private finishDrag() {
    const grabbed = this.grabbed
    if (grabbed) {
      const entry = this.entries.get(grabbed.id)
      if (entry?.rig && entry.item.kind === "actor")
        this.on.pose(grabbed.id, this.readPose(entry.rig, entry.item))
      return
    }
    const entry = this.selected ? this.entries.get(this.selected) : null
    if (entry) this.on.transform(entry.item.id, readTransform(entry.holder))
  }

  private readPose(rig: Rig, item: ActorItem): HumanPose {
    const pose: HumanPose = { ...item.pose }
    for (const name of HUMAN_BONES) {
      const node = rig.bone(name)
      if (!node) continue
      if (node.quaternion.angleTo(new THREE.Quaternion()) > 1e-3)
        pose[name] = quatOf(node.quaternion)
      else delete pose[name]
    }
    return pose
  }

  private reportCamera() {
    const cam = this.lastScene?.camera
    const next: SetCamera = {
      position: this.camera.position.toArray().map((n) => round(n)) as Vec3,
      target: this.orbit.target.toArray().map((n) => round(n)) as Vec3,
      fov: this.camera.fov,
      roll: cam?.roll ?? 0,
    }
    if (this.lastScene) {
      this.lastScene = { ...this.lastScene, camera: next }
    }
    this.on.camera(next)
  }

  private keyDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    if (e.metaKey || e.ctrlKey) return
    this.keys.add(e.code)
  }
  private keyUp = (e: KeyboardEvent) => this.keys.delete(e.code)
  private clearKeys = () => this.keys.clear()

  private walk(dt: number) {
    const step = (this.keys.has("ShiftLeft") ? 5 : 2.2) * dt
    const forward = this.camera.getWorldDirection(new THREE.Vector3())
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up)
    const move = new THREE.Vector3()
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) move.add(forward)
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) move.sub(forward)
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) move.add(right)
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) move.sub(right)
    if (this.keys.has("KeyE")) move.y += 1
    if (this.keys.has("KeyQ")) move.y -= 1
    if (!move.lengthSq()) return false
    move.normalize().multiplyScalar(step)
    this.camera.position.add(move)
    this.orbit.target.add(move)
    return true
  }

  private wasWalking = false
  private roll = 0

  private tick = (now: number) => {
    if (this.disposed) return
    this.frameId = requestAnimationFrame(this.tick)
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    const walking = this.walk(dt)
    if (this.wasWalking && !walking) this.reportCamera()
    this.wasWalking = walking
    this.orbit.update()
    for (const entry of this.entries.values()) {
      entry.rig?.update()
      if (entry.item.kind === "image" && entry.item.billboard)
        entry.holder.quaternion.copy(this.camera.quaternion)
    }
    this.moveHandles()
    this.draw(true)
  }

  private draw(overlay: boolean) {
    // OrbitControls re-aims the camera each frame, so tilt only while drawing.
    const aimed = this.camera.quaternion.clone()
    this.camera.rotateZ(this.roll)
    this.camera.updateMatrixWorld()
    const r = this.renderer
    r.setRenderTarget(this.colorTarget)
    r.clear()
    r.render(this.scene, this.camera)

    const background = this.scene.background
    this.scene.overrideMaterial = this.normalMaterial
    this.scene.background = new THREE.Color(0.5, 0.5, 1)
    const fog = this.scene.fog
    this.scene.fog = null
    r.setRenderTarget(this.normalTarget)
    r.clear()
    r.render(this.scene, this.camera)
    this.scene.overrideMaterial = null
    this.scene.background = background
    this.scene.fog = fog

    r.setRenderTarget(null)
    r.clear()
    r.render(this.quadScene, this.quadCamera)
    if (overlay) {
      r.clearDepth()
      r.render(this.overlay, this.camera)
    }
    this.camera.quaternion.copy(aimed)
    this.camera.updateMatrixWorld()
  }

  // Draws only what's inside `frame` (viewport pixels) at the given size.
  capture(
    frame: Frame,
    width: number,
    height: number,
    type = "image/png",
    look?: SetLook
  ) {
    const { width: fullW, height: fullH } = this.size
    const r = this.renderer
    const scale = width / frame.width
    const inkWidth = this.ink.uniforms.width!.value as number
    const mode = this.ink.uniforms.mode!.value as number
    if (look) this.ink.uniforms.mode!.value = LOOK_MODE[look]
    this.camera.setViewOffset(
      fullW,
      fullH,
      frame.x,
      frame.y,
      frame.width,
      frame.height
    )
    r.setPixelRatio(1)
    r.setSize(width, height, false)
    this.setTargets(width, height)
    this.ink.uniforms.width!.value = inkWidth * Math.max(1, scale / 2)
    this.draw(false)
    const url = r.domElement.toDataURL(type, 0.92)
    this.ink.uniforms.width!.value = inkWidth
    this.ink.uniforms.mode!.value = mode
    this.camera.clearViewOffset()
    r.setPixelRatio(this.dpr)
    r.setSize(fullW, fullH, false)
    this.setTargets(fullW * this.dpr, fullH * this.dpr)
    return url
  }

  frameOn(id: string) {
    const entry = this.entries.get(id)
    if (!entry) return
    const box = new THREE.Box3().setFromObject(entry.holder)
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3()).length()
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize()
    this.orbit.target.copy(center)
    this.camera.position
      .copy(center)
      .addScaledVector(dir, Math.max(1.2, size * 1.5))
    this.reportCamera()
  }

  // Close on the actor's face, for working on an expression.
  frameFace(id: string) {
    const head = this.entries.get(id)?.rig?.bone("head")
    if (!head) return
    const center = head.getWorldPosition(new THREE.Vector3())
    center.y += 0.09
    const holder = this.entries.get(id)!.holder
    const front = new THREE.Vector3(0, 0, 1).transformDirection(
      holder.matrixWorld
    )
    this.orbit.target.copy(center)
    this.camera.position.copy(center).addScaledVector(front, 1.1)
    this.reportCamera()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frameId)
    const el = this.renderer.domElement
    el.removeEventListener("pointerdown", this.pick, true)
    window.removeEventListener("keydown", this.keyDown, true)
    window.removeEventListener("keyup", this.keyUp, true)
    window.removeEventListener("blur", this.clearKeys)
    this.gizmo.detach()
    this.gizmo.dispose()
    this.orbit.dispose()
    for (const [id, entry] of this.entries) this.removeEntry(id, entry)
    if (this.stage) disposeGroup(this.stage)
    for (const texture of this.textures.values()) texture.dispose()
    this.colorTarget.dispose()
    this.normalTarget.dispose()
    this.ink.dispose()
    this.normalMaterial.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    el.remove()
  }
}

const sameCamera = (a: SetCamera, b: SetCamera) =>
  a === b ||
  (a.position.every((n, i) => n === b.position[i]) &&
    a.target.every((n, i) => n === b.target[i]) &&
    a.fov === b.fov &&
    a.roll === b.roll)

function applyTransform(holder: THREE.Object3D, t: Transform) {
  holder.position.set(...t.position)
  holder.rotation.copy(toEuler(t.rotation))
  holder.scale.set(...t.scale)
}

function readTransform(holder: THREE.Object3D): Transform {
  const deg = THREE.MathUtils.radToDeg
  return {
    position: holder.position.toArray().map((n) => round(n)) as Vec3,
    rotation: [
      round(deg(holder.rotation.x), 10),
      round(deg(holder.rotation.y), 10),
      round(deg(holder.rotation.z), 10),
    ],
    scale: holder.scale.toArray().map((n) => round(n)) as Vec3,
  }
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return Boolean(
    el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  )
}

function disposeGroup(group: THREE.Object3D) {
  const seen = new Set<THREE.Material>()
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    node.geometry.dispose()
    const materials: THREE.Material[] = Array.isArray(node.material)
      ? node.material
      : [node.material]
    for (const m of materials) seen.add(m)
  })
  for (const m of seen) {
    if ("map" in m && m.map instanceof THREE.Texture) m.map.dispose()
    m.dispose()
  }
}

// Silhouettes for the pose picker, drawn once on a small throwaway renderer.
export function poseThumbnails(size = 96) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(size, size)
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight("#ffffff", 3))
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 30)
  camera.position.set(1.8, 1.25, 5)
  camera.lookAt(0, 0.85, 0)
  const rig = createFigure({
    skin: "#8f96a3",
    hair: "#8f96a3",
    hairStyle: "none",
    top: "#8f96a3",
    bottom: "#8f96a3",
    shoes: "#8f96a3",
    build: "average",
    height: 1.75,
  })
  scene.add(rig.root)
  const hips = rig.bone("hips")!
  const rest = hips.position.y
  const out: Record<string, string> = {}
  for (const pose of BODY_POSES) {
    applyPose(rig, bodyPose(pose), HUMAN_BONES)
    hips.position.y = rest - pose.drop
    renderer.render(scene, camera)
    out[pose.id] = renderer.domElement.toDataURL("image/png")
  }
  rig.dispose()
  renderer.dispose()
  renderer.forceContextLoss()
  return out
}
