import * as React from "react"

import { useT } from "@/i18n/core"
import {
  money,
  safeHref,
  safeImage,
  type ElOf,
  type FormField,
  type Product,
  type Service,
} from "@/lib/sites/model"

import { productPath, SiteLink, useSite } from "./context"
import { messages } from "./widgets.messages"

async function send(slug: string, body: object) {
  const res = await fetch(`/api/sites/public/${slug}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    code?: string
    redirect?: string
  }
  return { ok: res.ok && !!json.ok, ...json }
}

function useSubmit() {
  const ctx = useSite()
  const t = useT(messages)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const run = async (body: object) => {
    if (!ctx.live) return { ok: false as const, preview: true }
    setBusy(true)
    setError(null)
    const res = await send(ctx.slug, body).catch(() => ({
      ok: false,
      code: "failed",
    }))
    setBusy(false)
    if (!res.ok)
      setError(
        res.code === "taken"
          ? t("taken")
          : res.code === "full"
            ? t("full")
            : t("failed")
      )
    return { ...res, preview: false }
  }
  return { busy, error, run, setError }
}

// Bots fill every field. People never see this one.
const Honeypot = () => (
  <input
    className="st-trap"
    name="website"
    tabIndex={-1}
    autoComplete="off"
    aria-hidden
  />
)

const readForm = (form: HTMLFormElement) => {
  const values: Record<string, string> = {}
  new FormData(form).forEach((v, k) => {
    values[k] = String(v)
  })
  return values
}

function Field({ field }: { field: FormField }) {
  const t = useT(messages)
  const common = { name: field.id, required: field.required, id: field.id }
  return (
    <label className="st-field" data-check={field.type === "checkbox" || null}>
      {field.type === "checkbox" && <input type="checkbox" {...common} />}
      <span>{field.label}</span>
      {field.type === "textarea" ? (
        <textarea rows={4} maxLength={4000} {...common} />
      ) : field.type === "select" ? (
        <select {...common} defaultValue="">
          <option value="" disabled>
            {t("choose")}
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : field.type === "checkbox" ? null : (
        <input
          type={
            field.type === "phone"
              ? "tel"
              : field.type === "email"
                ? "email"
                : field.type === "date"
                  ? "date"
                  : "text"
          }
          maxLength={400}
          {...common}
        />
      )}
    </label>
  )
}

export function SiteForm({ e }: { e: ElOf<"form"> }) {
  const { busy, error, run } = useSubmit()
  const t = useT(messages)
  const [done, setDone] = React.useState(false)
  const submit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const form = ev.currentTarget
    const { website, ...values } = readForm(form)
    const labelled = Object.fromEntries(
      e.props.fields.map((f) => [f.label, values[f.id] ?? ""])
    )
    const res = await run({
      kind: e.props.kind ?? "form",
      website,
      form: e.id,
      values: labelled,
    })
    if (res.ok) setDone(true)
  }
  if (done)
    return (
      <p className="st-done" role="status">
        {e.props.success}
      </p>
    )
  return (
    <form
      className="st-form"
      data-inline={e.props.layout === "inline" || null}
      onSubmit={submit}
    >
      {e.props.fields.map((f) => (
        <Field key={f.id} field={f} />
      ))}
      <Honeypot />
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
      <button className="st-button" disabled={busy}>
        {busy ? t("sending") : e.props.submit}
      </button>
    </form>
  )
}

export function Accordion({ e }: { e: ElOf<"accordion"> }) {
  return (
    <div className="st-accordion">
      {e.props.items.map((item, i) => (
        <details key={i}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  )
}

export function Countdown({ e }: { e: ElOf<"countdown"> }) {
  const t = useT(messages)
  const [now, setNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const left = now === null ? 0 : +new Date(e.props.to) - now
  if (now !== null && left <= 0)
    return <p className="st-count-done">{e.props.done}</p>
  const s = Math.floor(Math.max(0, left) / 1000)
  const parts: [number, string][] = [
    [Math.floor(s / 86400), t("days")],
    [Math.floor(s / 3600) % 24, t("hours")],
    [Math.floor(s / 60) % 60, t("minutes")],
    [s % 60, t("seconds")],
  ]
  return (
    <div className="st-count">
      {parts.map(([n, label]) => (
        <div key={label}>
          <b>{String(n).padStart(2, "0")}</b>
          <small>{label}</small>
        </div>
      ))}
    </div>
  )
}

export function Gallery({ e }: { e: ElOf<"gallery"> }) {
  const ctx = useSite()
  const t = useT(messages)
  const [open, setOpen] = React.useState<number | null>(null)
  const images = e.props.images.filter((i) => safeImage(i.src))
  React.useEffect(() => {
    if (open === null) return
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(null)
      if (ev.key === "ArrowRight")
        setOpen((i) => ((i ?? 0) + 1) % images.length)
      if (ev.key === "ArrowLeft")
        setOpen((i) => ((i ?? 0) - 1 + images.length) % images.length)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [open, images.length])
  return (
    <>
      <div
        className="st-gallery"
        data-layout={e.props.layout}
        style={
          {
            "--n": e.props.columns,
            "--gap": e.props.gap,
          } as React.CSSProperties
        }
      >
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            aria-label={img.alt || t("open")}
            onClick={() => ctx.live && setOpen(i)}
          >
            <img src={safeImage(img.src)} alt={img.alt} loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && images[open] && (
        <div
          className="st-lightbox"
          role="dialog"
          aria-modal
          onClick={() => setOpen(null)}
        >
          <img src={safeImage(images[open].src)} alt={images[open].alt} />
        </div>
      )}
    </>
  )
}

export function Menu({ e }: { e: ElOf<"menu"> }) {
  const ctx = useSite()
  const t = useT(messages)
  const [open, setOpen] = React.useState(false)
  const pages = ctx.site.pages.filter((p) => !p.hideFromMenu)
  return (
    <nav
      className="st-menu"
      aria-label={t("menu")}
      data-open={open || null}
      style={
        {
          color: e.style.color?.startsWith("$")
            ? `var(--st-${e.style.color.slice(1)})`
            : undefined,
          justifyContent:
            e.style.align === "center"
              ? "center"
              : e.style.align === "right"
                ? "flex-end"
                : undefined,
          "--gap": e.props.gap ?? 28,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="st-burger"
        aria-label={t("menu")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <i />
        <i />
      </button>
      <div>
        {pages.map((p) => (
          <SiteLink key={p.id} link={{ kind: "page", page: p.id }}>
            {p.name}
          </SiteLink>
        ))}
      </div>
    </nav>
  )
}

// ── Store ────────────────────────────────────────────────────────────────────

type CartLine = { id: string; qty: number }

const CartCtx = React.createContext<{
  lines: CartLine[]
  open: boolean
  setOpen: (o: boolean) => void
  add: (id: string) => void
  setQty: (id: string, qty: number) => void
  clear: () => void
} | null>(null)

export function CartProvider({
  slug,
  live,
  children,
}: {
  slug: string
  live: boolean
  children: React.ReactNode
}) {
  const [lines, setLines] = React.useState<CartLine[]>([])
  const [open, setOpen] = React.useState(false)
  const key = `palmframe-cart-${slug}`
  React.useEffect(() => {
    if (!live) return
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as CartLine[]
      if (Array.isArray(saved)) setLines(saved)
    } catch {
      // A private window, or a cart from an older page.
    }
  }, [key, live])
  const save = (next: CartLine[]) => {
    setLines(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // The cart still works for this visit.
    }
  }
  const value = {
    lines,
    open,
    setOpen,
    add: (id: string) => {
      const found = lines.find((l) => l.id === id)
      save(
        found
          ? lines.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l))
          : [...lines, { id, qty: 1 }]
      )
      setOpen(true)
    },
    setQty: (id: string, qty: number) =>
      save(
        qty > 0
          ? lines.map((l) => (l.id === id ? { ...l, qty } : l))
          : lines.filter((l) => l.id !== id)
      ),
    clear: () => save([]),
  }
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>
}

const useCart = () => React.useContext(CartCtx)!

export function ProductBuy({ product }: { product: Product }) {
  const t = useT(messages)
  const cart = useCart()
  return (
    <button
      type="button"
      className="st-button st-buy"
      disabled={product.soldOut}
      onClick={() => cart.add(product.id)}
    >
      {product.soldOut ? t("soldOut") : t("addToCart")}
    </button>
  )
}

export function Products({ e }: { e: ElOf<"products"> }) {
  const ctx = useSite()
  const cart = useCart()
  const t = useT(messages)
  const { currency } = ctx.site.settings
  return (
    <div
      className="st-grid"
      style={{ "--n": e.props.columns } as React.CSSProperties}
    >
      {ctx.site.products.slice(0, e.props.limit).map((p) => (
        <div key={p.id} className="st-card st-shop">
          <a href={ctx.live ? productPath(ctx, p) : undefined}>
            {safeImage(p.images[0]) && (
              <img src={safeImage(p.images[0])} alt={p.name} loading="lazy" />
            )}
            <div>
              <h3>{p.name}</h3>
              <small>{money(p.price, currency)}</small>
            </div>
          </a>
          <button
            type="button"
            disabled={p.soldOut}
            onClick={() => ctx.live && cart.add(p.id)}
          >
            {p.soldOut ? t("soldOut") : t("addToCart")}
          </button>
        </div>
      ))}
    </div>
  )
}

export function CartLayer() {
  const ctx = useSite()
  const cart = useCart()
  const t = useT(messages)
  const { busy, error, run } = useSubmit()
  const [placed, setPlaced] = React.useState(false)
  const [checkout, setCheckout] = React.useState(false)
  const { products, settings } = ctx.site
  if (!products.length) return null
  const rows = cart.lines.flatMap((l) => {
    const product = products.find((p) => p.id === l.id)
    return product ? [{ ...l, product }] : []
  })
  const total = rows.reduce((n, r) => n + r.product.price * r.qty, 0)
  const count = rows.reduce((n, r) => n + r.qty, 0)
  const place = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const { website, ...buyer } = readForm(ev.currentTarget)
    const res = await run({
      kind: "order",
      website,
      items: cart.lines,
      buyer,
    })
    if (!res.ok) return
    cart.clear()
    const target = "redirect" in res ? safeHref(res.redirect) : null
    if (target) window.location.href = target
    else setPlaced(true)
  }
  return (
    <>
      {count > 0 && !cart.open && (
        <button
          type="button"
          className="st-cart-fab"
          onClick={() => cart.setOpen(true)}
        >
          {t("cart")} · {count}
        </button>
      )}
      {cart.open && (
        <div className="st-drawer-back" onClick={() => cart.setOpen(false)}>
          <aside
            className="st-drawer"
            aria-label={t("cart")}
            onClick={(ev) => ev.stopPropagation()}
          >
            <header>
              <h2>{t("cart")}</h2>
              <button
                type="button"
                aria-label={t("close")}
                onClick={() => cart.setOpen(false)}
              >
                ×
              </button>
            </header>
            {placed ? (
              <p className="st-done" role="status">
                {settings.orderNote || t("orderPlaced")}
              </p>
            ) : !rows.length ? (
              <p>{t("cartEmpty")}</p>
            ) : (
              <>
                {rows.map((r) => (
                  <div key={r.id} className="st-line-item">
                    {safeImage(r.product.images[0]) && (
                      <img src={safeImage(r.product.images[0])} alt="" />
                    )}
                    <span>
                      {r.product.name}
                      <small>{money(r.product.price, settings.currency)}</small>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={r.qty}
                      aria-label={t("quantity")}
                      onChange={(ev) =>
                        cart.setQty(r.id, Number(ev.target.value))
                      }
                    />
                  </div>
                ))}
                <p className="st-total">
                  <span>{t("total")}</span>
                  <b>{money(total, settings.currency)}</b>
                </p>
                {!checkout ? (
                  <button
                    type="button"
                    className="st-button"
                    onClick={() => setCheckout(true)}
                  >
                    {t("checkout")}
                  </button>
                ) : (
                  <form className="st-form" onSubmit={place}>
                    <label className="st-field">
                      <span>{t("name")}</span>
                      <input name="name" required maxLength={200} />
                    </label>
                    <label className="st-field">
                      <span>{t("email")}</span>
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={200}
                      />
                    </label>
                    <label className="st-field">
                      <span>{t("address")}</span>
                      <textarea name="address" rows={3} maxLength={600} />
                    </label>
                    <Honeypot />
                    {error && (
                      <p className="st-error" role="alert">
                        {error}
                      </p>
                    )}
                    <button className="st-button" disabled={busy}>
                      {busy ? t("sending") : t("placeOrder")}
                    </button>
                  </form>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </>
  )
}

// ── Bookings ─────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0")
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function bookingDays(
  hours: { days: number[]; horizon: number },
  from: Date
) {
  const days: Date[] = []
  for (let i = 1; i <= hours.horizon && days.length < 14; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    if (hours.days.includes(d.getDay())) days.push(d)
  }
  return days
}

export function bookingTimes(
  hours: { from: string; to: string },
  service: Pick<Service, "minutes">
) {
  const times: string[] = []
  const step = Math.max(10, service.minutes)
  for (
    let m = toMinutes(hours.from);
    m + step <= toMinutes(hours.to);
    m += step
  )
    times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
  return times
}

export function Booking({ e }: { e: ElOf<"booking"> }) {
  const ctx = useSite()
  const t = useT(messages)
  const { busy, error, run, setError } = useSubmit()
  const { services, hours, settings } = ctx.site
  const [service, setService] = React.useState(services[0]?.id ?? "")
  const [day, setDay] = React.useState("")
  const [time, setTime] = React.useState("")
  const [justTaken, setJustTaken] = React.useState<string[]>([])
  const [done, setDone] = React.useState(false)
  const [today, setToday] = React.useState<Date | null>(null)
  React.useEffect(() => setToday(new Date()), [])
  const chosen = services.find((s) => s.id === service)
  const days = today ? bookingDays(hours, today) : []
  const times = chosen ? bookingTimes(hours, chosen) : []
  const slotOf = (d: string, at: string) => `${service}@${d}T${at}`
  const taken = new Set([...ctx.taken, ...justTaken])
  const submit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const { website, ...visitor } = readForm(ev.currentTarget)
    const slot = slotOf(day, time)
    const res = await run({ kind: "booking", website, slot, visitor })
    if (res.ok) setDone(true)
    else if ("code" in res && res.code === "taken") {
      setJustTaken([...justTaken, slot])
      setTime("")
    }
  }
  if (done)
    return (
      <p className="st-done" role="status">
        {t("booked", { day, time })}
      </p>
    )
  return (
    <div className="st-booking">
      <h3>{e.props.heading}</h3>
      <div className="st-chips">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            data-on={s.id === service || null}
            onClick={() => {
              setService(s.id)
              setTime("")
              setError(null)
            }}
          >
            {s.name}
            <small>
              {s.minutes} min · {money(s.price, settings.currency)}
            </small>
          </button>
        ))}
      </div>
      <div className="st-chips st-days">
        {days.map((d) => {
          const id = isoDay(d)
          return (
            <button
              key={id}
              type="button"
              data-on={id === day || null}
              onClick={() => {
                setDay(id)
                setTime("")
              }}
            >
              {d.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </button>
          )
        })}
      </div>
      {day && (
        <div className="st-chips st-times">
          {times.map((at) => (
            <button
              key={at}
              type="button"
              disabled={taken.has(slotOf(day, at))}
              data-on={at === time || null}
              onClick={() => setTime(at)}
            >
              {at}
            </button>
          ))}
        </div>
      )}
      {time && (
        <form className="st-form" onSubmit={submit}>
          <label className="st-field">
            <span>{t("name")}</span>
            <input name="name" required maxLength={200} />
          </label>
          <label className="st-field">
            <span>{t("email")}</span>
            <input name="email" type="email" required maxLength={200} />
          </label>
          <Honeypot />
          {error && (
            <p className="st-error" role="alert">
              {error}
            </p>
          )}
          <button className="st-button" disabled={busy}>
            {busy ? t("sending") : t("book")}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Events ───────────────────────────────────────────────────────────────────

function Rsvp({ event }: { event: string }) {
  const t = useT(messages)
  const { busy, error, run } = useSubmit()
  const [open, setOpen] = React.useState(false)
  const [done, setDone] = React.useState(false)
  if (done)
    return (
      <p className="st-done" role="status">
        {t("rsvpDone")}
      </p>
    )
  if (!open)
    return (
      <button type="button" className="st-button" onClick={() => setOpen(true)}>
        {t("rsvp")}
      </button>
    )
  return (
    <form
      className="st-form"
      data-inline
      onSubmit={async (ev) => {
        ev.preventDefault()
        const { website, ...visitor } = readForm(ev.currentTarget)
        const res = await run({ kind: "rsvp", website, event, visitor })
        if (res.ok) setDone(true)
      }}
    >
      <label className="st-field">
        <span>{t("name")}</span>
        <input name="name" required maxLength={200} />
      </label>
      <label className="st-field">
        <span>{t("email")}</span>
        <input name="email" type="email" required maxLength={200} />
      </label>
      <Honeypot />
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
      <button className="st-button" disabled={busy}>
        {busy ? t("sending") : t("rsvp")}
      </button>
    </form>
  )
}

export function Events({ e }: { e: ElOf<"events"> }) {
  const ctx = useSite()
  const events = ctx.site.events.slice(0, e.props.limit)
  return (
    <div className="st-events">
      {events.map((ev) => {
        const d = new Date(ev.date)
        return (
          <article key={ev.id} className="st-event">
            <time dateTime={ev.date}>
              <b>{d.getUTCDate()}</b>
              {d.toLocaleDateString("en", {
                month: "short",
                timeZone: "UTC",
              })}
            </time>
            <div>
              <h3>{ev.title}</h3>
              <small>{ev.location}</small>
              <p>{ev.description}</p>
              <Rsvp event={ev.id} />
            </div>
            {safeImage(ev.image) && (
              <img src={safeImage(ev.image)} alt="" loading="lazy" />
            )}
          </article>
        )
      })}
    </div>
  )
}
