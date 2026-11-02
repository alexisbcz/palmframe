import { el } from "./blocks"
import { newId, type El, type ElementType, type Site } from "./model"

const box = (w: number, h: number) => ({ x: 600 - w / 2, y: 80, w, h })

// What each entry in the Add panel drops on the page.
export function newElement(type: ElementType, site: Site): El {
  switch (type) {
    case "text":
      return el(
        "text",
        box(460, 40),
        { text: "Double-click to edit", tag: "p" },
        { size: 22 }
      )
    case "button":
      return el(
        "button",
        box(180, 52),
        { label: "Button", variant: "solid" },
        { size: 16 }
      )
    case "image":
      return el(
        "image",
        box(420, 300),
        { src: "/sites/stock/studio.jpg", alt: "" },
        { radius: 10 }
      )
    case "shape":
      return el(
        "shape",
        box(320, 220),
        { shape: "box" },
        { fill: "$surface", radius: 12 }
      )
    case "line":
      return el("line", box(600, 2), {}, { fill: "$line" })
    case "gallery":
      return el("gallery", box(900, 420), {
        images: [1, 2, 3, 4, 5, 6].map(() => ({
          src: "/sites/stock/studio.jpg",
          alt: "",
        })),
        layout: "grid",
        columns: 3,
        gap: 12,
      })
    case "video":
      return el("video", box(640, 360), { url: "" })
    case "menu":
      return el("menu", box(520, 40), { gap: 28 }, { size: 15 })
    case "social":
      return el(
        "social",
        box(200, 36),
        {
          links: [
            { kind: "instagram", url: "https://instagram.com/" },
            { kind: "facebook", url: "https://facebook.com/" },
          ],
        },
        { size: 18 }
      )
    case "form":
      return el("form", box(460, 340), {
        fields: [
          { id: newId(), label: "Name", type: "text", required: true },
          { id: newId(), label: "Email", type: "email", required: true },
          { id: newId(), label: "Message", type: "textarea" },
        ],
        submit: "Send",
        success: "Thanks. We'll be in touch.",
      })
    case "map":
      return el("map", box(520, 320), { query: "Paris" }, { radius: 10 })
    case "embed":
      return el("embed", box(520, 300), { html: "<p>Paste your code here</p>" })
    case "countdown":
      return el(
        "countdown",
        box(520, 100),
        {
          to: new Date(Date.now() + 14 * 864e5).toISOString(),
          done: "It's here.",
        },
        { size: 18 }
      )
    case "accordion":
      return el("accordion", box(640, 240), {
        items: [
          { q: "A question", a: "Its answer." },
          { q: "Another question", a: "Its answer." },
        ],
      })
    case "pricing":
      return el("pricing", box(900, 460), {
        tiers: [
          {
            name: "Basic",
            price: "$20",
            note: "per month",
            features: ["One feature"],
            cta: "Choose",
          },
          {
            name: "Plus",
            price: "$40",
            note: "per month",
            features: ["Two features"],
            cta: "Choose",
            featured: true,
          },
        ],
      })
    case "products":
      return el("products", box(1080, 520), { columns: 3, limit: 3 })
    case "posts":
      return el("posts", box(1080, 440), { columns: 3, limit: 3 })
    case "events":
      return el("events", box(960, 480), { limit: 2 })
    case "booking":
      return el("booking", box(600, 560), { heading: "Choose a time" })
    case "list":
      return el("list", box(1080, 400), {
        collection: site.collections[0]?.id ?? "",
        columns: 3,
        limit: 3,
      })
  }
}

export const ADD_GROUPS: { id: string; types: ElementType[] }[] = [
  { id: "basics", types: ["text", "button", "image", "shape", "line"] },
  { id: "media", types: ["gallery", "video", "map", "embed"] },
  {
    id: "site",
    types: ["menu", "social", "form", "countdown", "accordion", "pricing"],
  },
  { id: "apps", types: ["products", "posts", "events", "booking", "list"] },
]
