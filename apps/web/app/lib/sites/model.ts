// A website as one JSON document. Every element sits at a position on a fixed
// stage, like a page in a layout program, with an optional second position for
// phones. Shared by server and browser.

export const STAGE = 1200
export const PHONE = 390

export type Box = { x: number; y: number; w: number; h: number }
export type Device = "desktop" | "mobile"

export interface Palette {
  bg: string
  surface: string
  text: string
  muted: string
  accent: string
  accentText: string
  line: string
}

export interface Theme {
  palette: Palette
  heading: string
  body: string
  radius: number
}

export type Fill =
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: string; overlay: number; fixed?: boolean }

export type Anim = "fade" | "rise" | "zoom" | "left" | "right"

export interface Style {
  color?: string
  fill?: string
  radius?: number
  border?: number
  borderColor?: string
  shadow?: boolean
  opacity?: number
  font?: "heading" | "body"
  size?: number
  phoneSize?: number
  weight?: number
  italic?: boolean
  upper?: boolean
  underline?: boolean
  tracking?: number
  leading?: number
  align?: "left" | "center" | "right"
  fit?: "cover" | "contain"
}

export type Link =
  | { kind: "page"; page: string }
  | { kind: "url"; url: string }
  | { kind: "section"; section: string }
  | { kind: "email"; email: string }
  | { kind: "phone"; phone: string }

export interface FormField {
  id: string
  label: string
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "date"
  required?: boolean
  options?: string[]
}

export interface Tier {
  name: string
  price: string
  note: string
  features: string[]
  cta: string
  link?: Link | null
  featured?: boolean
}

interface Props {
  text: { text: string; tag?: "h1" | "h2" | "h3" | "p"; link?: Link | null }
  button: { label: string; link?: Link | null; variant?: "solid" | "outline" }
  image: { src: string; alt: string; link?: Link | null }
  shape: { shape: "box" | "circle"; link?: Link | null }
  line: Record<string, never>
  gallery: {
    images: { src: string; alt: string }[]
    layout: "grid" | "masonry" | "slider"
    columns: number
    gap: number
  }
  video: { url: string }
  menu: { direction?: "row" | "column"; gap?: number }
  social: { links: { kind: string; url: string }[] }
  form: {
    fields: FormField[]
    submit: string
    success: string
    kind?: "form" | "newsletter"
    layout?: "stack" | "inline"
  }
  map: { query: string }
  embed: { html: string }
  countdown: { to: string; done: string }
  accordion: { items: { q: string; a: string }[] }
  pricing: { tiers: Tier[] }
  products: { columns: number; limit: number }
  posts: { columns: number; limit: number; layout?: "cards" | "list" }
  events: { limit: number }
  booking: { heading: string }
  list: { collection: string; columns: number; limit: number }
}

export type ElementType = keyof Props

export type El = {
  [K in ElementType]: {
    id: string
    type: K
    name?: string
    box: Box
    // Where it sits on phones. Worked out from `box` until someone moves it.
    phone?: Box | null
    hideOnPhone?: boolean
    hidden?: boolean
    locked?: boolean
    anim?: Anim | null
    style: Style
    props: Props[K]
  }
}[ElementType]

export type ElOf<K extends ElementType> = Extract<El, { type: K }>

export interface Section {
  id: string
  name: string
  height: number
  phoneHeight?: number | null
  fill: Fill
  sticky?: boolean
  elements: El[]
}

export interface Page {
  id: string
  name: string
  // Empty for the home page.
  slug: string
  hideFromMenu?: boolean
  seo: { title: string; description: string; image: string }
  sections: Section[]
}

export interface Post {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  cover: string
  author: string
  date: string
  draft?: boolean
}

export interface Product {
  id: string
  slug: string
  name: string
  price: number
  description: string
  images: string[]
  // A payment link from the owner's own processor. Without one, an order is a
  // request the owner follows up on.
  paymentLink?: string
  soldOut?: boolean
}

export interface Service {
  id: string
  name: string
  description: string
  minutes: number
  price: number
}

export interface Hours {
  days: number[] // 0 is Sunday
  from: string
  to: string
  // How far ahead someone can book.
  horizon: number
}

export interface EventItem {
  id: string
  title: string
  date: string
  location: string
  description: string
  image: string
  capacity: number
}

export interface Collection {
  id: string
  name: string
  items: {
    id: string
    title: string
    subtitle: string
    body: string
    image: string
    url: string
  }[]
}

export interface Site {
  version: 1
  name: string
  theme: Theme
  header: Section | null
  footer: Section | null
  pages: Page[]
  posts: Post[]
  products: Product[]
  services: Service[]
  hours: Hours
  events: EventItem[]
  collections: Collection[]
  settings: {
    currency: string
    favicon: string
    description: string
    shareImage: string
    // Search engines stay out unless the owner lets them in.
    indexable: boolean
    orderNote: string
  }
}

export const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-2)

// ── Fonts ────────────────────────────────────────────────────────────────────
// Served by Bunny Fonts, a Google Fonts mirror that doesn't log visitors. Only
// names on this list reach a stylesheet URL.
export const FONTS: Record<string, { stack: string; weights: string }> = {
  Inter: { stack: "sans-serif", weights: "400,500,600,700,800" },
  "DM Sans": { stack: "sans-serif", weights: "400,500,700" },
  Manrope: { stack: "sans-serif", weights: "400,500,700,800" },
  "Space Grotesk": { stack: "sans-serif", weights: "400,500,700" },
  Sora: { stack: "sans-serif", weights: "400,600,800" },
  Archivo: { stack: "sans-serif", weights: "400,600,800,900" },
  "Bricolage Grotesque": { stack: "sans-serif", weights: "400,600,800" },
  Oswald: { stack: "sans-serif", weights: "400,500,700" },
  "Bebas Neue": { stack: "sans-serif", weights: "400" },
  "Playfair Display": { stack: "serif", weights: "400,500,700,800" },
  Fraunces: { stack: "serif", weights: "400,500,700,900" },
  "Cormorant Garamond": { stack: "serif", weights: "400,500,600,700" },
  "DM Serif Display": { stack: "serif", weights: "400" },
  "Libre Baskerville": { stack: "serif", weights: "400,700" },
  Lora: { stack: "serif", weights: "400,500,700" },
  "Instrument Serif": { stack: "serif", weights: "400" },
  "JetBrains Mono": { stack: "monospace", weights: "400,500,700" },
  Caveat: { stack: "cursive", weights: "400,700" },
}

export const fontStack = (name: string) =>
  `"${FONTS[name] ? name : "Inter"}", ${FONTS[name]?.stack ?? "sans-serif"}`

export function fontsHref(names: string[]) {
  const family = [...new Set(names)]
    .filter((n) => FONTS[n])
    .map((n) => `${n.toLowerCase().replace(/ /g, "-")}:${FONTS[n]!.weights}`)
    .join("|")
  return `https://fonts.bunny.net/css?family=${family}&display=swap`
}

// ── What may reach the page ──────────────────────────────────────────────────
// A release is written by its owner and read by the public on our origin, and
// owners can write the table directly. So these guards run as it's drawn, not
// only when it's saved.

export function safeHref(url: unknown): string | null {
  if (typeof url !== "string") return null
  const u = url.trim()
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u
  if (/^\/(?!\/)/.test(u)) return u
  if (/^#[\w-]*$/.test(u)) return u
  return null
}

export function safeImage(src: unknown): string {
  if (typeof src !== "string") return ""
  const s = src.trim()
  if (/^https:\/\//i.test(s)) return s
  if (/^\/(?!\/)/.test(s)) return s
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(s)) return s
  return ""
}

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|transparent)$/i
export const TOKENS = [
  "bg",
  "surface",
  "text",
  "muted",
  "accent",
  "accentText",
  "line",
] as const
export type Token = (typeof TOKENS)[number]

// A colour is a theme token (`$accent`) or a literal.
export function color(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback
  if (value.startsWith("$")) {
    const token = value.slice(1)
    return (TOKENS as readonly string[]).includes(token)
      ? `var(--st-${token})`
      : fallback
  }
  return COLOR.test(value) ? value : fallback
}

// The only video hosts a page can frame, in their no-tracking forms.
export function videoEmbed(url: unknown): string | null {
  if (typeof url !== "string") return null
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/
  )
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d{5,12})/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?dnt=1`
  return null
}

export function money(amount: number, currency: string, locale = "en") {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58)

// Addresses that would read as Palmframe itself, or as somewhere people sign in.
const RESERVED =
  /^(admin|api|app|auth|billing|login|signin|signup|support|help|www|mail|palmframe|paypal|stripe|apple|google|microsoft|amazon|bank|account|secure|verify)(-|$)/

export const slugAllowed = (slug: string) =>
  /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug) && !RESERVED.test(slug)

// ── Reading stored documents ─────────────────────────────────────────────────

const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback

const box = (
  b: unknown,
  fallback: Box = { x: 0, y: 0, w: 200, h: 100 }
): Box => {
  const r = (b ?? {}) as Partial<Box>
  return {
    x: clampNum(r.x, -600, 3000, fallback.x),
    y: clampNum(r.y, -600, 20000, fallback.y),
    w: clampNum(r.w, 1, 3000, fallback.w),
    h: clampNum(r.h, 1, 20000, fallback.h),
  }
}

export const ELEMENT_TYPES: ElementType[] = [
  "text",
  "button",
  "image",
  "shape",
  "line",
  "gallery",
  "video",
  "menu",
  "social",
  "form",
  "map",
  "embed",
  "countdown",
  "accordion",
  "pricing",
  "products",
  "posts",
  "events",
  "booking",
  "list",
]

function toEl(value: unknown): El | null {
  const e = value as Partial<El> | null
  if (!e || typeof e !== "object") return null
  if (!ELEMENT_TYPES.includes(e.type as ElementType)) return null
  return {
    ...e,
    id: typeof e.id === "string" ? e.id.slice(0, 40) : newId(),
    box: box(e.box),
    phone: e.phone ? box(e.phone) : null,
    style: (e.style && typeof e.style === "object" ? e.style : {}) as Style,
    props: (e.props && typeof e.props === "object" ? e.props : {}) as never,
  } as El
}

function toSection(value: unknown): Section | null {
  const s = value as Partial<Section> | null
  if (!s || typeof s !== "object") return null
  return {
    id: typeof s.id === "string" ? s.id.slice(0, 40) : newId(),
    name: typeof s.name === "string" ? s.name.slice(0, 80) : "Section",
    height: clampNum(s.height, 20, 6000, 600),
    phoneHeight:
      typeof s.phoneHeight === "number"
        ? clampNum(s.phoneHeight, 20, 12000, 600)
        : null,
    fill:
      s.fill && typeof s.fill === "object"
        ? s.fill
        : { kind: "color", color: "$bg" },
    sticky: !!s.sticky,
    elements: (Array.isArray(s.elements) ? s.elements : [])
      .map(toEl)
      .filter((e): e is El => !!e),
  }
}

export const DEFAULT_THEME: Theme = {
  palette: {
    bg: "#ffffff",
    surface: "#f5f4f1",
    text: "#141414",
    muted: "#62625e",
    accent: "#ff5a1f",
    accentText: "#ffffff",
    line: "#e3e1dc",
  },
  heading: "Bricolage Grotesque",
  body: "Inter",
  radius: 10,
}

export const DEFAULT_HOURS: Hours = {
  days: [1, 2, 3, 4, 5],
  from: "09:00",
  to: "17:00",
  horizon: 30,
}

const arr = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])

// Anything stored is read through this, so an old or hand-edited document can't
// crash the editor or the public page.
export function toSite(value: unknown): Site {
  const v = (value ?? {}) as Partial<Site>
  const pages = arr<Partial<Page>>(v.pages).map((p, i) => ({
    id: typeof p.id === "string" ? p.id : newId(),
    name: typeof p.name === "string" ? p.name.slice(0, 80) : `Page ${i + 1}`,
    slug: i === 0 ? "" : slugify(String(p.slug ?? p.name ?? "")) || `page-${i}`,
    hideFromMenu: !!p.hideFromMenu,
    seo: { title: "", description: "", image: "", ...(p.seo ?? {}) },
    sections: arr(p.sections)
      .map(toSection)
      .filter((s): s is Section => !!s),
  }))
  return {
    version: 1,
    name: typeof v.name === "string" ? v.name.slice(0, 120) : "Untitled site",
    theme: {
      ...DEFAULT_THEME,
      ...(v.theme ?? {}),
      palette: { ...DEFAULT_THEME.palette, ...(v.theme?.palette ?? {}) },
    },
    header: toSection(v.header),
    footer: toSection(v.footer),
    pages: pages.length
      ? pages
      : [
          {
            id: newId(),
            name: "Home",
            slug: "",
            seo: { title: "", description: "", image: "" },
            sections: [],
          },
        ],
    posts: arr<Post>(v.posts),
    products: arr<Product>(v.products),
    services: arr<Service>(v.services),
    hours: { ...DEFAULT_HOURS, ...(v.hours ?? {}) },
    events: arr<EventItem>(v.events),
    collections: arr<Collection>(v.collections),
    settings: {
      currency: "USD",
      favicon: "",
      description: "",
      shareImage: "",
      indexable: false,
      orderNote: "",
      ...(v.settings ?? {}),
    },
  }
}

// ── Phone layout ─────────────────────────────────────────────────────────────

const GUTTER = 24
const GAP = 16
const PAD = 40

const textHeight = (e: ElOf<"text">, size: number, width: number) => {
  const chars = Math.max(1, e.props.text.length)
  const perLine = Math.max(6, Math.floor(width / (size * 0.62)))
  const lines =
    e.props.text
      .split("\n")
      .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0) ||
    Math.ceil(chars / perLine)
  return Math.ceil(lines * size * (e.style.leading ?? 1.35)) + 6
}

export const phoneSize = (style: Style) => {
  if (style.phoneSize) return style.phoneSize
  const size = style.size ?? 16
  if (size <= 20) return size
  return Math.max(20, Math.round(16 + (size - 16) * 0.55))
}

function fitted(e: El, width: number): number {
  const scaled = (e.box.h * width) / Math.max(1, e.box.w)
  switch (e.type) {
    case "text":
      return textHeight(e, phoneSize(e.style), width)
    case "button":
      return Math.max(46, e.box.h)
    case "line":
      return Math.max(1, e.box.h)
    case "menu":
      return Math.max(e.box.h, 84)
    case "social":
    case "countdown":
      return e.box.h
    case "image":
    case "video":
    case "map":
      return Math.round(Math.min(scaled, 420))
    case "gallery":
      return Math.round(
        e.props.layout === "slider"
          ? 280
          : (Math.ceil(e.props.images.length / 2) * width) / 2
      )
    case "form":
      return (
        e.props.fields.reduce(
          (h, f) => h + (f.type === "textarea" ? 160 : 92),
          0
        ) + 84
      )
    case "accordion":
      return e.props.items.length * 84 + 140
    case "pricing":
      return (
        e.props.tiers.reduce((h, t) => h + 300 + t.features.length * 40, 0) + 40
      )
    case "products":
      return e.props.limit * 590
    case "posts":
    case "list":
      return e.props.limit * 450
    case "events":
      return e.props.limit * 320
    case "booking":
      return 620
    default:
      return Math.round(Math.min(scaled, 480))
  }
}

const inside = (outer: Box, b: Box) => {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  return (
    cx >= outer.x &&
    cx <= outer.x + outer.w &&
    cy >= outer.y &&
    cy <= outer.y + outer.h
  )
}

function bands(items: El[], axis: "x" | "y") {
  const size = axis === "y" ? "h" : "w"
  const sorted = [...items].sort((a, b) => a.box[axis] - b.box[axis])
  const groups: El[][] = []
  let edge = -Infinity
  for (const item of sorted) {
    if (item.box[axis] >= edge - 2) groups.push([item])
    else groups[groups.length - 1]!.push(item)
    edge = Math.max(edge, item.box[axis] + item.box[size])
  }
  return groups
}

// Reading order. Columns first, so a heading stays with the text under it. When
// nothing splits the rest into columns, take the top row off and look again.
function readingOrder(items: El[]): El[] {
  if (items.length <= 1) return items
  const columns = bands(items, "x")
  if (columns.length > 1) return columns.flatMap(readingOrder)
  const [first, ...rest] = bands(items, "y")
  if (!rest.length) return first!
  return [...first!, ...readingOrder(rest.flat())]
}

// A short section with a menu is a site header. On a phone it stays one bar: the
// name on the left and a menu button on the right.
function phoneBar(section: Section) {
  const menu = section.elements.find((e) => e.type === "menu")
  if (!menu || section.height > 140) return null
  const frames = new Map<string, Box>()
  const height = section.phoneHeight ?? 64
  const name = section.elements.find(
    (e) => e.type === "text" || e.type === "image"
  )
  frames.set(menu.id, { x: PHONE - GUTTER - 56, y: 12, w: 56, h: 40 })
  if (name)
    frames.set(name.id, {
      x: GUTTER,
      y: 14,
      w: PHONE - GUTTER * 2 - 64,
      h: 36,
    })
  const dropped = new Set(
    section.elements.filter((e) => !frames.has(e.id)).map((e) => e.id)
  )
  return { frames, height, bar: true, dropped }
}

// Works out where each element goes on a phone when nobody placed it: one
// column, in reading order, and a card behind other elements stays behind them.
export function phoneLayout(section: Section) {
  const bar = phoneBar(section)
  if (bar) return bar
  const visible = section.elements.filter((e) => !e.hideOnPhone && !e.hidden)
  const backdrops = visible.filter(
    (e) =>
      (e.type === "shape" || e.type === "image") &&
      visible.some((o) => o !== e && inside(e.box, o.box) && o.box.w < e.box.w)
  )
  const flow = visible.filter((e) => !backdrops.includes(e))
  const width = PHONE - GUTTER * 2
  const frames = new Map<string, Box>()
  let y = PAD
  const stacked = readingOrder(flow)
  for (const e of stacked) {
    const full =
      e.type === "text" ||
      e.type === "form" ||
      e.box.w > PHONE * 0.7 ||
      e.type === "gallery"
    const w = full ? width : Math.min(width, e.box.w)
    const h = fitted(e, w)
    const x =
      e.style.align === "center" || (e.type !== "text" && !full)
        ? Math.round((PHONE - w) / 2)
        : GUTTER
    if (e.type === "line" || e.type === "menu" || e.type === "social")
      frames.set(e.id, { x: GUTTER, y, w: width, h })
    else frames.set(e.id, { x, y, w, h })
    y += h + GAP
  }
  for (const b of backdrops) {
    const kids = flow
      .filter((e) => inside(b.box, e.box))
      .map((e) => frames.get(e.id)!)
    const top = Math.min(...kids.map((k) => k.y)) - 16
    const bottom = Math.max(...kids.map((k) => k.y + k.h)) + 16
    frames.set(b.id, {
      x: GUTTER - 8,
      y: top,
      w: width + 16,
      h: bottom - top,
    })
  }
  const height = section.phoneHeight ?? Math.max(y - GAP + PAD, 80)
  return { frames, height, bar: false, dropped: new Set<string>() }
}

// One element's box on a device, resolving the automatic phone layout.
export function frameOf(
  e: El,
  device: Device,
  auto: ReturnType<typeof phoneLayout> | null
): Box {
  if (device === "desktop") return e.box
  return e.phone ?? auto?.frames.get(e.id) ?? e.box
}
