import { blocks } from "../blocks"
import { newId } from "../model"
import { collection, img, page, site, to } from "./kit"
import type { Template } from "./types"

const I = img("ansel")

export const ansel: Template = {
  id: "ansel",
  name: "Ansel",
  category: "Creative",
  blurb:
    "A photographer's portfolio with huge type, project pages and a big gallery.",
  apps: [],
  make: () => {
    const home = newId()
    const work = newId()
    const about = newId()
    const contact = newId()
    const projects = collection("Projects", [
      {
        title: "Salt",
        subtitle: "Bonneville, 2025",
        body: "Three weeks on a dry lake bed, photographed at dawn.",
        image: I("hero"),
      },
      {
        title: "Grey Water",
        subtitle: "North Sea, 2024",
        body: "Fishing boats in mist, long exposures from the harbour wall.",
        image: I("p1"),
      },
      {
        title: "Narrow Streets",
        subtitle: "Naples, 2024",
        body: "Laundry, sidelight and the way people walk home.",
        image: I("p2"),
      },
      {
        title: "Ridgeline",
        subtitle: "Dolomites, 2023",
        body: "Layered peaks in cloud, shot over four sunrises.",
        image: I("p3"),
      },
      {
        title: "Concrete",
        subtitle: "Lisbon, 2023",
        body: "Stairs and shadows, in black and white.",
        image: I("p4"),
      },
      {
        title: "Long Road",
        subtitle: "Nevada, 2022",
        body: "One highway, one car and a lot of sky.",
        image: I("p5"),
      },
    ])
    return site({
      name: "Elias Ward",
      description:
        "Landscape and street photography by Elias Ward. Prints, projects and commissions.",
      currency: "USD",
      shareImage: I("hero"),
      collections: [projects],
      theme: {
        palette: {
          bg: "#f0eeea",
          surface: "#e4e1db",
          text: "#0f0f0f",
          muted: "#5f5d58",
          accent: "#b8381f",
          accentText: "#ffffff",
          line: "#cfccc5",
        },
        heading: "Space Grotesk",
        body: "Inter",
        radius: 2,
      },
      header: blocks.header("Elias Ward", {
        label: "Commission",
        link: to(contact),
      }),
      footer: blocks.footer(
        "Elias Ward",
        "Landscape and street photography. Available for commissions worldwide. studio@example.com",
        [{ kind: "instagram", url: "https://example.com/eliasward" }]
      ),
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.heroEditorial({
              title: "Quiet places, long light",
              text: "Photographs of landscapes and streets, made slowly and printed carefully.",
              cta: "See the work",
              ctaLink: to(work),
              image: I("hero"),
              alt: "A figure on a salt flat at dawn",
            }),
            blocks.list({
              title: "Selected projects",
              collection: projects.id,
              limit: 3,
              columns: 3,
            }),
            blocks.quote(
              {
                text: "I wait for the light, then I wait some more.",
                author: "Elias Ward",
              },
              { fill: "$surface" }
            ),
            blocks.gallery({
              images: [
                { src: I("e1"), alt: "Tall grass and a lone tree" },
                { src: I("e2"), alt: "Pines in fog" },
                { src: I("e3"), alt: "Sea cliffs at blue hour" },
              ],
            }),
            blocks.cta(
              {
                title: "Have a place in mind?",
                text: "I take on five commissions a year.",
                cta: "Get in touch",
                ctaLink: to(contact),
              },
              { fill: "$text", color: "$bg" }
            ),
          ],
          "Elias Ward | Photographer",
          "Landscape and street photography by Elias Ward. Selected projects, prints and commissions.",
          I("hero")
        ),
        page(
          work,
          "Work",
          "work",
          [
            blocks.list({
              title: "All projects",
              collection: projects.id,
              limit: 6,
              columns: 3,
            }),
            blocks.gallery(
              {
                title: "Frames",
                images: [
                  { src: I("p1"), alt: "A fishing boat in mist" },
                  { src: I("p2"), alt: "A narrow alley with laundry" },
                  { src: I("p3"), alt: "Mountain ridge at sunrise" },
                  { src: I("p4"), alt: "Concrete staircase" },
                  { src: I("p5"), alt: "Desert road at dusk" },
                  { src: I("p6"), alt: "Rainy street at night" },
                  { src: I("e1"), alt: "Tall grass and a lone tree" },
                  { src: I("e2"), alt: "Pines in fog" },
                  { src: I("e3"), alt: "Sea cliffs at blue hour" },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "Work | Elias Ward",
          "Projects and single frames from ten years of landscape and street photography.",
          I("p3")
        ),
        page(
          about,
          "About",
          "about",
          [
            blocks.story({
              kicker: "About",
              title: "Ten years, one camera",
              text: "I grew up near the sea and have been chasing grey light ever since. I shoot on a medium format camera, develop my own film and print in small editions. Clients include magazines, hotels and a few patient families.",
              image: I("p6"),
              cta: "Commission a project",
              ctaLink: to(contact),
            }),
            blocks.stats(
              [
                { value: "10", label: "years shooting" },
                { value: "23", label: "countries" },
                { value: "5", label: "commissions a year" },
              ],
              { fill: "$text", color: "$bg" }
            ),
          ],
          "About | Elias Ward",
          "Elias Ward has photographed landscapes and streets in 23 countries and prints every edition himself.",
          I("p6")
        ),
        page(
          contact,
          "Contact",
          "contact",
          [
            blocks.contact({
              title: "Say hello",
              text: "Tell me about the project, the place and the dates. I reply within three days.",
              details:
                "studio@example.com\n+44 20 7946 0581\nBased in London, travelling often",
              submit: "Send",
            }),
          ],
          "Contact | Elias Ward",
          "Commission a photographer. Share your project and I will reply within three days.",
          I("hero")
        ),
      ],
    })
  },
}
