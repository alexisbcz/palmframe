import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { FONTS, toSite, type El, type Section, type Site } from "../model"
import { TEMPLATES, templateById } from "./index"

const PUBLIC = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../public"
)

const sections = (s: Site): Section[] => [
  ...(s.header ? [s.header] : []),
  ...s.pages.flatMap((p) => p.sections),
  ...(s.footer ? [s.footer] : []),
]

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const imagesIn = (s: Site) => {
  const out: string[] = []
  const add = (v: string) => v && out.push(v)
  for (const sec of sections(s)) {
    if (sec.fill.kind === "image") add(sec.fill.src)
    for (const e of sec.elements) {
      if (e.type === "image") add(e.props.src)
      if (e.type === "gallery") e.props.images.forEach((i) => add(i.src))
    }
  }
  s.products.forEach((p) => p.images.forEach(add))
  s.posts.forEach((p) => add(p.cover))
  s.events.forEach((e) => add(e.image))
  s.collections.forEach((c) => c.items.forEach((i) => add(i.image)))
  s.pages.forEach((p) => add(p.seo.image))
  add(s.settings.shareImage)
  return out
}

// A rough guess at wrapped text height, to catch the worst overflows.
const textOverflow = (e: Extract<El, { type: "text" }>) => {
  const size = e.style.size ?? 16
  const perLine = Math.max(1, Math.floor(e.box.w / (size * 0.53)))
  const lines = e.props.text
    .split("\n")
    .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0)
  return lines * size * (e.style.leading ?? 1.35) - e.box.h
}

for (const t of TEMPLATES) {
  describe(t.id, () => {
    const a = t.make()

    test("shape and links", () => {
      expect(a.version).toBe(1)
      expect(toSite(a).pages.length).toBe(a.pages.length)
      expect(a.pages.length).toBeGreaterThanOrEqual(3)
      expect(a.pages.length).toBeLessThanOrEqual(6)
      expect(a.pages[0]!.slug).toBe("")
      expect(a.header).toBeTruthy()
      expect(a.footer).toBeTruthy()
      expect(a.settings.indexable).toBe(false)
      for (const p of a.pages) {
        expect(p.seo.title.length).toBeGreaterThan(5)
        expect(p.seo.description.length).toBeGreaterThan(20)
      }
      const ids = new Set(a.pages.map((p) => p.id))
      for (const s of sections(a))
        for (const e of s.elements) {
          if (e.type === "button" && e.props.link?.kind === "page")
            expect(ids.has(e.props.link.page)).toBe(true)
          if (e.type === "pricing")
            for (const tier of e.props.tiers)
              if (tier.link?.kind === "page")
                expect(ids.has(tier.link.page)).toBe(true)
        }
    })

    test("images exist", () => {
      for (const src of imagesIn(a)) {
        expect(src.startsWith("/sites/")).toBe(true)
        expect(existsSync(join(PUBLIC, src))).toBe(true)
      }
    })

    test("collections and fonts", () => {
      const cols = new Set(a.collections.map((c) => c.id))
      for (const s of sections(a))
        for (const e of s.elements)
          if (e.type === "list") expect(cols.has(e.props.collection)).toBe(true)
      expect(FONTS[a.theme.heading]).toBeTruthy()
      expect(FONTS[a.theme.body]).toBeTruthy()
    })

    test("contrast", () => {
      const p = a.theme.palette
      expect(contrast(p.accent, p.accentText)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.bg, p.text)).toBeGreaterThanOrEqual(7)
      expect(contrast(p.bg, p.muted)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.surface, p.muted)).toBeGreaterThanOrEqual(4)
    })

    test("elements stay in their sections", () => {
      for (const s of sections(a))
        for (const e of s.elements) {
          expect(e.box.x).toBeGreaterThanOrEqual(0)
          expect(e.box.x + e.box.w).toBeLessThanOrEqual(1200)
          expect(e.box.y + e.box.h).toBeLessThanOrEqual(s.height)
          if (e.type === "text") {
            const over = textOverflow(e)
            if (over > e.box.h * 0.15)
              throw new Error(
                `${s.name}: "${e.props.text.slice(0, 40)}" overflows by ~${Math.round(over)}px`
              )
          }
        }
    })

    test("fresh ids each call", () => {
      const b = t.make()
      expect(b.pages[0]!.id).not.toBe(a.pages[0]!.id)
      expect(b.pages[0]!.sections[0]!.id).not.toBe(a.pages[0]!.sections[0]!.id)
      expect(b.pages[0]!.sections[0]!.elements[0]!.id).not.toBe(
        a.pages[0]!.sections[0]!.elements[0]!.id
      )
    })

    test("copy hygiene", () => {
      const text = JSON.stringify(a)
      expect(text).not.toMatch(/—|lorem|unlock|elevate|seamless|journey/i)
    })
  })
}

test("lookup and distinct themes", () => {
  expect(TEMPLATES.length).toBe(14)
  expect(templateById("kiln")?.id).toBe("kiln")
  expect(templateById("nope")).toBeUndefined()
  const pairs = TEMPLATES.map((t) => {
    const s = t.make().theme
    return `${s.heading}/${s.body}`
  })
  expect(new Set(pairs).size).toBe(14)
  const dark = TEMPLATES.filter((t) => lum(t.make().theme.palette.bg) < 0.1)
  expect(dark.length).toBeGreaterThanOrEqual(3)
})
