import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"

import { Vale } from "vale-ts"

import { VALE_INI, VALE_RULES } from "@/lib/deepdive/vale/rules"
import { compose, LIMITS } from "@/lib/machines/gate"

import { FORMATS, type FormatId, type Part, type Rendition } from "../model"
import {
  blog,
  DESCRIPTION_MAX,
  graphemes,
  linksIn,
  renditionText,
  SEO_TITLE_MAX,
} from "./blog"
import { COMMENT_MAX, FOLD, linkedin } from "./linkedin"
import { PREVIEW_MAX, SUBJECT_MAX, substack } from "./substack"
import { MAX_POSTS, X_LINK, xLength, xThread } from "./x_thread"

const FAMILY = "👨‍👩‍👧‍👦"
const FLAG = "🇫🇷"
const LONG_LINK = `https://example.com/${"a".repeat(200)}`

const parts = (...texts: string[]): Part[] => texts.map((text) => ({ text }))
const words = (n: number, word = "margin") => Array(n).fill(word).join(" ")
const sentence = (i: number) =>
  `Mara sells ${i + 3} kinds of screw to 900 shops, and each box clears about $4 by her estimate.`

const has = (problems: string[], pattern: RegExp) =>
  assert.ok(
    problems.some((p) => pattern.test(p)),
    `Expected ${pattern} in ${JSON.stringify(problems)}`
  )
const none = (problems: string[], pattern: RegExp) =>
  assert.ok(
    !problems.some((p) => pattern.test(p)),
    `Unexpected ${pattern} in ${JSON.stringify(problems)}`
  )

const goodBlog = (): Rendition => ({
  format: "blog",
  title: "The $2M screw shop nobody in Ohio has heard of",
  parts: parts(
    words(300),
    "## $40 in, $31 out",
    words(300),
    "## What could kill it",
    words(100)
  ),
  meta: {
    seoTitle: "How Acme Screws bills about $2M a year",
    metaDescription:
      "Acme Screws sells one part to 900 shops. Here is the math behind its estimated $2M a year, and what could end it.",
    slug: "acme-screws-business-model",
  },
})

const goodSubstack = (): Rendition => ({
  format: "substack",
  title: "One screw, 900 customers",
  parts: [
    { text: "I read about a lot of shops. You should hear about this one." },
    { text: "## The hook" },
    { text: words(250) },
    { asset: { kind: "illustration", scene: "A box", alt: "A box" }, text: "" },
    { text: "## How the money works" },
    { text: words(250) },
    {
      text: "That's it for this week. Steal the one-part idea. See you next time.",
    },
  ],
  meta: {
    subject: "One screw, about $2M a year",
    previewText:
      "Three people. 900 customers. And one thing that could end it.",
  },
})

const goodLinkedin = (): Rendition => ({
  format: "linkedin",
  title: "Screw shop",
  parts: parts(
    "A 3-person shop bills about $2M a year.\nIt sells one screw.",
    ...Array.from({ length: 6 }, (_, i) => sentence(i)),
    "The idea to steal: own one part nobody else wants to stock."
  ),
  meta: {
    firstComment:
      "The full story, with the math: https://example.com/acme-screws",
  },
})

const goodThread = (count = 6): Rendition => ({
  format: "x_thread",
  title: "Screw shop",
  parts: parts(
    "A 3-person shop bills about $2M a year, by my estimate. It sells one screw.",
    ...Array.from({ length: count - 2 }, (_, i) => sentence(i)),
    "Own one part nobody else wants to stock. Full story: https://example.com/acme"
  ),
  meta: {},
})

const clean = {
  blog: goodBlog,
  substack: goodSubstack,
  linkedin: goodLinkedin,
  x_thread: goodThread,
}
const definitions = { blog, substack, linkedin, x_thread: xThread }
const ids = Object.keys(definitions) as (keyof typeof definitions)[]

describe("every text format", () => {
  for (const id of ids) {
    const definition = definitions[id]
    const good = clean[id]

    test(`${id}: a realistic rendition passes`, () => {
      assert.equal(definition.id, id)
      assert.ok(FORMATS.includes(id as FormatId))
      assert.deepEqual(definition.check(good()), { findings: [], problems: [] })
    })

    test(`${id}: the brief keeps estimates and caveats, and names nobody`, () => {
      assert.match(definition.brief, /estimate/i)
      assert.match(definition.brief, /caveat/i)
      assert.match(definition.brief, /turn a claim into a fact/)
      assert.doesNotMatch(definition.brief, /Sam Parr|Hustle/i)
      assert.doesNotMatch(definition.brief, /—/)
    })

    test(`${id}: the wrong format id is a problem`, () => {
      has(
        definition.check({ ...good(), format: "youtube" }).problems,
        /should be/
      )
    })

    test(`${id}: no parts and blank titles are problems, not crashes`, () => {
      const { problems } = definition.check({
        ...good(),
        title: "  ",
        parts: [],
      })
      has(problems, /title is empty/)
      has(problems, /no parts/)
    })

    test(`${id}: blank and emoji-only parts are problems`, () => {
      const r = good()
      r.parts.splice(1, 0, { text: " \n " }, { text: `​${FAMILY}` })
      const { problems } = definition.check(r)
      has(problems, /Part 2 has no words/)
      has(problems, /Part 3 has no words/)
    })

    test(`${id}: leftovers and style sources are caught anywhere`, () => {
      const r = good()
      r.parts[0]!.text += " Read more at {{link}}."
      has(definition.check(r).problems, /placeholder/)
      for (const name of [
        "Sam Parr",
        "The Hustle",
        "sam-parr",
        "thehustle.co",
      ]) {
        const named = good()
        named.meta.note = `As ${name} would say`
        has(definition.check(named).problems, /never appear in print/)
      }
    })

    test(`${id}: ordinary uses of the word hustle are fine`, () => {
      const r = good()
      r.parts[0]!.text += " Night shifts are the hustle of this trade."
      none(definition.check(r).problems, /never appear in print/)
    })
  }
})

describe("blog", () => {
  test("article length comes from the deep dive limits", () => {
    const short = goodBlog()
    short.parts = parts("## One", "## Two", words(100))
    has(blog.check(short).problems, /words, the article needs 600/)
    const long = goodBlog()
    long.parts.push({ text: words(1000) })
    has(blog.check(long).problems, /words, cut to 1500/)
  })

  test("requires every search field", () => {
    const { problems } = blog.check({ ...goodBlog(), meta: {} })
    has(problems, /meta\.seoTitle is missing/)
    has(problems, /meta\.metaDescription is missing/)
    has(problems, /meta\.slug is missing/)
  })

  test("whitespace does not count as a filled field", () => {
    const r = goodBlog()
    r.meta.seoTitle = "   "
    has(blog.check(r).problems, /meta\.seoTitle is missing/)
  })

  test("SEO title and description limits count graphemes", () => {
    const r = goodBlog()
    r.meta.seoTitle = "x".repeat(SEO_TITLE_MAX)
    r.meta.metaDescription = `a${FAMILY.repeat(DESCRIPTION_MAX - 1)}`
    assert.deepEqual(blog.check(r).problems, [])
    r.meta.seoTitle += "x"
    r.meta.metaDescription += FAMILY
    has(blog.check(r).problems, /SEO title is 61 characters, cut it to 60/)
    has(blog.check(r).problems, /meta description is 161 characters/)
  })

  test("a thin meta description is a problem", () => {
    const r = goodBlog()
    r.meta.metaDescription = "A screw shop."
    has(blog.check(r).problems, /write at least 70/)
  })

  test("rejects slugs that wouldn't survive a URL", () => {
    for (const slug of [
      "Acme-Screws",
      "acme screws",
      "-acme",
      "acme--screws",
      "café",
    ]) {
      const r = goodBlog()
      r.meta.slug = slug
      has(blog.check(r).problems, /slug .* must use only/)
    }
  })

  test("subheads: too few, too many, and a stray H1", () => {
    const flat = goodBlog()
    flat.parts = parts(words(700))
    has(blog.check(flat).problems, /0 subheads/)
    const busy = goodBlog()
    busy.parts.push(...parts("## A", "## B", "## C"))
    has(blog.check(busy).problems, /5 subheads, merge down to 4/)
    const h1 = goodBlog()
    h1.parts.unshift({ text: "# Same title again" })
    has(blog.check(h1).problems, /Remove the "# " heading/)
  })

  test("a whole article in one part is read the same way", () => {
    const r = goodBlog()
    r.parts = parts(r.parts.map((p) => p.text).join("\n\n"))
    assert.deepEqual(blog.check(r).problems, [])
  })

  test("a figure with no caption can stand alone as a part", () => {
    const r = goodBlog()
    r.parts.splice(1, 0, {
      text: "",
      asset: { kind: "illustration", scene: "A box", alt: "A box" },
    })
    assert.deepEqual(blog.check(r).problems, [])
  })
})

describe("substack", () => {
  test("requires subject and preview", () => {
    const { problems } = substack.check({ ...goodSubstack(), meta: {} })
    has(problems, /meta\.subject is missing/)
    has(problems, /meta\.previewText is missing/)
  })

  test("subject and preview limits count graphemes", () => {
    const r = goodSubstack()
    r.meta.subject = `a${FLAG.repeat(SUBJECT_MAX - 1)}`
    r.meta.previewText = `b${FLAG.repeat(PREVIEW_MAX - 1)}`
    assert.deepEqual(substack.check(r).problems, [])
    r.meta.subject += FLAG
    r.meta.previewText += FLAG
    has(substack.check(r).problems, /subject line is 61 characters/)
    has(substack.check(r).problems, /preview text is 141 characters/)
  })

  test("preview can't repeat the subject", () => {
    const r = goodSubstack()
    r.meta.previewText = `  ${r.meta.subject!.toUpperCase()} `
    has(substack.check(r).problems, /repeats the subject/)
  })

  test("the opener comes first, alone, and sounds like a person", () => {
    const headed = goodSubstack()
    headed.parts.shift()
    has(substack.check(headed).problems, /personal opener alone/)
    const cold = goodSubstack()
    cold.parts[0]!.text = "Acme Screws makes one part."
    has(substack.check(cold).problems, /reads like an article/)
    const long = goodSubstack()
    long.parts[0]!.text = `I think ${words(130)}`
    has(substack.check(long).problems, /opener is 132 words/)
  })

  test("needs a sign-off in its own last part", () => {
    const r = goodSubstack()
    r.parts.pop()
    has(substack.check(r).problems, /End with a sign-off/)
    const whole = goodSubstack()
    whole.parts = parts(whole.parts.map((p) => p.text).join("\n\n"))
    const { problems } = substack.check(whole)
    has(problems, /Split the edition/)
    has(problems, /personal opener alone/)
  })

  test("needs at least two sections and at most five", () => {
    const one = goodSubstack()
    one.parts.splice(1, 1)
    has(substack.check(one).problems, /1 sections/)
    const many = goodSubstack()
    many.parts.splice(2, 0, ...parts("## A", "## B", "## C", "## D"))
    has(substack.check(many).problems, /6 sections/)
  })

  test("length limits apply to the edition", () => {
    const thin = goodSubstack()
    thin.parts = thin.parts.filter((p) => !p.text.startsWith("margin"))
    has(substack.check(thin).problems, /write at least 400/)
    const fat = goodSubstack()
    fat.parts.splice(2, 0, { text: words(800) })
    has(substack.check(fat).problems, /cut to 1200/)
  })

  test("things that don't paste are named", () => {
    const traps: [string, RegExp][] = [
      ['<div class="x">Hi</div>', /HTML/],
      ["| a | b |\n| 1 | 2 |", /a table/],
      ["A claim.[^1]", /footnote/],
      ["See [the site][1].", /reference-style/],
      ["[1]: https://example.com", /reference-style/],
      ["![chart](https://example.com/a.png)", /inline image/],
    ]
    for (const [text, name] of traps) {
      const r = goodSubstack()
      r.parts[2]!.text += `\n\n${text}`
      has(substack.check(r).problems, name)
    }
  })

  test("the Markdown Substack keeps is left alone", () => {
    const r = goodSubstack()
    r.parts[2]!.text +=
      "\n\n- **Bold** in a list\n- [An inline link](https://example.com)\n\n> A quote\n\n<https://example.com>\n\nCosts <$5 and >$2."
    assert.deepEqual(substack.check(r).problems, [])
  })
})

describe("linkedin", () => {
  test("the limit is LinkedIn's own and counts the blank lines", () => {
    const line = "x".repeat(198)
    const r = goodLinkedin()
    r.parts = parts("Short hook.", "Second line.", ...Array(15).fill(line))
    const over = graphemes(r.parts.map((p) => p.text).join("\n\n"))
    assert.ok(over > LIMITS.linkedin)
    has(
      linkedin.check(r).problems,
      new RegExp(`The post is ${over} characters, cut`)
    )

    r.parts = parts("Short hook.", ...Array(14).fill(line))
    r.parts.push({
      text: "x".repeat(
        LIMITS.linkedin - graphemes(r.parts.map((p) => p.text).join("\n\n")) - 2
      ),
    })
    none(linkedin.check(r).problems, /The post is/)
  })

  test("emoji count once, not by code unit", () => {
    const r = goodLinkedin()
    const line = FAMILY.repeat(190)
    r.parts = parts("Short hook.", "Second line.", ...Array(14).fill(line))
    assert.ok(r.parts.map((p) => p.text).join("").length > LIMITS.linkedin)
    none(linkedin.check(r).problems, /The post is/)
    none(linkedin.check(r).problems, /lines run past/)
  })

  test("a thin post is a problem", () => {
    const r = goodLinkedin()
    r.parts = parts("Short hook.\nSecond line.")
    has(linkedin.check(r).problems, /Write at least 300/)
  })

  test("the first two lines must fit above the fold", () => {
    const r = goodLinkedin()
    r.parts[0]!.text = `${"x".repeat(120)}\n${"y".repeat(FOLD - 119)}`
    has(linkedin.check(r).problems, /first two lines run 211/)
    r.parts[0]!.text = `${"x".repeat(120)}\n${"y".repeat(FOLD - 120)}`
    none(linkedin.check(r).problems, /first two lines/)
  })

  test("lines count across parts, skipping blanks", () => {
    const r = goodLinkedin()
    r.parts[1]!.text = `\n\n${"x".repeat(199)}\n\n${"y".repeat(50)}`
    r.parts[0]!.text = `Hook${"!".repeat(12)}`
    has(linkedin.check(r).problems, /first two lines run 215/)
  })

  test("one block is a problem, and so are long lines", () => {
    const wall = goodLinkedin()
    wall.parts = parts(words(60))
    has(linkedin.check(wall).problems, /Break the post into lines/)
    const r = goodLinkedin()
    r.parts[2]!.text = words(40)
    has(linkedin.check(r).problems, /1 lines run past 200/)
  })

  test("a link in the post moves to the first comment", () => {
    for (const link of [
      "https://example.com/a",
      "example.com",
      "www.acme.io/x",
    ]) {
      const r = goodLinkedin()
      r.parts[2]!.text += ` Read it at ${link}.`
      has(linkedin.check(r).problems, /to meta\.firstComment/)
    }
  })

  test("the first comment must exist, carry an https link and fit", () => {
    const empty = goodLinkedin()
    empty.meta = {}
    has(linkedin.check(empty).problems, /meta\.firstComment is missing/)
    for (const firstComment of [
      "Read the full story.",
      "Read it at example.com/acme",
      "Read it at http://example.com/acme",
    ]) {
      has(
        linkedin.check({ ...goodLinkedin(), meta: { firstComment } }).problems,
        /full https:\/\/ link/
      )
    }
    const long = goodLinkedin()
    long.meta.firstComment = `${"x".repeat(COMMENT_MAX)} https://example.com`
    has(linkedin.check(long).problems, /first comment is \d+ characters/)
  })

  test("hashtags: a few at the end, none above the fold, and meta counts", () => {
    const tagged = goodLinkedin()
    tagged.parts.push({ text: "#Manufacturing #SmallBusiness #Margins" })
    assert.deepEqual(linkedin.check(tagged).problems, [])

    const spam = goodLinkedin()
    spam.parts.push({ text: "#a1 #b2 #c3 #d4" })
    has(linkedin.check(spam).problems, /4 hashtags/)

    const beside = goodLinkedin()
    beside.parts.push({ text: "#a1 #b2" })
    beside.meta.hashtags = "#c3 #d4"
    has(linkedin.check(beside).problems, /4 hashtags/)

    const high = goodLinkedin()
    high.parts[0]!.text = "Hook #business\nSecond line."
    has(linkedin.check(high).problems, /Move hashtags/)
  })

  test("C# and #1 in a word are not spam, and URL fragments aren't tags", () => {
    const r = goodLinkedin()
    r.parts.push({ text: "They rewrote it in C# and F#. R&D#1 stayed." })
    r.meta.firstComment = "Here: https://example.com/a#one#two#three#four"
    none(linkedin.check(r).problems, /hashtags/)
  })

  test("Markdown prints raw, so it's a problem", () => {
    for (const text of [
      "**Bold**",
      "## Heading",
      "[site](https://example.com)",
    ]) {
      const r = goodLinkedin()
      r.parts[2]!.text = text
      has(linkedin.check(r).problems, /Remove the Markdown/)
    }
  })
})

describe("x_thread", () => {
  test("a link costs 23 whatever its length", () => {
    assert.equal(xLength(LONG_LINK), X_LINK)
    assert.equal(xLength("https://x.co"), X_LINK)
    assert.equal(xLength(`See ${LONG_LINK} and ${LONG_LINK}`), 4 + 23 + 5 + 23)
  })

  test("bare domains cost 23 too, and emails and decimals don't", () => {
    assert.equal(xLength("example.com/a/b"), X_LINK)
    assert.equal(xLength("me@example.com"), 14)
    assert.equal(xLength("Up 3.5 percent"), 14)
    assert.equal(xLength("example.community"), 17)
  })

  test("punctuation after a link is charged as text", () => {
    assert.equal(xLength("(https://example.com/a)."), 1 + X_LINK + 2)
    assert.deepEqual(linksIn("At https://example.com/a, then"), [
      "https://example.com/a",
    ])
  })

  test("emoji count as one grapheme", () => {
    assert.equal(xLength(FAMILY), 1)
    assert.equal(xLength(FLAG), 1)
    assert.equal(xLength("👍🏽"), 1)
    assert.equal(xLength("é"), 1)
    assert.ok(FAMILY.length > 1)
  })

  test("agrees with compose at the limit, so X_LINK can't drift", () => {
    const words = "x".repeat(LIMITS.twitter - X_LINK - 2)
    const post = compose(words, LONG_LINK, "twitter")
    assert.equal(post, `${words}\n\n${LONG_LINK}`)
    assert.equal(xLength(post), LIMITS.twitter)
    const clipped = compose(`${words}x`, LONG_LINK, "twitter")
    assert.ok(clipped.includes("…"))
    assert.equal(xLength(clipped), LIMITS.twitter)
  })

  test("a post over the limit is named with how much to cut", () => {
    const r = goodThread()
    r.parts[2]!.text = "x".repeat(LIMITS.twitter - X_LINK) + ` ${LONG_LINK}`
    has(
      xThread.check(r).problems,
      /Post 3 is 281 characters with links at 23, cut 1/
    )
  })

  test("a long raw link that fits at 23 passes", () => {
    const r = goodThread()
    r.parts[2]!.text = "x".repeat(LIMITS.twitter - X_LINK - 1) + ` ${LONG_LINK}`
    assert.deepEqual(xThread.check(r).problems, [])
  })

  test("280 family emoji fit, 281 don't", () => {
    const r = goodThread()
    r.parts[2]!.text = `a${FAMILY.repeat(279)}`
    assert.deepEqual(xThread.check(r).problems, [])
    r.parts[2]!.text += FAMILY
    has(xThread.check(r).problems, /Post 3 is 281/)
  })

  test("thread length bounds, ignoring blank posts", () => {
    assert.deepEqual(xThread.check(goodThread(5)).problems, [])
    assert.deepEqual(xThread.check(goodThread(MAX_POSTS)).problems, [])
    has(xThread.check(goodThread(4)).problems, /4 posts/)
    has(xThread.check(goodThread(13)).problems, /13 posts, cut to 12/)
    const padded = goodThread(5)
    padded.parts = padded.parts.slice(0, 4).concat({ text: "  " })
    has(xThread.check(padded).problems, /4 posts/)
  })

  test("an image can't stand in for a post", () => {
    const r = goodThread()
    r.parts[2] = {
      text: "",
      asset: { kind: "illustration", scene: "A box", alt: "A box" },
    }
    has(xThread.check(r).problems, /Part 3 has no words/)
  })

  test("the hook carries no link and no thread label", () => {
    const linked = goodThread()
    linked.parts[0]!.text += " https://example.com"
    has(xThread.check(linked).problems, /out of the first post/)
    for (const hook of [
      "A thread on a screw shop",
      "Thread: screws",
      "1/ Thread on screws",
      "This shop 🧵",
    ]) {
      const r = goodThread()
      r.parts[0]!.text = hook
      has(xThread.check(r).problems, /"thread" label/)
    }
    const fine = goodThread()
    fine.parts[0]!.text =
      "Threaded screws made Mara about $2M, by her estimate."
    assert.deepEqual(xThread.check(fine).problems, [])
  })

  test("a clipped post is flagged, since compose's ellipsis can eat a caveat", () => {
    const r = goodThread()
    r.parts[2]!.text = compose(
      `About $2M a year. ${"x".repeat(300)}`,
      null,
      "twitter"
    )
    has(xThread.check(r).problems, /Post 3 trails off/)
    r.parts[2]!.text = "This one waits..."
    has(xThread.check(r).problems, /Post 3 trails off/)
  })

  test("duplicate posts are caught", () => {
    const r = goodThread()
    r.parts[3]!.text = r.parts[1]!.text
    has(xThread.check(r).problems, /Post 4 repeats post 2/)
  })

  test("numbering is optional but must be whole and right", () => {
    const numbered = (labels: string[]) => {
      const r = goodThread(labels.length)
      r.parts.forEach((p, i) => (p.text = `${labels[i]} ${p.text}`.trim()))
      return xThread.check(r).problems
    }
    assert.deepEqual(numbered(["1/", "2/", "3/", "4/", "5/"]), [])
    assert.deepEqual(numbered(["1/5", "2/5", "3/5", "4/5", "5/5"]), [])
    assert.deepEqual(
      numbered(["(1/5)", "(2/5)", "(3/5)", "(4/5)", "(5/5)"]),
      []
    )
    has(numbered(["1/", "2/", "", "4/", "5/"]), /Post 3 breaks the numbering/)
    has(numbered(["1/", "2/", "4/", "5/", "6/"]), /Post 3 breaks the numbering/)
    has(
      numbered(["1/6", "2/6", "3/6", "4/6", "5/6"]),
      /says 1\/6, but the thread has 5/
    )
  })

  test("a phrase that looks like numbering isn't", () => {
    const r = goodThread()
    r.parts[3]!.text = "24/7 support is what the customers pay for, Mara says."
    assert.deepEqual(xThread.check(r).problems, [])
  })

  test("a post that is only its number has nothing in it", () => {
    const r = goodThread(5)
    r.parts.forEach((p, i) => {
      p.text = `${i + 1}/ ${p.text}`
    })
    r.parts[2]!.text = "3/"
    has(xThread.check(r).problems, /Post 3 is only a number/)
  })

  test("hashtags and Markdown", () => {
    const tags = goodThread()
    tags.parts[1]!.text += " #a #b"
    tags.parts[2]!.text += " #c"
    has(xThread.check(tags).problems, /3 hashtags/)
    const bold = goodThread()
    bold.parts[1]!.text = "**Bold** claim"
    has(xThread.check(bold).problems, /Remove the Markdown/)
  })

  test("the thread reads through compose untouched when it fits", () => {
    for (const { text } of goodThread(MAX_POSTS).parts)
      assert.equal(compose(text, null, "twitter"), text)
  })
})

describe("renditionText", () => {
  test("gives Vale the title, the body and the prose in meta", () => {
    const text = renditionText({
      format: "substack",
      title: " The title ",
      parts: [
        { text: " One. " },
        { text: "" },
        { text: "", asset: { kind: "illustration", scene: "s", alt: "a" } },
        { text: "Two." },
      ],
      meta: {
        subject: "The subject",
        previewText: "The preview",
        slug: "the-slug",
      },
    })
    assert.equal(
      text,
      "# The title\n\nOne.\n\nTwo.\n\nThe subject\n\nThe preview"
    )
  })

  test("copes with an empty rendition", () => {
    assert.equal(
      renditionText({ format: "blog", title: "", parts: [], meta: {} }),
      ""
    )
  })

  test("marks bare links as code and leaves full ones alone", () => {
    const text = renditionText({
      format: "linkedin",
      title: "T",
      parts: parts("Read example.com/a or https://example.com/b."),
      meta: {},
    })
    assert.equal(text, "# T\n\nRead `example.com/a` or https://example.com/b.")
  })
})

describe("with real Vale", () => {
  const lint = async (markdown: string) => {
    const styles = mkdtempSync(join(tmpdir(), "formats-vale-"))
    mkdirSync(join(styles, "Hustle"))
    const rules = {
      ...VALE_RULES,
      ...linkedin.valeRules,
      ...xThread.valeRules,
    }
    for (const [file, rule] of Object.entries(rules))
      writeFileSync(join(styles, "Hustle", file), rule)
    const vale = await Vale.fromString(VALE_INI(styles))
    return vale
      .lintString(markdown, { path: "rendition.md" })
      .flatMap((file) => file.sortedAlerts())
      .filter((alert) => alert.severity === "error")
      .map((alert) => alert.check)
  }

  test("the format rules load and fire", async () => {
    const found = await lint(
      "Agree?\n\nFollow for more. Thread below.\n\nThoughts?"
    )
    assert.ok(found.includes("Hustle.LinkedInBait"))
    assert.ok(found.includes("Hustle.ThreadBait"))
  })

  test("words inside links stay out of it, words in meta don't", async () => {
    const found = await lint(
      renditionText({
        format: "linkedin",
        title: "Plain",
        parts: parts(
          "Read example.com/solutions and https://example.com/seamless too."
        ),
        meta: { firstComment: "Unlock the story." },
      })
    )
    assert.deepEqual(found, ["Hustle.Corporate"])
  })

  test("a word that merely contains bait is fine", async () => {
    assert.deepEqual(await lint("Do you disagree? She does."), [])
  })
})
