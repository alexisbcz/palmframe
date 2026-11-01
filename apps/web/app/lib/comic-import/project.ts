import {
  MAX_SLIDES,
  createPanel,
  type ComicPage,
  type ComicProject,
} from "@/components/comic-canvas/model"

// A comic as an editable project: every page one panel filling its slide, so
// lettering, translation and image tools all work on it.

const SLIDE_WIDTH = 1080
const MIN_HEIGHT = 540
const MAX_HEIGHT = 2160

// Pages keep their shape; the slide takes the cover's, within reason.
export function slideSize(width: number, height: number) {
  const ratio = width > 0 && height > 0 ? height / width : 1.4
  return {
    width: SLIDE_WIDTH,
    height: Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, Math.round(SLIDE_WIDTH * ratio))
    ),
  }
}

export function importedProject(
  urls: string[],
  size: { width: number; height: number }
): ComicProject {
  const pages: ComicPage[] = urls.map((src, i) => {
    const panel = createPanel({ x: 0, y: 0, ...size }, src)
    return {
      id: crypto.randomUUID(),
      layers: [
        // Contain, not cover: a double spread mustn't lose its edges.
        { ...panel, name: `Page ${i + 1}`, fit: "contain", borderWidth: 0 },
      ],
    }
  })
  return { ...size, version: 2, background: "#ffffff", pages }
}

// What a project can hold, in order. A long book becomes several parts.
export function splitPages<T>(pages: T[], size = MAX_SLIDES): T[][] {
  const parts: T[][] = []
  for (let i = 0; i < pages.length; i += size)
    parts.push(pages.slice(i, i + size))
  return parts
}

// `Largo Winch 001 - The Heir (2008) (Cinebook) (digital).cbr` keeps its name
// and year, and loses what only a file needs.
export function bookTitle(file: string) {
  const title = file
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/\((?!\d{4}\))[^)]*\)/g, " ")
    .replace(/[_\s]+/g, " ")
    .trim()
  return (title || file).slice(0, 120)
}

export const partTitle = (title: string, part: number, parts: number) =>
  parts > 1 ? `${title.slice(0, 110)} (${part}/${parts})` : title
