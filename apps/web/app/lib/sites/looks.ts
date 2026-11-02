import type { Palette } from "./model"

export const PALETTES: { id: string; name: string; palette: Palette }[] = [
  {
    id: "paper",
    name: "Paper",
    palette: {
      bg: "#fbfaf6",
      surface: "#f1eee6",
      text: "#1b1a17",
      muted: "#65625a",
      accent: "#c8442b",
      accentText: "#ffffff",
      line: "#e2ddd1",
    },
  },
  {
    id: "ink",
    name: "Ink",
    palette: {
      bg: "#0d0e10",
      surface: "#17191c",
      text: "#f3f2ee",
      muted: "#9b9b97",
      accent: "#e8e4d8",
      accentText: "#111214",
      line: "#2a2c30",
    },
  },
  {
    id: "forest",
    name: "Forest",
    palette: {
      bg: "#f4f2ea",
      surface: "#e6e6d8",
      text: "#1d2a22",
      muted: "#566357",
      accent: "#2f5d46",
      accentText: "#f6f4ea",
      line: "#d3d4c3",
    },
  },
  {
    id: "dusk",
    name: "Dusk",
    palette: {
      bg: "#17131f",
      surface: "#221c2d",
      text: "#f2ecf6",
      muted: "#a79fb2",
      accent: "#f0a35e",
      accentText: "#1a1320",
      line: "#352c42",
    },
  },
  {
    id: "marine",
    name: "Marine",
    palette: {
      bg: "#f5f8fa",
      surface: "#e7eef3",
      text: "#10222e",
      muted: "#54697a",
      accent: "#0f5f8c",
      accentText: "#ffffff",
      line: "#d3dfe7",
    },
  },
  {
    id: "blush",
    name: "Blush",
    palette: {
      bg: "#fdf6f3",
      surface: "#f8e8e2",
      text: "#30201d",
      muted: "#7c6560",
      accent: "#b84a5a",
      accentText: "#ffffff",
      line: "#efdad3",
    },
  },
  {
    id: "volt",
    name: "Volt",
    palette: {
      bg: "#0b0b0b",
      surface: "#161616",
      text: "#fafafa",
      muted: "#a0a0a0",
      accent: "#ff6b2c",
      accentText: "#160800",
      line: "#2b2b2b",
    },
  },
  {
    id: "clay",
    name: "Clay",
    palette: {
      bg: "#f6efe6",
      surface: "#ecdfcf",
      text: "#2c221b",
      muted: "#75665a",
      accent: "#a4552e",
      accentText: "#fff8f1",
      line: "#e0d0bd",
    },
  },
  {
    id: "mono",
    name: "Mono",
    palette: {
      bg: "#ffffff",
      surface: "#f3f3f3",
      text: "#0c0c0c",
      muted: "#696969",
      accent: "#0c0c0c",
      accentText: "#ffffff",
      line: "#e2e2e2",
    },
  },
  {
    id: "pine",
    name: "Pine",
    palette: {
      bg: "#0f1a16",
      surface: "#17261f",
      text: "#ecf2ec",
      muted: "#99a99e",
      accent: "#b6d98a",
      accentText: "#10200f",
      line: "#26382e",
    },
  },
]

export const TYPEFACES: {
  id: string
  name: string
  heading: string
  body: string
}[] = [
  {
    id: "grotesk",
    name: "Grotesk",
    heading: "Bricolage Grotesque",
    body: "Inter",
  },
  {
    id: "editorial",
    name: "Editorial",
    heading: "Playfair Display",
    body: "Lora",
  },
  { id: "soft", name: "Soft serif", heading: "Fraunces", body: "DM Sans" },
  {
    id: "elegant",
    name: "Elegant",
    heading: "Cormorant Garamond",
    body: "Manrope",
  },
  { id: "modern", name: "Modern", heading: "Sora", body: "Inter" },
  { id: "poster", name: "Poster", heading: "Bebas Neue", body: "DM Sans" },
  { id: "bold", name: "Bold", heading: "Archivo", body: "Inter" },
  {
    id: "technical",
    name: "Technical",
    heading: "Space Grotesk",
    body: "JetBrains Mono",
  },
  {
    id: "display",
    name: "Display",
    heading: "DM Serif Display",
    body: "Manrope",
  },
  {
    id: "condensed",
    name: "Condensed",
    heading: "Oswald",
    body: "Libre Baskerville",
  },
]

export const CORNERS: { id: string; name: string; radius: number }[] = [
  { id: "sharp", name: "Sharp", radius: 0 },
  { id: "crisp", name: "Crisp", radius: 4 },
  { id: "soft", name: "Soft", radius: 10 },
  { id: "round", name: "Round", radius: 18 },
  { id: "pill", name: "Pill", radius: 40 },
]

export interface Look {
  palette?: string
  type?: string
  corners?: string
}

export function applyLook<T extends { theme: import("./model").Theme }>(
  site: T,
  look: Look
): T {
  const palette = PALETTES.find((p) => p.id === look.palette)?.palette
  const type = TYPEFACES.find((t) => t.id === look.type)
  const corners = CORNERS.find((c) => c.id === look.corners)
  return {
    ...site,
    theme: {
      ...site.theme,
      ...(palette && { palette }),
      ...(type && { heading: type.heading, body: type.body }),
      ...(corners && { radius: corners.radius }),
    },
  }
}
