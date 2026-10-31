// A one-channel image, the shared input of the pixel tools.
export interface Gray {
  width: number
  height: number
  data: Uint8Array
}

export function grayFromRgba(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): Gray {
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) {
    const r = rgba[i * 4]!
    const g = rgba[i * 4 + 1]!
    const b = rgba[i * 4 + 2]!
    // Transparent pixels read as the white they export on.
    const a = rgba[i * 4 + 3]! / 255
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    data[i] = Math.round(luma * a + 255 * (1 - a))
  }
  return { width, height, data }
}

// The image scaled to fit `maxSide`. Browser only; needs a CORS-clean image.
export function grayFromImage(img: HTMLImageElement, maxSide: number): Gray {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const s = Math.min(1, maxSide / Math.max(iw, ih))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(iw * s))
  canvas.height = Math.max(1, Math.round(ih * s))
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return grayFromRgba(data, canvas.width, canvas.height)
}
