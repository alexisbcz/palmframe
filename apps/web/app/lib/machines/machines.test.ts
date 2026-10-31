import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { toFiled, inboxBrief } from "./agent.logic"
import { compileWords, createDetector } from "./detect"
import {
  isPrivateAddress,
  parseFeed,
  parseGdelt,
  parseHackerNews,
  stripHtml,
} from "./feeds"
import {
  compose,
  freshItems,
  holdReason,
  isDue,
  unsupportedNumbers,
} from "./gate"
import {
  type Item,
  type MachineConfig,
  type Reading,
  NO_MEDIA,
  PRESETS,
  feedSchema,
  machineConfig,
  slugify,
} from "./model"
import {
  coinbaseProducts,
  parseCoinbase,
  parseJetstream,
  parseWikipedia,
} from "./sources"

const MIN = 60_000
const config = (o: Partial<MachineConfig> = {}): MachineConfig => ({
  keywords: [],
  exclude: [],
  threshold: 3,
  windowMinutes: 10,
  cooldownMinutes: 60,
  dailyCap: 5,
  voice: "",
  language: "en",
  mission: "",
  feeds: [],
  listen: true,
  everyMinutes: 60,
  image: false,
  media: NO_MEDIA,
  ...o,
})
const edit = (at: number, subject = "Eclipse"): Reading => ({
  kind: "text",
  source: "wikipedia",
  subject,
  text: `${subject} update`,
  url: "https://en.wikipedia.org/wiki/Eclipse",
  at,
  lang: "en",
})
const post = (at: number, text: string, lang = "en"): Reading => ({
  kind: "text",
  source: "bluesky",
  subject: null,
  text,
  url: "https://bsky.app/profile/x/post/y",
  at,
  lang,
})
const price = (at: number, value: number): Reading => ({
  kind: "level",
  source: "crypto",
  subject: "BTC-USD",
  label: "Bitcoin",
  value,
  url: "https://www.coinbase.com/price/bitcoin",
  at,
})

describe("words", () => {
  test("match whole words, in any script", () => {
    const re = compileWords(["art", "c++", "漫画"])!
    assert.equal(re.test("the party"), false)
    assert.equal(re.test("ART school"), true)
    assert.equal(re.test("I write c++ daily"), true)
    assert.equal(re.test("新しい 漫画 です"), true)
  })
})

describe("bursts", () => {
  test("fire at the threshold, once, with the cooldown holding", () => {
    const d = createDetector("wikipedia", config())
    assert.equal(d.step(edit(0)), null)
    assert.equal(d.step(edit(MIN)), null)
    const fired = d.step(edit(2 * MIN))
    assert.equal(fired?.measure.type, "count")
    assert.match(fired!.facts, /3 edits to the Wikipedia article "Eclipse"/)
    for (const at of [3, 4, 5, 6]) assert.equal(d.step(edit(at * MIN)), null)
  })

  test("forget hits outside the window", () => {
    const d = createDetector("wikipedia", config())
    d.step(edit(0))
    d.step(edit(MIN))
    assert.equal(d.step(edit(20 * MIN)), null)
  })

  test("count each subject on its own", () => {
    const d = createDetector("wikipedia", config())
    for (const at of [0, 1]) d.step(edit(at, "A"))
    assert.equal(d.step(edit(2, "B")), null)
  })

  test("filter by keyword, exclusion and language", () => {
    const d = createDetector(
      "bluesky",
      config({ keywords: ["manga"], exclude: ["giveaway"], threshold: 2 })
    )
    assert.equal(d.matches(post(0, "love this manga")), true)
    assert.equal(d.matches(post(0, "mangas, plural")), false)
    assert.equal(d.matches(post(0, "manga giveaway")), false)
    assert.equal(d.matches(post(0, "ce manga", "fr")), false)
    d.step(post(0, "a manga"))
    const fired = d.step(post(1, "another MANGA"))
    assert.equal(fired?.title, "manga")
    assert.deepEqual(fired?.samples, ["a manga", "another MANGA"])
  })

  test("ignore other sources", () => {
    const d = createDetector("wikipedia", config({ threshold: 1 }))
    assert.equal(d.step(post(0, "hello")), null)
  })
})

describe("moves", () => {
  const swing = () => createDetector("crypto", config({ threshold: 2 }))

  test("fire on a percentage move, up or down", () => {
    for (const to of [103, 97]) {
      const d = swing()
      d.step(price(0, 100))
      const fired = d.step(price(MIN, to))
      assert.equal(fired?.measure.type, "move")
      assert.match(fired!.facts, /Bitcoin moved [+-]?3\.0%/)
    }
  })

  test("stay quiet on small moves and after the window", () => {
    const d = swing()
    d.step(price(0, 100))
    assert.equal(d.step(price(MIN, 101)), null)
    const e = swing()
    e.step(price(0, 100))
    assert.equal(e.step(price(11 * MIN, 110)), null)
  })

  test("keep the signal id across runs, through plain JSON", () => {
    const first = createDetector("crypto", config({ threshold: 2 }))
    first.step(price(0, 100))
    const saved = JSON.parse(JSON.stringify(first.state))
    const second = createDetector("crypto", config({ threshold: 2 }), saved)
    const a = second.step(price(MIN, 103))
    const replay = createDetector(
      "crypto",
      config({ threshold: 2 }),
      JSON.parse(JSON.stringify(first.state))
    ).step(price(MIN, 103))
    assert.ok(a)
    assert.equal(a.id, replay?.id)
  })

  test("track where the stream got to", () => {
    const d = swing()
    d.step(price(5, 100))
    d.step(price(3, 100))
    assert.equal(d.state.cursor, 5)
  })
})

describe("state", () => {
  test("stays bounded", () => {
    const d = createDetector("wikipedia", config({ threshold: 99 }))
    for (let i = 0; i < 1000; i++) d.step(edit(i, `Article ${i}`))
    assert.ok(Object.keys(d.state.hits!).length <= 400)
    assert.ok(d.state.hits!["article 999"])
  })
})

describe("parsers, on messages captured from the live streams", () => {
  test("Bluesky post", () => {
    const r = parseJetstream({
      did: "did:plc:meefelxogyxik7rjjrh4ns2t",
      time_us: 1793457074462184,
      kind: "commit",
      commit: {
        operation: "create",
        collection: "app.bsky.feed.post",
        rkey: "3mz6j3wtbmc2z",
        record: { langs: ["en"], text: "For me it is a lifelong condition" },
      },
    })
    assert.equal(
      r?.url,
      "https://bsky.app/profile/did:plc:meefelxogyxik7rjjrh4ns2t/post/3mz6j3wtbmc2z"
    )
    assert.equal(r?.at, 1793457074462)
    assert.equal(r?.kind === "text" && r.lang, "en")
    assert.equal(parseJetstream({ kind: "identity", identity: {} }), null)
  })

  test("Coinbase trade", () => {
    const [r] = parseCoinbase({
      channel: "market_trades",
      events: [
        {
          type: "update",
          trades: [
            {
              product_id: "BTC-USD",
              trade_id: "1113231590",
              price: "77336.21",
              size: "0.00000009",
              time: "2026-10-31T14:31:15.351683Z",
              side: "BUY",
            },
          ],
        },
      ],
    })
    assert.equal(r?.kind === "level" && r.value, 77336.21)
    assert.equal(r?.kind === "level" && r.label, "Bitcoin")
    assert.deepEqual(parseCoinbase({ channel: "subscriptions" }), [])
  })

  test("Wikipedia edit, leaving out bots and talk pages", () => {
    const edit = {
      type: "edit",
      namespace: 0,
      title: "Josephine Lagu",
      title_url: "https://en.wikipedia.org/wiki/Josephine_Lagu",
      comment: "Modifying redirect categories",
      timestamp: 1793457075,
      bot: false,
      wiki: "enwiki",
    }
    assert.equal(parseWikipedia(edit)?.at, 1793457075000)
    assert.equal(parseWikipedia({ ...edit, bot: true }), null)
    assert.equal(parseWikipedia({ ...edit, namespace: 1 }), null)
    assert.equal(parseWikipedia({ ...edit, wiki: "wikidatawiki" }), null)
  })

  test("Coinbase products keep to plain symbols", () => {
    assert.deepEqual(coinbaseProducts([]), ["BTC-USD", "ETH-USD", "SOL-USD"])
    assert.deepEqual(coinbaseProducts(["doge", "x y"]), ["DOGE-USD"])
  })
})

test("every preset is a valid config", () => {
  for (const p of PRESETS) machineConfig.parse(p.config)
})

const item = (o: Partial<Item> = {}): Item => ({
  key: "a",
  source: "Example",
  title: "Anthropic raises $2,500 million",
  summary: "Revenue grew 40% in 2026.",
  url: "https://example.com/a",
  at: 1_000,
  ...o,
})

describe("feeds", () => {
  test("reads RSS, with CDATA and entities", () => {
    const [i] = parseFeed(
      `<rss><channel><title>Site</title><item><title><![CDATA[A &amp; B]]></title>
      <link>https://x.test/1?a=1&amp;b=2</link><guid>g1</guid>
      <pubDate>Sat, 31 Oct 2026 16:00:00 GMT</pubDate>
      <description>&lt;p&gt;Hello &amp;amp; <b>bye</b>&lt;/p&gt;</description></item></channel></rss>`,
      "x.test",
      5
    )
    assert.equal(i?.title, "A & B")
    assert.equal(i?.url, "https://x.test/1?a=1&b=2")
    assert.equal(i?.key, "g1")
    assert.equal(i?.at, Date.UTC(2026, 9, 31, 16))
  })

  test("reads Atom and drops items with no https link", () => {
    const items = parseFeed(
      `<feed><entry><title>Ok</title><id>1</id><link rel="alternate" href="https://x.test/ok"/></entry>
      <entry><title>Plain</title><link href="http://x.test/no"/></entry></feed>`,
      "x",
      5
    )
    assert.deepEqual(
      items.map((i) => i.url),
      ["https://x.test/ok"]
    )
  })

  test("scripts in a page are not article text", () => {
    assert.equal(
      stripHtml("<script>evil()</script><p>Real &amp; text</p>"),
      "Real & text"
    )
  })

  test("reads GDELT dates and Hacker News hits", () => {
    const [g] = parseGdelt(
      {
        articles: [
          {
            url: "https://x.test/",
            title: "T",
            domain: "x.test",
            seendate: "20261031T120000Z",
          },
        ],
      },
      5
    )
    assert.equal(g?.at, Date.UTC(2026, 9, 31, 12))
    const [h] = parseHackerNews(
      { hits: [{ objectID: "9", title: "Ask HN" }] },
      5
    )
    assert.equal(h?.url, "https://news.ycombinator.com/item?id=9")
  })

  test("refuses non-public addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "172.16.0.1",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
      "fe80::1",
      "100.64.0.1",
    ])
      assert.equal(isPrivateAddress(ip), true, ip)
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
      assert.equal(isPrivateAddress(ip), false, ip)
  })

  test("feeds must be https", () => {
    assert.equal(
      feedSchema.safeParse({ kind: "rss", url: "http://x.test" }).success,
      false
    )
    assert.equal(
      feedSchema.safeParse({ kind: "rss", url: "https://x.test/f" }).success,
      true
    )
  })
})

describe("the gate before publishing", () => {
  const evidence = "Revenue of $2,500 million grew 40% in 2026"

  test("finds numbers the sources never stated", () => {
    assert.deepEqual(unsupportedNumbers("Revenue up 45%", evidence), ["45"])
    assert.deepEqual(unsupportedNumbers("$2500 million, up 40%", evidence), [])
    assert.deepEqual(unsupportedNumbers("Up 1 2 3", evidence), [])
    assert.deepEqual(unsupportedNumbers("$25 million", evidence), ["25"])
  })

  test("holds an invented number and an uncited post", () => {
    assert.match(holdReason("Up 45%", evidence, [item()]) ?? "", /45/)
    assert.match(holdReason("Fine", evidence, []) ?? "", /cite/)
    assert.equal(holdReason("Up 40%", evidence, [item()]), null)
  })

  test("the agent can only cite what is in the inbox", () => {
    const filed = toFiled(
      { text: "Hi", item_ids: [0, 7, "x", 0] },
      [item()],
      "",
      "p"
    )
    assert.equal(filed?.sources.length, 1)
    assert.equal(filed?.link, "https://example.com/a")
    assert.equal(toFiled({ text: "  " }, [item()], "", "p"), null)
  })

  test("the model never sees links", () => {
    assert.ok(!inboxBrief([item()], []).includes("example.com"))
  })

  test("posts fit each platform", () => {
    const long = "word ".repeat(100).trim()
    const url = `https://example.com/${"a".repeat(300)}`
    assert.ok(compose(long, null, "twitter").length <= 280)
    const x = compose(long, url, "twitter")
    assert.ok(x.endsWith(url))
    assert.ok(x.length - url.length + 23 <= 280)
    assert.equal(compose("Hi", url, "bluesky"), "Hi")
    assert.ok(compose(long, "https://a.co/b", "bluesky").length <= 300)
    assert.equal(compose("Hi", "https://a.co/b", "instagram"), "Hi")
  })

  test("schedule and freshness", () => {
    assert.equal(isDue(null, 5), true)
    assert.equal(isDue(new Date(10).toISOString(), 5), false)
    const now = 100 * 3_600_000
    const items = freshItems(
      [item({ at: now - 49 * 3_600_000 }), item({ at: now, key: "b" })],
      now
    )
    assert.deepEqual(
      items.map((i) => i.key),
      ["b"]
    )
  })

  test("slugs", () => {
    assert.equal(slugify("  Café Néws!! "), "cafe-news")
  })
})
