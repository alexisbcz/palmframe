// The building blocks every template and the editor's "Add section" gallery
// share. Each returns a fresh section with its own ids.
import {
  newId,
  type Anim,
  type Box,
  type El,
  type ElementType,
  type ElOf,
  type Fill,
  type Link,
  type Section,
  type Style,
  type Tier,
} from "./model"

type Opts = { anim?: Anim | null; name?: string; style?: Style }

export function el<K extends ElementType>(
  type: K,
  box: Box,
  props: ElOf<K>["props"],
  style: Style = {},
  anim: Anim | null = null
): El {
  return { id: newId(), type, box, props, style, anim } as unknown as El
}

const H = (
  text: string,
  box: Box,
  size: number,
  style: Style = {},
  tag: "h1" | "h2" | "h3" = "h2"
) =>
  el(
    "text",
    box,
    { text, tag },
    { font: "heading", size, weight: 700, leading: 1.08, ...style },
    "rise"
  )

const P = (text: string, box: Box, size = 18, style: Style = {}) =>
  el(
    "text",
    box,
    { text, tag: "p" },
    { size, color: "$muted", leading: 1.55, ...style },
    "rise"
  )

const K = (text: string, box: Box, style: Style = {}) =>
  el(
    "text",
    box,
    { text, tag: "p" },
    {
      size: 13,
      weight: 600,
      upper: true,
      tracking: 0.14,
      color: "$accent",
      ...style,
    }
  )

const B = (
  label: string,
  box: Box,
  link: Link | null = null,
  variant: "solid" | "outline" = "solid",
  style: Style = {}
) => el("button", box, { label, link, variant }, { size: 16, ...style }, "rise")

const Img = (
  src: string,
  alt: string,
  box: Box,
  style: Style = {},
  anim: Anim | null = "fade"
) => el("image", box, { src, alt }, { radius: 12, ...style }, anim)

const section = (
  name: string,
  height: number,
  fill: Fill,
  elements: El[],
  extra: Partial<Section> = {}
): Section => ({ id: newId(), name, height, fill, elements, ...extra })

const color = (c: string): Fill => ({ kind: "color", color: c })
const LEFT = 60
const WIDTH = 1080

export interface HeroCopy {
  kicker?: string
  title: string
  text: string
  cta: string
  ctaLink?: Link | null
  second?: string
  secondLink?: Link | null
  image: string
  alt?: string
}

export const blocks = {
  header(
    name: string,
    cta?: { label: string; link?: Link | null },
    opts: { fill?: string; color?: string } = {}
  ): Section {
    const c = opts.color ?? "$text"
    return section(
      "Header",
      84,
      color(opts.fill ?? "$bg"),
      [
        el(
          "text",
          { x: LEFT, y: 24, w: 300, h: 36 },
          { text: name, tag: "p", link: { kind: "url", url: "#" } },
          { font: "heading", size: 24, weight: 700, color: c }
        ),
        el(
          "menu",
          { x: 400, y: 22, w: cta ? 590 : 740, h: 40 },
          { gap: 30 },
          { size: 15, align: "right", color: c }
        ),
        ...(cta
          ? [
              B(
                cta.label,
                { x: 1010, y: 20, w: 130, h: 44 },
                cta.link ?? null,
                "solid",
                {
                  size: 14,
                }
              ),
            ]
          : []),
      ].map((e) => ({ ...e, anim: null })) as El[],
      { sticky: true }
    )
  },

  footer(
    name: string,
    line: string,
    social: { kind: string; url: string }[] = [],
    opts: { fill?: string; color?: string } = {}
  ): Section {
    const c = opts.color ?? "$text"
    return section("Footer", 240, color(opts.fill ?? "$surface"), [
      el(
        "text",
        { x: LEFT, y: 56, w: 420, h: 40 },
        { text: name, tag: "p" },
        { font: "heading", size: 28, weight: 700, color: c }
      ),
      el(
        "text",
        { x: LEFT, y: 104, w: 420, h: 60 },
        { text: line, tag: "p" },
        {
          size: 15,
          color: opts.color ?? "$muted",
          leading: 1.5,
          opacity: opts.color ? 0.75 : 1,
        }
      ),
      el(
        "menu",
        { x: 540, y: 56, w: 600, h: 32 },
        { gap: 24 },
        { size: 15, align: "right", color: c }
      ),
      ...(social.length
        ? [
            el(
              "social",
              { x: 840, y: 112, w: 300, h: 32 },
              { links: social },
              { size: 18, align: "right", color: c }
            ),
          ]
        : []),
    ])
  },

  // Words on the left, a tall picture on the right.
  heroSplit(c: HeroCopy): Section {
    return section("Hero", 680, color("$bg"), [
      ...(c.kicker ? [K(c.kicker, { x: LEFT, y: 140, w: 480, h: 24 })] : []),
      H(c.title, { x: LEFT, y: 176, w: 530, h: 220 }, 68, {}, "h1"),
      P(c.text, { x: LEFT, y: 410, w: 480, h: 90 }),
      B(c.cta, { x: LEFT, y: 520, w: 190, h: 54 }, c.ctaLink),
      ...(c.second
        ? [
            B(
              c.second,
              { x: 266, y: 520, w: 190, h: 54 },
              c.secondLink,
              "outline"
            ),
          ]
        : []),
      Img(c.image, c.alt ?? "", { x: 640, y: 50, w: 500, h: 580 }),
    ])
  },

  // A photograph across the whole width, with words over it.
  heroFull(c: HeroCopy): Section {
    return section(
      "Hero",
      760,
      { kind: "image", src: c.image, overlay: 0.42 },
      [
        ...(c.kicker
          ? [
              K(
                c.kicker,
                { x: 200, y: 214, w: 800, h: 24 },
                { align: "center", color: "#ffffff" }
              ),
            ]
          : []),
        H(
          c.title,
          { x: 120, y: 252, w: 960, h: 200 },
          84,
          { align: "center", color: "#ffffff" },
          "h1"
        ),
        P(c.text, { x: 270, y: 468, w: 660, h: 70 }, 20, {
          align: "center",
          color: "#ffffff",
        }),
        B(c.cta, { x: 500, y: 562, w: 200, h: 56 }, c.ctaLink),
      ]
    )
  },

  // Very large type with the picture underneath, for portfolios and studios.
  heroEditorial(c: HeroCopy): Section {
    return section("Hero", 900, color("$bg"), [
      H(
        c.title,
        { x: LEFT, y: 70, w: WIDTH, h: 290 },
        124,
        { leading: 0.98, tracking: -0.02 },
        "h1"
      ),
      P(c.text, { x: 700, y: 372, w: 440, h: 96 }),
      B(c.cta, { x: LEFT, y: 386, w: 200, h: 54 }, c.ctaLink),
      Img(
        c.image,
        c.alt ?? "",
        { x: LEFT, y: 500, w: WIDTH, h: 360 },
        { radius: 4 }
      ),
    ])
  },

  // Words in a card that sits on the photograph.
  heroCard(c: HeroCopy): Section {
    return section(
      "Hero",
      720,
      { kind: "image", src: c.image, overlay: 0.05 },
      [
        el(
          "shape",
          { x: LEFT, y: 170, w: 520, h: 420 },
          { shape: "box" },
          {
            fill: "$bg",
            radius: 14,
            shadow: true,
          },
          "rise"
        ),
        ...(c.kicker ? [K(c.kicker, { x: 104, y: 214, w: 430, h: 24 })] : []),
        H(c.title, { x: 104, y: 250, w: 430, h: 160 }, 50, {}, "h1"),
        P(c.text, { x: 104, y: 420, w: 430, h: 80 }, 17),
        B(c.cta, { x: 104, y: 512, w: 190, h: 52 }, c.ctaLink),
      ]
    )
  },

  intro(
    c: { kicker?: string; title: string; text: string },
    opts: { fill?: string } = {}
  ) {
    return section("Introduction", 400, color(opts.fill ?? "$bg"), [
      ...(c.kicker
        ? [K(c.kicker, { x: 200, y: 96, w: 800, h: 24 }, { align: "center" })]
        : []),
      H(c.title, { x: 150, y: 130, w: 900, h: 110 }, 46, { align: "center" }),
      P(c.text, { x: 240, y: 254, w: 720, h: 84 }, 18, { align: "center" }),
    ])
  },

  // Three columns of a heading and a sentence.
  features(
    c: {
      title: string
      items: { title: string; text: string; image?: string }[]
    },
    opts: { fill?: string } = {}
  ) {
    const w = (WIDTH - 40 * 2) / 3
    const pictured = c.items.some((i) => i.image)
    const top = 190
    const imageH = pictured ? 240 : 0
    return section(
      "Features",
      top + imageH + 250,
      color(opts.fill ?? "$surface"),
      [
        H(c.title, { x: LEFT, y: 84, w: 820, h: 70 }, 42),
        ...c.items.slice(0, 3).flatMap((item, i) => {
          const x = LEFT + i * (w + 40)
          return [
            ...(item.image
              ? [Img(item.image, item.title, { x, y: top, w, h: imageH - 20 })]
              : [el("line", { x, y: top, w, h: 2 }, {}, { fill: "$accent" })]),
            H(
              item.title,
              { x, y: top + imageH + 20, w, h: 40 },
              24,
              { weight: 600 },
              "h3"
            ),
            P(item.text, { x, y: top + imageH + 64, w, h: 110 }, 16),
          ]
        }),
      ]
    )
  },

  // A picture beside a passage, either way round.
  story(
    c: {
      kicker?: string
      title: string
      text: string
      image: string
      cta?: string
      ctaLink?: Link | null
      flip?: boolean
    },
    opts: { fill?: string } = {}
  ) {
    const words = c.flip ? 640 : LEFT
    const picture = c.flip ? LEFT : 640
    return section("Story", 640, color(opts.fill ?? "$bg"), [
      Img(c.image, c.title, { x: picture, y: 70, w: 500, h: 500 }),
      ...(c.kicker ? [K(c.kicker, { x: words, y: 140, w: 480, h: 24 })] : []),
      H(c.title, { x: words, y: 176, w: 500, h: 130 }, 44),
      P(c.text, { x: words, y: 318, w: 490, h: 150 }, 17),
      ...(c.cta
        ? [B(c.cta, { x: words, y: 486, w: 190, h: 52 }, c.ctaLink, "outline")]
        : []),
    ])
  },

  stats(
    items: { value: string; label: string }[],
    opts: { fill?: string; color?: string } = {}
  ) {
    const w = WIDTH / items.length
    return section(
      "Numbers",
      240,
      color(opts.fill ?? "$accent"),
      items.flatMap((s, i) => [
        H(s.value, { x: LEFT + i * w, y: 66, w: w - 20, h: 66 }, 54, {
          color: opts.color ?? "$accentText",
          align: "center",
        }),
        P(s.label, { x: LEFT + i * w, y: 140, w: w - 20, h: 30 }, 15, {
          color: opts.color ?? "$accentText",
          align: "center",
        }),
      ])
    )
  },

  quote(
    c: { text: string; author: string; image?: string },
    opts: { fill?: string } = {}
  ) {
    return section("Testimonial", 420, color(opts.fill ?? "$surface"), [
      H(`“${c.text}”`, { x: 150, y: 90, w: 900, h: 190 }, 34, {
        align: "center",
        weight: 500,
        leading: 1.25,
      }),
      P(c.author, { x: 300, y: 300, w: 600, h: 30 }, 15, { align: "center" }),
    ])
  },

  testimonials(
    items: { text: string; author: string }[],
    opts: { fill?: string; title?: string } = {}
  ) {
    const w = (WIDTH - 40) / 3
    return section("Testimonials", 480, color(opts.fill ?? "$surface"), [
      H(opts.title ?? "What people say", { x: LEFT, y: 72, w: 800, h: 60 }, 38),
      ...items.slice(0, 3).flatMap((t, i) => {
        const x = LEFT + i * (w + 20)
        return [
          el(
            "shape",
            { x, y: 164, w, h: 250 },
            { shape: "box" },
            { fill: "$bg", radius: 12 },
            "rise"
          ),
          P(`“${t.text}”`, { x: x + 28, y: 192, w: w - 56, h: 150 }, 17, {
            color: "$text",
          }),
          P(t.author, { x: x + 28, y: 358, w: w - 56, h: 28 }, 14),
        ]
      }),
    ])
  },

  gallery(
    c: { title?: string; images: { src: string; alt: string }[] },
    opts: { fill?: string; columns?: number } = {}
  ) {
    const columns = opts.columns ?? 3
    const rows = Math.ceil(c.images.length / columns)
    const cell = (WIDTH - 16 * (columns - 1)) / columns
    const height = Math.round(rows * cell * 0.8 + (rows - 1) * 16)
    const top = c.title ? 170 : 60
    return section("Gallery", top + height + 70, color(opts.fill ?? "$bg"), [
      ...(c.title ? [H(c.title, { x: LEFT, y: 72, w: 800, h: 60 }, 42)] : []),
      el(
        "gallery",
        { x: LEFT, y: top, w: WIDTH, h: height },
        { images: c.images, layout: "grid", columns, gap: 16 },
        {},
        "fade"
      ),
    ])
  },

  pricing(
    c: { title: string; text?: string; tiers: Tier[] },
    opts: { fill?: string } = {}
  ) {
    return section("Pricing", 780, color(opts.fill ?? "$bg"), [
      H(c.title, { x: 150, y: 76, w: 900, h: 64 }, 44, { align: "center" }),
      ...(c.text
        ? [
            P(c.text, { x: 240, y: 148, w: 720, h: 34 }, 17, {
              align: "center",
            }),
          ]
        : []),
      el(
        "pricing",
        { x: LEFT, y: 210, w: WIDTH, h: 500 },
        { tiers: c.tiers },
        {},
        "rise"
      ),
    ])
  },

  faq(
    c: { title: string; items: { q: string; a: string }[] },
    opts: { fill?: string } = {}
  ) {
    const h = c.items.length * 66 + 130
    return section(
      "Questions",
      Math.max(420, h + 150),
      color(opts.fill ?? "$bg"),
      [
        H(c.title, { x: LEFT, y: 80, w: 340, h: 130 }, 42),
        el("accordion", { x: 460, y: 80, w: 680, h }, { items: c.items }),
      ]
    )
  },

  cta(
    c: { title: string; text?: string; cta: string; ctaLink?: Link | null },
    opts: { fill?: string; color?: string } = {}
  ) {
    const ink = opts.color ?? "$accentText"
    return section("Call to action", 380, color(opts.fill ?? "$accent"), [
      H(c.title, { x: 150, y: 86, w: 900, h: 110 }, 50, {
        align: "center",
        color: ink,
      }),
      ...(c.text
        ? [
            P(c.text, { x: 260, y: 204, w: 680, h: 32 }, 18, {
              align: "center",
              color: ink,
            }),
          ]
        : []),
      B(c.cta, { x: 500, y: 256, w: 200, h: 56 }, c.ctaLink, "solid", {
        fill: ink,
        color: opts.fill ?? "$accent",
      }),
    ])
  },

  contact(
    c: {
      title: string
      text: string
      details: string
      map?: string
      submit?: string
      success?: string
    },
    opts: { fill?: string } = {}
  ) {
    return section("Contact", 720, color(opts.fill ?? "$bg"), [
      H(c.title, { x: LEFT, y: 90, w: 470, h: 120 }, 50),
      P(c.text, { x: LEFT, y: 216, w: 460, h: 84 }, 17),
      P(c.details, { x: LEFT, y: 316, w: 460, h: 110 }, 16, { color: "$text" }),
      ...(c.map
        ? [
            el(
              "map",
              { x: LEFT, y: 440, w: 460, h: 200 },
              { query: c.map },
              { radius: 10 }
            ),
          ]
        : []),
      el(
        "form",
        { x: 640, y: 90, w: 500, h: 540 },
        {
          fields: [
            { id: "name", label: "Name", type: "text", required: true },
            { id: "email", label: "Email", type: "email", required: true },
            { id: "phone", label: "Phone", type: "phone" },
            {
              id: "message",
              label: "Message",
              type: "textarea",
              required: true,
            },
          ],
          submit: c.submit ?? "Send message",
          success: c.success ?? "Thanks. We'll get back to you soon.",
        }
      ),
    ])
  },

  newsletter(
    c: { title: string; text: string; submit?: string },
    opts: { fill?: string; color?: string } = {}
  ) {
    const ink = opts.color ?? "$text"
    return section("Newsletter", 340, color(opts.fill ?? "$surface"), [
      H(c.title, { x: LEFT, y: 92, w: 520, h: 100 }, 40, { color: ink }),
      P(c.text, { x: LEFT, y: 198, w: 500, h: 70 }, 16, { color: ink }),
      el(
        "form",
        { x: 640, y: 120, w: 500, h: 96 },
        {
          fields: [
            { id: "email", label: "Email", type: "email", required: true },
          ],
          submit: c.submit ?? "Subscribe",
          success: "You're on the list.",
          kind: "newsletter",
          layout: "inline",
        },
        { color: ink }
      ),
    ])
  },

  shop(
    c: { title: string; limit?: number; columns?: number },
    opts: { fill?: string } = {}
  ) {
    const limit = c.limit ?? 6
    const columns = c.columns ?? 3
    const rows = Math.ceil(limit / columns)
    const card = (WIDTH - 28 * (columns - 1)) / columns
    const height = Math.round(rows * (card * 1.25 + 170))
    return section("Shop", height + 220, color(opts.fill ?? "$bg"), [
      H(c.title, { x: LEFT, y: 72, w: 800, h: 64 }, 44),
      el(
        "products",
        { x: LEFT, y: 170, w: WIDTH, h: height },
        { columns, limit },
        {},
        "fade"
      ),
    ])
  },

  blog(c: { title: string; limit?: number }, opts: { fill?: string } = {}) {
    const limit = c.limit ?? 3
    const rows = Math.ceil(limit / 3)
    return section("Blog", rows * 460 + 220, color(opts.fill ?? "$bg"), [
      H(c.title, { x: LEFT, y: 72, w: 800, h: 64 }, 44),
      el(
        "posts",
        { x: LEFT, y: 170, w: WIDTH, h: rows * 440 },
        { columns: 3, limit },
        {},
        "fade"
      ),
    ])
  },

  events(c: { title: string; limit?: number }, opts: { fill?: string } = {}) {
    const limit = c.limit ?? 3
    return section("Events", limit * 250 + 230, color(opts.fill ?? "$bg"), [
      H(c.title, { x: LEFT, y: 72, w: 800, h: 64 }, 44),
      el("events", { x: 120, y: 170, w: 960, h: limit * 240 }, { limit }),
    ])
  },

  booking(
    c: { title: string; text: string; heading?: string },
    opts: { fill?: string } = {}
  ) {
    return section("Booking", 720, color(opts.fill ?? "$surface"), [
      H(c.title, { x: LEFT, y: 90, w: 420, h: 130 }, 48),
      P(c.text, { x: LEFT, y: 232, w: 400, h: 120 }, 17),
      el(
        "booking",
        { x: 540, y: 80, w: 600, h: 570 },
        { heading: c.heading ?? "Choose a time" }
      ),
    ])
  },

  list(
    c: { title: string; collection: string; limit?: number; columns?: number },
    opts: { fill?: string } = {}
  ) {
    const limit = c.limit ?? 6
    const columns = c.columns ?? 3
    const rows = Math.ceil(limit / columns)
    return section("List", rows * 400 + 230, color(opts.fill ?? "$bg"), [
      H(c.title, { x: LEFT, y: 72, w: 800, h: 64 }, 44),
      el(
        "list",
        { x: LEFT, y: 170, w: WIDTH, h: rows * 390 },
        { collection: c.collection, columns, limit },
        {},
        "fade"
      ),
    ])
  },

  // Two columns of a name, a line and a price, for menus and price lists.
  priceList(
    c: {
      title: string
      groups: {
        name: string
        items: { name: string; text: string; price: string }[]
      }[]
    },
    opts: { fill?: string } = {}
  ) {
    const w = (WIDTH - 60) / 2
    const longest = Math.max(...c.groups.map((g) => g.items.length))
    const elements: El[] = [
      H(c.title, { x: 150, y: 76, w: 900, h: 64 }, 46, { align: "center" }),
    ]
    let bottom = 0
    c.groups.slice(0, 4).forEach((group, g) => {
      const x = LEFT + (g % 2) * (w + 60)
      const y = 180 + Math.floor(g / 2) * (longest * 84 + 80)
      elements.push(K(group.name, { x, y, w, h: 24 }))
      group.items.forEach((item, i) => {
        const iy = y + 44 + i * 84
        elements.push(
          H(
            item.name,
            { x, y: iy, w: w - 90, h: 30 },
            20,
            { weight: 600 },
            "h3"
          ),
          el(
            "text",
            { x: x + w - 90, y: iy, w: 90, h: 30 },
            { text: item.price, tag: "p" },
            { size: 18, align: "right", weight: 600 }
          ),
          P(item.text, { x, y: iy + 32, w: w - 20, h: 42 }, 15)
        )
        bottom = Math.max(bottom, iy + 84)
      })
    })
    return section(
      "Price list",
      bottom + 70,
      color(opts.fill ?? "$bg"),
      elements
    )
  },

  countdown(
    c: { title: string; to: string; done: string },
    opts: { fill?: string; color?: string } = {}
  ) {
    const ink = opts.color ?? "$text"
    return section("Countdown", 320, color(opts.fill ?? "$surface"), [
      H(c.title, { x: 150, y: 70, w: 900, h: 70 }, 42, {
        align: "center",
        color: ink,
      }),
      el(
        "countdown",
        { x: 300, y: 160, w: 600, h: 100 },
        { to: c.to, done: c.done },
        { color: ink, size: 18 }
      ),
    ])
  },
}

export const SECTION_LIBRARY: {
  id: string
  group: string
  make: () => Section
}[] = [
  {
    id: "heroSplit",
    group: "Hero",
    make: () =>
      blocks.heroSplit({
        kicker: "New",
        title: "Say what you do in one line",
        text: "A sentence or two about who you help and how.",
        cta: "Get started",
        second: "Learn more",
        image: "/sites/stock/studio.jpg",
      }),
  },
  {
    id: "heroFull",
    group: "Hero",
    make: () =>
      blocks.heroFull({
        title: "A headline over a photograph",
        text: "A short line that sits over your best picture.",
        cta: "Take a look",
        image: "/sites/stock/landscape.jpg",
      }),
  },
  {
    id: "heroEditorial",
    group: "Hero",
    make: () =>
      blocks.heroEditorial({
        title: "Very large words",
        text: "For studios and people whose work speaks first.",
        cta: "See the work",
        image: "/sites/stock/studio.jpg",
      }),
  },
  {
    id: "heroCard",
    group: "Hero",
    make: () =>
      blocks.heroCard({
        kicker: "Welcome",
        title: "Words on a card",
        text: "A photograph behind, a clear next step in front.",
        cta: "Book now",
        image: "/sites/stock/landscape.jpg",
      }),
  },
  {
    id: "intro",
    group: "Text",
    make: () =>
      blocks.intro({
        kicker: "About",
        title: "A short statement of what you believe",
        text: "Two or three lines that give a visitor a reason to stay.",
      }),
  },
  {
    id: "features",
    group: "Text",
    make: () =>
      blocks.features({
        title: "What you get",
        items: [
          {
            title: "First thing",
            text: "Explain what it is and why it matters.",
          },
          {
            title: "Second thing",
            text: "Explain what it is and why it matters.",
          },
          {
            title: "Third thing",
            text: "Explain what it is and why it matters.",
          },
        ],
      }),
  },
  {
    id: "story",
    group: "Text",
    make: () =>
      blocks.story({
        kicker: "Our story",
        title: "How this all started",
        text: "Tell the story in your own words. Who you are, why you do this and what people can expect.",
        image: "/sites/stock/studio.jpg",
      }),
  },
  {
    id: "stats",
    group: "Text",
    make: () =>
      blocks.stats([
        { value: "12", label: "Years open" },
        { value: "4k", label: "Happy customers" },
        { value: "98%", label: "Come back" },
      ]),
  },
  {
    id: "quote",
    group: "People",
    make: () =>
      blocks.quote({
        text: "The kind thing a happy customer said about you.",
        author: "Name, role",
      }),
  },
  {
    id: "testimonials",
    group: "People",
    make: () =>
      blocks.testimonials([
        { text: "A short, specific compliment.", author: "Name" },
        { text: "A short, specific compliment.", author: "Name" },
        { text: "A short, specific compliment.", author: "Name" },
      ]),
  },
  {
    id: "gallery",
    group: "Media",
    make: () =>
      blocks.gallery({
        title: "Gallery",
        images: [1, 2, 3, 4, 5, 6].map(() => ({
          src: "/sites/stock/studio.jpg",
          alt: "",
        })),
      }),
  },
  {
    id: "pricing",
    group: "Commerce",
    make: () =>
      blocks.pricing({
        title: "Simple pricing",
        tiers: [
          {
            name: "Starter",
            price: "$19",
            note: "per month",
            features: ["One thing", "Another thing"],
            cta: "Choose",
          },
          {
            name: "Plus",
            price: "$49",
            note: "per month",
            features: ["Everything in Starter", "One more thing"],
            cta: "Choose",
            featured: true,
          },
          {
            name: "Team",
            price: "$99",
            note: "per month",
            features: ["Everything in Plus", "Something bigger"],
            cta: "Choose",
          },
        ],
      }),
  },
  {
    id: "priceList",
    group: "Commerce",
    make: () =>
      blocks.priceList({
        title: "Menu",
        groups: [
          {
            name: "First",
            items: [
              { name: "Item", text: "What's in it.", price: "$12" },
              { name: "Item", text: "What's in it.", price: "$14" },
            ],
          },
          {
            name: "Second",
            items: [
              { name: "Item", text: "What's in it.", price: "$22" },
              { name: "Item", text: "What's in it.", price: "$24" },
            ],
          },
        ],
      }),
  },
  { id: "shop", group: "Commerce", make: () => blocks.shop({ title: "Shop" }) },
  {
    id: "booking",
    group: "Commerce",
    make: () =>
      blocks.booking({
        title: "Book a time",
        text: "Pick a service and a time that suits you.",
      }),
  },
  {
    id: "events",
    group: "Content",
    make: () => blocks.events({ title: "What's on" }),
  },
  {
    id: "blog",
    group: "Content",
    make: () => blocks.blog({ title: "Latest posts" }),
  },
  {
    id: "faq",
    group: "Content",
    make: () =>
      blocks.faq({
        title: "Questions",
        items: [
          { q: "A question people ask", a: "A clear answer." },
          { q: "Another question", a: "Another clear answer." },
          { q: "One more question", a: "One more clear answer." },
        ],
      }),
  },
  {
    id: "cta",
    group: "Forms",
    make: () =>
      blocks.cta({
        title: "Ready when you are",
        text: "Tell people what happens next.",
        cta: "Get in touch",
      }),
  },
  {
    id: "contact",
    group: "Forms",
    make: () =>
      blocks.contact({
        title: "Get in touch",
        text: "We usually reply within a day.",
        details: "hello@example.com\n+1 555 010 0100",
      }),
  },
  {
    id: "newsletter",
    group: "Forms",
    make: () =>
      blocks.newsletter({
        title: "Stay in the loop",
        text: "A short note when there's something worth saying.",
      }),
  },
  {
    id: "countdown",
    group: "Forms",
    make: () =>
      blocks.countdown({
        title: "Opening soon",
        to: new Date(Date.now() + 30 * 864e5).toISOString(),
        done: "We're open.",
      }),
  },
]
