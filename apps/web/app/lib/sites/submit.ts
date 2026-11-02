// Checks what a visitor sent against the published site. Pure, so every rule
// here has a test: the server never trusts a price or a time from the browser.
import type { Site } from "./model"

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : ""

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fields = (v: unknown, keys: number, length: number) =>
  Object.fromEntries(
    Object.entries((v ?? {}) as Record<string, unknown>)
      .slice(0, keys)
      .map(([k, value]) => [k.slice(0, 120), text(value, length)])
  )

export type Checked =
  | {
      kind: "form" | "newsletter" | "booking" | "order" | "rsvp"
      data: Record<string, unknown>
      slot?: string
      redirect?: string
    }
  | { error: string; status: number; code?: string }

const person = (v: unknown) => {
  const p = (v ?? {}) as Record<string, unknown>
  const name = text(p.name, 200)
  const email = text(p.email, 200)
  return name && EMAIL.test(email) ? { name, email } : null
}

export function checkSubmission(site: Site, body: unknown, now: Date): Checked {
  const b = (body ?? {}) as Record<string, unknown>
  const bad = { error: "That doesn't look right.", status: 400 }
  if (b.kind === "form" || b.kind === "newsletter") {
    const values = fields(b.values, 30, 4000)
    if (!Object.values(values).some(Boolean)) return bad
    return { kind: b.kind, data: { values, form: text(b.form, 40) } }
  }
  if (b.kind === "order") {
    const buyer = person(b.buyer)
    if (!buyer || !Array.isArray(b.items)) return bad
    const lines = (b.items as { id?: unknown; qty?: unknown }[])
      .slice(0, 50)
      .flatMap((line) => {
        const product = site.products.find((p) => p.id === line.id)
        const qty = Math.floor(Number(line.qty))
        if (!product || product.soldOut) return []
        if (!Number.isFinite(qty) || qty < 1 || qty > 99) return []
        return [{ product, qty }]
      })
    if (!lines.length) return bad
    const total = lines.reduce((n, l) => n + l.product.price * l.qty, 0)
    const single = lines.length === 1 && lines[0]!.qty === 1
    return {
      kind: "order",
      data: {
        ...buyer,
        address: text((b.buyer as Record<string, unknown>).address, 600),
        items: lines.map((l) => ({
          id: l.product.id,
          name: l.product.name,
          price: l.product.price,
          qty: l.qty,
        })),
        total,
        currency: site.settings.currency,
      },
      ...(single &&
        lines[0]!.product.paymentLink && {
          redirect: lines[0]!.product.paymentLink,
        }),
    }
  }
  if (b.kind === "booking") {
    const visitor = person(b.visitor)
    const slot = text(b.slot, 120)
    const match = slot.match(/^(.+)@(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/)
    if (!visitor || !match) return bad
    const service = site.services.find((s) => s.id === match[1])
    const when = new Date(`${match[2]}T${match[3]}:00`)
    if (!service || Number.isNaN(+when) || +when < +now) return bad
    const { days, from, to, horizon } = site.hours
    if (!days.includes(when.getDay())) return bad
    if (match[3]! < from || match[3]! >= to) return bad
    if (+when > +now + (horizon + 1) * 864e5) return bad
    return {
      kind: "booking",
      slot,
      data: {
        ...visitor,
        service: service.name,
        when: `${match[2]} ${match[3]}`,
      },
    }
  }
  if (b.kind === "rsvp") {
    const visitor = person(b.visitor)
    const event = site.events.find((e) => e.id === b.event)
    if (!visitor || !event) return bad
    return {
      kind: "rsvp",
      data: { ...visitor, event: event.id, title: event.title },
    }
  }
  return bad
}
