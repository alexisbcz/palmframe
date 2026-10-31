import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { comicFromBoard } from "./comic"
import { toBrand, toProduct } from "./contextdev.server"
import fixtures from "./fixtures.json"
import {
  type Board,
  boardSchema,
  engagement,
  platformOf,
  rankAds,
  rankVideos,
  studioSource,
  toDomain,
} from "./model"
import {
  fromAdvertiser,
  fromInstagramPost,
  fromMetaAd,
  fromReel,
  fromTikTok,
  fromYouTube,
} from "./normalize"

const NOW = 1793458000

describe("normalizers, on captured API responses", () => {
  test("Meta ad", () => {
    const ad = fromMetaAd(fixtures.ad, NOW)!
    assert.equal(ad.page, "Gymshark")
    assert.equal(ad.days, 121)
    assert.equal(ad.variants, 3)
    assert.equal(ad.cta, "Shop now")
    assert.equal(ad.active, true)
    assert.ok(ad.url.endsWith(ad.id))
    studioSource.parse({ kind: "ad", ad })
  })

  test("a stopped ad counts to its end date", () => {
    const ad = fromMetaAd(
      {
        ...fixtures.ad,
        is_active: false,
        end_date: fixtures.ad.start_date + 864000,
      },
      NOW
    )!
    assert.equal(ad.days, 10)
  })

  test("TikTok, without the sharer's tracking link", () => {
    const v = fromTikTok(fixtures.tiktok)!
    assert.equal(v.author, "sample_creator")
    assert.equal(v.views, 731758)
    assert.equal(v.seconds, 18.4)
    assert.ok(!v.url.includes("?"))
    studioSource.parse({ kind: "video", video: v })
  })

  test("Instagram reel and post", () => {
    const r = fromReel(fixtures.reel)!
    assert.equal(r.views, 49453760)
    studioSource.parse({ kind: "video", video: r })
    const url = "https://www.instagram.com/reel/De_pmHcooX5/"
    const p = fromInstagramPost(fixtures.igPost, url)!
    assert.equal(p.author, "fcbayern")
    assert.ok(p.likes! > 1_000_000)
    studioSource.parse({ kind: "video", video: p })
  })

  test("YouTube", () => {
    const v = fromYouTube(fixtures.youtube)!
    assert.equal(v.views, 3492383)
    assert.ok(v.author)
    studioSource.parse({ kind: "video", video: v })
  })

  test("search results name their fields differently from feeds", () => {
    const r = fromReel({
      id: "1",
      url: "https://www.instagram.com/reel/x/",
      thumbnail_src: "https://cdn.example/t.jpg",
      video_view_count: 7552,
      video_duration: 29.6,
      owner: { username: "someone" },
    })!
    assert.equal(r.views, 7552)
    assert.equal(r.seconds, 29.6)
    assert.equal(r.thumbnail, "https://cdn.example/t.jpg")
    const y = fromYouTube({
      id: "a",
      url: "https://www.youtube.com/watch?v=a",
      viewCountInt: "803951",
      lengthSeconds: "2233",
      publishedTime: "2026-05-31T15:16:54.977Z",
      channel: { title: "Channel" },
    })!
    assert.equal(y.views, 803951)
    assert.equal(y.seconds, 2233)
    assert.equal(y.postedAt, "2026-05-31T15:16:54.977Z")
  })

  test("advertiser", () => {
    const a = fromAdvertiser(fixtures.company)!
    assert.equal(a.name, "Gymshark")
    assert.equal(a.instagram, "gymshark")
    assert.equal(a.verified, true)
  })

  test("garbage gives null, not a crash", () => {
    assert.equal(fromTikTok({}), null)
    assert.equal(fromReel(null as never), null)
    assert.equal(fromYouTube({}), null)
    assert.equal(fromMetaAd({}, NOW), null)
    assert.equal(fromAdvertiser({}), null)
    assert.equal(fromInstagramPost({}, "https://x.com"), null)
  })

  test("brand and fonts", () => {
    const b = toBrand("gymshark.com", fixtures.brand, fixtures.style)
    assert.equal(b.name, "Gymshark")
    assert.ok(b.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c.hex)))
    assert.ok(b.logos.length > 0)
    assert.ok(b.fonts.some((f) => f.role === "headings"))
  })

  test("a brand without a style guide still makes a kit", () => {
    assert.deepEqual(toBrand("x.com", fixtures.brand, null).fonts, [])
  })

  test("product", () => {
    const url = "https://www.allbirds.com/products/mens-wool-runner"
    const p = toProduct(url, fixtures.product)!
    assert.ok(p.name)
    studioSource.parse({ kind: "product", product: p })
    assert.equal(
      toProduct(url, { product: { data: { isProductPage: false } } }),
      null
    )
  })
})

describe("ranking", () => {
  test("old, many-variant, running ads come first", () => {
    const ads = [
      { id: "new", days: 3, variants: 9, active: true },
      { id: "old", days: 200, variants: 4, active: true },
      { id: "dead", days: 200, variants: 4, active: false },
    ]
    assert.deepEqual(
      rankAds(ads).map((a) => a.id),
      ["old", "dead", "new"]
    )
  })

  test("videos are ranked by views, each once", () => {
    const v = (id: string, views: number) =>
      ({ platform: "youtube", id, views }) as const
    assert.deepEqual(
      rankVideos([v("a", 1), v("b", 9), v("a", 1)]).map((x) => x.id),
      ["b", "a"]
    )
  })

  test("engagement needs views and likes", () => {
    const v = { views: 1000, likes: 80, comments: 10, shares: 10 }
    assert.equal(engagement(v), 10)
    assert.equal(engagement({ ...v, views: 0 }), null)
    assert.equal(engagement({ ...v, likes: null }), null)
  })
})

describe("input", () => {
  test("only known video hosts, over https", () => {
    assert.equal(platformOf("https://www.tiktok.com/@a/video/1"), "tiktok")
    assert.equal(platformOf("https://youtu.be/abc"), "youtube")
    assert.equal(platformOf("https://www.instagram.com/reel/x/"), "instagram")
    assert.equal(platformOf("https://tiktok.com.evil.dev/x"), null)
    assert.equal(platformOf("http://www.tiktok.com/x"), null)
    assert.equal(platformOf("not a url"), null)
  })

  test("domains", () => {
    assert.equal(toDomain("https://www.Acme.com/about"), "acme.com")
    assert.equal(toDomain("shop.acme.co.uk"), "shop.acme.co.uk")
    assert.equal(toDomain("localhost"), null)
    assert.equal(toDomain("not a domain"), null)
  })
})

describe("comic", () => {
  const board: Board = {
    hook: "h",
    angle: "a",
    whyItWorks: [],
    postText: "p",
    scenes: [
      { scene: "One", caption: "First" },
      { scene: "Two", caption: "" },
      { scene: "Three", caption: "Last" },
    ],
  }

  test("one slide per scene, prompts set, captions only where written", () => {
    boardSchema.parse(board)
    const p = comicFromBoard(board)
    assert.equal(p.pages.length, 3)
    const panel = p.pages[0]!.layers[0] as { type: string; prompt?: string }
    assert.equal(panel.type, "panel")
    assert.equal(panel.prompt, "One")
    assert.equal(p.pages[0]!.layers.length, 2)
    assert.equal(p.pages[1]!.layers.length, 1)
  })
})
