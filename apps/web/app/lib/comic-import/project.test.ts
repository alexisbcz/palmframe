import { expect, test } from "bun:test"

import { MAX_SLIDES, toProject } from "@/components/comic-canvas/model"

import {
  bookTitle,
  importedProject,
  partTitle,
  slideSize,
  splitPages,
} from "./project"

test("an imported project is a valid one, a full-page panel per page", () => {
  const project = importedProject(["https://x/a.jpg", "https://x/b.jpg"], {
    width: 1080,
    height: 1440,
  })
  const read = toProject(JSON.parse(JSON.stringify(project)))!
  expect(read.pages).toHaveLength(2)
  const panel = read.pages[1]!.layers[0]!
  expect(panel).toMatchObject({
    type: "panel",
    src: "https://x/b.jpg",
    fit: "contain",
    x: 0,
    y: 0,
    width: 1080,
    height: 1440,
    borderWidth: 0,
    name: "Page 2",
  })
})

test("slides take the cover's shape, within limits", () => {
  expect(slideSize(1000, 1400)).toEqual({ width: 1080, height: 1512 })
  expect(slideSize(100, 9000).height).toBe(2160)
  expect(slideSize(9000, 100).height).toBe(540)
  expect(slideSize(0, 0).height).toBe(1512)
})

test("a long book splits into parts a project can hold", () => {
  const pages = Array.from({ length: MAX_SLIDES * 2 + 5 }, (_, i) => i)
  const parts = splitPages(pages)
  expect(parts.map((p) => p.length)).toEqual([MAX_SLIDES, MAX_SLIDES, 5])
  expect(parts.flat()).toEqual(pages)
  expect(splitPages([])).toEqual([])
})

test("titles come from file names", () => {
  expect(
    bookTitle(
      "Largo Winch 001 - The Heir -- The W Group (2008) (Cinebook) (digital) (Lynx-Empire).cbr"
    )
  ).toBe("Largo Winch 001 - The Heir -- The W Group (2008)")
  expect(bookTitle("my_comic.cbz")).toBe("my comic")
  expect(bookTitle("(scan).cbr")).toBe("(scan).cbr")
  expect(partTitle("Book", 2, 3)).toBe("Book (2/3)")
  expect(partTitle("Book", 1, 1)).toBe("Book")
})
