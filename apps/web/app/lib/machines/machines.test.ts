import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  fromTool,
  inboxBrief,
  passed,
  splitMemory,
  tally,
  toFiled,
} from "./agent.logic"
import type { MachineDraftRow } from "@/lib/database"

import { compileWords, createDetector } from "./detect"
import {
  decodeBody,
  entryCount,
  isPrivateAddress,
  parseFeed,
  parseGdelt,
  parseHackerNews,
  stripHtml,
} from "./feeds"
import {
  LIMITS,
  PUBLISHED_TRACK,
  attemptCeiling,
  budgetStop,
  compose,
  freshItems,
  holdReason,
  isDue,
  publishOutcome,
  reviewHold,
  unsupportedNumbers,
} from "./gate"
import {
  type Item,
  type MachineConfig,
  type PublishReceipt,
  type Reading,
  DEFAULT_CREDITS_PER_DAY,
  NO_MEDIA,
  OUTPUT_PLATFORMS,
  PRESETS,
  feedSchema,
  machineConfig,
  noticeOf,
  slugify,
} from "./model"
import { signatureFor } from "./signature"
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
  maxCreditsPerDay: DEFAULT_CREDITS_PER_DAY,
  voice: "",
  language: "en",
  mission: "",
  feeds: [],
  listen: true,
  everyMinutes: 60,
  image: false,
  media: NO_MEDIA,
  line: null,
  style: "plain",
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

  test("reads Atom, upgrades http links and drops any other scheme", () => {
    const items = parseFeed(
      `<feed><entry><title>Ok</title><id>1</id><link rel="alternate" href="https://x.test/ok"/></entry>
      <entry><title>Plain</title><link href="http://x.test/up"/></entry>
      <entry><title>Other</title><link href="ftp://x.test/no"/></entry></feed>`,
      "x",
      5
    )
    assert.deepEqual(
      items.map((i) => i.url),
      ["https://x.test/ok", "https://x.test/up"]
    )
  })

  test("posts without a title lead with their own words", () => {
    const [short, long] = parseFeed(
      `<rss><channel><item><link>https://bsky.app/profile/a/post/1</link>
      <description>Hello &amp; welcome</description><guid>1</guid></item>
      <item><link>https://bsky.app/profile/a/post/2</link><guid>2</guid>
      <description>${"word ".repeat(60)}</description></item></channel></rss>`,
      "bsky.app",
      5
    )
    assert.equal(short?.title, "Hello & welcome")
    assert.equal(short?.summary, "Hello & welcome")
    assert.ok(long!.title.length <= 121)
    assert.ok(long!.title.endsWith("word…"))
  })

  test("an entry with nothing to say is still dropped", () => {
    const xml = `<rss><item><link>https://x.test/1</link></item></rss>`
    assert.deepEqual(parseFeed(xml, "x", 5), [])
    assert.equal(entryCount(xml), 1)
    assert.equal(entryCount("<html><body>Blocked</body></html>"), 0)
  })

  test("decodes every entity, and tags that arrive escaped", () => {
    const [i] = parseFeed(
      `<rss><item><title>Caf&eacute; &mdash; caf&#233; &#x2019;24</title>
      <link>https://x.test/?a=1&amp;copy=2</link>
      <description>&lt;p&gt;caf&amp;eacute; &lt;a href="x"&gt;link&lt;/a&gt;&lt;/p&gt;</description>
      </item></rss>`,
      "x",
      5
    )
    assert.equal(i?.title, "Café — café ’24")
    assert.equal(i?.url, "https://x.test/?a=1&copy=2")
    assert.equal(i?.summary, "café link")
  })

  test("reads a YouTube description", () => {
    const [i] = parseFeed(
      `<feed><entry><title>Clip</title><link rel="alternate" href="https://youtu.be/a"/>
      <media:group><media:description>What it is</media:description></media:group></entry></feed>`,
      "x",
      5
    )
    assert.equal(i?.summary, "What it is")
  })

  test("reads the charset the page declares", () => {
    const bytes = (...codes: number[]) => Uint8Array.from(codes)
    const latin = bytes(0x63, 0x61, 0x66, 0xe9)
    assert.equal(decodeBody(latin, "text/xml; charset=ISO-8859-1"), "café")
    const prolog = new TextEncoder().encode(
      `<?xml version="1.0" encoding="windows-1252"?><a>`
    )
    const xml = new Uint8Array([
      ...prolog,
      0x92,
      ...new TextEncoder().encode("</a>"),
    ])
    assert.ok(decodeBody(xml, "text/xml").includes("’"))
    const sjis = bytes(0x93, 0xfa, 0x96, 0x7b)
    assert.equal(decodeBody(sjis, "text/html; charset=Shift_JIS"), "日本")
    assert.equal(decodeBody(new TextEncoder().encode("é"), null), "é")
    assert.equal(
      decodeBody(new TextEncoder().encode("é"), "text/xml; charset=nonsense"),
      "é"
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
      "fec0::1",
      "::7f00:1",
      "64:ff9b::a00:1",
      "2002:a00:1::",
      "100.64.0.1",
      "198.51.100.1",
      "203.0.113.1",
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

const SIG = "AI-written"

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
    assert.match(holdReason("Fine", "", []) ?? "", /cite/)
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
    assert.ok(!inboxBrief([item()]).includes("example.com"))
  })

  test("a brief with no memory reads as it always did", () => {
    assert.deepEqual(Object.keys(JSON.parse(inboxBrief([item()]))), [
      "inbox",
      "recent_posts",
    ])
  })

  test("posts fit each platform", () => {
    const long = "word ".repeat(100).trim()
    const url = `https://example.com/${"a".repeat(300)}`
    assert.ok(compose(long, null, "twitter", SIG).length <= 280)
    const x = compose(long, url, "twitter", SIG)
    assert.ok(x.endsWith(url))
    assert.ok(x.length - url.length + 23 <= 280)
    assert.equal(compose("Hi", url, "bluesky", SIG), `Hi\n\n${SIG}`)
    assert.ok(compose(long, "https://a.co/b", "bluesky", SIG).length <= 300)
    assert.equal(
      compose("Hi", "https://a.co/b", "instagram", SIG),
      `Hi\n\n${SIG}`
    )
  })

  test("no post can clip the signature away", () => {
    const bodies = [
      "Hi",
      "word ".repeat(1000),
      "🧑‍🚀".repeat(4000),
      "漫".repeat(4000),
    ]
    const links = [
      null,
      "https://a.co/b",
      `https://example.com/${"a".repeat(90)}`,
      `https://example.com/${"a".repeat(1900)}`,
    ]
    const size = (s: string) => [...new Intl.Segmenter().segment(s)].length
    for (const platform of OUTPUT_PLATFORMS)
      for (const body of bodies)
        for (const link of links) {
          const post = compose(body, link, platform, SIG)
          assert.ok(post.includes(`\n\n${SIG}`), platform)
          const counted =
            platform === "twitter" && link
              ? post.replace(link, "x".repeat(23))
              : post
          assert.ok(size(counted) <= LIMITS[platform], `${platform} over`)
        }
  })

  test("a link that leaves no room is dropped, not the words", () => {
    const url = `https://example.com/${"a".repeat(1900)}`
    assert.equal(compose("Hi", url, "threads", SIG), `Hi\n\n${SIG}`)
  })

  test("every language signs, and others sign in English", () => {
    assert.equal(signatureFor("en"), "AI-written")
    assert.equal(signatureFor("fr"), "Écrit par une IA")
    assert.equal(signatureFor("pt"), "AI-written")
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

describe("after a person edits a post", () => {
  const draft = {
    text: "Revenue grew 40%",
    evidence: "Revenue grew 40% in 2026",
    sources: [{ title: "T", url: "https://x.test", source: "x" }],
    signal: null,
  }

  test("unchanged words aren't checked again", () => {
    const held = { ...draft, text: "Revenue grew 45%" }
    assert.equal(reviewHold("Revenue grew 45%", held, "en"), null)
  })

  test("changed words are checked against the stored evidence", () => {
    assert.match(reviewHold("Revenue grew 45%", draft, "en") ?? "", /45%/)
    assert.equal(reviewHold("Revenue was up 40%", draft, "en"), null)
  })

  test("a wire draft stands on its signal, not an inbox item", () => {
    const wire = { ...draft, sources: [], signal: { id: "s" } }
    assert.equal(reviewHold("Revenue up 40%", wire, "en"), null)
    const uncited = { ...draft, sources: [] }
    assert.match(reviewHold("Revenue up 40%", uncited, "en") ?? "", /cite/)
  })
})

describe("a machine's day", () => {
  const limits = { dailyCap: 5, maxCreditsPerDay: 100 }
  const day = (posts: number, attempts: number, credits: number) => ({
    posts,
    attempts,
    credits,
  })

  test("the agent runs until something says stop", () => {
    assert.equal(budgetStop(day(4, 9, 99), limits, 1), null)
  })

  test("the cap counts posts", () => {
    assert.equal(budgetStop(day(5, 5, 0), limits, 1), "capped")
  })

  test("passes can't run forever: the ceiling is twice the cap", () => {
    assert.equal(attemptCeiling(5), 10)
    assert.equal(budgetStop(day(0, 10, 0), limits, 1), "ceiling")
  })

  test("the breaker goes first, so its notice shows", () => {
    assert.equal(budgetStop(day(5, 10, 100), limits, 1), "breaker")
  })

  test("dismissed, expired and held posts don't take up the cap", () => {
    const counted: readonly string[] = PUBLISHED_TRACK
    assert.equal(counted.includes("dismissed"), false)
    assert.equal(counted.includes("expired"), false)
    assert.equal(counted.includes("new"), true)
  })

  test("old machines get a default limit", () => {
    const { maxCreditsPerDay: _, ...saved } = config()
    assert.equal(
      machineConfig.parse(saved).maxCreditsPerDay,
      DEFAULT_CREDITS_PER_DAY
    )
  })
})

const sent = (o: Partial<PublishReceipt> = {}): PublishReceipt => ({
  accountId: "a",
  platform: "bluesky",
  username: "u",
  url: null,
  postId: "p",
  error: null,
  ...o,
})

describe("what counts as published", () => {
  const failed = sent({ postId: null, error: "No" })

  test("a public page doesn't hide failed accounts", () => {
    assert.equal(publishOutcome(true, 1, [failed]), false)
    assert.equal(publishOutcome(false, 1, [failed]), false)
  })

  test("a rejected post with an id didn't land", () => {
    assert.equal(publishOutcome(true, 1, [sent({ error: "Rejected" })]), false)
  })

  test("one account taking it is enough", () => {
    assert.equal(publishOutcome(false, 2, [failed, sent()]), true)
  })

  test("a page with no accounts counts, a machine with neither doesn't", () => {
    assert.equal(publishOutcome(true, 0, []), true)
    assert.equal(publishOutcome(false, 0, []), false)
  })
})

describe("memory", () => {
  const row = (
    status: MachineDraftRow["status"],
    text: string,
    o: Partial<MachineDraftRow> = {}
  ) =>
    ({
      text,
      status,
      receipts: [],
      sources: [{ title: `About ${text}`, url: "https://x.test", source: "x" }],
      signal: null,
      dismiss_reason: null,
      block_rule: null,
      ...o,
    }) as Pick<
      MachineDraftRow,
      | "text"
      | "status"
      | "receipts"
      | "sources"
      | "signal"
      | "dismiss_reason"
      | "block_rule"
    >

  test("only what reached someone counts as the outlet's voice", () => {
    const m = splitMemory([
      row("published", "out", { receipts: [sent()] }),
      row("published", "page"),
      row("published", "bounced", {
        receipts: [sent({ postId: null, error: "No" })],
      }),
      row("new", "waiting"),
      row("new", "held", { held: "It states 45%." }),
      row("approved", "queued"),
      row("failed", "broke"),
      row("expired", "stale"),
    ])
    assert.deepEqual(m.delivered, ["out", "page"])
    assert.deepEqual(m.inReview, [
      "About bounced",
      "About waiting",
      "About held",
      "About queued",
      "About broke",
      "About stale",
    ])
  })

  test("the agent's unchecked words never come back to it", () => {
    const brief = inboxBrief(
      [],
      splitMemory([row("new", "Secret claim", { sources: [] })])
    )
    assert.ok(!brief.includes("Secret claim"))
  })

  test("dismissed stories come back with their reason", () => {
    const m = splitMemory([
      row("dismissed", "x", { dismiss_reason: "dull" }),
      row("dismissed", "y"),
    ])
    assert.deepEqual(m.dismissed, [
      { story: "About x", reason: "dull" },
      { story: "About y", reason: null },
    ])
    assert.equal(m.inReview.length, 0)
    const brief = JSON.parse(inboxBrief([], m))
    assert.equal(brief.rejected_by_the_owner_do_not_repeat.length, 2)
  })
})

describe("the run ledger's inputs", () => {
  test("a pass keeps its reason, and an empty filing isn't a pass", () => {
    assert.deepEqual(passed("  Nothing new ", "p"), {
      decision: "passed",
      reason: "Nothing new",
      prompt: "p",
    })
    assert.equal(passed(undefined, "p").decision, "passed")
    assert.equal(fromTool({ text: " " }, [], "", "p").decision, "invalid")
    assert.equal(fromTool({ text: "Hi" }, [], "", "p").decision, "filed")
  })

  test("counts items per source", () => {
    assert.deepEqual(
      tally([{ source: "a" }, { source: "a" }, { source: "b" }]),
      {
        a: 2,
        b: 1,
      }
    )
  })

  test("notices are told from sentences", () => {
    assert.deepEqual(noticeOf("budget"), { notice: "budget", detail: "" })
    assert.deepEqual(noticeOf("unreadable:https://x.test/a"), {
      notice: "unreadable",
      detail: "https://x.test/a",
    })
    assert.equal(noticeOf("Couldn't read x: y."), null)
  })
})
