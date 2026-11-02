// Every piece of copy in a site as a flat list of slots, so a model can rewrite
// the words of a template and the layout stays exactly as designed.
import { mapSections } from "./edit"
import type { El, Site } from "./model"

export type Slots = Record<string, string>

const words = (e: El, out: Slots) => {
  const key = (k: string) => `${e.id}.${k}`
  switch (e.type) {
    case "text":
      out[key("text")] = e.props.text
      break
    case "button":
      out[key("label")] = e.props.label
      break
    case "accordion":
      e.props.items.forEach((item, i) => {
        out[key(`q${i}`)] = item.q
        out[key(`a${i}`)] = item.a
      })
      break
    case "pricing":
      e.props.tiers.forEach((tier, i) => {
        out[key(`name${i}`)] = tier.name
        out[key(`note${i}`)] = tier.note
        tier.features.forEach((f, j) => {
          out[key(`f${i}_${j}`)] = f
        })
      })
      break
  }
}

export function slotsOf(site: Site): Slots {
  const out: Slots = {}
  mapSections(site, (s) => {
    s.elements.forEach((e) => words(e, out))
    return s
  })
  site.pages.forEach((p) => {
    out[`page.${p.id}.title`] = p.seo.title
    out[`page.${p.id}.description`] = p.seo.description
  })
  site.products.forEach((p) => {
    out[`product.${p.id}.name`] = p.name
    out[`product.${p.id}.description`] = p.description
  })
  site.services.forEach((p) => {
    out[`service.${p.id}.name`] = p.name
    out[`service.${p.id}.description`] = p.description
  })
  site.events.forEach((p) => {
    out[`event.${p.id}.title`] = p.title
    out[`event.${p.id}.description`] = p.description
    out[`event.${p.id}.location`] = p.location
  })
  site.posts.slice(0, 3).forEach((p) => {
    out[`post.${p.id}.title`] = p.title
    out[`post.${p.id}.excerpt`] = p.excerpt
    out[`post.${p.id}.body`] = p.body
  })
  site.collections.forEach((c) =>
    c.items.forEach((item) => {
      out[`item.${item.id}.title`] = item.title
      out[`item.${item.id}.subtitle`] = item.subtitle
      out[`item.${item.id}.body`] = item.body
    })
  )
  return out
}

const rewritten = (e: El, slots: Slots): El => {
  const get = (k: string, old: string) => slots[`${e.id}.${k}`] ?? old
  switch (e.type) {
    case "text":
      return { ...e, props: { ...e.props, text: get("text", e.props.text) } }
    case "button":
      return { ...e, props: { ...e.props, label: get("label", e.props.label) } }
    case "accordion":
      return {
        ...e,
        props: {
          ...e.props,
          items: e.props.items.map((item, i) => ({
            q: get(`q${i}`, item.q),
            a: get(`a${i}`, item.a),
          })),
        },
      }
    case "pricing":
      return {
        ...e,
        props: {
          ...e.props,
          tiers: e.props.tiers.map((tier, i) => ({
            ...tier,
            name: get(`name${i}`, tier.name),
            note: get(`note${i}`, tier.note),
            features: tier.features.map((f, j) => get(`f${i}_${j}`, f)),
          })),
        },
      }
    default:
      return e
  }
}

export function applySlots(site: Site, slots: Slots): Site {
  const get = (k: string, old: string) => slots[k] ?? old
  const next = mapSections(site, (s) => ({
    ...s,
    elements: s.elements.map((e) => rewritten(e, slots)),
  }))
  return {
    ...next,
    pages: next.pages.map((p) => ({
      ...p,
      seo: {
        ...p.seo,
        title: get(`page.${p.id}.title`, p.seo.title),
        description: get(`page.${p.id}.description`, p.seo.description),
      },
    })),
    products: next.products.map((p) => ({
      ...p,
      name: get(`product.${p.id}.name`, p.name),
      description: get(`product.${p.id}.description`, p.description),
    })),
    services: next.services.map((p) => ({
      ...p,
      name: get(`service.${p.id}.name`, p.name),
      description: get(`service.${p.id}.description`, p.description),
    })),
    events: next.events.map((p) => ({
      ...p,
      title: get(`event.${p.id}.title`, p.title),
      description: get(`event.${p.id}.description`, p.description),
      location: get(`event.${p.id}.location`, p.location),
    })),
    posts: next.posts.map((p) => ({
      ...p,
      title: get(`post.${p.id}.title`, p.title),
      excerpt: get(`post.${p.id}.excerpt`, p.excerpt),
      body: get(`post.${p.id}.body`, p.body),
    })),
    collections: next.collections.map((c) => ({
      ...c,
      items: c.items.map((item) => ({
        ...item,
        title: get(`item.${item.id}.title`, item.title),
        subtitle: get(`item.${item.id}.subtitle`, item.subtitle),
        body: get(`item.${item.id}.body`, item.body),
      })),
    })),
  }
}
