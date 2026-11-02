import { blocks } from "../blocks"
import { newId } from "../model"
import { eventItem, img, page, site, to } from "./kit"
import type { Template } from "./types"

const I = img("meridian")

export const meridian: Template = {
  id: "meridian",
  name: "Meridian",
  category: "Events",
  blurb:
    "A two day design conference with a countdown, programme, tickets and FAQ.",
  apps: ["events"],
  make: () => {
    const home = newId()
    const programme = newId()
    const tickets = newId()
    const info = newId()
    const hero = blocks.heroFull({
      kicker: "Lisbon, 14 and 15 May 2027",
      title: "Meridian 2027",
      text: "Two days of talks, workshops and long lunches for people who make things.",
      cta: "Get tickets",
      ctaLink: to(tickets),
      image: I("hero"),
    })
    if (hero.fill.kind === "image") hero.fill.overlay = 0.5
    return site({
      name: "Meridian",
      description:
        "A two day conference for designers and makers in Lisbon, 14 and 15 May 2027.",
      currency: "EUR",
      shareImage: I("hero"),
      events: [
        eventItem(
          "Opening keynote",
          "2027-05-14T09:30:00",
          "Main hall",
          "The case for slower, more careful design, with a morning of short talks to follow.",
          I("stage"),
          600
        ),
        eventItem(
          "Workshop day: paper prototyping",
          "2027-05-14T14:00:00",
          "Studio 2",
          "Three hours, one problem, a table of paper and tape. Limited to 40 seats.",
          I("talk"),
          40
        ),
        eventItem(
          "Rooftop sunset session",
          "2027-05-14T19:00:00",
          "The terrace",
          "Music, drinks and four lightning talks as the sun goes down over the river.",
          I("crowd"),
          300
        ),
        eventItem(
          "Closing night",
          "2027-05-15T20:00:00",
          "The warehouse",
          "A live set, street food and the awards for the best student projects.",
          I("night"),
          500
        ),
      ],
      theme: {
        palette: {
          bg: "#0b1220",
          surface: "#131d31",
          text: "#eaf0fb",
          muted: "#93a1bb",
          accent: "#ffb23e",
          accentText: "#0b1220",
          line: "#243350",
        },
        heading: "Bebas Neue",
        body: "Space Grotesk",
        radius: 2,
      },
      header: blocks.header("MERIDIAN", {
        label: "Tickets",
        link: to(tickets),
      }),
      footer: blocks.footer(
        "Meridian",
        "A conference for people who make things. Lisbon, 14 and 15 May 2027. hello@example.com",
        [
          { kind: "instagram", url: "https://example.com/meridian" },
          { kind: "x", url: "https://example.com/meridian" },
        ]
      ),
      pages: [
        page(
          home,
          "Home",
          "",
          [
            hero,
            blocks.countdown({
              title: "The doors open in",
              to: "2027-05-14T09:00:00",
              done: "Welcome to Meridian.",
            }),
            blocks.events(
              { title: "On the programme", limit: 3 },
              { fill: "$bg" }
            ),
            blocks.stats(
              [
                { value: "40", label: "speakers" },
                { value: "1,200", label: "attendees" },
                { value: "2", label: "days" },
                { value: "12", label: "workshops" },
              ],
              { fill: "$accent" }
            ),
            blocks.pricing(
              {
                title: "Tickets",
                text: "Early bird prices end on 31 January 2027.",
                tiers: [
                  {
                    name: "Early bird",
                    price: "€189",
                    note: "both days",
                    features: [
                      "Both conference days",
                      "Lunch and coffee",
                      "Rooftop session",
                    ],
                    cta: "Buy ticket",
                    link: to(tickets),
                  },
                  {
                    name: "Standard",
                    price: "€289",
                    note: "both days",
                    features: [
                      "Everything in Early bird",
                      "Workshop of your choice",
                      "Conference notebook",
                    ],
                    cta: "Buy ticket",
                    link: to(tickets),
                    featured: true,
                  },
                  {
                    name: "Studio pass",
                    price: "€549",
                    note: "for teams of 3",
                    features: [
                      "Three standard tickets",
                      "Reserved table at lunch",
                      "Invitation to speakers' dinner",
                    ],
                    cta: "Buy ticket",
                    link: to(tickets),
                  },
                ],
              },
              { fill: "$surface" }
            ),
            blocks.cta({
              title: "See you in Lisbon",
              text: "Join 1,200 makers on the river in May.",
              cta: "Get tickets",
              ctaLink: to(tickets),
            }),
          ],
          "Meridian 2027 | Design conference, Lisbon",
          "A two day conference for designers and makers in Lisbon, 14 and 15 May 2027. Talks, workshops and a rooftop session.",
          I("hero")
        ),
        page(
          programme,
          "Programme",
          "programme",
          [
            blocks.events(
              { title: "Two days, four moments", limit: 4 },
              { fill: "$bg" }
            ),
            blocks.gallery(
              {
                title: "Last year",
                images: [
                  { src: I("stage"), alt: "The main stage" },
                  {
                    src: I("crowd"),
                    alt: "The festival grounds at golden hour",
                  },
                  { src: I("talk"), alt: "A speaker on stage" },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "Programme | Meridian 2027",
          "The programme for Meridian 2027: keynotes, workshops, a rooftop session and a closing night.",
          I("stage")
        ),
        page(
          tickets,
          "Tickets",
          "tickets",
          [
            blocks.pricing({
              title: "Choose your ticket",
              text: "Tickets are transferable. Refunds up to 30 days before the event.",
              tiers: [
                {
                  name: "Early bird",
                  price: "€189",
                  note: "until 31 January",
                  features: [
                    "Both conference days",
                    "Lunch and coffee",
                    "Rooftop session",
                  ],
                  cta: "Request ticket",
                  link: to(info),
                },
                {
                  name: "Standard",
                  price: "€289",
                  note: "from 1 February",
                  features: [
                    "Everything in Early bird",
                    "Workshop of your choice",
                    "Conference notebook",
                  ],
                  cta: "Request ticket",
                  link: to(info),
                  featured: true,
                },
                {
                  name: "Studio pass",
                  price: "€549",
                  note: "for teams of 3",
                  features: [
                    "Three standard tickets",
                    "Reserved table at lunch",
                    "Invitation to speakers' dinner",
                  ],
                  cta: "Request ticket",
                  link: to(info),
                },
              ],
            }),
            blocks.faq(
              {
                title: "Questions",
                items: [
                  {
                    q: "Where is it?",
                    a: "At the old tobacco warehouse by the river, ten minutes from the airport by metro.",
                  },
                  {
                    q: "Is there a student price?",
                    a: "Yes. Write to us with your student card and we will send a code at half price.",
                  },
                  {
                    q: "Will talks be recorded?",
                    a: "Main hall talks will be online a month after. Workshops are not recorded.",
                  },
                  {
                    q: "Is the venue accessible?",
                    a: "Yes. Step free throughout, with quiet rooms and a hearing loop in the main hall.",
                  },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "Tickets | Meridian 2027",
          "Tickets for Meridian 2027: early bird, standard and team passes, with student prices on request.",
          I("crowd")
        ),
        page(
          info,
          "Contact",
          "contact",
          [
            blocks.contact({
              title: "Get in touch",
              text: "Tickets, speaking, sponsoring or access needs. The team replies within two working days.",
              details:
                "Armazem 4, Cais do Sodre, Lisbon\nhello@example.com\n+351 21 555 0110",
              map: "Cais do Sodre, Lisbon",
            }),
          ],
          "Contact | Meridian 2027",
          "Contact the Meridian team about tickets, sponsorship and access.",
          I("night")
        ),
      ],
    })
  },
}
