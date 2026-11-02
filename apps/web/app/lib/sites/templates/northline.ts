import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, site, to } from "./kit"
import type { Template } from "./types"

const I = img("northline")

export const northline: Template = {
  id: "northline",
  name: "Northline",
  category: "Business",
  blurb:
    "A calm consultancy site with services, proof, pricing and a contact form.",
  apps: [],
  make: () => {
    const home = newId()
    const services = newId()
    const about = newId()
    const contact = newId()
    return site({
      name: "Northline",
      description:
        "Operations advisory for founder-led companies: pricing, hiring and cash flow.",
      currency: "USD",
      shareImage: I("hero"),
      theme: {
        palette: {
          bg: "#f3f1ec",
          surface: "#e7e4dc",
          text: "#15181d",
          muted: "#5d6168",
          accent: "#1f4d3a",
          accentText: "#f7f5ef",
          line: "#d6d2c8",
        },
        heading: "Instrument Serif",
        body: "Inter",
        radius: 6,
      },
      header: blocks.header("Northline", {
        label: "Talk to us",
        link: to(contact),
      }),
      footer: blocks.footer(
        "Northline",
        "Operations advisory for companies that grew faster than their systems. hello@example.com",
        [{ kind: "linkedin", url: "https://example.com/northline" }]
      ),
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.heroSplit({
              kicker: "Operations advisory",
              title: "Growth, minus the chaos",
              text: "We help founder-led companies fix pricing, hiring and cash flow, then step back.",
              cta: "Book an intro call",
              ctaLink: to(contact),
              second: "Our services",
              secondLink: to(services),
              image: I("hero"),
              alt: "Colleagues at a whiteboard",
            }),
            blocks.stats(
              [
                { value: "140+", label: "companies advised" },
                { value: "11", label: "years in business" },
                { value: "3.2x", label: "median profit growth" },
                { value: "92%", label: "hire us for a second project" },
              ],
              { fill: "$text", color: "$bg" }
            ),
            blocks.features(
              {
                title: "How we work",
                items: [
                  {
                    title: "Diagnose",
                    text: "Two weeks inside your numbers, with the people who actually run them.",
                    image: I("table"),
                  },
                  {
                    title: "Fix",
                    text: "A short list of changes, ranked by money saved or earned, and who owns each.",
                    image: I("work"),
                  },
                  {
                    title: "Hand over",
                    text: "We train your team to run it, then leave. No lock-in, no endless retainer.",
                    image: I("team"),
                  },
                ],
              },
              { fill: "$bg" }
            ),
            blocks.testimonials(
              [
                {
                  text: "They found 14 percent of margin we were giving away in discounts. Paid for itself in a month.",
                  author: "Dana R., founder, packaging supplier",
                },
                {
                  text: "Straight talk, no slides for the sake of slides. Our hiring plan finally matches our cash.",
                  author: "Tomas K., CEO, logistics firm",
                },
                {
                  text: "They left us with a team that could do it alone. That is rare in consulting.",
                  author: "Priya N., COO, software studio",
                },
              ],
              { title: "Clients, in their words" }
            ),
            blocks.cta({
              title: "Tell us what is stuck",
              text: "A 30 minute call, free, with someone who has seen it before.",
              cta: "Book a call",
              ctaLink: to(contact),
            }),
          ],
          "Northline | Operations advisory",
          "Northline helps founder-led companies fix pricing, hiring and cash flow, then hands the work back to the team.",
          I("hero")
        ),
        page(
          services,
          "Services",
          "services",
          [
            blocks.intro({
              kicker: "Services",
              title: "Three ways to work with us",
              text: "Start with a diagnostic. Most clients go on to a project, and a few keep us close for a year.",
            }),
            blocks.pricing(
              {
                title: "Fixed fees, no surprises",
                text: "Every engagement has a written scope and a price before we start.",
                tiers: [
                  {
                    name: "Diagnostic",
                    price: "$4,500",
                    note: "one time, two weeks",
                    features: [
                      "Interviews with your leads",
                      "Review of three years of numbers",
                      "Ranked list of fixes",
                      "Readout with your team",
                    ],
                    cta: "Start here",
                    link: to(contact),
                  },
                  {
                    name: "Project",
                    price: "$9,000",
                    note: "per month, 3 months",
                    features: [
                      "Everything in Diagnostic",
                      "Weekly working sessions",
                      "Pricing and hiring plans built with you",
                      "Tools and templates handed over",
                    ],
                    cta: "Talk to us",
                    link: to(contact),
                    featured: true,
                  },
                  {
                    name: "Embedded",
                    price: "$18,000",
                    note: "per month, 6 months",
                    features: [
                      "A senior advisor two days a week",
                      "Board and investor updates",
                      "Interim operations lead",
                      "Priority access",
                    ],
                    cta: "Talk to us",
                    link: to(contact),
                  },
                ],
              },
              { fill: "$surface" }
            ),
            blocks.faq({
              title: "Questions",
              items: [
                {
                  q: "Who is this for?",
                  a: "Companies with 15 to 200 people, run by the people who started them.",
                },
                {
                  q: "Do you work remotely?",
                  a: "Mostly. We visit in the first and last weeks and whenever it helps.",
                },
                {
                  q: "What if we need less?",
                  a: "Say so. A single workshop is often enough to unblock a team.",
                },
                {
                  q: "Can we see a sample report?",
                  a: "Yes. Ask on the call and we will send an anonymised one.",
                },
              ],
            }),
          ],
          "Services | Northline",
          "Fixed-fee advisory: a two week diagnostic, a three month project or a six month embedded advisor.",
          I("table")
        ),
        page(
          about,
          "About",
          "about",
          [
            blocks.story({
              kicker: "About",
              title: "Built by operators",
              text: "Northline was started by three people who ran companies before they advised them. We have hired the wrong person, priced too low and nearly run out of cash. That is why the advice is practical.",
              image: I("city"),
            }),
            blocks.quote({
              text: "Most companies do not need more strategy. They need the three things already decided to actually happen.",
              author: "Marta Lindqvist, founding partner",
            }),
          ],
          "About | Northline",
          "Northline was founded by operators who have run, grown and rescued companies of their own.",
          I("city")
        ),
        page(
          contact,
          "Contact",
          "contact",
          [
            blocks.contact({
              title: "Let's talk",
              text: "Tell us a little about the company and what is stuck. A partner replies within one working day.",
              details:
                "hello@example.com\n+1 555 0148\nWeekdays, 9am to 6pm Eastern",
              map: "Chicago, Illinois",
              submit: "Send",
              success: "Thank you. A partner will write to you tomorrow.",
            }),
          ],
          "Contact | Northline",
          "Book an introduction call with Northline. A partner replies within one working day.",
          I("team")
        ),
      ],
    })
  },
}
