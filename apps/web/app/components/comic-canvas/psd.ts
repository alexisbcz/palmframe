import type { Layer as PsdLayer, Psd } from "ag-psd"

import type { ComicDoc, Layer, PanelLayer } from "./model"
import {
  drawDoc,
  drawLayerPart,
  fontsReady,
  loadImages,
  toPage,
  type ImageCache,
  type LayerPart,
  type RenderOptions,
} from "./render"

type Box = { left: number; top: number; right: number; bottom: number }

// Output-pixel box around a rect given in the layer's local, unrotated space.
function pageBox(
  l: Layer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  scale: number
): Box {
  const pts = [
    toPage(l, x0, y0),
    toPage(l, x1, y0),
    toPage(l, x0, y1),
    toPage(l, x1, y1),
  ]
  return {
    left: Math.floor(Math.min(...pts.map((p) => p.x)) * scale),
    top: Math.floor(Math.min(...pts.map((p) => p.y)) * scale),
    right: Math.ceil(Math.max(...pts.map((p) => p.x)) * scale),
    bottom: Math.ceil(Math.max(...pts.map((p) => p.y)) * scale),
  }
}

function clamp(b: Box, width: number, height: number): Box {
  return {
    left: Math.max(0, b.left),
    top: Math.max(0, b.top),
    right: Math.min(width, b.right),
    bottom: Math.min(height, b.bottom),
  }
}

// Where render.ts draws a panel's image, in the panel's local space.
function artRect(l: PanelLayer, img: HTMLImageElement) {
  const { width: w, height: h } = l
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  let dw = w
  let dh = h
  if (l.fit !== "fill") {
    const s =
      l.fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)
    dw = iw * s
    dh = ih * s
  }
  dw *= l.imageZoom / 100
  dh *= l.imageZoom / 100
  const cx = (Math.abs(dw - w) / 2) * (l.panX / 100) * (l.flipX ? -1 : 1)
  const cy = (Math.abs(dh - h) / 2) * (l.panY / 100) * (l.flipY ? -1 : 1)
  const pad = l.blur * 3
  return [
    cx - dw / 2 - pad,
    cy - dh / 2 - pad,
    cx + dw / 2 + pad,
    cy + dh / 2 + pad,
  ] as const
}

// Shrinks a canvas to its non-transparent pixels.
function trim(canvas: HTMLCanvasElement, box: Box) {
  const { width, height } = canvas
  const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3]) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return null
  const out = document.createElement("canvas")
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext("2d")!.drawImage(canvas, -x0, -y0)
  return { canvas: out, left: box.left + x0, top: box.top + y0 }
}

function part(
  name: string,
  l: Layer,
  p: LayerPart | undefined,
  box: Box,
  opts: RenderOptions,
  extra: Partial<PsdLayer> = {}
): PsdLayer | null {
  const width = box.right - box.left
  const height = box.bottom - box.top
  if (width <= 0 || height <= 0) return null
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.setTransform(opts.scale, 0, 0, opts.scale, -box.left, -box.top)
  drawLayerPart(ctx, l, opts, p)
  return { name, left: box.left, top: box.top, canvas, ...extra }
}

function snippet(text: string) {
  const s = text.replace(/\s+/g, " ").trim()
  return s.length > 40 ? `${s.slice(0, 39)}…` : s
}

// One slide as a layered Photoshop file. Each panel is a group: its frame,
// the art clipped to it (whole, so it can be reframed), and its border.
// Bubbles split balloon from lettering; free text is its own layer.
export async function renderPsd(
  doc: ComicDoc,
  images: ImageCache,
  scale = 1,
  dpi = 72
) {
  const { writePsdUint8Array } = await import("ag-psd")
  await Promise.all([fontsReady(), loadImages(doc, images)])
  const width = Math.round(doc.width * scale)
  const height = Math.round(doc.height * scale)
  const opts: RenderOptions = { scale, images }
  const page = (b: Box) => clamp(b, width, height)

  const composite = document.createElement("canvas")
  composite.width = width
  composite.height = height
  drawDoc(composite.getContext("2d")!, doc, opts)

  const background = document.createElement("canvas")
  background.width = width
  background.height = height
  const bg = background.getContext("2d")!
  bg.fillStyle = doc.background
  bg.fillRect(0, 0, width, height)

  const children: PsdLayer[] = [
    { name: "Background", left: 0, top: 0, canvas: background },
  ]
  for (const l of doc.layers) {
    const rx = l.width / 2
    const ry = l.height / 2
    const group = {
      name: l.name,
      opacity: l.opacity / 100,
      hidden: l.hidden,
      opened: true,
    }
    if (l.type === "panel") {
      const frame = pageBox(l, -rx, -ry, rx, ry, scale)
      const img = l.src ? images.get(l.src) : undefined
      const art =
        img?.complete && img.naturalWidth
          ? part("Art", l, "art", pageBox(l, ...artRect(l, img), scale), opts, {
              clipping: true,
            })
          : null
      const parts = [
        // The clipping base: Photoshop masks "Art" by this layer's pixels.
        part("Frame", l, "frame", page(frame), opts),
        art,
        l.borderWidth > 0
          ? part("Border", l, "border", page(frame), opts)
          : null,
      ].filter((p): p is PsdLayer => !!p)
      children.push({ ...group, children: parts })
    } else if (l.type === "bubble") {
      const pad = l.borderWidth * 2 + Math.min(rx, ry) * 0.3 + 8
      const balloon = pageBox(
        l,
        Math.min(-rx, l.tailX) - pad,
        Math.min(-ry, l.tailY) - pad,
        Math.max(rx, l.tailX) + pad,
        Math.max(ry, l.tailY) + pad,
        scale
      )
      const lettering = pageBox(
        l,
        -rx - l.fontSize,
        -ry - l.fontSize,
        rx + l.fontSize,
        ry + l.fontSize,
        scale
      )
      const parts = [
        part("Balloon", l, "balloon", page(balloon), opts),
        l.text.trim()
          ? part(snippet(l.text), l, "lettering", page(lettering), opts)
          : null,
      ].filter((p): p is PsdLayer => !!p)
      children.push({ ...group, children: parts })
    } else {
      // Wrapped text can outgrow its box: draw on the page, then trim.
      const full = part(
        l.name,
        l,
        undefined,
        { left: 0, top: 0, right: width, bottom: height },
        opts
      )
      const t =
        full?.canvas &&
        trim(full.canvas, { left: 0, top: 0, right: width, bottom: height })
      if (t) children.push({ ...group, name: l.name || snippet(l.text), ...t })
    }
  }

  const psd: Psd = {
    width,
    height,
    canvas: composite,
    children,
    imageResources: {
      resolutionInfo: {
        horizontalResolution: dpi,
        horizontalResolutionUnit: "PPI",
        widthUnit: "Inches",
        verticalResolution: dpi,
        verticalResolutionUnit: "PPI",
        heightUnit: "Inches",
      },
    },
  }
  const bytes = writePsdUint8Array(psd, { generateThumbnail: true })
  return new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: "image/vnd.adobe.photoshop",
  })
}
