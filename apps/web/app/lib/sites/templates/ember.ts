import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, product, site, to } from "./kit"
import type { Template } from "./types"

const I = img("ember")

export const ember: Template = {
  id: "ember",
  name: "Ember",
  category: "Food",
  blurb:
    "A coffee roaster's online shop with beans, a brewing kit and a roastery story.",
  apps: ["store"],
  make: () => {
    const home = newId()
    const shop = newId()
    const story = newId()
    const contact = newId()
    return site({
      name: "Ember Coffee",
      description:
        "Small batch coffee roasted every Tuesday and Friday in Portland, shipped within a day.",
      currency: "USD",
      orderNote:
        "Roasted to order on Tuesdays and Fridays. Orders placed by Monday 5pm ship that week.",
      shareImage: I("hero"),
      theme: {
        palette: {
          bg: "#17110e",
          surface: "#231a15",
          text: "#f3e8dc",
          muted: "#b3a190",
          accent: "#e8793a",
          accentText: "#17110e",
          line: "#3a2b22",
        },
        heading: "Bricolage Grotesque",
        body: "Inter",
        radius: 10,
      },
      header: blocks.header("Ember", { label: "Shop beans", link: to(shop) }),
      footer: blocks.footer(
        "Ember Coffee",
        "Roasted in Portland. Order by Monday for Tuesday's batch. hello@example.com",
        [{ kind: "instagram", url: "https://example.com/embercoffee" }]
      ),
      products: [
        product(
          "Ethiopia Guji, 250g",
          18,
          "Blueberry, jasmine and honey. A bright light roast, best as filter coffee.",
          [I("bag1")]
        ),
        product(
          "Colombia Huila, 250g",
          16,
          "Brown sugar, red apple and cocoa. Medium roast that works in any machine.",
          [I("bag2")]
        ),
        product(
          "Sumatra Mandheling, 250g",
          17,
          "Dark chocolate, cedar and a little smoke. Heavy body, low acidity.",
          [I("bag3")]
        ),
        product(
          "Pour-over starter kit",
          64,
          "A gooseneck kettle, ceramic dripper, filters and a bag of our house blend.",
          [I("pour")]
        ),
      ],
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.heroSplit({
              kicker: "Roasted in Portland",
              title: "Coffee with a pulse",
              text: "Small batches, roasted twice a week, in your kitchen by the weekend.",
              cta: "Shop beans",
              ctaLink: to(shop),
              second: "Our roastery",
              secondLink: to(story),
              image: I("pour"),
              alt: "A pour-over being made",
            }),
            blocks.features(
              {
                title: "Three things we care about",
                items: [
                  {
                    title: "Direct trade",
                    text: "We buy from nine farms we know by name, and pay above fair trade prices.",
                  },
                  {
                    title: "Roasted fresh",
                    text: "Batches go out the same day they are roasted. Never older than a week.",
                  },
                  {
                    title: "Zero plastic",
                    text: "Paper bags, paper labels and a compost-friendly valve. No exceptions.",
                  },
                ],
              },
              { fill: "$surface" }
            ),
            blocks.shop({ title: "This week's roasts", limit: 3, columns: 3 }),
            blocks.story(
              {
                kicker: "The roastery",
                title: "A 1960s roaster and a lot of patience",
                text: "Our drum roaster is older than anyone who works here. It is slow and temperamental, which is exactly why the coffee tastes the way it does. Come and watch a batch if you are in town on a Friday.",
                image: I("roaster"),
                flip: true,
                cta: "Read our story",
                ctaLink: to(story),
              },
              { fill: "$surface" }
            ),
            blocks.newsletter({
              title: "Hear when the new lot lands",
              text: "One email when a limited coffee arrives. They usually sell out in a week.",
            }),
          ],
          "Ember Coffee | Small batch roasters",
          "Small batch coffee roasted in Portland every Tuesday and Friday and shipped within a day.",
          I("hero")
        ),
        page(
          shop,
          "Shop",
          "shop",
          [
            blocks.shop({ title: "All coffee", limit: 4, columns: 2 }),
            blocks.faq(
              {
                title: "Shipping",
                items: [
                  {
                    q: "When will my coffee arrive?",
                    a: "Orders placed by Monday 5pm are roasted on Tuesday and arrive by Friday.",
                  },
                  {
                    q: "Can I get it ground?",
                    a: "Of course. Tell us your brewer in the order note and we will grind to match.",
                  },
                  {
                    q: "Do you ship outside the US?",
                    a: "Canada and the UK. International shipping is calculated at checkout.",
                  },
                  {
                    q: "Do you do subscriptions?",
                    a: "Yes, every two weeks or monthly. Write to us and we will set one up.",
                  },
                ],
              },
              { fill: "$surface" }
            ),
          ],
          "Shop | Ember Coffee",
          "Buy single origin and blended coffee beans, roasted to order in Portland.",
          I("bag1")
        ),
        page(
          story,
          "Our story",
          "story",
          [
            blocks.story({
              kicker: "Our story",
              title: "Two friends and a bad cup",
              text: "In 2019 Jonah and Lea drank a terrible coffee in an airport and decided they could do better. They bought a secondhand roaster, cleared out a garage and learned the hard way. Seven years on, the garage is a roastery with a front window.",
              image: I("roaster"),
            }),
            blocks.stats(
              [
                { value: "9", label: "farms we buy from" },
                { value: "2x", label: "roasts a week" },
                { value: "0", label: "plastic bags" },
              ],
              { fill: "$accent" }
            ),
            blocks.gallery({
              images: [
                { src: I("cafe"), alt: "Our cafe counter" },
                { src: I("hero"), alt: "Fresh beans in a sack" },
                { src: I("bag3"), alt: "A bag of Sumatra" },
              ],
            }),
          ],
          "Our story | Ember Coffee",
          "How two friends turned a garage and a secondhand roaster into Ember Coffee.",
          I("roaster")
        ),
        page(
          contact,
          "Contact",
          "contact",
          [
            blocks.contact({
              title: "Visit or write",
              text: "Wholesale for cafes, press or just a chat about coffee. We love all three.",
              details:
                "212 Harbor Road, Portland\nFriday roast days, 8am to 2pm\nhello@example.com\n+1 555 0138",
              map: "212 Harbor Road, Portland",
            }),
          ],
          "Contact | Ember Coffee",
          "Visit the Ember roastery on a Friday or write to us about wholesale.",
          I("cafe")
        ),
      ],
    })
  },
}
