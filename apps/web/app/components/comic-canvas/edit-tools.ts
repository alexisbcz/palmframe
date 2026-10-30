import * as React from "react"

import { INSUFFICIENT_CREDITS, setCredits } from "@/lib/credits-store"
import type { EditKind, EditRequest } from "@/routes/api.edit"

import type { ComicProject, PanelLayer, PanelVersion } from "./model"
import type { ComicEditor } from "./use-editor"
import { buildPrompt, hasPrompt } from "./use-generator"

// AI edits of a panel's image: instruction edit (Klein), variations,
// inpaint, erase and outpaint (Anima). Pixels are cropped, scaled and
// pasted back here, in the browser; /api/edit only renders.

export type EditTool = EditKind
export type MaskTool = "brush" | "rect"

// Anima Turbo's sweet spot (~0.6 MP, ~10 s warm), and Klein's edit size
// (~35 s with the image as reference, under the one-minute budget).
const ANIMA_AREA = 640 * 960
const KLEIN_AREA = 1024 * 576
// Results keep the image's resolution, up to the import limit.
const MAX_SIDE = 2400
// Versions kept on a panel; they ride along in the project.
const MAX_VERSIONS = 8

export interface MaskState {
  panelId: string
  // The image the mask was painted over; another image starts a new mask.
  src: string
  // Painted in image pixels, in any colour: only alpha counts.
  canvas: HTMLCanvasElement
  painted: boolean
  active: boolean
  tool: MaskTool
  // Brush diameter in page units, so it looks the same at any zoom.
  size: number
  rev: number
}

interface EditJob {
  kind: EditKind
  startedAt: number
  controller: AbortController
}

interface EditState {
  mask: MaskState | null
  jobs: Record<string, EditJob>
  errors: Record<string, string>
}

let state: EditState = { mask: null, jobs: {}, errors: {} }
const listeners = new Set<() => void>()

function set(next: Partial<EditState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export function useEditState() {
  return React.useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state
  )
}

export function updateMask(patch: Partial<MaskState>) {
  if (state.mask) set({ mask: { ...state.mask, ...patch } })
}

export function bumpMask(painted = true) {
  if (state.mask)
    set({ mask: { ...state.mask, painted, rev: state.mask.rev + 1 } })
}

// Shows the mask over the panel, keeping what was painted on the same image.
export async function startMask(panel: PanelLayer) {
  if (!panel.src) return
  const m = state.mask
  if (m && m.panelId === panel.id && m.src === panel.src) {
    updateMask({ active: true })
    return
  }
  const img = await loadImage(panel.src)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  set({
    mask: {
      panelId: panel.id,
      src: panel.src,
      canvas,
      painted: false,
      active: true,
      tool: m?.tool ?? "brush",
      size: m?.size ?? 60,
      rev: 0,
    },
  })
}

export function clearMask() {
  const m = state.mask
  if (!m) return
  m.canvas.getContext("2d")!.clearRect(0, 0, m.canvas.width, m.canvas.height)
  bumpMask(false)
}

export function loadImage(src: string) {
  const img = new Image()
  // Saved projects point at the storage bucket; CORS keeps canvases untainted.
  if (/^https?:/.test(src)) img.crossOrigin = "anonymous"
  img.src = src
  return img.decode().then(() => img)
}

// Where the image sits in the panel, in panel-local units around its
// centre, before flipping: the same maths as drawPanel.
export function imageGeometry(p: PanelLayer, iw: number, ih: number) {
  let w = p.width
  let h = p.height
  if (p.fit !== "fill") {
    const s =
      p.fit === "cover"
        ? Math.max(p.width / iw, p.height / ih)
        : Math.min(p.width / iw, p.height / ih)
    w = iw * s
    h = ih * s
  }
  w *= p.imageZoom / 100
  h *= p.imageZoom / 100
  const dx = (Math.abs(w - p.width) / 2) * (p.panX / 100)
  const dy = (Math.abs(h - p.height) / 2) * (p.panY / 100)
  return { x: -w / 2 + dx, y: -h / 2 + dy, w, h }
}

// A panel-local point to image pixels.
export function localToImage(
  p: PanelLayer,
  iw: number,
  ih: number,
  lx: number,
  ly: number
) {
  const g = imageGeometry(p, iw, ih)
  const fx = p.flipX ? -lx : lx
  const fy = p.flipY ? -ly : ly
  return {
    x: ((fx - g.x) * iw) / g.w,
    y: ((fy - g.y) * ih) / g.h,
    scale: iw / g.w,
  }
}

// A size near `area` with the same shape, on the 64px grid models want.
function renderSize(w: number, h: number, area: number) {
  const s = Math.sqrt(area / (w * h))
  const snap = (n: number) =>
    Math.max(256, Math.min(1536, Math.round(n / 64) * 64))
  return { width: snap(w * s), height: snap(h * s) }
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas")
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function scaled(src: CanvasImageSource, w: number, h: number) {
  const c = canvas(w, h)
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height)
  return c
}

type Box = { x: number; y: number; w: number; h: number }

// The painted area's bounding box, in mask pixels.
function maskBounds(mask: HTMLCanvasElement): Box | null {
  const { width, height } = mask
  const data = mask.getContext("2d")!.getImageData(0, 0, width, height).data
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

// The crop to redraw: the mask plus context around it, at least `min`
// pixels a side so the model sees enough of the picture.
function padRegion(b: Box, iw: number, ih: number): Box {
  const pad = Math.max(48, Math.max(b.w, b.h) * 0.5)
  const min = Math.min(512, iw, ih)
  let w = Math.min(iw, Math.max(min, b.w + pad * 2))
  let h = Math.min(ih, Math.max(min, b.h + pad * 2))
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const x = Math.round(Math.min(iw - w, Math.max(0, cx - w / 2)))
  const y = Math.round(Math.min(ih - h, Math.max(0, cy - h / 2)))
  return { x, y, w: Math.round(w), h: Math.round(h) }
}

// The mask's alpha, grown by `grow` and softened by `blur` pixels, as a
// white-on-transparent canvas over `region`.
function softMask(
  mask: HTMLCanvasElement,
  region: Box,
  grow: number,
  blur: number
) {
  const hard = canvas(region.w, region.h)
  const hc = hard.getContext("2d")!
  // Dilate: the mask stamped around a circle.
  const steps = grow > 0 ? 12 : 1
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    hc.drawImage(
      mask,
      region.x,
      region.y,
      region.w,
      region.h,
      Math.cos(a) * grow,
      Math.sin(a) * grow,
      region.w,
      region.h
    )
  }
  if (grow > 0)
    hc.drawImage(
      mask,
      region.x,
      region.y,
      region.w,
      region.h,
      0,
      0,
      region.w,
      region.h
    )
  hc.globalCompositeOperation = "source-in"
  hc.fillStyle = "#fff"
  hc.fillRect(0, 0, region.w, region.h)
  const soft = canvas(region.w, region.h)
  const sc = soft.getContext("2d")!
  sc.filter = blur > 0 ? `blur(${blur}px)` : "none"
  sc.drawImage(hard, 0, 0)
  return soft
}

// What drew the edit, by job, for the step that records it. Edits go through
// several canvases, so it can't travel with the image.
const models = new WeakMap<AbortSignal, string>()

async function post(body: EditRequest, signal: AbortSignal) {
  const res = await fetch("/api/edit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify(body),
  })
  const credits = res.headers.get("x-credits")
  if (credits !== null) setCredits(Number(credits))
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    if (json?.code === INSUFFICIENT_CREDITS)
      throw new Error(INSUFFICIENT_CREDITS)
    throw new Error(json?.error ?? `HTTP ${res.status}`)
  }
  const model = res.headers.get("x-model")
  if (model) models.set(signal, model)
  const url = URL.createObjectURL(await res.blob())
  try {
    return covered(await loadImage(url), body.width, body.height)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// OpenRouter models draw at their nearest aspect ratio; centre-crop to the
// shape asked for so the paste-back doesn't stretch.
function covered(img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const c = canvas(w, h)
  const sw = w / s
  const sh = h / s
  c.getContext("2d")!.drawImage(
    img,
    (img.naturalWidth - sw) / 2,
    (img.naturalHeight - sh) / 2,
    sw,
    sh,
    0,
    0,
    w,
    h
  )
  return c
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 32)

// Redraws `region` of `source` where `soft` (white on transparent, region
// sized) is painted, and pastes the result back through the same soft mask.
async function inpaint(
  source: HTMLCanvasElement,
  region: Box,
  soft: HTMLCanvasElement,
  kind: EditKind,
  prompt: { prompt: string; negative: string },
  signal: AbortSignal
) {
  const size = renderSize(region.w, region.h, ANIMA_AREA)
  const crop = canvas(size.width, size.height)
  crop
    .getContext("2d")!
    .drawImage(
      source,
      region.x,
      region.y,
      region.w,
      region.h,
      0,
      0,
      size.width,
      size.height
    )
  const modelMask = canvas(size.width, size.height)
  const mc = modelMask.getContext("2d")!
  mc.fillStyle = "#000"
  mc.fillRect(0, 0, size.width, size.height)
  mc.drawImage(soft, 0, 0, size.width, size.height)
  const result = await post(
    {
      mode: "inpaint",
      kind,
      image: crop.toDataURL("image/png"),
      mask: modelMask.toDataURL("image/png"),
      ...prompt,
      ...size,
      seed: randomSeed(),
      steps: 8,
      strength: 1,
    },
    signal
  )
  const patch = scaled(result, region.w, region.h)
  const pc = patch.getContext("2d")!
  pc.globalCompositeOperation = "destination-in"
  pc.drawImage(soft, 0, 0)
  const out = scaled(source, source.width, source.height)
  out.getContext("2d")!.drawImage(patch, region.x, region.y)
  return out
}

// The whole image through a model, back at the image's own size.
async function redraw(
  img: HTMLImageElement,
  body: Omit<EditRequest, "image" | "width" | "height" | "seed">,
  area: number,
  signal: AbortSignal
) {
  const size = renderSize(img.naturalWidth, img.naturalHeight, area)
  const input = scaled(img, size.width, size.height)
  const result = await post(
    {
      ...body,
      image: input.toDataURL("image/png"),
      ...size,
      seed: randomSeed(),
    },
    signal
  )
  return scaled(result, img.naturalWidth, img.naturalHeight)
}

function capped(w: number, h: number) {
  const s = Math.min(1, MAX_SIDE / Math.max(w, h))
  return { w: Math.round(w * s), h: Math.round(h * s), s }
}

// The canvas the image fills once it matches the panel's shape, and where
// the image sits in it. Null when it already fits.
export function outpaintFrame(panel: PanelLayer, iw: number, ih: number) {
  const ia = iw / ih
  const pa = panel.width / panel.height
  if (Math.abs(Math.log(ia / pa)) < 0.02) return null
  const full = pa > ia ? { w: ih * pa, h: ih } : { w: iw, h: iw / pa }
  const { w, h, s } = capped(full.w, full.h)
  const image = {
    w: iw * s,
    h: ih * s,
    x: (w - iw * s) / 2,
    y: (h - ih * s) / 2,
  }
  return { w, h, image }
}

async function outpaint(
  img: HTMLImageElement,
  panel: PanelLayer,
  prompt: { prompt: string; negative: string },
  signal: AbortSignal
) {
  const frame = outpaintFrame(panel, img.naturalWidth, img.naturalHeight)
  if (!frame) throw new Error("fits")
  const { w, h, image: r } = frame
  // The margins start as a blurred stretch of the image: the right
  // colours, so the new parts match the old.
  const source = canvas(w, h)
  const sc = source.getContext("2d")!
  sc.filter = `blur(${Math.round(Math.max(w, h) / 30)}px)`
  sc.drawImage(img, -w * 0.05, -h * 0.05, w * 1.1, h * 1.1)
  sc.filter = "none"
  sc.drawImage(img, r.x, r.y, r.w, r.h)
  // Redraw the margins and a band inside the old edge, so the seam blends.
  const band = Math.max(8, Math.round(Math.min(w, h) * 0.03))
  const mask = canvas(w, h)
  const mc = mask.getContext("2d")!
  mc.fillStyle = "#fff"
  mc.fillRect(0, 0, w, h)
  mc.clearRect(r.x + band, r.y + band, r.w - band * 2, r.h - band * 2)
  const region = { x: 0, y: 0, w: source.width, h: source.height }
  const soft = softMask(mask, region, 0, band / 2)
  return inpaint(source, region, soft, "outpaint", prompt, signal)
}

// The panel's own prompt, or a new subject in the panel's look.
function promptFor(
  panel: PanelLayer,
  project: ComicProject,
  kind: EditKind,
  text: string
) {
  if (kind === "erase") {
    const built = buildPrompt(
      {
        ...panel,
        tags: ["no humans", "scenery"],
        cast: [],
        world: [],
        prompt: "empty background",
      },
      project
    )
    return {
      prompt: built.prompt,
      negative: `${built.negative}, 1girl, 1boy, person, character, object`,
    }
  }
  const built = text.trim()
    ? buildPrompt(
        { ...panel, tags: [], cast: [], world: [], prompt: text.trim() },
        project
      )
    : buildPrompt(panel, project)
  // One continuous picture, not a page of panels around the old one.
  if (kind === "outpaint") {
    const scene = hasPrompt(panel)
      ? built
      : buildPrompt({ ...panel, tags: ["scenery"], prompt: "" }, project)
    return {
      prompt: scene.prompt,
      negative: `${scene.negative}, border, frame, letterboxing, multiple views, panel border, split screen, inset`,
    }
  }
  return built
}

export interface EditOptions {
  // The instruction (edit) or what to paint (inpaint).
  text?: string
  // Variations: 0 to 1.
  strength?: number
}

// Runs one edit on a panel. The result becomes the panel's image and joins
// its versions, next to the image it replaced; one undo step reverts it.
export async function runEdit(
  editor: ComicEditor,
  panelId: string,
  kind: EditKind,
  options: EditOptions = {}
) {
  if (state.jobs[panelId]) return
  const controller = new AbortController()
  const { [panelId]: _, ...errors } = state.errors
  set({
    jobs: {
      ...state.jobs,
      [panelId]: { kind, startedAt: Date.now(), controller },
    },
    errors,
  })
  try {
    const panel = editor.findLayer(panelId)?.layer
    if (panel?.type !== "panel" || !panel.src) return
    const project = editor.projectRef.current
    const img = await loadImage(panel.src)
    const prompt = promptFor(panel, project, kind, options.text ?? "")
    const signal = controller.signal
    let out: HTMLCanvasElement
    if (kind === "edit") {
      out = await redraw(
        img,
        {
          mode: "edit",
          kind,
          prompt: options.text ?? "",
          negative: "",
          steps: 4,
          strength: 1,
        },
        KLEIN_AREA,
        signal
      )
    } else if (kind === "vary") {
      out = await redraw(
        img,
        {
          mode: "vary",
          kind,
          ...prompt,
          steps: panel.steps ?? 8,
          strength: options.strength ?? 0.5,
        },
        ANIMA_AREA,
        signal
      )
    } else if (kind === "outpaint") {
      out = await outpaint(img, panel, prompt, signal)
    } else {
      const m = state.mask
      if (!m || m.panelId !== panelId || m.src !== panel.src)
        throw new Error("mask")
      const bounds = maskBounds(m.canvas)
      if (!bounds) throw new Error("mask")
      const region = padRegion(bounds, img.naturalWidth, img.naturalHeight)
      const reach = Math.max(4, Math.round(Math.max(region.w, region.h) / 80))
      const soft = softMask(m.canvas, region, reach * 2, reach)
      const source = scaled(img, img.naturalWidth, img.naturalHeight)
      out = await inpaint(source, region, soft, kind, prompt, signal)
    }
    const { w, h } = capped(out.width, out.height)
    const src = scaled(out, w, h).toDataURL("image/webp", 0.92)
    applyVersion(editor, panelId, src, kind, models.get(signal))
    if (kind === "inpaint" || kind === "erase") clearMask()
  } catch (e) {
    if (!controller.signal.aborted)
      set({
        errors: {
          ...state.errors,
          [panelId]: e instanceof Error ? e.message : String(e),
        },
      })
  } finally {
    const { [panelId]: _, ...jobs } = state.jobs
    set({ jobs })
  }
}

export function cancelEdit(panelId: string) {
  state.jobs[panelId]?.controller.abort()
}

function applyVersion(
  editor: ComicEditor,
  panelId: string,
  src: string,
  kind: EditKind,
  model?: string
) {
  const panel = editor.findLayer(panelId)?.layer
  if (panel?.type !== "panel") return
  let versions: PanelVersion[] = panel.versions ?? []
  if (panel.src && !versions.some((v) => v.src === panel.src))
    versions = [
      { src: panel.src, kind: "original", model: panel.model },
      ...versions,
    ]
  editor.update(panelId, {
    src,
    model,
    versions: [{ src, kind, model }, ...versions].slice(0, MAX_VERSIONS),
    // Outpainted images match the panel; show all of them.
    ...(kind === "outpaint" && {
      fit: "cover",
      imageZoom: 100,
      panX: 0,
      panY: 0,
    }),
  })
}
