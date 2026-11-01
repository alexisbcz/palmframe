// The on-device apps, each behind its own switch under Settings > Labs. Shared
// by server and browser, so nothing here may import a model.

export const TOOL_IDS = [
  "voice",
  "captions",
  "redact",
  "images",
  "photos",
  "post",
  "sketch",
] as const

export type ToolId = (typeof TOOL_IDS)[number]

export const LAB_FEATURES = ["machines", "novels", "dub", ...TOOL_IDS] as const

export type LabFeature = (typeof LAB_FEATURES)[number]

export type Labs = Record<LabFeature, boolean>

// What the first run downloads, in MB: the models plus their WebAssembly core,
// which the browser receives compressed to about 18MB per model.
export const TOOLS: Record<ToolId, { models: string[]; downloadMB: number }> = {
  voice: { models: ["Clear"], downloadMB: 70 },
  captions: { models: ["Voz", "Ear"], downloadMB: 430 },
  redact: { models: ["Redact"], downloadMB: 45 },
  images: { models: ["Moderator"], downloadMB: 30 },
  photos: { models: ["Eye"], downloadMB: 85 },
  post: { models: ["Tongue", "Gist", "Emo"], downloadMB: 60 },
  sketch: { models: ["Shapes"], downloadMB: 20 },
}

// Keep equal to the exact @litertjs/core pin in package.json. The SDKs otherwise
// fetch whatever jsDelivr calls latest, which could break the apps on its own.
export const LITERT_VERSION = "2.6.0"

export const toolPath = (id: ToolId) => `/tools/${id}`

// Metadata is user-editable, so only a literal `true` turns a feature on.
export function readLabs(stored: unknown): Labs {
  const labs = (stored ?? {}) as Partial<Record<LabFeature, unknown>>
  return Object.fromEntries(
    LAB_FEATURES.map((feature) => [feature, labs[feature] === true])
  ) as Labs
}
