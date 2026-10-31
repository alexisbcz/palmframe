export const ASSET_SIZES = {
  carousel: { width: 1080, height: 1350 },
  article: { width: 1200, height: 675 },
  video: { width: 1280, height: 720 },
} as const
export type AssetSize = keyof typeof ASSET_SIZES

export const INK = {
  ground: "#101114",
  raised: "#23262C",
  line: "#3A3E46",
  primary: "#F5F1E8",
  muted: "#A9A69E",
  amber: "#F5A623",
  steel: "#7C9CB5",
  bone: "#D9D4C7",
}

// A design unit. Portrait cards are read on a phone, so they run larger.
export const scaleOf = (width: number, height: number) =>
  height > width ? 1.2 : width / 1200
