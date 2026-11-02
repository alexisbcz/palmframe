// Pure document edits, used by the editor and the server alike.
import { blocks } from "./blocks"
import {
  newId,
  slugify,
  type Device,
  type El,
  type Page,
  type Section,
  type Site,
} from "./model"

export type App = "store" | "bookings" | "blog" | "events"
export const APPS: App[] = ["store", "bookings", "blog", "events"]

export const allSections = (site: Site, page: Page | null): Section[] =>
  [site.header, ...(page?.sections ?? []), site.footer].filter(
    (s): s is Section => !!s
  )

export function mapSections(site: Site, fn: (s: Section) => Section): Site {
  return {
    ...site,
    header: site.header && fn(site.header),
    footer: site.footer && fn(site.footer),
    pages: site.pages.map((p) => ({ ...p, sections: p.sections.map(fn) })),
  }
}

export const mapElements = (site: Site, ids: string[], fn: (e: El) => El) =>
  mapSections(site, (s) =>
    s.elements.some((e) => ids.includes(e.id))
      ? {
          ...s,
          elements: s.elements.map((e) => (ids.includes(e.id) ? fn(e) : e)),
        }
      : s
  )

export function findElement(site: Site, id: string) {
  for (const s of allSections(site, null).concat(
    site.pages.flatMap((p) => p.sections)
  )) {
    const element = s.elements.find((e) => e.id === id)
    if (element) return { section: s, element }
  }
  return null
}

export const removeElements = (site: Site, ids: string[]) =>
  mapSections(site, (s) => ({
    ...s,
    elements: s.elements.filter((e) => !ids.includes(e.id)),
  }))

export const addElement = (site: Site, sectionId: string, element: El) =>
  mapSections(site, (s) =>
    s.id === sectionId ? { ...s, elements: [...s.elements, element] } : s
  )

export const cloneElement = (e: El, offset = 24): El => ({
  ...e,
  id: newId(),
  box: { ...e.box, x: e.box.x + offset, y: e.box.y + offset },
  phone: e.phone ? { ...e.phone, y: e.phone.y + offset } : null,
})

export const cloneSection = (s: Section): Section => ({
  ...s,
  id: newId(),
  elements: s.elements.map((e) => ({ ...e, id: newId() })),
})

export const clonePage = (p: Page, name: string): Page => ({
  ...p,
  id: newId(),
  name,
  slug: slugify(name) || newId(),
  sections: p.sections.map(cloneSection),
})

export const newPage = (site: Site, name: string): Page => {
  const base = slugify(name) || "page"
  let slug = base
  for (let i = 2; site.pages.some((p) => p.slug === slug); i++)
    slug = `${base}-${i}`
  return {
    id: newId(),
    name,
    slug,
    seo: { title: "", description: "", image: "" },
    sections: [],
  }
}

export function reorder<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

export const frameKey = (device: Device) =>
  device === "desktop" ? ("box" as const) : ("phone" as const)

const SAMPLE = "/sites/stock/studio.jpg"

// Turns an app on: sample content, and a page that shows it.
export function addApp(site: Site, app: App): Site {
  if (hasApp(site, app)) return site
  const page = (name: string, sections: Section[]): Page => ({
    ...newPage(site, name),
    sections,
  })
  if (app === "store")
    return {
      ...site,
      products: site.products.length
        ? site.products
        : [
            { name: "First product", price: 24 },
            { name: "Second product", price: 38 },
            { name: "Third product", price: 56 },
          ].map((p) => ({
            ...p,
            id: newId(),
            slug: slugify(p.name),
            description: "Say what it is, what it's made of and who it's for.",
            images: [SAMPLE],
          })),
      pages: [...site.pages, page("Shop", [blocks.shop({ title: "Shop" })])],
    }
  if (app === "bookings")
    return {
      ...site,
      services: site.services.length
        ? site.services
        : [
            {
              id: newId(),
              name: "Consultation",
              description: "A first conversation.",
              minutes: 30,
              price: 0,
            },
            {
              id: newId(),
              name: "Full session",
              description: "The complete service.",
              minutes: 60,
              price: 80,
            },
          ],
      pages: [
        ...site.pages,
        page("Book", [
          blocks.booking({
            title: "Book a time",
            text: "Pick a service and a time that suits you.",
          }),
        ]),
      ],
    }
  if (app === "blog")
    return {
      ...site,
      posts: site.posts.length
        ? site.posts
        : [
            {
              id: newId(),
              slug: "first-post",
              title: "Your first post",
              excerpt: "A sentence that makes people want to read on.",
              body: "Write here.\n\n## A subheading\n\nKeep going.",
              cover: SAMPLE,
              author: "",
              date: new Date().toISOString().slice(0, 10),
            },
          ],
      pages: [
        ...site.pages,
        page("Blog", [blocks.blog({ title: "Latest posts" })]),
      ],
    }
  return {
    ...site,
    events: site.events.length
      ? site.events
      : [
          {
            id: newId(),
            title: "First event",
            date: new Date(Date.now() + 30 * 864e5).toISOString(),
            location: "Where it happens",
            description: "What it is and who should come.",
            image: SAMPLE,
            capacity: 40,
          },
        ],
    pages: [
      ...site.pages,
      page("Events", [blocks.events({ title: "What's on" })]),
    ],
  }
}

const usesType = (site: Site, type: El["type"]) =>
  site.pages.some((p) =>
    p.sections.some((s) => s.elements.some((e) => e.type === type))
  )

export const hasApp = (site: Site, app: App) =>
  usesType(
    site,
    app === "store"
      ? "products"
      : app === "bookings"
        ? "booking"
        : app === "blog"
          ? "posts"
          : "events"
  )

export function emptySite(name: string): Site {
  return {
    version: 1,
    name,
    theme: {
      palette: {
        bg: "#ffffff",
        surface: "#f4f3ef",
        text: "#141414",
        muted: "#62625e",
        accent: "#141414",
        accentText: "#ffffff",
        line: "#e3e1dc",
      },
      heading: "Bricolage Grotesque",
      body: "Inter",
      radius: 8,
    },
    header: blocks.header(name),
    footer: blocks.footer(name, "A line about what you do."),
    pages: [
      {
        id: newId(),
        name: "Home",
        slug: "",
        seo: { title: "", description: "", image: "" },
        sections: [
          blocks.heroSplit({
            title: "Say what you do in one line",
            text: "A sentence or two about who you help and how.",
            cta: "Get in touch",
            image: "/sites/stock/studio.jpg",
          }),
        ],
      },
    ],
    posts: [],
    products: [],
    services: [],
    hours: { days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00", horizon: 30 },
    events: [],
    collections: [],
    settings: {
      currency: "USD",
      favicon: "",
      description: "",
      shareImage: "",
      indexable: false,
      orderNote: "",
    },
  }
}
