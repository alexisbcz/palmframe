// Small helpers the templates share. Not a template itself.
import {
  DEFAULT_HOURS,
  newId,
  type Collection,
  type EventItem,
  type Hours,
  type Link,
  type Page,
  type Post,
  type Product,
  type Section,
  type Service,
  type Site,
  type Theme,
} from "../model"

export const to = (page: string): Link => ({ kind: "page", page })

export function page(
  id: string,
  name: string,
  slug: string,
  sections: Section[],
  title: string,
  description: string,
  image = "",
  hideFromMenu = false
): Page {
  return {
    id,
    name,
    slug,
    hideFromMenu,
    seo: { title, description, image },
    sections,
  }
}

export function product(
  name: string,
  price: number,
  description: string,
  images: string[],
  soldOut = false
): Product {
  return {
    id: newId(),
    slug: name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    name,
    price,
    description,
    images,
    soldOut,
  }
}

export const service = (
  name: string,
  description: string,
  minutes: number,
  price: number
): Service => ({ id: newId(), name, description, minutes, price })

export const post = (
  title: string,
  excerpt: string,
  body: string,
  cover: string,
  author: string,
  date: string
): Post => ({
  id: newId(),
  slug: title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
  title,
  excerpt,
  body,
  cover,
  author,
  date,
})

export const eventItem = (
  title: string,
  date: string,
  location: string,
  description: string,
  image: string,
  capacity: number
): EventItem => ({
  id: newId(),
  title,
  date,
  location,
  description,
  image,
  capacity,
})

export const collection = (
  name: string,
  items: {
    title: string
    subtitle: string
    body: string
    image: string
    url?: string
  }[]
): Collection => ({
  id: newId(),
  name,
  items: items.map((i) => ({ id: newId(), url: "", ...i })),
})

export function site(o: {
  name: string
  description: string
  theme: Theme
  header: Section
  footer: Section
  pages: Page[]
  currency?: string
  hours?: Partial<Hours>
  posts?: Post[]
  products?: Product[]
  services?: Service[]
  events?: EventItem[]
  collections?: Collection[]
  shareImage?: string
  orderNote?: string
}): Site {
  return {
    version: 1,
    name: o.name,
    theme: o.theme,
    header: o.header,
    footer: o.footer,
    pages: o.pages,
    posts: o.posts ?? [],
    products: o.products ?? [],
    services: o.services ?? [],
    hours: { ...DEFAULT_HOURS, ...(o.hours ?? {}) },
    events: o.events ?? [],
    collections: o.collections ?? [],
    settings: {
      currency: o.currency ?? "USD",
      favicon: "",
      description: o.description,
      shareImage: o.shareImage ?? "",
      indexable: false,
      orderNote: o.orderNote ?? "",
    },
  }
}

// Photographs live in /public/sites/<template>/.
export const img = (tpl: string) => (name: string) =>
  `/sites/${tpl}/${name}.jpg`
