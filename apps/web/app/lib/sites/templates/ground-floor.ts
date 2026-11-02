import { blocks } from "../blocks"
import { newId } from "../model"
import { collection, img, page, site, to } from "./kit"
import type { Template } from "./types"

const I = img("ground-floor")

export const groundFloor: Template = {
  id: "ground-floor",
  name: "Ground Floor",
  category: "Business",
  blurb:
    "An architecture and interiors studio with a big editorial hero and project pages.",
  apps: [],
  make: () => {
    const home = newId()
    const projects = newId()
    const studio = newId()
    const contact = newId()
    const work = collection("Projects", [
      {
        title: "Linden House",
        subtitle: "Residential, 2026",
        body: "A family home rebuilt around a double height living room.",
        image: I("hero"),
      },
      {
        title: "Oak Kitchen",
        subtitle: "Interior, 2025",
        body: "Solid oak cabinetry and a single slab of stone.",
        image: I("p1"),
      },
      {
        title: "The Stair",
        subtitle: "Residential, 2025",
        body: "A curved plaster stairwell lit from a skylight.",
        image: I("p2"),
      },
      {
        title: "Quiet Room",
        subtitle: "Interior, 2024",
        body: "A low bed, linen and a window that fills the wall.",
        image: I("p3"),
      },
      {
        title: "Page & Pine",
        subtitle: "Retail, 2024",
        body: "A neighbourhood bookshop in timber and warm light.",
        image: I("p4"),
      },
      {
        title: "Terrazzo Bath",
        subtitle: "Interior, 2023",
        body: "A small bathroom with a rounded mirror and brass.",
        image: I("p5"),
      },
    ])
    return site({
      name: "Ground Floor Studio",
      description:
        "An architecture and interiors studio designing calm homes and small commercial spaces.",
      currency: "USD",
      shareImage: I("hero"),
      collections: [work],
      theme: {
        palette: {
          bg: "#ece8e0",
          surface: "#dfdad0",
          text: "#1c1b19",
          muted: "#5d5951",
          accent: "#5a4a38",
          accentText: "#f5f1ea",
          line: "#cbc5b8",
        },
        heading: "Archivo",
        body: "Lora",
        radius: 0,
      },
      header: blocks.header("Ground Floor", {
        label: "Enquire",
        link: to(contact),
      }),
      footer: blocks.footer(
        "Ground Floor Studio",
        "Architecture and interiors. Studio visits by appointment. studio@example.com",
        [{ kind: "instagram", url: "https://example.com/groundfloor" }]
      ),
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.heroEditorial({
              title: "Rooms that feel settled",
              text: "We design homes and small spaces with real materials, good light and no fuss.",
              cta: "See projects",
              ctaLink: to(projects),
              image: I("hero"),
              alt: "A living room with oak floors and plaster walls",
            }),
            blocks.intro(
              {
                kicker: "Our approach",
                title: "Fewer things, made properly",
                text: "We start with how you live, then draw the plan around it. Materials are chosen to age well, and details are kept simple enough to build properly.",
              },
              { fill: "$surface" }
            ),
            blocks.list({
              title: "Recent projects",
              collection: work.id,
              limit: 3,
              columns: 3,
            }),
            blocks.story(
              {
                kicker: "The studio",
                title: "Six people, one big table",
                text: "Ground Floor is an architect, an interior designer and four makers. We draw, build models and visit site every week, so what is drawn is what gets built.",
                image: I("studio"),
                cta: "Meet the studio",
                ctaLink: to(studio),
              },
              { fill: "$bg" }
            ),
            blocks.cta({
              title: "Planning a home?",
              text: "Tell us about it. First conversations are free.",
              cta: "Start a conversation",
              ctaLink: to(contact),
            }),
          ],
          "Ground Floor Studio | Architecture and interiors",
          "An architecture and interiors studio designing calm homes and small commercial spaces.",
          I("hero")
        ),
        page(
          projects,
          "Projects",
          "projects",
          [
            blocks.list({
              title: "Selected work",
              collection: work.id,
              limit: 6,
              columns: 3,
            }),
          ],
          "Projects | Ground Floor Studio",
          "Selected architecture and interior projects by Ground Floor Studio.",
          I("p1")
        ),
        page(
          studio,
          "Studio",
          "studio",
          [
            blocks.story({
              kicker: "Studio",
              title: "Made on site, not just on screen",
              text: "We keep a workshop above the studio, where we build cardboard models and test joints at full size. Clients are invited to handle samples before anything is ordered.",
              image: I("detail"),
            }),
            blocks.features(
              {
                title: "How a project runs",
                items: [
                  {
                    title: "Listen",
                    text: "Two or three visits to see how you live, with sketches by the end of the month.",
                  },
                  {
                    title: "Draw",
                    text: "Plans, models and material boards, with a fixed budget agreed before we go further.",
                  },
                  {
                    title: "Build",
                    text: "We manage builders and visit weekly until the keys are handed over.",
                  },
                ],
              },
              { fill: "$surface" }
            ),
            blocks.stats(
              [
                { value: "62", label: "homes completed" },
                { value: "14", label: "years of practice" },
                { value: "6", label: "people in the studio" },
              ],
              { fill: "$text", color: "$bg" }
            ),
          ],
          "Studio | Ground Floor Studio",
          "Meet the architects, designers and makers behind Ground Floor Studio.",
          I("studio")
        ),
        page(
          contact,
          "Contact",
          "contact",
          [
            blocks.contact({
              title: "Start a conversation",
              text: "Tell us about the building, the budget and the timing. We reply within two working days.",
              details:
                "Unit 3, Mill Yard, Leeds\nstudio@example.com\n+44 113 496 0555",
              map: "Mill Yard, Leeds",
            }),
          ],
          "Contact | Ground Floor Studio",
          "Talk to Ground Floor Studio about a new home, an extension or an interior.",
          I("detail")
        ),
      ],
    })
  },
}
