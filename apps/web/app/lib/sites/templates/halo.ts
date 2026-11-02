import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, service, site, to } from "./kit"
import type { Template } from "./types"

const I = img("halo")

export const halo: Template = {
  id: "halo",
  name: "Halo",
  category: "Beauty & wellness",
  blurb: "A bright hair salon with a price list, online booking and a gallery.",
  apps: ["bookings"],
  make: () => {
    const home = newId()
    const prices = newId()
    const book = newId()
    const contact = newId()
    return site({
      name: "Halo Hair",
      description:
        "An independent hair salon for cuts, colour and care. Book online.",
      currency: "USD",
      hours: { days: [2, 3, 4, 5, 6], from: "09:00", to: "18:30", horizon: 45 },
      shareImage: I("hero"),
      theme: {
        palette: {
          bg: "#fbf6f1",
          surface: "#f2e5dc",
          text: "#2a2220",
          muted: "#7a6a64",
          accent: "#9c4a45",
          accentText: "#fff8f3",
          line: "#e6d6cb",
        },
        heading: "DM Serif Display",
        body: "Manrope",
        radius: 0,
      },
      header: blocks.header("Halo", { label: "Book", link: to(book) }),
      footer: blocks.footer(
        "Halo Hair",
        "31 Bell Street. Tuesday to Saturday, 9am to 6:30pm. hello@example.com",
        [{ kind: "instagram", url: "https://example.com/halohair" }]
      ),
      services: [
        service(
          "Cut and blow dry",
          "A consultation, wash, precision cut and finish.",
          60,
          85
        ),
        service(
          "Colour, full head",
          "Single process colour or gloss, with a treatment.",
          120,
          140
        ),
        service(
          "Balayage",
          "Hand painted highlights, toned and cut. Includes a blow dry.",
          180,
          260
        ),
        service(
          "Blow dry",
          "Wash and style, from sleek to loose waves.",
          40,
          45
        ),
      ],
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.heroSplit({
              kicker: "Independent hair salon",
              title: "Hair that feels like yours",
              text: "Cuts, colour and honest advice from stylists who listen first.",
              cta: "Book a visit",
              ctaLink: to(book),
              second: "See prices",
              secondLink: to(prices),
              image: I("hero"),
              alt: "A stylist combing long brown hair",
            }),
            blocks.features(
              {
                title: "Why people stay",
                items: [
                  {
                    title: "Consultation first",
                    text: "Every visit starts with ten minutes of talking, before scissors come out.",
                  },
                  {
                    title: "Kind to your hair",
                    text: "Plant-based colour lines and bond treatments in every colour service.",
                  },
                  {
                    title: "No rush",
                    text: "Appointments are never double booked, so you are not squeezed in.",
                  },
                ],
              },
              { fill: "$surface" }
            ),
            blocks.story({
              kicker: "Our salon",
              title: "Four chairs and big windows",
              text: "Halo is run by Dani and Rosa, who spent ten years in busy salons before opening their own. The room is small on purpose. You will get the same stylist every visit, and a cup of something warm.",
              image: I("chair"),
              flip: true,
            }),
            blocks.gallery(
              {
                title: "Recent work",
                images: [
                  { src: I("cut"), alt: "A fresh bob haircut" },
                  { src: I("colour"), alt: "Colour being applied" },
                  { src: I("hero"), alt: "Long glossy hair" },
                  { src: I("tools"), alt: "Scissors and combs on marble" },
                  { src: I("shampoo"), alt: "Amber bottles on a shelf" },
                  {
                    src: I("chair"),
                    alt: "A chair in front of a brass mirror",
                  },
                ],
              },
              { fill: "$surface" }
            ),
            blocks.quote({
              text: "Best haircut I have had in years, and she remembered exactly how I like my fringe.",
              author: "Priya, regular since 2023",
            }),
            blocks.cta({
              title: "Your chair is waiting",
              cta: "Book online",
              ctaLink: to(book),
            }),
          ],
          "Halo Hair | Independent hair salon",
          "An independent hair salon offering cuts, colour, balayage and blow dries. Book online.",
          I("hero")
        ),
        page(
          prices,
          "Prices",
          "prices",
          [
            blocks.priceList({
              title: "Price list",
              groups: [
                {
                  name: "Cutting",
                  items: [
                    {
                      name: "Cut and blow dry",
                      text: "Consultation, wash, cut and finish.",
                      price: "$85",
                    },
                    {
                      name: "Fringe trim",
                      text: "A quick tidy between cuts.",
                      price: "$15",
                    },
                    {
                      name: "Children under 12",
                      text: "Wash and a simple cut.",
                      price: "$40",
                    },
                  ],
                },
                {
                  name: "Colour",
                  items: [
                    {
                      name: "Root colour",
                      text: "Regrowth only, with a gloss.",
                      price: "$95",
                    },
                    {
                      name: "Full head colour",
                      text: "Single process with a treatment.",
                      price: "$140",
                    },
                    {
                      name: "Balayage",
                      text: "Hand painted, toned, cut and dried.",
                      price: "from $260",
                    },
                  ],
                },
                {
                  name: "Styling",
                  items: [
                    {
                      name: "Blow dry",
                      text: "Sleek, bouncy or loose waves.",
                      price: "$45",
                    },
                    {
                      name: "Occasion style",
                      text: "Updos and braids. Trial available.",
                      price: "from $75",
                    },
                    {
                      name: "Bridal hair",
                      text: "Trial and the day. Ask for a quote.",
                      price: "from $320",
                    },
                  ],
                },
                {
                  name: "Treatments",
                  items: [
                    {
                      name: "Bond repair",
                      text: "Rebuilds damaged hair. Add to any colour.",
                      price: "$40",
                    },
                    {
                      name: "Scalp ritual",
                      text: "A massage and deep cleanse.",
                      price: "$35",
                    },
                    {
                      name: "Gloss",
                      text: "Shine and tone refresh in 30 minutes.",
                      price: "$55",
                    },
                  ],
                },
              ],
            }),
            blocks.cta({
              title: "Not sure what you need?",
              text: "Book a 15 minute consultation. It is free.",
              cta: "Book now",
              ctaLink: to(book),
            }),
          ],
          "Prices | Halo Hair",
          "The full price list for cuts, colour, styling and treatments at Halo Hair.",
          I("tools")
        ),
        page(
          book,
          "Book",
          "book",
          [
            blocks.booking({
              title: "Book your visit",
              text: "Choose a service and a time. We will email to confirm and remind you the day before.",
              heading: "Pick a time",
            }),
          ],
          "Book online | Halo Hair",
          "Book a cut, colour or blow dry online at Halo Hair, Tuesday to Saturday.",
          I("chair")
        ),
        page(
          contact,
          "Contact",
          "contact",
          [
            blocks.contact({
              title: "Say hello",
              text: "A question about colour, a wedding or your first visit? We reply the same day.",
              details:
                "31 Bell Street\nTuesday to Saturday, 9am to 6:30pm\nhello@example.com\n+1 555 0173",
              map: "31 Bell Street",
            }),
          ],
          "Contact | Halo Hair",
          "Find Halo Hair at 31 Bell Street or send us a message.",
          I("shampoo")
        ),
      ],
    })
  },
}
