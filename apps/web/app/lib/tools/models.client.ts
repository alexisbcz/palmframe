// Browser only, and always reached through a dynamic import: each SDK fetches
// and instantiates a 46MB WebAssembly core the moment it's imported, so a model
// loads when someone first uses its app, never with the page.
//
// The SDKs obtain a monthly license in the background when a model loads. The
// license requires that this check keeps running, so leave it alone.
import { LITERT_VERSION } from "./catalog"

// Each package picks its own accelerator. Don't force WebGPU: Clear's graph uses
// tensors WebGPU can't run, and it fails at inference, not at load.

type Progress = (fraction: number) => void

const litert = {
  litertWasmDir: `https://cdn.jsdelivr.net/npm/@litertjs/core@${LITERT_VERSION}/wasm/`,
}

const once = <T>(open: (onProgress?: Progress) => Promise<T>) => {
  let loaded: Promise<T> | null = null
  return (onProgress?: Progress) => {
    loaded ??= open(onProgress).catch((error) => {
      // A failed download gets another go on the next try.
      loaded = null
      throw error
    })
    return loaded
  }
}

export const loadClear = once(async (onProgress) => {
  const { Clear } = await import("@desert-ant-labs/clear")
  return Clear.load({ ...litert, onProgress })
})

export const loadRedact = once(async (onProgress) => {
  const { Redact, DEFAULT_LABELS } = await import("@desert-ant-labs/redact")
  return {
    redact: await Redact.load({ ...litert, onProgress }),
    DEFAULT_LABELS,
  }
})

export const loadModerator = once(async (onProgress) => {
  const { Moderator } = await import("@desert-ant-labs/moderator")
  return Moderator.load({ ...litert, onProgress })
})

export const loadEye = once(async (onProgress) => {
  const { Eye } = await import("@desert-ant-labs/eye")
  return { eye: await Eye.load({ ...litert, onProgress }), Eye }
})

export const loadEar = once(async (onProgress) => {
  const { Ear } = await import("@desert-ant-labs/ear")
  return Ear.load({ ...litert, onProgress })
})

export const loadVoz = once(async (onProgress) => {
  const { Voz } = await import("@desert-ant-labs/voz")
  return Voz.load({ onProgress })
})

export const loadGist = once(async (onProgress) => {
  const { Gist } = await import("@desert-ant-labs/gist")
  return Gist.load({ ...litert, onProgress })
})

export const loadEmo = once(async (onProgress) => {
  const { Emo } = await import("@desert-ant-labs/emo")
  return Emo.load({ ...litert, onProgress })
})

export const loadShapes = once(async (onProgress) => {
  const { Shapes, arrowheads } = await import("@desert-ant-labs/shapes")
  return { shapes: await Shapes.load({ ...litert, onProgress }), arrowheads }
})

// Served from /models/tongue; see scripts/tongue-assets.ts.
export const loadTongue = once(async () => {
  const { Tongue } = await import("@desert-ant-labs/tongue")
  return Tongue.load({ from: "/models/tongue" })
})
