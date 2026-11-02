import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, service, site, to } from "./kit"
import type { Template } from "./types"

const I = img("juniper")

export const juniper: Template = {
  id: "juniper",
  name: "Juniper",
  category: "Beauty & wellness",
  blurb:
    "A friendly dental and health clinic with services, booking, reviews and FAQ.",
  apps: ["bookings"],
  make: () => {
    const home = newId()
    const care = newId()
    const book = newId()
    const contact = newId()
    return site({
      name: "Juniper Dental",
      description:
        "A friendly family dental clinic with same week appointments and clear prices.",
      currency: "USD",
      hours: { days: [1, 2, 3, 4, 5], from: "08:30", to: "17:00", horizon: 60 },
      shareImage: I("hero"),
      services: [
        service(
          "Check-up and clean",
          "An exam, scale and polish, with advice on home care.",
          45,
          95
        ),
        service(
          "Children's check-up",
          "A gentle first visit for ages 2 to 12. Parents stay in the room.",
          30,
          65
        ),
        service(
          "Emergency appointment",
          "Pain, a chipped tooth or a lost filling. We keep slots free each day.",
          30,
          120
        ),
        service(
          "Teeth whitening",
          "Professional whitening in one visit, with a take-home kit.",
          75,
          320
        ),
        service(
          "Hygienist visit",
          "A deeper clean for gum health, with a plan to keep it up.",
          45,
          110
        ),
      ],
      theme: {
        palette: {
          bg: "#f6faf8",
          surface: "#e4f0eb",
          text: "#12302a",
          muted: "#4d645d",
          accent: "#1d7560",
          accentText: "#f6faf8",
          line: "#d1e2db",
        },
        heading: "Manrope",
        body: "Inter",
        radius: 24,
      },
      header: blocks.header("Juniper Dental", {
        label: "Book a visit",
        link: to(book),
      }),
      footer: blocks.footer(
        "Juniper Dental",
        "6 Orchard Row. Monday to Friday, 8:30am to 5pm. hello@example.com",
        [{ kind: "facebook", url: "https://example.com/juniperdental" }]
      ),
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.heroCard({
              kicker: "Family dental clinic",
              title: "Dentistry without the dread",
              text: "Gentle care, clear prices and appointments this week, not next month.",
              cta: "Book a visit",
              ctaLink: to(book),
              image: I("hero"),
            }),
            blocks.features({
              title: "What to expect",
              items: [
                {
                  title: "No judgement",
                  text: "Not been in years? Neither of us will mention it. We start where you are.",
                },
                {
                  title: "Prices up front",
                  text: "You get a written quote before any treatment, and nothing starts without a yes.",
                },
                {
                  title: "Seen this week",
                  text: "We keep daily slots free for pain and emergencies. Call before 10am.",
                },
              ],
            }),
            blocks.testimonials(
              [
                {
                  text: "I have been terrified of dentists for twenty years. Dr Okoro made it feel ordinary.",
                  author: "Alan P., patient",
                },
                {
                  text: "Our twins went in for their first check-up and asked when they could go back.",
                  author: "Helen & Raj, parents",
                },
                {
                  text: "They explained every step and the price. No surprises at the desk.",
                  author: "Mina S., patient",
                },
              ],
              { fill: "$surface", title: "Patients say" }
            ),
            blocks.faq({
              title: "Common questions",
              items: [
                {
                  q: "Do you accept new patients?",
                  a: "Yes. Book a check-up online or call us on 555 0119 and we will find a time.",
                },
                {
                  q: "What if I am in pain?",
                  a: "Call us first thing. We keep emergency slots free every weekday.",
                },
                {
                  q: "Do you treat children?",
                  a: "From age two. Children's check-ups are shorter and gentler, with a sticker.",
                },
                {
                  q: "Can I pay in instalments?",
                  a: "Yes, for larger treatments. Ask at reception and we will explain the options.",
                },
              ],
            }),
            blocks.cta({
              title: "Book your next check-up",
              text: "It takes under a minute.",
              cta: "Book online",
              ctaLink: to(book),
            }),
          ],
          "Juniper Dental | Family dental clinic",
          "A friendly family dental clinic with same week appointments, clear prices and gentle care.",
          I("hero")
        ),
        page(
          care,
          "Treatments",
          "treatments",
          [
            blocks.story({
              kicker: "Check-ups",
              title: "Prevention is cheaper",
              text: "Most dental problems are easier and cheaper if caught early. A twice-yearly check-up and clean keeps small issues small, and we will tell you honestly when something can wait.",
              image: I("care"),
            }),
            blocks.priceList(
              {
                title: "Prices",
                groups: [
                  {
                    name: "Routine",
                    items: [
                      {
                        name: "Check-up and clean",
                        text: "Exam, scale and polish.",
                        price: "$95",
                      },
                      {
                        name: "Hygienist visit",
                        text: "Deep clean and gum care plan.",
                        price: "$110",
                      },
                      {
                        name: "X-rays",
                        text: "Two bitewing images.",
                        price: "$40",
                      },
                    ],
                  },
                  {
                    name: "Treatment",
                    items: [
                      {
                        name: "White filling",
                        text: "Tooth-coloured, per tooth.",
                        price: "from $140",
                      },
                      {
                        name: "Emergency visit",
                        text: "Pain relief and a plan.",
                        price: "$120",
                      },
                      {
                        name: "Teeth whitening",
                        text: "One visit and a take-home kit.",
                        price: "$320",
                      },
                    ],
                  },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "Treatments and prices | Juniper Dental",
          "Check-ups, hygienist visits, fillings, emergencies and whitening, with clear prices.",
          I("tools")
        ),
        page(
          book,
          "Book",
          "book",
          [
            blocks.booking({
              title: "Book a visit",
              text: "Choose a treatment and a time that suits you. We confirm by email and text the day before.",
              heading: "Choose a time",
            }),
          ],
          "Book online | Juniper Dental",
          "Book a check-up, hygienist visit, emergency appointment or whitening online.",
          I("reception")
        ),
        page(
          contact,
          "Contact",
          "contact",
          [
            blocks.contact({
              title: "Find the clinic",
              text: "Questions before your first visit? Write or call and we will help.",
              details:
                "6 Orchard Row\nMonday to Friday, 8:30am to 5pm\nhello@example.com\n+1 555 0119",
              map: "6 Orchard Row",
            }),
          ],
          "Contact | Juniper Dental",
          "Find Juniper Dental at 6 Orchard Row or send us a message.",
          I("smile")
        ),
      ],
    })
  },
}
