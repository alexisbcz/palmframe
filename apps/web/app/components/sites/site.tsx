import * as React from "react"

import {
  color,
  fontStack,
  frameOf,
  money,
  phoneLayout,
  phoneSize,
  safeHref,
  safeImage,
  type Box,
  type Device,
  type El,
  type Fill,
  type Page,
  type Post,
  type Product,
  type Section,
  type Site,
  type Style,
  videoEmbed,
} from "@/lib/sites/model"

import { Ctx, SiteLink, postPath, useSite, type SiteContext } from "./context"
import "./site.css"
import {
  Accordion,
  Booking,
  CartLayer,
  CartProvider,
  Countdown,
  Events,
  Gallery,
  Menu,
  ProductBuy,
  Products,
  SiteForm,
} from "./widgets"

const textStyle = (s: Style): React.CSSProperties => ({
  color: color(s.color) || undefined,
  fontFamily: s.font ? `var(--st-${s.font})` : undefined,
  fontWeight: s.weight,
  fontStyle: s.italic ? "italic" : undefined,
  textTransform: s.upper ? "uppercase" : undefined,
  textDecoration: s.underline ? "underline" : undefined,
  letterSpacing: s.tracking ? `${s.tracking}em` : undefined,
  lineHeight: s.leading,
  textAlign: s.align,
})

const surface = (s: Style): React.CSSProperties => ({
  background: color(s.fill) || undefined,
  borderRadius:
    s.radius === undefined
      ? undefined
      : `calc(${Math.min(Math.max(s.radius, 0), 999)} * var(--u))`,
  border: s.border
    ? `${s.border}px solid ${color(s.borderColor, "var(--st-line)")}`
    : undefined,
  boxShadow: s.shadow ? "0 1em 2.5em rgb(0 0 0 / 0.14)" : undefined,
})

function ElementBody({ e }: { e: El }) {
  const s = e.style
  switch (e.type) {
    case "text": {
      const Tag = e.props.tag ?? "p"
      const body = (
        <Tag className="st-text" style={textStyle(s)}>
          {e.props.text}
        </Tag>
      )
      return e.props.link ? (
        <SiteLink link={e.props.link} className="st-fill">
          {body}
        </SiteLink>
      ) : (
        body
      )
    }
    case "button": {
      const outline = e.props.variant === "outline"
      return (
        <SiteLink
          link={e.props.link}
          className="st-button"
          style={{
            ...textStyle(s),
            background: outline
              ? "transparent"
              : color(s.fill, "var(--st-accent)"),
            color: color(
              s.color,
              outline ? "var(--st-text)" : "var(--st-accentText)"
            ),
            borderRadius:
              s.radius === undefined
                ? "var(--st-round)"
                : `calc(${s.radius} * var(--u))`,
            border: outline
              ? `1px solid ${color(s.borderColor, "currentColor")}`
              : undefined,
          }}
        >
          {e.props.label}
        </SiteLink>
      )
    }
    case "image": {
      const src = safeImage(e.props.src)
      const img = src ? (
        <img
          className="st-image"
          src={src}
          alt={e.props.alt}
          loading="lazy"
          draggable={false}
          style={{ ...surface(s), objectFit: s.fit ?? "cover" }}
        />
      ) : (
        <div className="st-image st-blank" style={surface(s)} />
      )
      return e.props.link ? (
        <SiteLink link={e.props.link} className="st-fill">
          {img}
        </SiteLink>
      ) : (
        img
      )
    }
    case "shape":
      return (
        <SiteLink
          link={e.props.link}
          className="st-shape"
          style={{
            ...surface(s),
            borderRadius:
              e.props.shape === "circle" ? "50%" : surface(s).borderRadius,
          }}
        >
          {null}
        </SiteLink>
      )
    case "line":
      return (
        <div
          className="st-line"
          style={{ background: color(s.fill, "var(--st-line)") }}
        />
      )
    case "gallery":
      return <Gallery e={e} />
    case "video":
      return <Video e={e} />
    case "menu":
      return <Menu e={e} />
    case "social":
      return <Social e={e} />
    case "form":
      return <SiteForm e={e} />
    case "map":
      return <MapFrame e={e} />
    case "embed":
      return <Embed e={e} />
    case "countdown":
      return <Countdown e={e} />
    case "accordion":
      return <Accordion e={e} />
    case "pricing":
      return <Pricing e={e} />
    case "products":
      return <Products e={e} />
    case "posts":
      return <Posts e={e} />
    case "events":
      return <Events e={e} />
    case "booking":
      return <Booking e={e} />
    case "list":
      return <ListEl e={e} />
  }
}

function Video({ e }: { e: Extract<El, { type: "video" }> }) {
  const ctx = useSite()
  const src = videoEmbed(e.props.url)
  if (!src) return <div className="st-frame st-blank">Video</div>
  return (
    <iframe
      className="st-frame"
      src={ctx.live ? src : undefined}
      title={e.name ?? "Video"}
      loading="lazy"
      allow="fullscreen; picture-in-picture"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
    />
  )
}

function MapFrame({ e }: { e: Extract<El, { type: "map" }> }) {
  const ctx = useSite()
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(e.props.query)}&output=embed`
  return ctx.live ? (
    <iframe
      className="st-frame"
      src={src}
      title={e.props.query}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="st-frame st-blank">{e.props.query}</div>
  )
}

// Owner HTML runs in a sandbox with an opaque origin, so it can't reach
// Palmframe's cookies, storage or pages.
function Embed({ e }: { e: Extract<El, { type: "embed" }> }) {
  const ctx = useSite()
  return ctx.live ? (
    <iframe
      className="st-frame"
      title={e.name ?? "Embed"}
      sandbox="allow-scripts allow-forms allow-popups"
      srcDoc={e.props.html}
    />
  ) : (
    <div className="st-frame st-blank">{"</>"}</div>
  )
}

const SOCIAL: Record<string, string> = {
  instagram:
    "M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 7.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4ZM17.7 7.3a1 1 0 1 1-2.1 0 1 1 0 0 1 2.1 0ZM16 3H8a5 5 0 0 0-5 5v8a5 5 0 0 0 5 5h8a5 5 0 0 0 5-5V8a5 5 0 0 0-5-5Zm3.2 13a3.2 3.2 0 0 1-3.2 3.2H8A3.2 3.2 0 0 1 4.8 16V8A3.2 3.2 0 0 1 8 4.8h8A3.2 3.2 0 0 1 19.2 8v8Z",
  x: "M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.7 21H1.5l7.5-8.6L1.1 3h6.6l4.5 5.6L17.5 3Zm-1.1 16.2h1.8L6.7 4.7H4.8l11.6 14.5Z",
  facebook:
    "M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.3-1.5 1.6-1.5h1.6V3.6c-.8-.1-1.6-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.3H7.6V13h2.7v8h3.2Z",
  tiktok:
    "M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v2.7c-1.4.1-2.6-.3-3.9-1.1v5.8c0 7.4-8 9.7-11.3 4.4-2.1-3.4-.8-9.4 5.9-9.6v2.9c-.5.1-1 .2-1.5.4-1.5.5-2.3 1.4-2.1 3 .5 3.2 6.2 4.1 5.7-2.1V3h3.3Z",
  youtube:
    "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.7 2 12 2 12s0 3.3.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.5.4-4.8.4-4.8s0-3.3-.4-4.8ZM10 15V9l5.2 3L10 15Z",
  linkedin:
    "M6.9 8.7H3.6V21h3.3V8.7ZM5.2 3a2 2 0 1 0 0 3.9 2 2 0 0 0 0-3.9ZM21 13.9c0-3.7-2-5.4-4.6-5.4-2.1 0-3 1.2-3.5 2V8.7H9.6V21h3.3v-6.1c0-1.6.3-3.2 2.3-3.2s2 1.9 2 3.3v6H21v-7.1Z",
}

function Social({ e }: { e: Extract<El, { type: "social" }> }) {
  const ctx = useSite()
  return (
    <div
      className="st-social"
      style={{
        color: color(e.style.color) || undefined,
        justifyContent:
          e.style.align === "center"
            ? "center"
            : e.style.align === "right"
              ? "flex-end"
              : undefined,
      }}
    >
      {e.props.links.map((l, i) => {
        const href = safeHref(l.url)
        return (
          <a
            key={i}
            aria-label={l.kind}
            href={ctx.live ? (href ?? undefined) : undefined}
            target="_blank"
            rel="noopener nofollow"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={SOCIAL[l.kind] ?? SOCIAL.instagram} />
            </svg>
          </a>
        )
      })}
    </div>
  )
}

function Pricing({ e }: { e: Extract<El, { type: "pricing" }> }) {
  return (
    <div
      className="st-pricing"
      style={{ "--n": e.props.tiers.length } as React.CSSProperties}
    >
      {e.props.tiers.map((t, i) => (
        <article key={i} className="st-tier" data-featured={t.featured || null}>
          <h3>{t.name}</h3>
          <p className="st-tier-price">{t.price}</p>
          <p className="st-tier-note">{t.note}</p>
          <ul>
            {t.features.map((f, j) => (
              <li key={j}>{f}</li>
            ))}
          </ul>
          <SiteLink link={t.link} className="st-button st-tier-cta">
            {t.cta}
          </SiteLink>
        </article>
      ))}
    </div>
  )
}

const prettyDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(+d)
    ? iso
    : d.toLocaleDateString("en", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
}

function Posts({ e }: { e: Extract<El, { type: "posts" }> }) {
  const ctx = useSite()
  const posts = ctx.site.posts.filter((p) => !p.draft).slice(0, e.props.limit)
  return (
    <div
      className="st-grid"
      data-list={e.props.layout === "list" || null}
      style={{ "--n": e.props.columns } as React.CSSProperties}
    >
      {posts.map((p) => (
        <a
          key={p.id}
          className="st-card"
          href={ctx.live ? postPath(ctx, p) : undefined}
        >
          {safeImage(p.cover) && (
            <img src={safeImage(p.cover)} alt="" loading="lazy" />
          )}
          <div>
            <small>{prettyDate(p.date)}</small>
            <h3>{p.title}</h3>
            <p>{p.excerpt}</p>
          </div>
        </a>
      ))}
    </div>
  )
}

function ListEl({ e }: { e: Extract<El, { type: "list" }> }) {
  const ctx = useSite()
  const items =
    ctx.site.collections
      .find((c) => c.id === e.props.collection)
      ?.items.slice(0, e.props.limit) ?? []
  return (
    <div
      className="st-grid"
      style={{ "--n": e.props.columns } as React.CSSProperties}
    >
      {items.map((item) => {
        const href = safeHref(item.url)
        const body = (
          <>
            {safeImage(item.image) && (
              <img src={safeImage(item.image)} alt="" loading="lazy" />
            )}
            <div>
              <h3>{item.title}</h3>
              {item.subtitle && <small>{item.subtitle}</small>}
              {item.body && <p>{item.body}</p>}
            </div>
          </>
        )
        return href ? (
          <a
            key={item.id}
            className="st-card"
            href={ctx.live ? href : undefined}
            rel="noopener nofollow"
          >
            {body}
          </a>
        ) : (
          <div key={item.id} className="st-card">
            {body}
          </div>
        )
      })}
    </div>
  )
}

const px = (b: Box, prefix = "") => ({
  [`--${prefix}x`]: b.x,
  [`--${prefix}y`]: b.y,
  [`--${prefix}w`]: b.w,
  [`--${prefix}h`]: b.h,
})

function ElementView({
  e,
  auto,
}: {
  e: El
  auto: ReturnType<typeof phoneLayout>
}) {
  if (e.hidden) return null
  const phone = frameOf(e, "mobile", auto)
  const vars = {
    ...px(e.box),
    ...px(phone, "p"),
    "--fs": e.style.size ?? 16,
    "--pfs": phoneSize(e.style),
    opacity: e.style.opacity,
  } as React.CSSProperties
  return (
    <div
      className="st-el"
      data-el={e.id}
      data-type={e.type}
      data-anim={e.anim ?? undefined}
      data-phone-off={e.hideOnPhone || auto.dropped.has(e.id) || undefined}
      style={vars}
    >
      <ElementBody e={e} />
    </div>
  )
}

export function fillStyle(fill: Fill): React.CSSProperties {
  if (fill.kind === "color") return { background: color(fill.color) }
  if (fill.kind === "gradient")
    return {
      background: `linear-gradient(${Number(fill.angle) || 0}deg, ${color(fill.from, "transparent")}, ${color(fill.to, "transparent")})`,
    }
  const src = safeImage(fill.src)
  const dim = Math.min(0.95, Math.max(0, Number(fill.overlay) || 0))
  return {
    backgroundImage: `linear-gradient(rgb(0 0 0 / ${dim}), rgb(0 0 0 / ${dim}))${
      src ? `, url("${encodeURI(src).replace(/"/g, "%22")}")` : ""
    }`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: fill.fixed ? "fixed" : undefined,
  }
}

export function SectionView({
  section,
  overlay,
  sticky,
}: {
  section: Section
  overlay?: (s: Section) => React.ReactNode
  sticky?: boolean
}) {
  const auto = phoneLayout(section)
  return (
    <section
      id={section.id}
      data-section={section.id}
      data-sticky={(sticky && section.sticky) || undefined}
      data-bar={auto.bar || undefined}
      className="st-section"
      style={
        {
          ...fillStyle(section.fill),
          "--sh": section.height,
          "--psh": auto.height,
        } as React.CSSProperties
      }
    >
      <div className="st-stage">
        {section.elements.map((e) => (
          <ElementView key={e.id} e={e} auto={auto} />
        ))}
        {overlay?.(section)}
      </div>
    </section>
  )
}

function Body({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((block, i) =>
          block.startsWith("## ") ? (
            <h2 key={i}>{block.slice(3)}</h2>
          ) : (
            <p key={i}>{block}</p>
          )
        )}
    </>
  )
}

function PostArticle({ post }: { post: Post }) {
  const cover = safeImage(post.cover)
  return (
    <article className="st-article">
      <small>
        {prettyDate(post.date)}
        {post.author && ` · ${post.author}`}
      </small>
      <h1>{post.title}</h1>
      {cover && <img src={cover} alt="" />}
      <Body text={post.body} />
    </article>
  )
}

function ProductArticle({ product }: { product: Product }) {
  const ctx = useSite()
  const image = safeImage(product.images[0])
  return (
    <article className="st-product">
      {image ? <img src={image} alt={product.name} /> : <div />}
      <div>
        <h1>{product.name}</h1>
        <p className="st-tier-price">
          {money(product.price, ctx.site.settings.currency)}
        </p>
        <Body text={product.description} />
        <ProductBuy product={product} />
      </div>
    </article>
  )
}

export function themeVars(site: Site): React.CSSProperties {
  const { palette: p, heading, body, radius } = site.theme
  const safe = (v: string, f: string) => color(v, f)
  return {
    "--st-bg": safe(p.bg, "#fff"),
    "--st-surface": safe(p.surface, "#f5f5f5"),
    "--st-text": safe(p.text, "#111"),
    "--st-muted": safe(p.muted, "#666"),
    "--st-accent": safe(p.accent, "#111"),
    "--st-accentText": safe(p.accentText, "#fff"),
    "--st-line": safe(p.line, "#ddd"),
    "--st-heading": fontStack(heading),
    "--st-body": fontStack(body),
    "--st-round": `calc(${Math.min(99, Math.max(0, Number(radius) || 0))} * var(--u))`,
  } as React.CSSProperties
}

// Reveals elements as they scroll in. Everything is already visible for anyone
// without scripts, and for anyone who asked for less motion.
function useReveal(root: React.RefObject<HTMLDivElement | null>, on: boolean) {
  React.useEffect(() => {
    if (!on || !root.current) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const els = [
      ...root.current.querySelectorAll<HTMLElement>("[data-anim]"),
    ].filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.9)
    els.forEach((el) => el.classList.add("st-pre"))
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.remove("st-pre")
          io.unobserve(entry.target)
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [on, root])
}

export function SiteView({
  site,
  page,
  post,
  product,
  base = "",
  slug = "",
  live = false,
  taken = [],
  path = "",
  overlay,
  device,
  badge,
}: {
  site: Site
  page: Page | null
  post?: Post | null
  product?: Product | null
  base?: string
  slug?: string
  live?: boolean
  taken?: string[]
  path?: string
  overlay?: (s: Section) => React.ReactNode
  device?: Device
  badge?: boolean
}) {
  const root = React.useRef<HTMLDivElement>(null)
  useReveal(root, live)
  const ctx = React.useMemo(
    () => ({ site, base, slug, live, taken, path }),
    [site, base, slug, live, taken, path]
  )
  return (
    <Ctx.Provider value={ctx}>
      <div
        ref={root}
        className="st"
        data-device={device}
        data-live={live || undefined}
        style={themeVars(site)}
      >
        <div className="st-page">
          <CartProvider slug={slug} live={live}>
            {site.header && (
              <SectionView section={site.header} overlay={overlay} sticky />
            )}
            <main>
              {post ? (
                <PostArticle post={post} />
              ) : product ? (
                <ProductArticle product={product} />
              ) : (
                page?.sections.map((s) => (
                  <SectionView key={s.id} section={s} overlay={overlay} />
                ))
              )}
            </main>
            {site.footer && (
              <SectionView section={site.footer} overlay={overlay} />
            )}
            {live && <CartLayer />}
            {badge && (
              <p className="st-badge">
                <a href="https://www.palmframe.com/sites">
                  Made with Palmframe
                </a>
                <a href="https://www.palmframe.com/terms">Report this site</a>
              </p>
            )}
          </CartProvider>
        </div>
      </div>
    </Ctx.Provider>
  )
}
