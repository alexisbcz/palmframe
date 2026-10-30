import type { Rect } from "./model"

// Guides go to the model large and lossless: a pose lives in thin strokes,
// and a small derivative turns a stick figure into a smudge.
export const GUIDE_SIDE = 1024

export async function loadImage(src: string) {
  const img = new Image()
  // Saved projects point at the storage bucket; CORS keeps the canvas readable.
  if (/^https?:/.test(src)) img.crossOrigin = "anonymous"
  img.src = src
  await img.decode()
  return img
}

// A region of an image as a PNG fitting 1024 px, on white so a transparent
// sketch doesn't turn black. Never scaled up.
export function guidePng(img: CanvasImageSource, region: Rect) {
  const s = Math.min(1, GUIDE_SIDE / Math.max(region.width, region.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(region.width * s))
  canvas.height = Math.max(1, Math.round(region.height * s))
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(
    img,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    canvas.width,
    canvas.height
  )
  return canvas.toDataURL("image/png")
}

export async function readGuideFile(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    return guidePng(img, {
      x: 0,
      y: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
