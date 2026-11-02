import { describe, expect, test } from "bun:test"

import { blocks } from "./blocks"
import { addApp, emptySite, hasApp, removeElements } from "./edit"
import {
  color,
  phoneLayout,
  safeHref,
  safeImage,
  slugAllowed,
  toSite,
  videoEmbed,
  type Site,
} from "./model"
import { applySlots, slotsOf } from "./slots"
import { resizeBox, snapMove } from "./snap"
import { checkSubmission } from "./submit"
import { TEMPLATES } from "./templates"

describe("what may reach a public page", () => {
  test("links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull()
    expect(safeHref(" JaVaScRiPt:alert(1)")).toBeNull()
    expect(safeHref("data:text/html,x")).toBeNull()
    expect(safeHref("//evil.example")).toBeNull()
    expect(safeHref("https://example.com")).toBe("https://example.com")
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com")
    expect(safeHref("/s/x")).toBe("/s/x")
  })
  test("images", () => {
    expect(safeImage("http://example.com/a.png")).toBe("")
    expect(safeImage("javascript:x")).toBe("")
    expect(safeImage("data:image/svg+xml;base64,AA")).toBe("")
    expect(safeImage("https://example.com/a.png")).toBe(
      "https://example.com/a.png"
    )
  })
  test("colours", () => {
    expect(color("$accent")).toBe("var(--st-accent)")
    expect(color("$nope", "x")).toBe("x")
    expect(color("red;background:url(x)", "x")).toBe("x")
    expect(color("#fff")).toBe("#fff")
  })
  test("videos only from known hosts, in their private forms", () => {
    expect(videoEmbed("https://evil.example/embed/abcdefg")).toBeNull()
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")).toContain(
      "youtube-nocookie.com"
    )
  })
  test("addresses", () => {
    expect(slugAllowed("rosewater")).toBe(true)
    expect(slugAllowed("paypal-login")).toBe(false)
    expect(slugAllowed("login")).toBe(false)
    expect(slugAllowed("a")).toBe(false)
    expect(slugAllowed("Bad Slug")).toBe(false)
  })
})

describe("stored documents", () => {
  test("rubbish reads as an empty site", () => {
    const site = toSite({ pages: "no", theme: 3 })
    expect(site.pages).toHaveLength(1)
    expect(site.settings.indexable).toBe(false)
  })
  test("unknown elements are dropped", () => {
    const site = toSite({
      pages: [
        {
          sections: [
            { elements: [{ type: "script" }, { type: "line", box: {} }] },
          ],
        },
      ],
    })
    expect(site.pages[0]!.sections[0]!.elements.map((e) => e.type)).toEqual([
      "line",
    ])
  })
})

describe("phone layout", () => {
  test("every template stacks without overlaps or leaving the screen", () => {
    for (const t of TEMPLATES)
      for (const page of t.make().pages)
        for (const section of page.sections) {
          const { frames, height } = phoneLayout(section)
          for (const box of frames.values()) {
            expect(box.x).toBeGreaterThanOrEqual(0)
            expect(box.x + box.w).toBeLessThanOrEqual(390)
            expect(box.y + box.h).toBeLessThanOrEqual(height)
          }
        }
  })
  test("columns stay together rather than interleaving", () => {
    const section = blocks.features({
      title: "T",
      items: [
        { title: "A", text: "a" },
        { title: "B", text: "b" },
        { title: "C", text: "c" },
      ],
    })
    const { frames } = phoneLayout(section)
    const text = section.elements.flatMap((e) =>
      e.type === "text" ? [{ t: e.props.text, y: frames.get(e.id)!.y }] : []
    )
    const order = text.sort((a, b) => a.y - b.y).map((x) => x.t)
    expect(order).toEqual(["T", "A", "a", "B", "b", "C", "c"])
  })
  test("a header becomes one bar and drops its button", () => {
    const section = blocks.header("Name", { label: "Go" })
    const { bar, height, dropped } = phoneLayout(section)
    expect(bar).toBe(true)
    expect(height).toBe(64)
    expect(dropped.size).toBe(1)
  })
})

describe("snapping and resizing", () => {
  const box = { x: 100, y: 100, w: 100, h: 50 }
  test("snaps to a nearby edge", () => {
    const snap = snapMove(box, [{ x: 203, y: 400, w: 50, h: 50 }])
    expect(snap.dx).toBe(3)
    expect(snap.guides[0]).toEqual({ axis: "x", at: 203 })
  })
  test("ignores what's far away", () => {
    expect(snapMove(box, [{ x: 500, y: 500, w: 9, h: 9 }]).guides).toEqual([])
  })
  test("a west handle keeps the east edge", () => {
    const next = resizeBox(box, "w", 20, 0, false)
    expect(next.x + next.w).toBe(200)
  })
  test("never shrinks below the minimum", () => {
    expect(resizeBox(box, "e", -999, 0, false).w).toBe(12)
  })
  test("shift keeps the ratio", () => {
    const next = resizeBox(box, "se", 100, 0, true)
    expect(next.w / next.h).toBeCloseTo(2)
  })
})

describe("copy slots", () => {
  test("rewriting words leaves the layout alone", () => {
    const site = TEMPLATES[0]!.make()
    const slots = Object.fromEntries(
      Object.keys(slotsOf(site)).map((k) => [k, "New words"])
    )
    const next = applySlots(site, slots)
    expect(JSON.stringify(next.theme)).toBe(JSON.stringify(site.theme))
    expect(next.pages[0]!.sections.map((s) => s.height)).toEqual(
      site.pages[0]!.sections.map((s) => s.height)
    )
    expect(Object.values(slotsOf(next)).every((v) => v === "New words")).toBe(
      true
    )
  })
})

describe("apps", () => {
  test("adding one gives it a page and content, once", () => {
    let site = addApp(emptySite("X"), "store")
    expect(hasApp(site, "store")).toBe(true)
    expect(site.products.length).toBeGreaterThan(0)
    const pages = site.pages.length
    site = addApp(site, "store")
    expect(site.pages).toHaveLength(pages)
  })
  test("removing an element removes it everywhere", () => {
    const site = emptySite("X")
    const id = site.pages[0]!.sections[0]!.elements[0]!.id
    const next = removeElements(site, [id])
    expect(next.pages[0]!.sections[0]!.elements.some((e) => e.id === id)).toBe(
      false
    )
  })
})

describe("what visitors send", () => {
  const now = new Date("2027-03-01T08:00:00")
  const site = {
    ...emptySite("X"),
    products: [
      { id: "p", slug: "p", name: "P", price: 10, description: "", images: [] },
      {
        id: "gone",
        slug: "g",
        name: "G",
        price: 10,
        description: "",
        images: [],
        soldOut: true,
      },
      {
        id: "linked",
        slug: "l",
        name: "L",
        price: 5,
        description: "",
        images: [],
        paymentLink: "https://pay.example/x",
      },
    ],
    services: [{ id: "s", name: "S", description: "", minutes: 30, price: 1 }],
    events: [
      {
        id: "e",
        title: "E",
        date: "2027-04-01",
        location: "",
        description: "",
        image: "",
        capacity: 1,
      },
    ],
  } satisfies Site
  const buyer = { name: "A", email: "a@example.com" }

  test("order totals come from the published prices", () => {
    const r = checkSubmission(
      site,
      {
        kind: "order",
        buyer,
        items: [{ id: "p", qty: 3, price: 0 }],
        total: 1,
      },
      now
    )
    expect("data" in r && r.data.total).toBe(30)
  })
  test("sold-out items and silly quantities are refused", () => {
    for (const items of [
      [{ id: "gone", qty: 1 }],
      [{ id: "p", qty: 0 }],
      [{ id: "p", qty: 1000 }],
      [{ id: "unknown", qty: 1 }],
    ])
      expect(
        "error" in checkSubmission(site, { kind: "order", buyer, items }, now)
      ).toBe(true)
  })
  test("a payment link only applies to one single item", () => {
    const one = checkSubmission(
      site,
      { kind: "order", buyer, items: [{ id: "linked", qty: 1 }] },
      now
    )
    const two = checkSubmission(
      site,
      { kind: "order", buyer, items: [{ id: "linked", qty: 2 }] },
      now
    )
    expect("redirect" in one && one.redirect).toBe("https://pay.example/x")
    expect("redirect" in two).toBe(false)
  })
  test("bookings must fit the opening hours", () => {
    const at = (slot: string) =>
      "error" in
      checkSubmission(site, { kind: "booking", slot, visitor: buyer }, now)
    expect(at("s@2027-03-02T10:00")).toBe(false)
    expect(at("s@2027-03-02T20:00")).toBe(true) // closed
    expect(at("s@2027-03-06T10:00")).toBe(true) // Saturday
    expect(at("s@2026-03-02T10:00")).toBe(true) // past
    expect(at("s@2028-03-02T10:00")).toBe(true) // too far ahead
    expect(at("x@2027-03-02T10:00")).toBe(true) // no such service
  })
  test("anything else is refused", () => {
    expect("error" in checkSubmission(site, { kind: "admin" }, now)).toBe(true)
    expect("error" in checkSubmission(site, null, now)).toBe(true)
    expect(
      "error" in
        checkSubmission(
          site,
          { kind: "rsvp", event: "e", visitor: { name: "A", email: "nope" } },
          now
        )
    ).toBe(true)
  })
})
