import { describe, expect, test } from "bun:test"

import { renderIssue } from "./mail"
import { isPublicationSlug, slugify, suggestSlug } from "./publication"
import { postProblems, withLink } from "./social"
import { zernioBody } from "./zernio.server"

describe("publication addresses", () => {
  test("slugs", () => {
    expect(isPublicationSlug("the-daily-cat")).toBe(true)
    expect(isPublicationSlug("ab")).toBe(false)
    expect(isPublicationSlug("-bad")).toBe(false)
    expect(isPublicationSlug("api")).toBe(false)
    expect(isPublicationSlug("Caps")).toBe(false)
    expect(slugify("Café au lait: déjà vu!")).toBe("cafe-au-lait-deja-vu")
    expect(slugify("a".repeat(90) + " b", 80).endsWith("-")).toBe(false)
    expect(isPublicationSlug(suggestSlug("!!!"))).toBe(true)
  })
})

describe("social posts", () => {
  test("limits per network", () => {
    expect(postProblems("x", "a".repeat(280))).toEqual([])
    expect(postProblems("x", "a".repeat(281))).toHaveLength(1)
    expect(postProblems("bluesky", "a".repeat(300))).toEqual([])
    expect(postProblems("linkedin", "")).toHaveLength(1)
    expect(postProblems("facebook", "Fine — but dashed")).toHaveLength(1)
  })

  test("the link is added once", () => {
    const url = "https://www.palmframe.com/n/a/b"
    expect(withLink("Hi", url)).toBe(`Hi\n\n${url}`)
    expect(withLink(`Hi ${url}`, url)).toBe(`Hi ${url}`)
  })

  test("Zernio requests", () => {
    const now = zernioBody({
      platform: "x",
      accountId: null,
      text: "Hello",
      imageUrl: "https://img/x.jpg",
      scheduledFor: null,
      idempotencyKey: "k",
    })
    expect(now).toMatchObject({
      content: "Hello",
      publishNow: true,
      platforms: [{ platform: "twitter" }],
      mediaItems: [{ type: "image", url: "https://img/x.jpg" }],
    })
    const later = zernioBody({
      platform: "linkedin",
      accountId: "acc",
      text: "Hi",
      imageUrl: null,
      scheduledFor: "2026-12-01T09:00:00.000Z",
      idempotencyKey: "k",
    })
    expect(later).toMatchObject({
      scheduledFor: "2026-12-01T09:00:00.000Z",
      platforms: [{ platform: "linkedin", accountId: "acc" }],
    })
    expect("publishNow" in later).toBe(false)
  })
})

describe("newsletter email", () => {
  const mail = renderIssue({
    publication: { name: "The <Cat> Times", tagline: "", accent: "#ff0000" },
    story: {
      title: 'Cats & "dogs"',
      dek: "A dek",
      body: "Para with [a link](https://example.com) and [bad](javascript:alert(1)).\n\n## Head\n\n- one\n- two",
      cover: null,
    },
    storyUrl: "https://www.palmframe.com/n/cat/cats",
    unsubscribeUrl: "https://www.palmframe.com/n/cat/unsubscribe?t=abc",
  })

  test("escapes and keeps only safe links", () => {
    expect(mail.html).toContain("The &lt;Cat&gt; Times")
    expect(mail.html).toContain("Cats &amp; &quot;dogs&quot;")
    expect(mail.html).toContain('href="https://example.com"')
    expect(mail.html).not.toContain("javascript:")
    expect(mail.html).toContain("<li")
  })

  test("both parts carry the story and the way out", () => {
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("https://www.palmframe.com/n/cat/cats")
      expect(part).toContain("unsubscribe?t=abc")
    }
    expect(mail.subject).toBe('Cats & "dogs"')
  })
})

test("long addresses stop at a word", () => {
  expect(
    slugify("Starship reaches orbit and deploys twenty six satellites", 40)
  ).toBe("starship-reaches-orbit-and-deploys")
})
