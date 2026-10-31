import {
  FONTS,
  type BubbleLayer,
  type ComicDoc,
  type Layer,
  type PanelLayer,
  type TextLayer,
} from "./model"

type Ctx = CanvasRenderingContext2D
export type ImageCache = Map<string, HTMLImageElement>

export interface RenderOptions {
  scale: number
  images: ImageCache
  // Draws placeholders that should never reach an export.
  editor?: boolean
  // Translated placeholder text for empty and loading panels in the editor.
  labels?: { empty: string; loading: string }
}

export function drawDoc(ctx: Ctx, doc: ComicDoc, opts: RenderOptions) {
  ctx.save()
  ctx.setTransform(opts.scale, 0, 0, opts.scale, 0, 0)
  ctx.fillStyle = doc.background
  ctx.fillRect(0, 0, doc.width, doc.height)
  for (const layer of doc.layers) {
    if (layer.hidden) continue
    ctx.save()
    ctx.globalAlpha = layer.opacity / 100
    ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
    ctx.rotate((layer.rotation * Math.PI) / 180)
    if (layer.type === "panel") drawPanel(ctx, layer, opts)
    else if (layer.type === "bubble") drawBubble(ctx, layer)
    else drawText(ctx, layer)
    ctx.restore()
  }
  ctx.restore()
}

// One layer, or one part of it, in the context's current transform. Opacity
// and visibility are left to the caller (a PSD group carries them).
export function drawLayerPart(
  ctx: Ctx,
  layer: Layer,
  opts: RenderOptions,
  part?: LayerPart
) {
  ctx.save()
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
  ctx.rotate((layer.rotation * Math.PI) / 180)
  if (layer.type === "panel") drawPanel(ctx, layer, opts, part)
  else if (layer.type === "bubble") drawBubble(ctx, layer, part)
  else drawText(ctx, layer)
  ctx.restore()
}

function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  const p = new Path2D()
  p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
  return p
}

// Pieces of a layer drawn on their own, for layered (PSD) export: a panel's
// frame, its art unclipped, and its border; a bubble's balloon and lettering.
export type LayerPart = "frame" | "art" | "border" | "balloon" | "lettering"

function drawPanel(
  ctx: Ctx,
  l: PanelLayer,
  opts: RenderOptions,
  part?: LayerPart
) {
  const w = l.width
  const h = l.height
  const shape = roundedRect(-w / 2, -h / 2, w, h, l.radius)
  ctx.save()
  if (part !== "art") ctx.clip(shape)
  if (!part || part === "frame") {
    ctx.fillStyle = l.fill
    ctx.fill(shape)
  }

  const img = l.src ? opts.images.get(l.src) : undefined
  if (part === "frame" || part === "border") {
    // Drawn by its own part.
  } else if (img?.complete && img.naturalWidth) {
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const zoom = l.imageZoom / 100
    let dw = w
    let dh = h
    if (l.fit !== "fill") {
      const s =
        l.fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)
      dw = iw * s
      dh = ih * s
    }
    dw *= zoom
    dh *= zoom
    const dx = (Math.abs(dw - w) / 2) * (l.panX / 100)
    const dy = (Math.abs(dh - h) / 2) * (l.panY / 100)
    // ctx.filter lengths are in device pixels, not user space.
    ctx.filter = [
      l.blur ? `blur(${l.blur * opts.scale}px)` : "",
      `brightness(${l.brightness}%)`,
      `contrast(${l.contrast}%)`,
      `saturate(${l.saturation}%)`,
      l.grayscale ? `grayscale(${l.grayscale}%)` : "",
    ].join(" ")
    ctx.save()
    ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1)
    ctx.drawImage(img, -dw / 2 + dx, -dh / 2 + dy, dw, dh)
    ctx.restore()
    ctx.filter = "none"
  } else if (opts.editor) {
    ctx.fillStyle = "rgba(17, 17, 17, 0.04)"
    ctx.fill(shape)
    ctx.fillStyle = "rgba(17, 17, 17, 0.35)"
    ctx.font = `500 ${Math.max(14, Math.min(28, w / 16))}px "Inter Variable", sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(
      l.src
        ? (opts.labels?.loading ?? "Loading…")
        : (opts.labels?.empty ?? "Drop an image"),
      0,
      0
    )
  }
  ctx.restore()

  if (l.borderWidth > 0 && (!part || part === "border")) {
    const bw = l.borderWidth
    ctx.lineWidth = bw
    ctx.strokeStyle = l.borderColor
    ctx.stroke(
      roundedRect(
        -w / 2 + bw / 2,
        -h / 2 + bw / 2,
        w - bw,
        h - bw,
        l.radius - bw / 2
      )
    )
  }
}

// Deterministic jitter so shout bubbles don't change shape on every redraw.
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

function bubbleBody(l: BubbleLayer) {
  const rx = l.width / 2
  const ry = l.height / 2
  const p = new Path2D()
  if (l.shape === "caption") {
    p.rect(-rx, -ry, l.width, l.height)
  } else if (l.shape === "message") {
    p.roundRect(-rx, -ry, l.width, l.height, Math.min(ry, 44))
  } else if (l.shape === "speech") {
    p.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  } else if (l.shape === "thought") {
    const perimeter = Math.PI * (rx + ry)
    const n = Math.max(9, Math.round(perimeter / 90))
    const inner = 0.9
    const bulge = 1.12
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      const x = Math.cos(a) * rx * inner
      const y = Math.sin(a) * ry * inner
      if (i === 0) {
        p.moveTo(x, y)
        continue
      }
      const m = ((i - 0.5) / n) * Math.PI * 2
      p.quadraticCurveTo(
        Math.cos(m) * rx * bulge,
        Math.sin(m) * ry * bulge,
        x,
        y
      )
    }
    p.closePath()
  } else {
    const rand = seeded(l.id)
    const n = Math.max(14, Math.round((Math.PI * (rx + ry)) / 70))
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2
      const r = i % 2 === 0 ? 1 - rand() * 0.06 : 0.72 + rand() * 0.08
      const x = Math.cos(a) * rx * r
      const y = Math.sin(a) * ry * r
      if (i === 0) p.moveTo(x, y)
      else p.lineTo(x, y)
    }
    p.closePath()
  }
  return p
}

function bubbleTail(l: BubbleLayer) {
  const rx = l.width / 2
  const ry = l.height / 2
  const tx = l.tailX
  const ty = l.tailY
  // Tip inside the body: nothing to draw.
  if (l.shape !== "message" && (tx / rx) ** 2 + (ty / ry) ** 2 < 1) return null

  const p = new Path2D()
  // A chat bubble's tail curls off the bottom corner on the sender's side.
  if (l.shape === "message") {
    const side = tx < 0 ? -1 : 1
    const r = Math.min(ry, 44)
    p.moveTo(side * (rx - r * 1.4), ry - 2)
    p.quadraticCurveTo(
      side * (rx - r * 0.2),
      ry - 2,
      side * (rx - r * 0.35),
      ry - r * 0.9
    )
    p.quadraticCurveTo(
      side * (rx - r * 0.15),
      ry + r * 0.15,
      side * (rx + r * 0.25),
      ry + r * 0.3
    )
    p.quadraticCurveTo(
      side * (rx - r * 0.6),
      ry + r * 0.35,
      side * (rx - r * 1.4),
      ry - 2
    )
    p.closePath()
    return p
  }
  if (l.shape === "thought") {
    const a = Math.atan2(ty / ry, tx / rx)
    const sx = Math.cos(a) * rx * 0.95
    const sy = Math.sin(a) * ry * 0.95
    const size = Math.min(rx, ry) * 0.22
    for (const [t, r] of [
      [0.25, 1],
      [0.6, 0.68],
      [0.92, 0.42],
    ]) {
      const cx = sx + (tx - sx) * t
      const cy = sy + (ty - sy) * t
      p.moveTo(cx + size * r, cy)
      p.arc(cx, cy, size * r, 0, Math.PI * 2)
    }
    return p
  }
  const a = Math.atan2(ty / ry, tx / rx)
  const spread = 0.22
  const k = l.shape === "shout" ? 0.8 : 0.97
  const ax = Math.cos(a - spread) * rx * k
  const ay = Math.sin(a - spread) * ry * k
  const bx = Math.cos(a + spread) * rx * k
  const by = Math.sin(a + spread) * ry * k
  // Bend the tail slightly so it reads as drawn rather than a wedge.
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  const bend = 0.15
  const ox = -(ty - my) * bend
  const oy = (tx - mx) * bend
  p.moveTo(ax, ay)
  p.quadraticCurveTo((ax + tx) / 2 + ox, (ay + ty) / 2 + oy, tx, ty)
  p.quadraticCurveTo((bx + tx) / 2 + ox, (by + ty) / 2 + oy, bx, by)
  p.closePath()
  return p
}

function fontString(font: keyof typeof FONTS, size: number) {
  const f = FONTS[font]
  return `${f.weight} ${size}px ${f.family}, sans-serif`
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/

// Japanese has no spaces to break on: split by word, with punctuation staying
// on the word before it, so a line never starts with "。".
function breakable(word: string) {
  if (!CJK.test(word)) return [word]
  const parts: string[] = []
  const words = new Intl.Segmenter("ja", { granularity: "word" })
  for (const { segment, isWordLike } of words.segment(word)) {
    if (isWordLike || !parts.length) parts.push(segment)
    else parts[parts.length - 1] += segment
  }
  return parts
}

function wrap(ctx: Ctx, text: string, maxWidth: number) {
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push("")
      continue
    }
    let line = ""
    for (const word of words) {
      for (const [i, part] of breakable(word).entries()) {
        const next = line && !i ? `${line} ${part}` : line + part
        if (!line || ctx.measureText(next).width <= maxWidth) line = next
        else {
          lines.push(line)
          line = part
        }
      }
    }
    lines.push(line)
  }
  return lines
}

// Shrinks the font until the text fits the box, like a letterer would.
export function fitText(
  ctx: Ctx,
  text: string,
  font: keyof typeof FONTS,
  maxSize: number,
  boxW: number,
  boxH: number,
  lineHeight: number
) {
  let size = maxSize
  for (;;) {
    ctx.font = fontString(font, size)
    const lines = wrap(ctx, text, boxW)
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width))
    if (
      (lines.length * size * lineHeight <= boxH && widest <= boxW) ||
      size <= 10
    ) {
      return { lines, size }
    }
    size = Math.max(10, size - Math.max(1, size * 0.06))
  }
}

function drawLines(
  ctx: Ctx,
  lines: string[],
  size: number,
  lineHeight: number,
  x: number,
  draw: (line: string, x: number, y: number) => void
) {
  const lh = size * lineHeight
  let y = -((lines.length - 1) * lh) / 2
  for (const line of lines) {
    draw(line, x, y)
    y += lh
  }
}

export const BUBBLE_LINE_HEIGHT = 1.12

// Where lettering may go inside a balloon of this size.
export function bubbleTextBox(
  l: Pick<BubbleLayer, "shape" | "width" | "height">
) {
  const boxed = l.shape === "caption" || l.shape === "message"
  const inset = boxed ? 0.86 : l.shape === "shout" ? 0.56 : 0.7
  return {
    width: l.width * inset - (boxed ? 24 : 0),
    height: l.height * inset - (boxed ? 16 : 0),
  }
}

function drawBubble(ctx: Ctx, l: BubbleLayer, part?: LayerPart) {
  const body = bubbleBody(l)
  const tail = l.tail && l.shape !== "caption" ? bubbleTail(l) : null
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  // Stroke at twice the width then fill on top: the outline of the union
  // of body and tail survives, with no seam where they meet.
  if (l.borderWidth > 0 && part !== "lettering") {
    ctx.lineWidth = l.borderWidth * 2
    ctx.strokeStyle = l.borderColor
    ctx.stroke(body)
    if (tail) ctx.stroke(tail)
  }
  if (part !== "lettering") {
    ctx.fillStyle = l.fill
    ctx.fill(body)
    if (tail) ctx.fill(tail)
  }
  if (part === "balloon") return

  const box = bubbleTextBox(l)
  const text = l.uppercase ? l.text.toUpperCase() : l.text
  const { lines, size } = fitText(
    ctx,
    text,
    l.font,
    l.fontSize,
    box.width,
    box.height,
    BUBBLE_LINE_HEIGHT
  )
  ctx.fillStyle = l.textColor
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  drawLines(ctx, lines, size, BUBBLE_LINE_HEIGHT, 0, (line, x, y) =>
    ctx.fillText(line, x, y)
  )
}

function drawText(ctx: Ctx, l: TextLayer) {
  const text = l.uppercase ? l.text.toUpperCase() : l.text
  ctx.font = fontString(l.font, l.fontSize)
  const lines = wrap(ctx, text, l.width)
  const x =
    l.align === "left" ? -l.width / 2 : l.align === "right" ? l.width / 2 : 0
  ctx.textAlign = l.align
  ctx.textBaseline = "middle"
  ctx.lineJoin = "round"
  if (l.strokeWidth > 0) {
    ctx.lineWidth = l.strokeWidth * 2
    ctx.strokeStyle = l.strokeColor
    drawLines(ctx, lines, l.fontSize, 1.05, x, (line, x, y) =>
      ctx.strokeText(line, x, y)
    )
  }
  ctx.fillStyle = l.color
  drawLines(ctx, lines, l.fontSize, 1.05, x, (line, x, y) =>
    ctx.fillText(line, x, y)
  )
}

export function toLocal(l: Layer, px: number, py: number) {
  const a = (-l.rotation * Math.PI) / 180
  const dx = px - (l.x + l.width / 2)
  const dy = py - (l.y + l.height / 2)
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
  }
}

export function toPage(l: Layer, lx: number, ly: number) {
  const a = (l.rotation * Math.PI) / 180
  return {
    x: l.x + l.width / 2 + lx * Math.cos(a) - ly * Math.sin(a),
    y: l.y + l.height / 2 + lx * Math.sin(a) + ly * Math.cos(a),
  }
}

export function hitTest(doc: ComicDoc, px: number, py: number) {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i]!
    if (l.hidden) continue
    const p = toLocal(l, px, py)
    if (Math.abs(p.x) <= l.width / 2 && Math.abs(p.y) <= l.height / 2) return l
  }
  return null
}

export function fontsReady() {
  return Promise.all(
    Object.values(FONTS).map((f) =>
      document.fonts.load(`${f.weight} 40px ${f.family}`)
    )
  ).catch(() => undefined)
}

export function loadImages(
  doc: ComicDoc,
  cache: ImageCache,
  onLoad?: () => void
) {
  const pending: Promise<void>[] = []
  for (const l of doc.layers) {
    if (l.type !== "panel" || !l.src) continue
    let img = cache.get(l.src)
    if (!img) {
      img = new Image()
      // Saved projects point at the storage bucket; CORS keeps exports untainted.
      if (/^https?:/.test(l.src)) img.crossOrigin = "anonymous"
      img.src = l.src
      cache.set(l.src, img)
    }
    if (!img.complete) {
      const el = img
      pending.push(
        new Promise((resolve) => {
          el.addEventListener("load", () => (onLoad?.(), resolve()), {
            once: true,
          })
          el.addEventListener("error", () => resolve(), { once: true })
        })
      )
    }
  }
  return Promise.all(pending)
}

export async function renderToBlob(
  doc: ComicDoc,
  cache: ImageCache,
  type: "image/png" | "image/jpeg" | "image/webp",
  scale = 1,
  // JPEG and WebP only, 0 to 1.
  quality = 0.92
) {
  await Promise.all([fontsReady(), loadImages(doc, cache)])
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(doc.width * scale)
  canvas.height = Math.round(doc.height * scale)
  drawDoc(canvas.getContext("2d")!, doc, { scale, images: cache })
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality)
  )
  // Hands the pixels back now rather than whenever the canvas is collected.
  canvas.width = canvas.height = 0
  return blob
}

// Uploads are downscaled so autosave and project files stay small.
export async function readImageFile(file: File, maxSide = 2400) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const s = Math.min(
      1,
      maxSide / Math.max(img.naturalWidth, img.naturalHeight)
    )
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * s)
    canvas.height = Math.round(img.naturalHeight * s)
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return {
      src: canvas.toDataURL("image/webp", 0.9),
      width: canvas.width,
      height: canvas.height,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
