import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  MAX_COMPOSE_URL,
  composeLinks,
  discordMessage,
  encodeQuery,
  escapeMarkdown,
  parseWebhook,
  readOutcome,
  retryDelay,
  testMessage,
  xWeight,
} from "./discord"
import { LIMITS } from "./gate"

// Made up: the right shape, and no webhook anywhere.
const ID = "123456789012345678"
const TOKEN = "not-a-real-token_not-a-real-token_not-a-real-token"
const HOOK = `https://discord.com/api/webhooks/${ID}/${TOKEN}`

const SIGNATURE = "AI-written"
const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].length

const decoded = (url: string, name = "text") =>
  new URL(url).searchParams.get(name)!
const only = (links: ReturnType<typeof composeLinks>, target: string) =>
  links.find((l) => l.target === target)

describe("a Discord webhook URL", () => {
  test("both hosts are accepted, and come back without a trailing slash", () => {
    assert.equal(parseWebhook(HOOK)?.url, HOOK)
    assert.equal(parseWebhook(`  ${HOOK}/\n`)?.url, HOOK)
    const old = `https://discordapp.com/api/webhooks/${ID}/${TOKEN}`
    assert.equal(parseWebhook(old)?.url, old)
  })

  test("the hint comes from the id, and holds nothing of the token", () => {
    assert.equal(parseWebhook(HOOK)?.hint, "5678")
  })

  const refused: [string, string][] = [
    ["plain http", `http://discord.com/api/webhooks/${ID}/${TOKEN}`],
    [
      "a lookalike host",
      `https://discord.com.evil.test/api/webhooks/${ID}/${TOKEN}`,
    ],
    ["a suffix host", `https://evildiscord.com/api/webhooks/${ID}/${TOKEN}`],
    [
      "a user before the host",
      `https://discord.com@evil.test/api/webhooks/${ID}/${TOKEN}`,
    ],
    ["a password", `https://a:b@discord.com/api/webhooks/${ID}/${TOKEN}`],
    ["a port", `https://discord.com:8443/api/webhooks/${ID}/${TOKEN}`],
    [
      "the default port spelled out",
      `https://discord.com:443/api/webhooks/${ID}/${TOKEN}`,
    ],
    ["a subdomain", `https://canary.discord.com/api/webhooks/${ID}/${TOKEN}`],
    [
      "an internal address",
      `https://169.254.169.254/api/webhooks/${ID}/${TOKEN}`,
    ],
    ["localhost", `https://localhost/api/webhooks/${ID}/${TOKEN}`],
    ["another API path", `https://discord.com/api/v10/webhooks/${ID}/${TOKEN}`],
    [
      "a path climbing out",
      `https://discord.com/api/webhooks/../../users/${ID}/${TOKEN}`,
    ],
    [
      "an encoded dot",
      `https://discord.com/api/webhooks/%2e%2e/${ID}/${TOKEN}`,
    ],
    ["a longer path", `${HOOK}/messages/1`],
    ["a query", `${HOOK}?wait=true`],
    ["a fragment", `${HOOK}#x`],
    ["a tab in the host", `https://dis\tcord.com/api/webhooks/${ID}/${TOKEN}`],
    ["backslashes", `https:\\\\discord.com/api/webhooks/${ID}/${TOKEN}`],
    ["a newline before more text", `${HOOK}\nhttps://evil.test`],
    ["a short id", `https://discord.com/api/webhooks/123/${TOKEN}`],
    ["a short token", `https://discord.com/api/webhooks/${ID}/abc`],
    ["nothing", ""],
  ]
  for (const [name, url] of refused)
    test(`refuses ${name}`, () => assert.equal(parseWebhook(url), null))
})

describe("query encoding", () => {
  test("round-trips everything a URL or a Discord link could trip on", () => {
    const text =
      "50% off & more? #win a+b=c (yes) [x] 'q' *s* ~t~ !\nnext\tline"
    const url = `https://x.com/intent/post?text=${encodeQuery(text)}`
    assert.equal(decoded(url), text)
    assert.doesNotMatch(url.split("?")[1]!.slice(5), /[()!'*~&#+\s]/)
  })

  test("keeps accents, Japanese and emoji", () => {
    const text = "Écrit par une IA 日本語 👩‍👩‍👧"
    assert.equal(decodeURIComponent(encodeQuery(text)), text)
  })

  test("survives a lone surrogate", () => {
    assert.equal(decodeURIComponent(encodeQuery("a\ud83db")), "a�b")
  })
})

describe("X's count", () => {
  test("Latin counts one, CJK and emoji two, a link 23", () => {
    assert.equal(xWeight("abc é"), 5)
    assert.equal(xWeight("日本語"), 6)
    assert.equal(xWeight("😀"), 2)
    assert.equal(xWeight(`see https://example.com/${"a".repeat(200)}`), 27)
  })
})

describe("compose links", () => {
  const LINK = "https://example.com/story?a=1&b=2"
  const long = "The council approved the budget after a long debate. ".repeat(
    30
  )

  test("each platform gets the post with its signature and link", () => {
    const links = composeLinks({
      text: "Revenue grew 40%.",
      link: LINK,
      signature: SIGNATURE,
    })
    assert.deepEqual(
      links.map((l) => l.target),
      ["x", "bluesky", "threads", "linkedin", "reddit"]
    )
    const whole = `Revenue grew 40%.\n\n${SIGNATURE}\n${LINK}`
    assert.ok(
      only(links, "x")!.url.startsWith("https://x.com/intent/post?text=")
    )
    assert.equal(decoded(only(links, "x")!.url), whole)
    assert.ok(
      only(links, "bluesky")!.url.startsWith(
        "https://bsky.app/intent/compose?text="
      )
    )
    assert.equal(decoded(only(links, "bluesky")!.url), whole)
    assert.ok(
      only(links, "threads")!.url.startsWith(
        "https://www.threads.net/intent/post?text="
      )
    )
    assert.equal(decoded(only(links, "threads")!.url), whole)
  })

  test("LinkedIn shares the link, and only when there is one", () => {
    const withLink = composeLinks({
      text: "Hi",
      link: LINK,
      signature: SIGNATURE,
    })
    const url = only(withLink, "linkedin")!.url
    assert.ok(
      url.startsWith("https://www.linkedin.com/sharing/share-offsite/?url=")
    )
    assert.equal(decoded(url, "url"), LINK)
    assert.equal(
      only(
        composeLinks({ text: "Hi", link: null, signature: SIGNATURE }),
        "linkedin"
      ),
      undefined
    )
  })

  test("Reddit takes a link post, or a text post with no link", () => {
    const linked = only(
      composeLinks({ text: "Two\nlines", link: LINK, signature: SIGNATURE }),
      "reddit"
    )!.url
    assert.equal(decoded(linked, "url"), LINK)
    assert.equal(decoded(linked, "title"), `Two lines · ${SIGNATURE}`)
    const bare = only(
      composeLinks({ text: "Hi", link: null, signature: SIGNATURE }),
      "reddit"
    )!.url
    assert.equal(decoded(bare, "selftext"), "true")
    assert.equal(new URL(bare).searchParams.has("url"), false)
  })

  test("a link that isn't https goes nowhere", () => {
    const links = composeLinks({
      text: "Hi",
      link: "javascript:alert(1)",
      signature: SIGNATURE,
    })
    assert.equal(only(links, "linkedin"), undefined)
    assert.doesNotMatch(decoded(only(links, "x")!.url), /javascript/)
  })

  for (const language of ["Latin", "Japanese"]) {
    const text =
      language === "Latin"
        ? long
        : "予算案は長い議論の末に承認された。".repeat(40)
    test(`long ${language} text stays in every limit, signature intact`, () => {
      for (const link of [LINK, null]) {
        const links = composeLinks({ text, link, signature: SIGNATURE })
        const x = decoded(only(links, "x")!.url)
        const bluesky = decoded(only(links, "bluesky")!.url)
        const threads = decoded(only(links, "threads")!.url)
        const title = decoded(only(links, "reddit")!.url, "title")
        assert.ok(xWeight(x) <= LIMITS.twitter, `x ${xWeight(x)}`)
        assert.ok(graphemes(bluesky) <= LIMITS.bluesky)
        assert.ok(graphemes(threads) <= LIMITS.threads)
        assert.ok(graphemes(title) <= 300)
        assert.doesNotMatch(title, /\n/)
        for (const composed of [x, bluesky, threads, title])
          assert.match(composed, new RegExp(SIGNATURE))
        for (const l of links) assert.ok(l.url.length <= MAX_COMPOSE_URL)
      }
    })
  }

  test("a sign-off with a licence credit is kept whole as well", () => {
    const signature = `${SIGNATURE} · Data: openFDA (CC0)`
    for (const l of composeLinks({ text: long, link: LINK, signature }))
      if (l.target !== "linkedin")
        assert.ok(
          decodeURIComponent(l.url).includes("Data: openFDA (CC0)"),
          l.target
        )
  })

  test("no link rather than one without the signature", () => {
    const links = composeLinks({
      text: "Hi",
      link: null,
      signature: "署".repeat(1200),
    })
    assert.equal(only(links, "x"), undefined)
  })
})

describe("the Discord message", () => {
  const post = {
    text: "Revenue grew 40%.",
    link: "https://example.com/a_(b)",
    signature: SIGNATURE,
    machine: "Desk",
    language: "en",
  }
  const footer = (m: ReturnType<typeof discordMessage>) =>
    (m.embeds[0] as { footer: { text: string } }).footer.text
  const size = (m: ReturnType<typeof discordMessage>) =>
    m.embeds.reduce(
      (n, e) =>
        n +
        e.description.length +
        ("title" in e ? (e.title?.length ?? 0) : 0) +
        ("footer" in e ? (e.footer?.text.length ?? 0) : 0),
      0
    )

  test("can't ping anyone, whatever the post says", () => {
    const message = discordMessage({ ...post, text: "@everyone <@123> @here" })
    assert.deepEqual(message.allowed_mentions, { parse: [] })
    assert.deepEqual(testMessage("@everyone", "en").allowed_mentions, {
      parse: [],
    })
    assert.equal("content" in message, false)
    assert.match(message.embeds[0]!.description, /\\<@123\\>/)
  })

  test("the post is shown with its signature, as plain words", () => {
    const message = discordMessage({
      ...post,
      text: "[Click](https://evil.test) **now** # `x`",
    })
    const body = message.embeds[0]!.description
    assert.match(body, /AI-written/)
    assert.ok(body.includes("\\[Click\\]\\(https://evil.test\\)"))
    assert.equal(escapeMarkdown("a_b"), "a\\_b")
  })

  test("a bracket in the source can't break out of its link", () => {
    const body = discordMessage(post).embeds[0]!.description
    assert.ok(body.endsWith("(https://example.com/a_%28b%29)"))
  })

  test("carries one link per platform, each a masked link that ends where it should", () => {
    const links = discordMessage(post).embeds.slice(1)
    const text = links.map((e) => e.description).join("\n")
    for (const name of ["X", "Bluesky", "Threads", "LinkedIn", "Reddit"])
      assert.match(
        text,
        new RegExp(`^\\[${name}\\]\\(https://[^()\\s]+\\)$`, "m")
      )
  })

  test("says when LinkedIn leaves the signature to the person", () => {
    assert.match(footer(discordMessage(post)), /AI-written line/)
    assert.doesNotMatch(
      footer(discordMessage({ ...post, link: null })),
      /LinkedIn/
    )
  })

  test("speaks the machine's language, and English for any other", () => {
    assert.match(footer(discordMessage({ ...post, language: "fr" })), /fenêtre/)
    assert.match(
      footer(discordMessage({ ...post, language: "nl" })),
      /compose window/
    )
  })

  test("stays inside Discord's limits however long the post", () => {
    for (const text of [
      "予算案は長い議論の末に承認された。".repeat(40),
      "(a) ".repeat(300),
    ]) {
      const message = discordMessage({ ...post, text })
      assert.ok(size(message) <= 6000, `total ${size(message)}`)
      assert.ok(message.embeds.length <= 10)
      for (const e of message.embeds) assert.ok(e.description.length <= 4096)
      assert.match(message.embeds[0]!.description, /AI-written/)
    }
  })

  test("a test message can't be turned into markup by a machine's name", () => {
    assert.match(testMessage("[x](y)", "en").content, /\\\[x\\\]\\\(y\\\)/)
  })
})

describe("what Discord answers", () => {
  const answer = (o: Partial<Parameters<typeof readOutcome>[0]>) =>
    readOutcome({
      status: 200,
      retryAfter: null,
      global: false,
      text: "",
      ...o,
    })

  test("a send gives the message's id", () => {
    assert.deepEqual(answer({ text: '{"id":"999"}' }), {
      kind: "sent",
      messageId: "999",
    })
    assert.deepEqual(answer({ status: 204 }), { kind: "sent", messageId: null })
  })

  test("429 waits as long as Retry-After says", () => {
    assert.deepEqual(answer({ status: 429, retryAfter: "7" }), {
      kind: "wait",
      ms: 7000,
      global: false,
    })
    assert.deepEqual(
      answer({ status: 429, retryAfter: "0.25", global: true }),
      {
        kind: "wait",
        ms: 1000,
        global: true,
      }
    )
  })

  test("429 falls back on the body, then on a default, and is capped", () => {
    const wait = (o: Parameters<typeof answer>[0]) => {
      const r = answer({ status: 429, ...o })
      return r.kind === "wait" ? r.ms : null
    }
    assert.equal(wait({ text: '{"retry_after":1.5}' }), 1500)
    assert.equal(wait({ retryAfter: "soon" }), 60_000)
    assert.equal(wait({ retryAfter: "99999999" }), 3_600_000)
  })

  test("a webhook that's gone is told apart from a message that's gone", () => {
    assert.equal(answer({ status: 404 }).kind, "gone")
    assert.equal(answer({ status: 404, text: '{"code":10015}' }).kind, "gone")
    assert.equal(answer({ status: 401 }).kind, "gone")
    assert.equal(
      answer({ status: 404, text: '{"code":10008}' }).kind,
      "no_message"
    )
  })

  test("a bad message isn't retried, a server error is, and a redirect isn't followed", () => {
    assert.equal(answer({ status: 400 }).kind, "refused")
    assert.equal(answer({ status: 302 }).kind, "refused")
    assert.equal(answer({ status: 503 }).kind, "retry")
  })

  test("retries back off", () => {
    assert.deepEqual(
      [1, 2, 3, 4].map(retryDelay),
      [300_000, 600_000, 1_200_000, 2_400_000]
    )
  })
})
