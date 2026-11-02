import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, site, to } from "./kit"
import type { Template } from "./types"

const I = img("tandem")

export const tandem: Template = {
  id: "tandem",
  name: "Tandem",
  category: "Business",
  blurb:
    "A SaaS landing page with a split hero, feature highlights, plans and FAQ.",
  apps: [],
  make: () => {
    const home = newId()
    const pricing = newId()
    const about = newId()
    const contact = newId()
    return site({
      name: "Tandem",
      description:
        "Tandem is shared planning for small teams: one list, one calendar, no status meetings.",
      currency: "USD",
      shareImage: I("hero"),
      theme: {
        palette: {
          bg: "#ffffff",
          surface: "#f1f4fb",
          text: "#0d1426",
          muted: "#586178",
          accent: "#2543e6",
          accentText: "#ffffff",
          line: "#e0e5f2",
        },
        heading: "Sora",
        body: "Inter",
        radius: 16,
      },
      header: blocks.header("Tandem", {
        label: "Start free",
        link: to(contact),
      }),
      footer: blocks.footer(
        "Tandem",
        "Shared planning for small teams. Built in Amsterdam. hello@example.com",
        [
          { kind: "x", url: "https://example.com/tandem" },
          { kind: "linkedin", url: "https://example.com/tandem" },
        ]
      ),
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.heroSplit({
              kicker: "Planning for small teams",
              title: "One plan the whole team trusts",
              text: "Tandem keeps tasks, dates and owners in a single view, so you can skip the status meeting.",
              cta: "Start free",
              ctaLink: to(contact),
              second: "See plans",
              secondLink: to(pricing),
              image: I("hero"),
              alt: "A laptop on a clean desk",
            }),
            blocks.features({
              title: "Built for teams of 3 to 30",
              items: [
                {
                  title: "One shared list",
                  text: "Every task has an owner and a date. Nothing hides in a thread or a DM.",
                },
                {
                  title: "Weekly view",
                  text: "See who is free, who is stretched and what is slipping before it does.",
                },
                {
                  title: "Updates write themselves",
                  text: "Tandem drafts the Friday summary from what moved. You just press send.",
                },
              ],
            }),
            blocks.testimonials(
              [
                {
                  text: "We cancelled our Monday meeting after the second week. Nobody missed it.",
                  author: "Sofia M., design studio",
                },
                {
                  text: "Simple enough that interns use it correctly on day one.",
                  author: "Karl B., agency lead",
                },
                {
                  text: "The weekly view saved us from a very bad launch week.",
                  author: "Aiko T., product manager",
                },
              ],
              { fill: "$bg", title: "Teams like it" }
            ),
            blocks.pricing(
              {
                title: "Simple plans",
                text: "Start free. Upgrade when your team grows. Cancel any time.",
                tiers: [
                  {
                    name: "Free",
                    price: "$0",
                    note: "up to 5 people",
                    features: [
                      "Unlimited tasks",
                      "Weekly view",
                      "30 days of history",
                    ],
                    cta: "Start free",
                    link: to(contact),
                  },
                  {
                    name: "Team",
                    price: "$8",
                    note: "per person per month",
                    features: [
                      "Everything in Free",
                      "Automatic Friday updates",
                      "Calendar sync",
                      "Unlimited history",
                    ],
                    cta: "Start trial",
                    link: to(contact),
                    featured: true,
                  },
                  {
                    name: "Studio",
                    price: "$16",
                    note: "per person per month",
                    features: [
                      "Everything in Team",
                      "Workload reports",
                      "Priority support",
                      "Single sign on",
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
                  q: "Can I import from another tool?",
                  a: "Yes. Paste a spreadsheet or connect a CSV export and your tasks arrive in a minute.",
                },
                {
                  q: "Is there a free trial?",
                  a: "The Free plan is free forever. Team and Studio have a 14 day trial.",
                },
                {
                  q: "Where is my data stored?",
                  a: "In the EU, encrypted at rest. You can export everything at any time.",
                },
                {
                  q: "Does it work on phones?",
                  a: "Yes, in the browser and as an app on iOS and Android.",
                },
              ],
            }),
            blocks.cta({
              title: "Plan your next week in Tandem",
              text: "It takes five minutes to set up.",
              cta: "Start free",
              ctaLink: to(contact),
            }),
          ],
          "Tandem | Shared planning for small teams",
          "Tandem keeps tasks, dates and owners in one place so small teams can skip the status meeting.",
          I("hero")
        ),
        page(
          pricing,
          "Pricing",
          "pricing",
          [
            blocks.pricing({
              title: "Pricing that scales with you",
              text: "Pay only for people who plan. Guests and viewers are always free.",
              tiers: [
                {
                  name: "Free",
                  price: "$0",
                  note: "up to 5 people",
                  features: [
                    "Unlimited tasks",
                    "Weekly view",
                    "30 days of history",
                  ],
                  cta: "Start free",
                  link: to(contact),
                },
                {
                  name: "Team",
                  price: "$8",
                  note: "per person per month",
                  features: [
                    "Everything in Free",
                    "Automatic Friday updates",
                    "Calendar sync",
                    "Unlimited history",
                  ],
                  cta: "Start trial",
                  link: to(contact),
                  featured: true,
                },
                {
                  name: "Studio",
                  price: "$16",
                  note: "per person per month",
                  features: [
                    "Everything in Team",
                    "Workload reports",
                    "Priority support",
                    "Single sign on",
                  ],
                  cta: "Talk to us",
                  link: to(contact),
                },
              ],
            }),
            blocks.faq(
              {
                title: "Billing",
                items: [
                  {
                    q: "Do you charge per seat?",
                    a: "Yes, for active planners. Viewers and guests are free and unlimited.",
                  },
                  {
                    q: "Can I switch plans?",
                    a: "Any time. We prorate the difference to the day.",
                  },
                  {
                    q: "Do you offer discounts?",
                    a: "Nonprofits and schools get half off. Write to us with a link.",
                  },
                  {
                    q: "How do I cancel?",
                    a: "In settings, in two clicks. You keep your data for 90 days.",
                  },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "Pricing | Tandem",
          "Tandem pricing: a free plan for small teams and per-person plans for larger ones.",
          I("detail")
        ),
        page(
          about,
          "About",
          "about",
          [
            blocks.story({
              kicker: "About",
              title: "Made by a team of nine",
              text: "We built Tandem because our own team kept losing track of who was doing what. We are nine people in Amsterdam, and we answer support email ourselves. We plan the product in Tandem too.",
              image: I("team"),
            }),
            blocks.stats(
              [
                { value: "6,000", label: "teams" },
                { value: "9", label: "people at Tandem" },
                { value: "4.8", label: "average app rating" },
              ],
              { fill: "$text", color: "$bg" }
            ),
          ],
          "About | Tandem",
          "Tandem is built by a team of nine in Amsterdam for small teams everywhere.",
          I("team")
        ),
        page(
          contact,
          "Get started",
          "start",
          [
            blocks.contact({
              title: "Start with Tandem",
              text: "Leave your email and a few words about your team. We set up your workspace and write back.",
              details:
                "hello@example.com\n+31 20 555 0143\nWeekdays, 9am to 6pm CET",
              submit: "Request access",
              success: "Thank you. We will send your workspace link shortly.",
            }),
          ],
          "Get started | Tandem",
          "Start a free Tandem workspace for your team.",
          I("detail")
        ),
      ],
    })
  },
}
