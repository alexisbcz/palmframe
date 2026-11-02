import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, service, site, to } from "./kit"
import type { Template } from "./types"

const I = img("slowbody")

export const slowbody: Template = {
  id: "slowbody",
  name: "Slow Body",
  category: "Beauty & wellness",
  blurb:
    "A yoga and pilates studio with a class booking page, memberships and questions.",
  apps: ["bookings"],
  make: () => {
    const home = newId()
    const classes = newId()
    const book = newId()
    const about = newId()
    const hero = blocks.heroFull({
      kicker: "Yoga and pilates studio",
      title: "Move slowly, feel better",
      text: "Small classes in a bright room, with teachers who know your name.",
      cta: "Book a class",
      ctaLink: to(book),
      image: I("hero"),
    })
    if (hero.fill.kind === "image") hero.fill.overlay = 0.3
    return site({
      name: "Slow Body",
      description:
        "A small yoga and pilates studio. Classes for every level, capped at ten people.",
      currency: "USD",
      hours: {
        days: [1, 2, 3, 4, 5, 6],
        from: "07:00",
        to: "20:00",
        horizon: 21,
      },
      shareImage: I("hero"),
      theme: {
        palette: {
          bg: "#f5f2ea",
          surface: "#e9e7da",
          text: "#27302a",
          muted: "#667060",
          accent: "#4a6648",
          accentText: "#f8f6ee",
          line: "#d8d6c6",
        },
        heading: "Lora",
        body: "DM Sans",
        radius: 20,
      },
      header: blocks.header("Slow Body", {
        label: "Book a class",
        link: to(book),
      }),
      footer: blocks.footer(
        "Slow Body",
        "88 Maple Street, second floor. Open Monday to Saturday. hello@example.com",
        [{ kind: "instagram", url: "https://example.com/slowbody" }]
      ),
      services: [
        service(
          "Vinyasa flow",
          "A steady, breath-led class. All levels, with options for every pose.",
          60,
          22
        ),
        service(
          "Reformer pilates",
          "Machine-based pilates for strength and posture. Limited to eight people.",
          55,
          32
        ),
        service(
          "Restorative evening",
          "Props, blankets and long holds. A quiet way to end the day.",
          75,
          24
        ),
        service(
          "Private session",
          "One to one with a teacher. Good for injuries, beginners or goals.",
          60,
          90
        ),
      ],
      pages: [
        page(
          home,
          "Home",
          "",
          [
            hero,
            blocks.intro({
              kicker: "Welcome",
              title: "A studio for people who do not like gyms",
              text: "No mirrors, no music at full volume, no one watching. Just a warm room, a mat and a teacher who adjusts the class to the people in it.",
            }),
            blocks.features({
              title: "What makes us different",
              items: [
                {
                  title: "Ten people, tops",
                  text: "Every class is capped, so teachers can see you and help you adjust.",
                },
                {
                  title: "All bodies welcome",
                  text: "Beginners, bad backs, new parents. Every class has easier and harder options.",
                },
                {
                  title: "Tea afterwards",
                  text: "Stay for a cup in the front room. Some of our best friends met there.",
                },
              ],
            }),
            blocks.testimonials(
              [
                {
                  text: "I walked in stiff and anxious. Three weeks later my back has stopped aching.",
                  author: "Hannah, Tuesday vinyasa",
                },
                {
                  text: "The reformer class is hard but nobody makes you feel bad about it.",
                  author: "Marcus, member since 2024",
                },
                {
                  text: "Smallest, kindest studio I have found. I book my week around it.",
                  author: "Elena, restorative evenings",
                },
              ],
              { title: "Kind words", fill: "$bg" }
            ),
            blocks.cta({
              title: "Try your first class for $12",
              text: "New to the studio? Your first visit is on us at a reduced rate.",
              cta: "Book now",
              ctaLink: to(book),
            }),
          ],
          "Slow Body | Yoga and pilates studio",
          "A small yoga and pilates studio with classes for every level, capped at ten people.",
          I("hero")
        ),
        page(
          classes,
          "Classes",
          "classes",
          [
            blocks.story({
              kicker: "Pilates",
              title: "Strong from the middle",
              text: "Our reformer classes build core strength and steady posture. You will work slowly, with springs and straps, and feel it the next day in a good way. No experience needed.",
              image: I("pilates"),
              cta: "Book a class",
              ctaLink: to(book),
            }),
            blocks.story(
              {
                kicker: "Yoga",
                title: "Breath first, poses second",
                text: "From flowing vinyasa to restorative evenings, classes follow the breath and finish with a long rest. Mats, blocks, straps and blankets are all provided.",
                image: I("pose"),
                flip: true,
              },
              { fill: "$surface" }
            ),
            blocks.pricing({
              title: "Memberships",
              text: "Cancel any time. Unused classes roll over for a month.",
              tiers: [
                {
                  name: "Drop in",
                  price: "$22",
                  note: "per class",
                  features: [
                    "Any yoga class",
                    "Mat and props included",
                    "No commitment",
                  ],
                  cta: "Book a class",
                  link: to(book),
                },
                {
                  name: "Monthly",
                  price: "$120",
                  note: "per month",
                  features: [
                    "Eight classes a month",
                    "Yoga and pilates",
                    "Bring a friend once a month",
                    "Tea with every visit",
                  ],
                  cta: "Join",
                  link: to(book),
                  featured: true,
                },
                {
                  name: "Unlimited",
                  price: "$175",
                  note: "per month",
                  features: [
                    "As many classes as you like",
                    "Reformer priority booking",
                    "One private session a quarter",
                  ],
                  cta: "Join",
                  link: to(book),
                },
              ],
            }),
            blocks.faq(
              {
                title: "Before you come",
                items: [
                  {
                    q: "I have never done yoga. Is that okay?",
                    a: "Yes. Tell the teacher at the door and they will look after you.",
                  },
                  {
                    q: "What should I wear?",
                    a: "Anything you can stretch in. We go barefoot in the studio.",
                  },
                  {
                    q: "Can I cancel a class?",
                    a: "Up to six hours before, with no charge. After that the class is used.",
                  },
                  {
                    q: "Do you offer pregnancy classes?",
                    a: "Yes, on Saturday mornings. Ask us and we will explain what it involves.",
                  },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "Classes and pricing | Slow Body",
          "Yoga and reformer pilates classes, memberships and drop in prices at Slow Body.",
          I("pilates")
        ),
        page(
          book,
          "Book",
          "book",
          [
            blocks.booking({
              title: "Book a class",
              text: "Choose a class and a time. You will get a confirmation by email and a reminder the day before.",
              heading: "Choose a time",
            }),
          ],
          "Book a class | Slow Body",
          "Reserve a spot in a yoga or reformer pilates class at Slow Body.",
          I("reception")
        ),
        page(
          about,
          "Studio",
          "studio",
          [
            blocks.story({
              kicker: "The studio",
              title: "A room we wanted for ourselves",
              text: "Slow Body began when two teachers could not find a studio that felt calm. We found a sunny room above a bakery, sanded the floor and filled it with plants. The smell of bread is free.",
              image: I("reception"),
            }),
            blocks.gallery(
              {
                images: [
                  { src: I("props"), alt: "Towels, blocks and a plant" },
                  { src: I("stretch"), alt: "A gentle forward fold" },
                  { src: I("pose"), alt: "Seated meditation by a window" },
                ],
              },
              { fill: "$surface" }
            ),
            blocks.contact({
              title: "Find us",
              text: "Questions about classes, injuries or a private session? Write to us.",
              details:
                "88 Maple Street, second floor\nMonday to Saturday, 7am to 8pm\nhello@example.com\n+1 555 0126",
              map: "88 Maple Street",
            }),
          ],
          "The studio | Slow Body",
          "Visit Slow Body at 88 Maple Street. Open Monday to Saturday from 7am.",
          I("props")
        ),
      ],
    })
  },
}
