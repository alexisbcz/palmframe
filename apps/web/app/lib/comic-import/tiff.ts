import { ImportError } from "./errors"
import { assertPage, assertPixels } from "./sniff"

// A TIFF page as raw pixels. This only runs in `tiff.worker.ts`: the decoder
// trusts the file's counts and offsets, so `assertPage` walks them first, and
// whatever it misses burns a worker that can be killed instead of the page.
export async function decodeTiff(bytes: Uint8Array) {
  if (assertPage(bytes) !== "tiff") throw new ImportError("unsupported")
  const { default: UTIF } = await import("utif2")
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
  // The typings miss the options. MakerNote parsing is another way in, and a
  // page has no use for it.
  const decode = UTIF.decode as (
    data: ArrayBuffer,
    options: { parseMN: boolean; debug: boolean }
  ) => ReturnType<typeof UTIF.decode>
  const ifd = decode(buffer, { parseMN: false, debug: false })[0]
  if (!ifd) throw new ImportError("corrupt")
  // `t256` and `t257` are the width and height tags, there before decoding.
  const tag = (t: unknown) => Number((t as number[] | undefined)?.[0])
  assertPixels(tag(ifd.t256), tag(ifd.t257))
  UTIF.decodeImage(buffer, ifd)
  return {
    width: ifd.width,
    height: ifd.height,
    rgba: new Uint8ClampedArray(UTIF.toRGBA8(ifd)),
  }
}
