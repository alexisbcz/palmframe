import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, service, site, to } from "./kit"
import type { Template } from "./types"

const I = img("rosewater")

export const rosewater: Template = {
  id: "rosewater",
  name: "Rosewater",
  category: "Food",
  blurb:
    "A candlelit wine bar and kitchen with a menu, table booking and a gallery.",
  apps: ["bookings"],
  make: () => {
    const home = newId()
    const menu = newId()
    const book = newId()
    const visit = newId()
    const hero = blocks.heroFull({
      kicker: "Wine bar and kitchen",
      title: "Dinner, slowly.",
      text: "Small plates, natural wine and a corner table with your name on it.",
      cta: "Book a table",
      ctaLink: to(book),
      image: I("hero"),
    })
    if (hero.fill.kind === "image") hero.fill.overlay = 0.55
    return site({
      name: "Rosewater",
      description:
        "A neighbourhood wine bar and kitchen. Small plates, natural wine, open Tuesday to Saturday.",
      currency: "GBP",
      hours: { days: [2, 3, 4, 5, 6], from: "17:00", to: "22:00", horizon: 60 },
      shareImage: I("hero"),
      theme: {
        palette: {
          bg: "#1e1411",
          surface: "#2a1c18",
          text: "#f4e9df",
          muted: "#b9a79a",
          accent: "#d9825b",
          accentText: "#1e1411",
          line: "#3d2b25",
        },
        heading: "Cormorant Garamond",
        body: "DM Sans",
        radius: 2,
      },
      header: blocks.header("Rosewater", {
        label: "Book a table",
        link: to(book),
      }),
      footer: blocks.footer(
        "Rosewater",
        "14 Alder Lane. Tuesday to Saturday, from five. 020 7946 0555",
        [
          { kind: "instagram", url: "https://example.com/rosewater" },
          { kind: "facebook", url: "https://example.com/rosewater" },
        ]
      ),
      services: [
        service(
          "Table for two",
          "Our usual dining room, two to a table. Walk-ins are welcome at the bar.",
          90,
          0
        ),
        service(
          "Table for four",
          "A round table by the window. Good for sharing everything.",
          120,
          0
        ),
        service(
          "The counter, set menu",
          "Six courses at the kitchen counter, with a glass of something with each.",
          150,
          68
        ),
        service(
          "Back room, up to ten",
          "A private room with its own door. We will plan the menu with you.",
          180,
          0
        ),
      ],
      pages: [
        page(
          home,
          "Home",
          "",
          [
            hero,
            blocks.story({
              kicker: "Our kitchen",
              title: "Cooked in the next room",
              text: "Rosewater started as four tables and a wood oven. We still buy from the same three farms, keep the list short and change it when the fish does. The wine is mostly small growers who farm without sprays.",
              image: I("dish1"),
              cta: "See the menu",
              ctaLink: to(menu),
            }),
            blocks.gallery(
              {
                images: [
                  { src: I("dining"), alt: "A long table set for dinner" },
                  { src: I("pour"), alt: "Red wine being poured" },
                  { src: I("dish2"), alt: "Handmade tagliatelle with sage" },
                  { src: I("bar"), alt: "The bar with rows of glasses" },
                  { src: I("dessert"), alt: "Burnt cheesecake with figs" },
                  { src: I("hero"), alt: "The dining room at dusk" },
                ],
              },
              { fill: "$surface" }
            ),
            blocks.quote({
              text: "The kind of place you plan to pop into for one glass and leave three hours later, happy.",
              author: "A regular, Thursday table",
            }),
            blocks.cta(
              {
                title: "Save us a corner table",
                text: "We take bookings up to two months ahead.",
                cta: "Book a table",
                ctaLink: to(book),
              },
              { fill: "$accent" }
            ),
          ],
          "Rosewater | Wine bar and kitchen",
          "A neighbourhood wine bar and kitchen serving small plates and natural wine, Tuesday to Saturday.",
          I("hero")
        ),
        page(
          menu,
          "Menu",
          "menu",
          [
            blocks.priceList({
              title: "This week's menu",
              groups: [
                {
                  name: "To start",
                  items: [
                    {
                      name: "Marinated olives",
                      text: "Orange peel, thyme, warm bread.",
                      price: "£5",
                    },
                    {
                      name: "Roast bone marrow",
                      text: "Pickled shallot, parsley, toast.",
                      price: "£11",
                    },
                    {
                      name: "Burrata",
                      text: "Blistered tomatoes, basil oil.",
                      price: "£10",
                    },
                  ],
                },
                {
                  name: "From the kitchen",
                  items: [
                    {
                      name: "Tagliatelle",
                      text: "Brown butter, sage, aged parmesan.",
                      price: "£16",
                    },
                    {
                      name: "Hake",
                      text: "White beans, chorizo, charred leeks.",
                      price: "£24",
                    },
                    {
                      name: "Lamb shoulder",
                      text: "Slow cooked, to share. Salsa verde.",
                      price: "£38",
                    },
                  ],
                },
                {
                  name: "Something sweet",
                  items: [
                    {
                      name: "Burnt cheesecake",
                      text: "Poached figs, honey.",
                      price: "£9",
                    },
                    {
                      name: "Chocolate pot",
                      text: "Olive oil, sea salt.",
                      price: "£8",
                    },
                    {
                      name: "Cheese plate",
                      text: "Three cheeses, quince, crackers.",
                      price: "£12",
                    },
                  ],
                },
                {
                  name: "By the glass",
                  items: [
                    {
                      name: "Orange wine",
                      text: "Skin contact, dry, a little wild.",
                      price: "£9",
                    },
                    {
                      name: "Light red",
                      text: "Gamay from a small grower.",
                      price: "£8",
                    },
                    {
                      name: "Sparkling",
                      text: "Pet nat, cloudy and bright.",
                      price: "£10",
                    },
                  ],
                },
              ],
            }),
            blocks.cta(
              {
                title: "Hungry yet?",
                text: "Tables are small. Book ahead for Friday and Saturday.",
                cta: "Book a table",
                ctaLink: to(book),
              },
              { fill: "$surface", color: "$text" }
            ),
          ],
          "Menu | Rosewater",
          "The current menu at Rosewater: small plates, mains to share, desserts and wine by the glass.",
          I("dish1")
        ),
        page(
          book,
          "Book",
          "book",
          [
            blocks.booking(
              {
                title: "Book a table",
                text: "Choose a table size and a time. We confirm by email within the hour. For groups over ten, write to us.",
                heading: "Pick a time",
              },
              { fill: "$surface" }
            ),
            blocks.faq({
              title: "Good to know",
              items: [
                {
                  q: "Do you take walk-ins?",
                  a: "Always. The bar and two tables are kept for people who just turn up.",
                },
                {
                  q: "Can you cater for allergies?",
                  a: "Yes. Tell us when you book and the kitchen will plan around it.",
                },
                {
                  q: "Are dogs welcome?",
                  a: "Small, calm ones are welcome at the bar. We keep water bowls by the door.",
                },
                {
                  q: "How long do we have the table?",
                  a: "Two hours at busy times, as long as you like on quiet weeknights.",
                },
              ],
            }),
          ],
          "Book a table | Rosewater",
          "Reserve a table at Rosewater. Tables for two and four, a chef's counter and a private back room.",
          I("dining")
        ),
        page(
          visit,
          "Visit",
          "visit",
          [
            blocks.contact({
              title: "Come and find us",
              text: "Questions, parties or a table that is not showing online? Write and we will sort it.",
              details:
                "14 Alder Lane\nTuesday to Saturday, 5pm to 10pm\nhello@example.com\n020 7946 0555",
              map: "14 Alder Lane",
              success: "Thank you. We will reply by the end of the day.",
            }),
          ],
          "Visit | Rosewater",
          "Find Rosewater at 14 Alder Lane. Open Tuesday to Saturday from five in the evening.",
          I("bar")
        ),
      ],
    })
  },
}
