import { blocks } from "../blocks"
import { newId } from "../model"
import { img, page, post, site, to } from "./kit"
import type { Template } from "./types"

const I = img("field-notes")
const A = "Noor Haddad"

export const fieldNotes: Template = {
  id: "field-notes",
  name: "Field Notes",
  category: "Blog",
  blurb:
    "A magazine-style personal blog with essays, an about page and a newsletter.",
  apps: ["blog"],
  make: () => {
    const home = newId()
    const essays = newId()
    const about = newId()
    const letter = newId()
    return site({
      name: "Field Notes",
      description:
        "Essays on small things: food, trains, books and places worth walking to. By Noor Haddad.",
      currency: "GBP",
      shareImage: I("hero"),
      theme: {
        palette: {
          bg: "#fbf8f1",
          surface: "#f0e9db",
          text: "#1d1b17",
          muted: "#6b655a",
          accent: "#b34a1c",
          accentText: "#fffaf2",
          line: "#ddd3c0",
        },
        heading: "Playfair Display",
        body: "Lora",
        radius: 4,
      },
      header: blocks.header("Field Notes", {
        label: "Subscribe",
        link: to(letter),
      }),
      footer: blocks.footer(
        "Field Notes",
        "Essays on small things, written slowly. Write to me at noor@example.com",
        [{ kind: "x", url: "https://example.com/fieldnotes" }]
      ),
      posts: [
        post(
          "The slow train home",
          "Eleven hours, one window and no signal. A case for the long way round.",
          "I used to think of trains as a delay between places. Now I think of them as the place.\n\nLast month I took the overnight line back from the coast, because the flights were cancelled and because I was tired of being efficient. There was a window, a flask of tea and no signal for most of the route.\n\n## What the window shows\n\nFor the first hour I watched fields. Then I stopped watching and started noticing: washing lines, a boy waving at a level crossing, a heron standing in a drainage ditch as though it had paid for the spot.\n\n## What I did not do\n\nI did not answer a single email. I wrote four pages by hand, ate a very sad sandwich and fell asleep somewhere after the long tunnel. I woke up forty minutes from home, calmer than I had been in a year.\n\nNobody needs to give up flying. But everybody needs one long train ride a year where nothing is gained except the ride.",
          I("c4"),
          A,
          "2026-10-14"
        ),
        post(
          "In praise of the second-hand book",
          "Pencil marks, pressed flowers and the people who read it first.",
          "A new book is a promise. A used one is a conversation.\n\nI buy most of my reading from a stall near the station, where paperbacks cost two pounds and smell like other people's attics. Last week I found a novel with a boarding pass for a flight to Lisbon in 1998 tucked inside.\n\n## The margins\n\nSomeone had underlined one sentence on page 61 three times. I have no idea why. I have thought about it every day since.\n\n## Why it matters\n\nBooks that have been read keep the evidence. Creases, coffee rings and a name inside the cover. Reading them feels less like consuming and more like joining a very slow queue.\n\nBuy new when the author needs the money. Buy old the rest of the time, and leave your own pencil mark for whoever comes next.",
          I("c3"),
          A,
          "2026-09-30"
        ),
        post(
          "Soup for people you are worried about",
          "A recipe that is mostly an excuse to knock on a door.",
          "When someone you love is having a bad month, cooking is the only thing that helps and the one thing they will not ask for.\n\nSo make soup. Make too much.\n\n## The recipe\n\nSoften two onions in plenty of olive oil, slowly, for twenty minutes. Add a tin of tomatoes, a tin of chickpeas, a spoon of smoked paprika and a litre of water. Let it bubble gently while you tidy something. Finish with lemon and salt, and taste it three times.\n\n## The delivery\n\nPut it in a jar, not a nice container you will want back. Knock, hand it over and say you cannot stay. Nobody has to talk. The soup does the talking, and the jar gives them a reason to text you next week.",
          I("c5"),
          A,
          "2026-09-08"
        ),
        post(
          "Cycling to the same café for a year",
          "Fifty-two Saturdays, one table and what changed.",
          "Last autumn I made a rule. Every Saturday, no matter the weather, I would cycle to the same café and sit at the same table by the door.\n\n## The first month\n\nIt felt silly. I had a book, I was cold and the barista asked if I was waiting for someone. By week six, he had my coffee ready as I locked the bike.\n\n## What I noticed\n\nThe street changes more than you think. A shop closed in March. A mural appeared in June. The man with the small grey dog started walking him in a coat in November.\n\nRepeating something does not make it dull. It makes you attentive, because the sameness gives the differences somewhere to show.\n\nI am starting year two this weekend. The table is still free.",
          I("c2"),
          A,
          "2026-08-19"
        ),
        post(
          "A desk, a notebook, a window",
          "How I write, and why I stopped using three apps to do it.",
          "People ask what tools I use. The honest answer is embarrassing: a notebook, a pen that cost one pound and the corner of the dining table.\n\n## Why paper\n\nA page does not offer notifications. It does not suggest a better word or tell me how many I have left. It lets me be wrong at my own speed.\n\n## The routine\n\nI write for forty minutes before I look at a screen. Mostly it is rubbish. Occasionally there is one sentence worth saving, and I copy that into the computer later, which is also when I edit.\n\n## If you want to try\n\nBuy any notebook that does not look precious. Write the date. Stop when the coffee is finished.",
          I("hero"),
          A,
          "2026-07-27"
        ),
        post(
          "Kitchen table, Sunday",
          "The best meal I had all year cost four pounds and took an hour.",
          "On Sunday I made a tray of roast vegetables and ate it standing at the counter while the rain hit the window.\n\nNothing about it was impressive. Carrots, red onion, a bulb of garlic, lots of salt. But somewhere in the smell of it I remembered being eight and sitting under my grandmother's table while the grown-ups argued happily over dinner.\n\n## The point\n\nFood is memory with a fork. I think that is why we cook the same dishes at the same time of year, whether or not anyone is watching.\n\nMake something plain this weekend, and pay attention to what it reminds you of.",
          I("c1"),
          A,
          "2026-06-11"
        ),
      ],
      pages: [
        page(
          home,
          "Home",
          "",
          [
            blocks.story({
              kicker: "A personal blog",
              title: "Notes on small things",
              text: "I am Noor, and I write about food, books, trains and anything else I notice on the way. New essays arrive every other Wednesday. They take about five minutes to read.",
              image: I("hero"),
              cta: "Read the essays",
              ctaLink: to(essays),
            }),
            blocks.blog(
              { title: "Recent essays", limit: 6 },
              { fill: "$surface" }
            ),
            blocks.quote({
              text: "Repeating something does not make it dull. It makes you attentive.",
              author: "From “Cycling to the same café for a year”",
            }),
            blocks.newsletter(
              {
                title: "One letter, every other Wednesday",
                text: "New essays and what I am reading. No ads, no tracking, unsubscribe in one click.",
              },
              { fill: "$surface" }
            ),
          ],
          "Field Notes | Essays by Noor Haddad",
          "Personal essays on food, trains, books and places worth walking to, every other Wednesday.",
          I("hero")
        ),
        page(
          essays,
          "Essays",
          "essays",
          [blocks.blog({ title: "All essays", limit: 6 })],
          "Essays | Field Notes",
          "Every essay on Field Notes, newest first.",
          I("c3")
        ),
        page(
          about,
          "About",
          "about",
          [
            blocks.story({
              kicker: "About",
              title: "Hello, I am Noor",
              text: "By day I work in a library. By night I write down what I saw. Field Notes began as a list of things I did not want to forget. Four years later it has readers in thirty countries, which I still find astonishing.",
              image: I("c1"),
              flip: true,
            }),
            blocks.contact(
              {
                title: "Write to me",
                text: "I read every message. I cannot always answer, but I try.",
                details: "noor@example.com",
              },
              { fill: "$surface" }
            ),
          ],
          "About | Field Notes",
          "Noor Haddad is a librarian who writes essays about small, ordinary things.",
          I("c1")
        ),
        page(
          letter,
          "Newsletter",
          "newsletter",
          [
            blocks.newsletter(
              {
                title: "Get the letter",
                text: "Essays every other Wednesday, free. Reply to any email and it reaches me.",
              },
              { fill: "$bg" }
            ),
          ],
          "Newsletter | Field Notes",
          "Subscribe to the Field Notes letter for new essays every other Wednesday.",
          I("hero")
        ),
      ],
    })
  },
}
