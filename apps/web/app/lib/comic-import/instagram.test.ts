import { describe, expect, test } from "bun:test"

import {
  fromFeedItem,
  fromPost,
  isInstagramImageUrl,
  parseInstagramSource,
  proxied,
} from "./instagram"

const cdn = (name: string) =>
  `https://scontent-dfw5-1.cdninstagram.com/v/t51/${name}.jpg?stp=x&oh=sig`

describe("parseInstagramSource", () => {
  test("reads handles and profile links as an account", () => {
    for (const input of [
      "@Some.Artist",
      "some.artist",
      " https://www.instagram.com/some.artist/ ",
      "instagram.com/some.artist?igsh=abc",
    ])
      expect(parseInstagramSource(input)).toEqual({
        kind: "account",
        handle: "some.artist",
      })
  })

  test("reads post and reel links, deduplicated and capped", () => {
    expect(
      parseInstagramSource(
        "https://www.instagram.com/p/Dfcr9z7jBnD/?img_index=2, instagram.com/someone/reel/DfAWxdIFmVB\nhttps://instagram.com/p/Dfcr9z7jBnD"
      )
    ).toEqual({
      kind: "posts",
      urls: [
        "https://www.instagram.com/p/Dfcr9z7jBnD/",
        "https://www.instagram.com/reel/DfAWxdIFmVB/",
      ],
    })
    const many = Array.from(
      { length: 12 },
      (_, i) => `instagram.com/p/ABCDE${i}`
    )
    expect(parseInstagramSource(many.join(" "))).toMatchObject({
      urls: { length: 8 },
    })
  })

  test("refuses anything else", () => {
    for (const input of [
      "",
      "https://example.com/p/ABCDEF/",
      "https://www.instagram.com/explore/",
      "reels",
      "two words",
      "https://www.instagram.com/p/ABCDEF/ https://x.com/p/ABCDEF",
      "not a handle!",
    ])
      expect(parseInstagramSource(input)).toBeNull()
  })
})

test("only Instagram's image hosts are proxied", () => {
  expect(isInstagramImageUrl(cdn("a"))).toBe(true)
  expect(isInstagramImageUrl("https://scontent.xx.fbcdn.net/a.jpg")).toBe(true)
  for (const url of [
    "http://scontent.cdninstagram.com/a.jpg",
    "https://cdninstagram.com.evil.com/a.jpg",
    "https://evilcdninstagram.com/a.jpg",
    "https://scontent.cdninstagram.com:8443/a.jpg",
    "https://user@scontent.cdninstagram.com/a.jpg",
    "https://169.254.169.254/latest",
    "not a url",
  ])
    expect(isInstagramImageUrl(url)).toBe(false)
})

describe("fromFeedItem", () => {
  test("gives every slide of a carousel, largest as the page", () => {
    const images = fromFeedItem({
      code: "Dfcr9z7jBnD",
      image_versions2: { candidates: [{ url: cdn("cover"), width: 1440 }] },
      carousel_media: [
        {
          image_versions2: {
            candidates: [
              { url: cdn("one-small"), width: 320 },
              { url: cdn("one"), width: 1440 },
              { url: cdn("one-thumb"), width: 640 },
            ],
          },
        },
        {
          image_versions2: { candidates: [{ url: cdn("two"), width: 1080 }] },
        },
      ],
    })
    expect(images).toEqual([
      {
        id: "Dfcr9z7jBnD-0",
        label: "Dfcr9z7jBnD · 1/2",
        full: proxied(cdn("one")),
        thumb: proxied(cdn("one-thumb")),
      },
      {
        id: "Dfcr9z7jBnD-1",
        label: "Dfcr9z7jBnD · 2/2",
        full: proxied(cdn("two")),
        thumb: proxied(cdn("two")),
      },
    ])
  })

  test("drops addresses off Instagram's hosts", () => {
    expect(
      fromFeedItem({
        code: "x1",
        image_versions2: {
          candidates: [{ url: "https://example.com/a.jpg", width: 1440 }],
        },
      })
    ).toEqual([])
    expect(fromFeedItem({})).toEqual([])
  })
})

test("fromPost reads a sidecar and its owner", () => {
  const listing = fromPost({
    data: {
      xdt_shortcode_media: {
        shortcode: "Dfcr9z7jBnD",
        owner: { username: "some.artist" },
        display_url: cdn("cover"),
        edge_sidecar_to_children: {
          edges: [
            {
              node: {
                display_url: cdn("one"),
                display_resources: [
                  { src: cdn("one-640"), config_width: 640 },
                  { src: cdn("one-1080"), config_width: 1080 },
                ],
              },
            },
            { node: { display_url: cdn("two") } },
          ],
        },
      },
    },
  })
  expect(listing.author).toBe("some.artist")
  expect(listing.images.map((i) => [i.full, i.thumb])).toEqual([
    [proxied(cdn("one-1080")), proxied(cdn("one-640"))],
    [proxied(cdn("two")), proxied(cdn("two"))],
  ])
  expect(fromPost({}).images).toEqual([])
})
