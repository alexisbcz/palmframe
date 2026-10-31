/// <reference lib="webworker" />
import { ImportError } from "./errors"
import { decodeTiff } from "./tiff"

// One page, then the worker is gone: a TIFF that hangs the decoder costs this
// thread and nothing else, and the page ends it when time runs out.
export interface TiffRequest {
  bytes: Uint8Array
  side: number
}

export type TiffResponse =
  { ok: true; bitmap: ImageBitmap } | { ok: false; code: ImportError["code"] }

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async ({ data }: MessageEvent<TiffRequest>) => {
  try {
    const { width, height, rgba } = await decodeTiff(data.bytes)
    const pixels = new ImageData(
      rgba as Uint8ClampedArray<ArrayBuffer>,
      width,
      height
    )
    const full = new OffscreenCanvas(width, height)
    full.getContext("2d")!.putImageData(pixels, 0, 0)
    const scale = Math.min(1, data.side / Math.max(width, height))
    const small = new OffscreenCanvas(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale))
    )
    const ctx = small.getContext("2d")!
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(full, 0, 0, small.width, small.height)
    const bitmap = small.transferToImageBitmap()
    scope.postMessage({ ok: true, bitmap } satisfies TiffResponse, [bitmap])
  } catch (e) {
    scope.postMessage({
      ok: false,
      code: e instanceof ImportError ? e.code : "corrupt",
    } satisfies TiffResponse)
  }
}
