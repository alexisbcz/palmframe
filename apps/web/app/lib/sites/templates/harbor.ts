import { blocks } from "../blocks"
import { newId } from "../model"
import { eventItem, img, page, site, to } from "./kit"
import type { Template } from "./types"

const I = img("harbor")

export const harbor: Template = {
  id: "harbor",
  name: "Harbor",
  category: "Community",
  blurb:
    "A community centre or non-profit with events, impact numbers and a donate page.",
  apps: ["events"],
  make: () => {
    const home = newId()
    const whatson = newId()
    const involved = newId()
    const donate = newId()
    const contact = newId()
    const hero = blocks.heroCard({
      kicker: "Community centre and charity",
      title: "A place for everyone on the street",
      text: "Meals, classes and company, every day of the week. All of it free or pay what you can.",
      cta: "See what's on",
      ctaLink: to(whatson),
      image: I("hero"),
    })
    return site({
      name: "Harbor House",
      description:
        "A neighbourhood community centre running meals, classes, a garden and a food bank.",
      currency: "USD",
      shareImage: I("hero"),
      events: [
        eventItem(
          "Community lunch",
          "2027-03-06T12:00:00",
          "Main hall",
          "A hot meal and good company every Saturday. Everyone is welcome, and nobody asks questions.",
          I("hero"),
          80
        ),
        eventItem(
          "Spring planting day",
          "2027-04-17T10:00:00",
          "The garden",
          "Bring gloves and a friend. We will have tea, seedlings and tools for every size of hand.",
          I("garden"),
          60
        ),
        eventItem(
          "Kids' art club",
          "2027-03-13T15:30:00",
          "Studio room",
          "Paint, clay and collage for ages 6 to 11. Materials are provided.",
          I("kids"),
          20
        ),
        eventItem(
          "Winter coat drive",
          "2027-11-20T10:00:00",
          "Front hall",
          "Drop off a clean coat or pick one up. No forms, no questions.",
          I("food"),
          120
        ),
      ],
      theme: {
        palette: {
          bg: "#fbf7ef",
          surface: "#f0e8d6",
          text: "#1e2a32",
          muted: "#58636b",
          accent: "#17626b",
          accentText: "#fbf7ef",
          line: "#e2d8c1",
        },
        heading: "Libre Baskerville",
        body: "DM Sans",
        radius: 12,
      },
      header: blocks.header("Harbor House", {
        label: "Donate",
        link: to(donate),
      }),
      footer: blocks.footer(
        "Harbor House",
        "A registered charity. 40 Quay Street, open every day. hello@example.com",
        [
          { kind: "facebook", url: "https://example.com/harborhouse" },
          { kind: "instagram", url: "https://example.com/harborhouse" },
        ]
      ),
      pages: [
        page(
          home,
          "Home",
          "",
          [
            hero,
            blocks.stats([
              { value: "42,000", label: "meals served last year" },
              { value: "310", label: "volunteers" },
              { value: "28", label: "weekly activities" },
            ]),
            blocks.events({ title: "Coming up", limit: 3 }),
            blocks.story(
              {
                kicker: "Who we are",
                title: "Opened in 1987, still run by neighbours",
                text: "Harbor House started in a church basement with one kettle. Today it is a bright hall, a garden and a food bank, kept going by people from the street who give an hour when they can.",
                image: I("hall"),
                cta: "Get involved",
                ctaLink: to(involved),
                flip: true,
              },
              { fill: "$surface" }
            ),
            blocks.newsletter({
              title: "What's on this month",
              text: "A short monthly note with events, volunteer calls and stories from the hall.",
            }),
            blocks.cta({
              title: "Help keep the kettle on",
              text: "A gift of $15 a month feeds a family every week.",
              cta: "Donate",
              ctaLink: to(donate),
            }),
          ],
          "Harbor House | Community centre and charity",
          "Harbor House is a neighbourhood community centre running meals, classes, a garden and a food bank.",
          I("hero")
        ),
        page(
          whatson,
          "What's on",
          "whats-on",
          [
            blocks.events({ title: "What's on", limit: 4 }),
            blocks.gallery(
              {
                images: [
                  { src: I("garden"), alt: "Volunteers in the garden" },
                  { src: I("kids"), alt: "Children painting" },
                  { src: I("food"), alt: "Fresh produce for the food bank" },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "What's on | Harbor House",
          "Community lunches, classes, planting days and drives at Harbor House.",
          I("garden")
        ),
        page(
          involved,
          "Get involved",
          "get-involved",
          [
            blocks.features({
              title: "Three ways to help",
              items: [
                {
                  title: "Volunteer",
                  text: "Give two hours a week or one Saturday a month. We will train you and feed you.",
                },
                {
                  title: "Give things",
                  text: "Clean coats, tinned food, school supplies. Drop them at the front desk any day.",
                },
                {
                  title: "Share a skill",
                  text: "Teach a class, fix a bike or help with CVs. If you know it, someone here needs it.",
                },
              ],
            }),
            blocks.testimonials(
              [
                {
                  text: "I came for the Saturday lunch. Now I run the kitchen on Thursdays.",
                  author: "Aurelia, volunteer",
                },
                {
                  text: "My son's confidence has grown since art club. We will not miss a week.",
                  author: "Tariq, parent",
                },
                {
                  text: "They helped us find a flat in a week. I still cannot believe it.",
                  author: "Joan, neighbour",
                },
              ],
              { fill: "$bg", title: "From the hall" }
            ),
          ],
          "Get involved | Harbor House",
          "Volunteer, donate goods or share a skill with Harbor House.",
          I("hall")
        ),
        page(
          donate,
          "Donate",
          "donate",
          [
            blocks.pricing({
              title: "Give what you can",
              text: "Every gift stays in the neighbourhood. We are a registered charity.",
              tiers: [
                {
                  name: "Friend",
                  price: "$15",
                  note: "per month",
                  features: [
                    "Feeds a family for a week",
                    "Our monthly newsletter",
                  ],
                  cta: "Give monthly",
                  link: to(contact),
                },
                {
                  name: "Neighbour",
                  price: "$40",
                  note: "per month",
                  features: [
                    "Stocks the food bank shelves",
                    "Name on our supporters wall",
                    "Invitation to the summer lunch",
                  ],
                  cta: "Give monthly",
                  link: to(contact),
                  featured: true,
                },
                {
                  name: "One gift",
                  price: "$100",
                  note: "once",
                  features: [
                    "Buys ingredients for a Saturday lunch",
                    "A thank you card from the kids",
                  ],
                  cta: "Give once",
                  link: to(contact),
                },
              ],
            }),
            blocks.cta(
              {
                title: "Prefer to give in person?",
                text: "Pop in any day. The kettle is on.",
                cta: "Find us",
                ctaLink: to(contact),
              },
              { fill: "$surface", color: "$text" }
            ),
          ],
          "Donate | Harbor House",
          "Support Harbor House with a monthly or one-off gift. Every dollar stays in the neighbourhood.",
          I("food")
        ),
        page(
          contact,
          "Contact",
          "contact",
          [
            blocks.contact({
              title: "Come in",
              text: "Questions, referrals, or a room to hire? Write to us or just drop by.",
              details:
                "40 Quay Street\nOpen every day, 9am to 8pm\nhello@example.com\n+1 555 0164",
              map: "40 Quay Street",
            }),
          ],
          "Contact | Harbor House",
          "Find Harbor House at 40 Quay Street or send us a message.",
          I("hall")
        ),
      ],
    })
  },
}
