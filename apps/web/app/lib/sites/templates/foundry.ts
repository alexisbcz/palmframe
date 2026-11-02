import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, product, site, to } from "./kit"
import type { Template } from "./types"

const I = img("foundry")

export const foundry: Template = {
  id: "foundry",
  name: "Foundry",
  category: "Store",
  blurb: "A dark streetwear drop with a countdown, products and a lookbook.",
  apps: ["store"],
  make: () => {
    const home = newId()
    const shop = newId()
    const look = newId()
    const info = newId()
    const hero = blocks.heroFull({
      kicker: "Drop 07, 6 February 2027",
      title: "Built for after dark",
      text: "Heavyweight basics in black, grey and washed olive. Cut once, made in small runs.",
      cta: "Shop the drop",
      ctaLink: to(shop),
      image: I("hero"),
    })
    if (hero.fill.kind === "image") hero.fill.overlay = 0.5
    return site({
      name: "Foundry",
      description:
        "Small run streetwear. Heavyweight basics, one drop at a time.",
      currency: "USD",
      orderNote:
        "Drops ship 5 to 7 days after the release date. All sales are final.",
      shareImage: I("hero"),
      products: [
        product(
          "Anvil hoodie",
          140,
          "450gsm brushed cotton, boxy cut, double layer hood. Garment dyed black.",
          [I("p1")]
        ),
        product(
          "Cargo trousers",
          165,
          "Washed grey ripstop, six pockets, tapered leg with an elastic hem.",
          [I("p2")]
        ),
        product(
          "Slab tee",
          58,
          "280gsm heavy jersey with a dropped shoulder. Shrunk and pre-washed.",
          [I("p3")]
        ),
        product(
          "Field jacket",
          220,
          "Washed olive cotton canvas, corduroy collar and a hidden zip pocket.",
          [I("p4")]
        ),
        product(
          "Beanie and tote set",
          65,
          "A ribbed black beanie and a heavy canvas tote, sold together.",
          [I("p5")]
        ),
        product(
          "Anvil hoodie, ash",
          140,
          "The same hoodie in washed grey. Only 80 made. Sold out in 11 minutes.",
          [I("p1")],
          true
        ),
      ],
      theme: {
        palette: {
          bg: "#0a0a0a",
          surface: "#161616",
          text: "#f2f2ee",
          muted: "#9a9a94",
          accent: "#d7ff3a",
          accentText: "#0a0a0a",
          line: "#2a2a2a",
        },
        heading: "Oswald",
        body: "JetBrains Mono",
        radius: 0,
      },
      header: blocks.header("FOUNDRY", { label: "Shop", link: to(shop) }),
      footer: blocks.footer(
        "FOUNDRY",
        "Small run streetwear. Made in Porto. support@example.com",
        [{ kind: "instagram", url: "https://example.com/foundry" }]
      ),
      pages: [
        page(
          home,
          "Home",
          "",
          [
            hero,
            blocks.countdown({
              title: "Drop 07 goes live in",
              to: "2027-02-06T18:00:00",
              done: "The drop is live.",
            }),
            blocks.shop({ title: "The pieces", limit: 3, columns: 3 }),
            blocks.story(
              {
                kicker: "The idea",
                title: "Fewer pieces, heavier cloth",
                text: "We make three drops a year, in runs of 200 or less. Everything is cut in Porto, from fabric heavy enough to hold a shape. When it is gone, it is gone.",
                image: I("look"),
                flip: true,
              },
              { fill: "$surface" }
            ),
            blocks.newsletter({
              title: "Get the code first",
              text: "Subscribers get the drop link ten minutes before everyone else.",
            }),
          ],
          "Foundry | Small run streetwear",
          "Heavyweight streetwear in small runs. Next drop: 6 February 2027.",
          I("hero")
        ),
        page(
          shop,
          "Shop",
          "shop",
          [blocks.shop({ title: "Drop 07", limit: 6, columns: 3 })],
          "Shop | Foundry",
          "Hoodies, trousers, tees, jackets and accessories from Drop 07.",
          I("p1")
        ),
        page(
          look,
          "Lookbook",
          "lookbook",
          [
            blocks.gallery(
              {
                title: "Lookbook",
                images: [
                  { src: I("look"), alt: "A long coat in a parking garage" },
                  { src: I("hero"), alt: "A black hoodie under an overpass" },
                  { src: I("p4"), alt: "The field jacket" },
                  { src: I("p2"), alt: "Cargo trousers" },
                  { src: I("p1"), alt: "The Anvil hoodie" },
                  { src: I("p3"), alt: "The Slab tee" },
                ],
              },
              { fill: "$bg" }
            ),
            blocks.cta({
              title: "See it in the flesh",
              text: "Pieces go on sale at 6pm sharp.",
              cta: "Shop the drop",
              ctaLink: to(shop),
            }),
          ],
          "Lookbook | Foundry",
          "The Drop 07 lookbook, shot at night in Porto.",
          I("look")
        ),
        page(
          info,
          "Help",
          "help",
          [
            blocks.faq({
              title: "Help",
              items: [
                {
                  q: "When do orders ship?",
                  a: "Five to seven days after a drop. You will get a tracking link by email.",
                },
                {
                  q: "What is your return policy?",
                  a: "All sales are final, but we will swap a size within 14 days if unworn.",
                },
                {
                  q: "How do the sizes fit?",
                  a: "Boxy. Most people take their usual size. Go down one for a closer fit.",
                },
                {
                  q: "Do you restock?",
                  a: "Rarely. When a piece sells out, it is gone for good.",
                },
              ],
            }),
            blocks.contact(
              {
                title: "Contact",
                text: "Orders, sizing or collaborations. We read everything.",
                details:
                  "support@example.com\n+351 22 555 0177\nMonday to Friday, 10am to 5pm",
              },
              { fill: "$surface" }
            ),
          ],
          "Help | Foundry",
          "Shipping, sizing and returns for Foundry orders.",
          I("p5")
        ),
      ],
    })
  },
}
