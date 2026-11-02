import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, post, product, site, to } from "./kit"
import type { Template } from "./types"

const I = img("kiln")

export const kiln: Template = {
  id: "kiln",
  name: "Kiln",
  category: "Store",
  blurb:
    "A small ceramics shop with a product grid, a journal and a studio story.",
  apps: ["store", "blog"],
  make: () => {
    const home = newId()
    const shop = newId()
    const journal = newId()
    const about = newId()
    return site({
      name: "Kiln & Clay",
      description:
        "Handmade stoneware mugs, bowls and vases, thrown and glazed in a small studio.",
      currency: "EUR",
      orderNote:
        "Each piece is made to order and ships within two weeks, wrapped in recycled paper.",
      shareImage: I("hero"),
      theme: {
        palette: {
          bg: "#f6f1e9",
          surface: "#ebe3d6",
          text: "#2b2622",
          muted: "#6f655b",
          accent: "#a24b2a",
          accentText: "#fffaf3",
          line: "#d9cfbf",
        },
        heading: "Fraunces",
        body: "Manrope",
        radius: 14,
      },
      header: blocks.header("Kiln & Clay", { label: "Shop", link: to(shop) }),
      footer: blocks.footer(
        "Kiln & Clay",
        "Thrown by hand in Lisbon. Studio visits by appointment. hello@example.com",
        [{ kind: "instagram", url: "https://example.com/kilnandclay" }]
      ),
      products: [
        product(
          "Everyday mug",
          28,
          "A 300ml mug with a thick thumb handle. Speckled oat glaze, dishwasher safe.",
          [I("p1")]
        ),
        product(
          "Shallow bowl",
          42,
          "Wide and low, for noodles, fruit or keys by the door. About 22cm across.",
          [I("p2")]
        ),
        product(
          "Bud vase",
          36,
          "A tall, narrow vase in dark brown glaze. Holds a single stem very well.",
          [I("p3")]
        ),
        product(
          "Side plates, set of three",
          54,
          "Small plates for toast and cake. Each set is glazed together, so they match.",
          [I("p4")]
        ),
        product(
          "Teapot",
          78,
          "A 700ml pot with a cane handle and a sage glaze. Pours cleanly, drips never.",
          [I("p5")]
        ),
        product(
          "Espresso cups, pair",
          40,
          "Two little cups with a rust-coloured rim and a thick base that stays warm.",
          [I("p6")]
        ),
      ],
      posts: [
        post(
          "How a mug gets made",
          "Seventeen steps between a lump of clay and your morning coffee.",
          "A mug looks simple, which is why it takes so long to get right.\n\n## Wedging and throwing\n\nThe clay is wedged first, like kneading bread, to push the air out. Then it is thrown on the wheel, about 400 grams for a mug, and pulled up into a cylinder.\n\n## The handle\n\nHandles are pulled separately and left to stiffen for an afternoon. Attach them too soon and they sag. Too late and they crack. Most of what I know about patience came from handles.\n\n## Two firings\n\nA first firing at 980 degrees makes the clay tough enough to glaze. The second goes to 1240 and turns the glaze into glass. When the kiln is opened two days later, every piece is a small surprise.",
          I("hands"),
          "Inês Duarte",
          "2026-09-12"
        ),
        post(
          "Why the glazes are all oat and rust",
          "Fewer colours, better pots. A note on keeping the shelf calm.",
          "Customers sometimes ask for a brighter palette. I understand, but I keep to four glazes.\n\n## A short list\n\nWith fewer glazes I can test each one properly. Thickness, firing temperature, what it does on a rim. A glaze I have used two hundred times behaves like an old friend.\n\n## Things that go together\n\nA mug, a bowl and a plate in the same glaze look like a family even when the shapes differ. That is the whole idea of the shop.",
          I("studio"),
          "Inês Duarte",
          "2026-07-03"
        ),
        post(
          "Caring for handmade ceramics",
          "Dishwashers, microwaves and what to do about a chip.",
          "Everything we make is food safe and fired hot enough to be tough.\n\n## Washing\n\nDishwashers are fine. Hand washing is kinder to glazes over many years, but nobody has time for that. Skip the abrasive pads.\n\n## Heat\n\nMugs and bowls go in the microwave and the oven up to 220 degrees. Do not move a hot dish onto a cold wet surface.\n\n## When it chips\n\nSmall chips on a rim can be sanded smooth. If you break something, write to us. We often have a near twin on the shelf.",
          I("p4"),
          "Inês Duarte",
          "2026-04-21"
        ),
      ],
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.heroCard({
              kicker: "Handmade stoneware",
              title: "Pots for slow mornings",
              text: "Mugs, bowls and vases thrown by hand in a small Lisbon studio.",
              cta: "Shop the collection",
              ctaLink: to(shop),
              image: I("hero"),
            }),
            blocks.shop(
              { title: "New on the shelf", limit: 3, columns: 3 },
              { fill: "$bg" }
            ),
            blocks.story(
              {
                kicker: "The studio",
                title: "One potter, one wheel",
                text: "I am Inês, and I make everything you see here. Each piece is thrown, trimmed, glazed and fired in the studio behind the shop, so no two are exactly alike. Small differences are what hand made means.",
                image: I("hands"),
                cta: "Read our story",
                ctaLink: to(about),
                flip: true,
              },
              { fill: "$surface" }
            ),
            blocks.blog({ title: "From the journal", limit: 3 }),
            blocks.newsletter(
              {
                title: "First to the new batch",
                text: "A short email when a kiln load comes out. Never more than twice a month.",
              },
              { fill: "$surface" }
            ),
          ],
          "Kiln & Clay | Handmade ceramics",
          "Handmade stoneware mugs, bowls and vases from a small Lisbon studio.",
          I("hero")
        ),
        page(
          shop,
          "Shop",
          "shop",
          [
            blocks.shop({ title: "The shop", limit: 6, columns: 3 }),
            blocks.faq(
              {
                title: "Shipping and care",
                items: [
                  {
                    q: "How long does an order take?",
                    a: "Pieces are made in small batches and ship within two weeks.",
                  },
                  {
                    q: "Do you ship abroad?",
                    a: "Yes, across Europe and to the UK, packed in recycled paper and card.",
                  },
                  {
                    q: "Can I return something?",
                    a: "Within 30 days, unused and in its box. We refund the price of the piece.",
                  },
                  {
                    q: "Is it dishwasher safe?",
                    a: "Everything is, though hand washing keeps glazes looking new for longer.",
                  },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "Shop | Kiln & Clay",
          "Browse handmade mugs, bowls, plates, teapots and vases, all thrown in Lisbon.",
          I("p1")
        ),
        page(
          journal,
          "Journal",
          "journal",
          [blocks.blog({ title: "Journal", limit: 3 })],
          "Journal | Kiln & Clay",
          "Notes from the studio on making, glazing and looking after handmade pots.",
          I("studio")
        ),
        page(
          about,
          "About",
          "about",
          [
            blocks.story({
              kicker: "About",
              title: "Made where you can see it",
              text: "The shop sits at the front of a former bakery. The wheel is at the back, and the kiln hums in the yard. If you are in Lisbon, ring and come to see a firing open.",
              image: I("studio"),
            }),
            blocks.contact(
              {
                title: "Say hello",
                text: "Commissions, wholesale or a visit to the studio. I read every message.",
                details:
                  "Rua das Flores 21, Lisbon\nhello@example.com\n+351 21 555 0192",
                map: "Rua das Flores, Lisbon",
              },
              { fill: "$surface" }
            ),
          ],
          "About | Kiln & Clay",
          "Meet the potter behind Kiln & Clay and find the studio in Lisbon.",
          I("hands")
        ),
      ],
    })
  },
}
